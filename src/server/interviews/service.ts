import type pg from "pg";
import { conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresInterviewRepository } from "../persistence/postgres-interview-repository";
import type { InterviewRepository } from "./repository";
import type {
  Interview,
  InterviewAdminReadInput,
  InterviewAggregate,
  InterviewDraftInput,
  InterviewEvaluation,
  InterviewEvaluationInput,
  InterviewEvent,
  InterviewInput,
  InterviewParticipant,
  InterviewParticipantInput,
  InterviewQuestion,
  InterviewQuestionInput,
  InterviewReasonInput,
  InterviewResponse,
  InterviewResponseInput,
  InterviewScheduleInput,
  InterviewStatus
} from "./types";
import {
  validateAdminReason,
  validateCreateInterview,
  validateDraftInput,
  validateEvaluationInput,
  validateParticipantInput,
  validateQuestionInput,
  validateReason,
  validateResponseInput,
  validateScheduleInput
} from "./validation";

type InterviewTransaction = {
  core: CoreRepository;
  interviews: InterviewRepository;
};

type InterviewTransactionRunner = <T>(
  callback: (transaction: InterviewTransaction) => Promise<T>
) => Promise<T>;

export class InterviewService {
  constructor(
    private readonly core: CoreRepository,
    private readonly interviews: InterviewRepository,
    private readonly runTransaction: InterviewTransactionRunner
  ) {}

  async createInterview(actor: Actor, organizationId: string, input: InterviewInput) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const preflight = validateCreateInterview(input);
    await this.ensureApplicationUsable(
      actor,
      organizationId,
      preflight.candidateApplicationId,
      true
    );

    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const normalized = validateCreateInterview(input);
      const application = await service.ensureApplicationUsable(
        actor,
        organizationId,
        normalized.candidateApplicationId,
        false
      );
      const now = transaction.interviews.now();
      const userId = requireUserActorId(actor);
      const interview: Interview = {
        id: transaction.interviews.nextId("int"),
        organizationId,
        candidateApplicationId: application.id,
        title: normalized.title,
        type: normalized.type,
        status: "draft",
        scheduledStartAt: null,
        scheduledEndAt: null,
        timezone: normalized.timezone,
        locationType: normalized.locationType,
        locationDetails: normalized.locationDetails,
        interviewerInstructions: normalized.interviewerInstructions,
        candidateInstructions: normalized.candidateInstructions,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
        noShowAt: null,
        noShowByUserId: null,
        noShowReason: null,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now
      };
      await transaction.interviews.createInterview(interview);
      await service.addEvent(interview, "interview_created", null, "draft", null, {
        candidateApplicationId: application.id
      });
      await service.audit(actor, organizationId, "interview.created", {
        interviewId: interview.id,
        candidateApplicationId: application.id
      });
      return service.serializeOwnerAdmin(await service.aggregate(interview), actor);
    });
  }

  async listInterviews(actor: Actor, organizationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const interviews =
      context.role === "member"
        ? await this.interviews.listInterviewsByParticipant(
            organizationId,
            requireUserActorId(actor)
          )
        : await this.interviews.listInterviews(organizationId);
    const aggregates = await Promise.all(interviews.map((interview) => this.aggregate(interview)));
    return Promise.all(
      aggregates.map((aggregate) =>
        context.role === "member"
          ? this.serializeMember(aggregate, requireUserActorId(actor))
          : this.serializeOwnerAdmin(aggregate, actor)
      )
    );
  }

  async listByApplication(actor: Actor, organizationId: string, applicationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    await this.findApplicationInOrganization(actor, organizationId, applicationId);
    const interviews = await this.interviews.listInterviewsByApplication(
      organizationId,
      applicationId
    );
    const aggregates = await Promise.all(interviews.map((interview) => this.aggregate(interview)));
    const visible =
      context.role === "member"
        ? aggregates.filter((aggregate) =>
            aggregate.participants.some(
              (participant) =>
                participant.userId === actor.userId &&
                participant.status === "active" &&
                ["scheduled", "in_progress"].includes(aggregate.interview.status)
            )
          )
        : aggregates;
    return Promise.all(
      visible.map((aggregate) =>
        context.role === "member"
          ? this.serializeMember(aggregate, requireUserActorId(actor))
          : this.serializeOwnerAdmin(aggregate, actor)
      )
    );
  }

  async getInterview(actor: Actor, organizationId: string, interviewId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const interview = await this.findInterviewInOrganization(actor, organizationId, interviewId);
    const aggregate = await this.aggregate(interview, context.role !== "member");
    if (context.role === "member") {
      await this.ensureParticipantVisible(actor, aggregate);
      return this.serializeMember(aggregate, requireUserActorId(actor));
    }
    return this.serializeOwnerAdmin(aggregate, actor);
  }

  async updateDraft(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewDraftInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      if (interview.status !== "draft") {
        throw conflict("interview_not_draft", "Only draft interviews can be edited.");
      }
      const normalized = validateDraftInput(input);
      const updated: Interview = {
        ...interview,
        title: normalized.title ?? interview.title,
        type: normalized.type ?? interview.type,
        timezone: normalized.timezone ?? interview.timezone,
        locationType: normalized.locationType ?? interview.locationType,
        locationDetails:
          normalized.locationDetails === undefined
            ? interview.locationDetails
            : normalized.locationDetails,
        interviewerInstructions:
          normalized.interviewerInstructions === undefined
            ? interview.interviewerInstructions
            : normalized.interviewerInstructions,
        candidateInstructions:
          normalized.candidateInstructions === undefined
            ? interview.candidateInstructions
            : normalized.candidateInstructions,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: transaction.interviews.now()
      };
      await transaction.interviews.updateInterview(updated);
      await service.addEvent(updated, "draft_updated", "draft", "draft", null);
      await service.audit(actor, organizationId, "interview.draft_updated", {
        interviewId: updated.id
      });
      return service.serializeOwnerAdmin(await service.aggregate(updated), actor);
    });
  }

  async addParticipant(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewParticipantInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      service.ensureNotFinal(interview);
      const normalized = validateParticipantInput(input);
      const role = await transaction.interviews.findMembershipRole(
        organizationId,
        normalized.userId
      );
      if (!role) {
        await service.auditDenied(
          actor,
          organizationId,
          "interview.cross_organization_access_denied",
          "participant_membership_required",
          { interviewId, userId: normalized.userId }
        );
        throw forbidden("membership_required", "Active membership is required.");
      }
      const targetUser = await transaction.core.findUserById(normalized.userId);
      if (!targetUser || targetUser.status !== "active") {
        await service.auditDenied(
          actor,
          organizationId,
          "interview.cross_organization_access_denied",
          "participant_user_inactive",
          { interviewId, userId: normalized.userId }
        );
        throw forbidden("user_inactive_or_missing", "Active user is required.");
      }
      const now = transaction.interviews.now();
      const existing = await transaction.interviews.findParticipant(
        interview.id,
        normalized.userId
      );
      if (
        existing &&
        existing.status === "active" &&
        existing.role === "lead" &&
        normalized.role !== "lead"
      ) {
        await service.ensureLastLeadPreserved(transaction, interview, existing.userId);
      }
      const participant: InterviewParticipant = existing
        ? {
            ...existing,
            role: normalized.role,
            status: "active",
            updatedByUserId: requireUserActorId(actor),
            updatedAt: now
          }
        : {
            id: transaction.interviews.nextId("intpart"),
            organizationId,
            interviewId: interview.id,
            userId: normalized.userId,
            role: normalized.role,
            status: "active",
            createdByUserId: requireUserActorId(actor),
            updatedByUserId: requireUserActorId(actor),
            createdAt: now,
            updatedAt: now
          };
      if (existing) {
        await transaction.interviews.updateParticipant(participant);
      } else {
        await transaction.interviews.addParticipant(participant);
      }
      await service.addEvent(
        { ...interview, updatedByUserId: requireUserActorId(actor) },
        "participant_added",
        interview.status,
        interview.status,
        null,
        {
          participantUserId: participant.userId,
          participantRole: participant.role
        }
      );
      await service.audit(actor, organizationId, "interview.participant_added", {
        interviewId: interview.id,
        participantUserId: participant.userId,
        participantRole: participant.role
      });
      return participant;
    });
  }

  async removeParticipant(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    userId: string
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      service.ensureNotFinal(interview);
      const participant = await transaction.interviews.findParticipant(interview.id, userId);
      if (!participant || participant.organizationId !== organizationId) {
        throw notFound("interview_participant_not_found", "Interview participant not found.");
      }
      if (participant.status === "active" && participant.role === "lead") {
        await service.ensureLastLeadPreserved(transaction, interview, participant.userId);
      }
      const updated = {
        ...participant,
        status: "inactive" as const,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: transaction.interviews.now()
      };
      await transaction.interviews.updateParticipant(updated);
      await service.addEvent(
        { ...interview, updatedByUserId: requireUserActorId(actor) },
        "participant_inactivated",
        interview.status,
        interview.status,
        null,
        {
          participantUserId: userId
        }
      );
      await service.audit(actor, organizationId, "interview.participant_inactivated", {
        interviewId,
        participantUserId: userId
      });
      return updated;
    });
  }

  async addQuestion(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewQuestionInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      if (interview.status !== "draft") {
        throw conflict("interview_question_not_draft", "Questions can only be changed in draft.");
      }
      const normalized = validateQuestionInput(input);
      const count = await transaction.interviews.countQuestions(interview.id);
      if (count >= 100) {
        throw conflict("interview_question_limit", "Interview has too many questions.");
      }
      const catalog = await transaction.interviews.findQuestionCatalogItem(
        normalized.questionCatalogItemId
      );
      if (!catalog || catalog.organizationId !== organizationId || catalog.status !== "active") {
        await service.auditDenied(
          actor,
          organizationId,
          "interview.cross_organization_access_denied",
          "question_catalog_item_invalid",
          { questionCatalogItemId: normalized.questionCatalogItemId }
        );
        throw notFound("question_catalog_item_not_found", "Question catalog item not found.");
      }
      const question: InterviewQuestion = {
        id: transaction.interviews.nextId("intq"),
        organizationId,
        interviewId: interview.id,
        questionCatalogItemId: catalog.id,
        snapshotTitle: catalog.title,
        snapshotText: catalog.questionText,
        snapshotType: catalog.type,
        snapshotOptions: catalog.options,
        snapshotSettings: catalog.settings,
        displayOrder: normalized.displayOrder,
        required: normalized.required,
        contextualWeight: normalized.contextualWeight,
        contextualCompetencyCatalogItemId:
          normalized.contextualCompetencyCatalogItemId ?? catalog.competencyCatalogItemId,
        createdByUserId: requireUserActorId(actor),
        createdAt: transaction.interviews.now()
      };
      try {
        await transaction.interviews.addQuestion(question);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("interview_question_duplicate", "Question already exists.");
        }
        throw error;
      }
      await service.addEvent(
        { ...interview, updatedByUserId: requireUserActorId(actor) },
        "question_added",
        "draft",
        "draft",
        null,
        {
          interviewQuestionId: question.id,
          questionCatalogItemId: catalog.id
        }
      );
      await service.audit(actor, organizationId, "interview.question_added", {
        interviewId: interview.id,
        interviewQuestionId: question.id,
        questionCatalogItemId: catalog.id
      });
      return question;
    });
  }

  async schedule(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewScheduleInput
  ) {
    return this.scheduleOrReschedule(actor, organizationId, interviewId, input, false);
  }

  async reschedule(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewScheduleInput
  ) {
    return this.scheduleOrReschedule(actor, organizationId, interviewId, input, true);
  }

  async start(actor: Actor, organizationId: string, interviewId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      const context = await service.authorizeUser(actor, organizationId, [
        "owner",
        "admin",
        "member"
      ]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      const participant = await transaction.interviews.findParticipant(
        interview.id,
        requireUserActorId(actor)
      );
      // A member who is not an active lead is denied before any status-derived conflict, so a
      // non-participant member never learns anything about the interview's current state.
      if (context.role === "member" && !isActiveRole(participant, "lead")) {
        throw forbidden("permission_denied", "Permission denied.");
      }
      if (interview.status !== "scheduled") {
        throw conflict("interview_not_scheduled", "Interview must be scheduled.");
      }
      await service.ensureInterviewOperational(actor, interview, false);
      await service.ensureHasLead(interview);
      const administrative = context.role !== "member" && !isActiveRole(participant, "lead");
      const updated: Interview = {
        ...interview,
        status: "in_progress",
        startedAt: transaction.interviews.now(),
        updatedByUserId: requireUserActorId(actor),
        updatedAt: transaction.interviews.now()
      };
      await transaction.interviews.updateInterview(updated);
      await service.addEvent(updated, "started", "scheduled", "in_progress", null, {
        administrative: String(administrative)
      });
      await service.audit(actor, organizationId, "interview.started", {
        interviewId: interview.id,
        administrative: String(administrative)
      });
      return service.serializeOwnerAdmin(await service.aggregate(updated), actor);
    });
  }

  async recordResponse(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewResponseInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      // Participation is checked before any state-dependent conflict so a member who isn't a
      // participant always gets a flat permission denial, never a state-derived response that
      // would confirm details about an interview they aren't allowed to know about at all.
      const participant = await service.requireOperationalParticipant(actor, interview, [
        "lead",
        "interviewer"
      ]);
      if (interview.status !== "in_progress") {
        throw conflict("interview_not_in_progress", "Interview must be in progress.");
      }
      await service.ensureInterviewOperational(actor, interview, false);
      const questionId = String(input.interviewQuestionId ?? input.interview_question_id ?? "");
      const question = (await transaction.interviews.listQuestions(interview.id)).find(
        (candidate) => candidate.id === questionId
      );
      if (!question) {
        throw notFound("interview_question_not_found", "Interview question not found.");
      }
      const normalized = validateResponseInput(input, question.snapshotType);
      const existing = await transaction.interviews.findResponseByQuestion(question.id);
      const now = transaction.interviews.now();
      const response: InterviewResponse = existing
        ? {
            ...existing,
            responseValue: normalized.responseValue,
            interviewerObservation: normalized.interviewerObservation,
            updatedByUserId: requireUserActorId(actor),
            updatedAt: now
          }
        : {
            id: transaction.interviews.nextId("intresp"),
            organizationId,
            interviewId: interview.id,
            interviewQuestionId: question.id,
            responseValue: normalized.responseValue,
            interviewerObservation: normalized.interviewerObservation,
            createdByUserId: requireUserActorId(actor),
            updatedByUserId: requireUserActorId(actor),
            createdAt: now,
            updatedAt: now
          };
      if (existing) {
        await transaction.interviews.updateResponse(response);
      } else {
        await transaction.interviews.addResponse(response);
      }
      await service.addEvent(
        { ...interview, updatedByUserId: requireUserActorId(actor) },
        existing ? "response_updated" : "response_created",
        "in_progress",
        "in_progress",
        null,
        {
          interviewQuestionId: question.id,
          participantRole: participant.role
        }
      );
      await service.audit(
        actor,
        organizationId,
        existing ? "interview.response_updated" : "interview.response_created",
        { interviewId: interview.id, interviewQuestionId: question.id }
      );
      return response;
    });
  }

  async recordEvaluation(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewEvaluationInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      // Participation is checked before any state-dependent conflict so a member who isn't a
      // participant always gets a flat permission denial, never a state-derived response that
      // would confirm details about an interview they aren't allowed to know about at all.
      const participant = await service.requireOperationalParticipant(actor, interview, [
        "lead",
        "interviewer"
      ]);
      if (
        interview.status === "completed" ||
        interview.status === "cancelled" ||
        interview.status === "no_show"
      ) {
        throw conflict("interview_final", "Final interview cannot change.");
      }
      await service.ensureInterviewOperational(actor, interview, false);
      const normalized = validateEvaluationInput(input);
      const existing = await transaction.interviews.findEvaluation(
        interview.id,
        requireUserActorId(actor)
      );
      const now = transaction.interviews.now();
      const evaluation: InterviewEvaluation = existing
        ? {
            ...existing,
            recommendation: normalized.recommendation,
            summary: normalized.summary,
            strengths: normalized.strengths,
            attentionPoints: normalized.attentionPoints,
            overallRating: normalized.overallRating,
            updatedByUserId: requireUserActorId(actor),
            updatedAt: now
          }
        : {
            id: transaction.interviews.nextId("inteval"),
            organizationId,
            interviewId: interview.id,
            evaluatorUserId: requireUserActorId(actor),
            recommendation: normalized.recommendation,
            summary: normalized.summary,
            strengths: normalized.strengths,
            attentionPoints: normalized.attentionPoints,
            overallRating: normalized.overallRating,
            createdByUserId: requireUserActorId(actor),
            updatedByUserId: requireUserActorId(actor),
            createdAt: now,
            updatedAt: now
          };
      if (existing) {
        await transaction.interviews.updateEvaluation(evaluation);
      } else {
        await transaction.interviews.addEvaluation(evaluation);
      }
      await service.addEvent(
        { ...interview, updatedByUserId: requireUserActorId(actor) },
        existing ? "evaluation_updated" : "evaluation_created",
        interview.status,
        interview.status,
        null,
        {
          evaluatorUserId: evaluation.evaluatorUserId,
          participantRole: participant.role
        }
      );
      await service.audit(
        actor,
        organizationId,
        existing ? "interview.evaluation_updated" : "interview.evaluation_created",
        { interviewId: interview.id, evaluatorUserId: evaluation.evaluatorUserId }
      );
      return evaluation;
    });
  }

  async complete(actor: Actor, organizationId: string, interviewId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      const context = await service.authorizeUser(actor, organizationId, [
        "owner",
        "admin",
        "member"
      ]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      const participant = await transaction.interviews.findParticipant(
        interview.id,
        requireUserActorId(actor)
      );
      // A member who is not an active lead is denied before any status-derived conflict, so a
      // non-participant member never learns anything about the interview's current state.
      if (context.role === "member" && !isActiveRole(participant, "lead")) {
        throw forbidden("permission_denied", "Permission denied.");
      }
      if (interview.status !== "in_progress") {
        throw conflict("interview_not_in_progress", "Interview must be in progress.");
      }
      await service.ensureInterviewOperational(actor, interview, false);
      const administrative = context.role !== "member" && !isActiveRole(participant, "lead");
      const questions = await transaction.interviews.listQuestions(interview.id);
      const responses = await transaction.interviews.listResponses(interview.id);
      const answered = new Set(responses.map((response) => response.interviewQuestionId));
      if (questions.some((question) => question.required && !answered.has(question.id))) {
        throw conflict("interview_required_response_missing", "Required responses are missing.");
      }
      const evaluations = await transaction.interviews.listEvaluations(interview.id);
      if (evaluations.length === 0) {
        throw conflict("interview_evaluation_missing", "At least one evaluation is required.");
      }
      const now = transaction.interviews.now();
      const updated = {
        ...interview,
        status: "completed" as const,
        completedAt: now,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: now
      };
      await transaction.interviews.updateInterview(updated);
      await service.addEvent(updated, "completed", "in_progress", "completed", null, {
        administrative: String(administrative)
      });
      await service.audit(actor, organizationId, "interview.completed", {
        interviewId: interview.id,
        administrative: String(administrative)
      });
      return service.serializeOwnerAdmin(await service.aggregate(updated), actor);
    });
  }

  async cancel(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewReasonInput
  ) {
    return this.finalize(actor, organizationId, interviewId, input, "cancelled");
  }

  async noShow(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewReasonInput
  ) {
    return this.finalize(actor, organizationId, interviewId, input, "no_show");
  }

  async timeline(actor: Actor, organizationId: string, interviewId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const interview = await this.findInterviewInOrganization(actor, organizationId, interviewId);
    return this.interviews.listEvents(interview.id);
  }

  async adminRead(actor: Actor, organizationId: string, input: InterviewAdminReadInput) {
    const reason = validateAdminReason(input);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }
    const interviews = await this.interviews.listInterviews(organizationId);
    await this.audit(actor, organizationId, "interview.administrative_read", {
      reason,
      interviewCount: String(interviews.length)
    });
    return interviews.map((interview) => ({
      id: interview.id,
      organizationId: interview.organizationId,
      candidateApplicationId: interview.candidateApplicationId,
      type: interview.type,
      status: interview.status,
      scheduledStartAt: interview.scheduledStartAt,
      scheduledEndAt: interview.scheduledEndAt,
      createdAt: interview.createdAt,
      updatedAt: interview.updatedAt
    }));
  }

  private async scheduleOrReschedule(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewScheduleInput,
    reschedule: boolean
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      if (reschedule ? interview.status !== "scheduled" : interview.status !== "draft") {
        throw conflict(
          reschedule ? "interview_not_scheduled" : "interview_not_draft",
          "Interview cannot be scheduled."
        );
      }
      // Decision: rescheduling is a functional operation, not an administrative one, so it is
      // gated by the same operational preconditions as creating or starting an interview. An
      // inactive Candidate or a consent that is pending/revoked/expired blocks reschedule just
      // like it blocks schedule. Only cancellation, administrative no-show, authorized reads and
      // preserved history stay available in that state. This applies to both `schedule` and
      // `reschedule` on purpose.
      await service.ensureApplicationUsable(
        actor,
        organizationId,
        interview.candidateApplicationId,
        false
      );
      await service.ensureHasLead(interview);
      const normalized = validateScheduleInput(input);
      const now = transaction.interviews.now();
      const updated = {
        ...interview,
        status: "scheduled" as const,
        scheduledStartAt: normalized.scheduledStartAt,
        scheduledEndAt: normalized.scheduledEndAt,
        timezone: normalized.timezone,
        locationType: normalized.locationType,
        locationDetails: normalized.locationDetails,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: now
      };
      await transaction.interviews.updateInterview(updated);
      await service.addEvent(
        updated,
        reschedule ? "rescheduled" : "scheduled",
        interview.status,
        "scheduled",
        null
      );
      await service.audit(
        actor,
        organizationId,
        reschedule ? "interview.rescheduled" : "interview.scheduled",
        {
          interviewId: interview.id
        }
      );
      return service.serializeOwnerAdmin(await service.aggregate(updated), actor);
    });
  }

  private async finalize(
    actor: Actor,
    organizationId: string,
    interviewId: string,
    input: InterviewReasonInput,
    status: "cancelled" | "no_show"
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      const context = await service.authorizeUser(actor, organizationId, [
        "owner",
        "admin",
        "member"
      ]);
      const interview = await service.findInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        interviewId
      );
      const participant = await transaction.interviews.findParticipant(
        interview.id,
        requireUserActorId(actor)
      );
      // A member who is not an active lead is denied before any status-derived conflict, so a
      // non-participant member never learns anything about the interview's current state.
      if (context.role === "member" && !isActiveRole(participant, "lead")) {
        throw forbidden("permission_denied", "Permission denied.");
      }
      if (status === "cancelled" && interview.status === "completed") {
        throw conflict("interview_completed", "Completed interview cannot be cancelled.");
      }
      if (status === "no_show" && interview.status !== "scheduled") {
        throw conflict(
          "interview_no_show_status_invalid",
          "Only scheduled interviews can be no-show."
        );
      }
      service.ensureNotFinal(interview);
      const administrative = context.role !== "member" && !isActiveRole(participant, "lead");
      const reason = validateReason(input);
      const now = transaction.interviews.now();
      const updated: Interview =
        status === "cancelled"
          ? {
              ...interview,
              status,
              cancelledAt: now,
              cancelledByUserId: requireUserActorId(actor),
              cancellationReason: reason,
              updatedByUserId: requireUserActorId(actor),
              updatedAt: now
            }
          : {
              ...interview,
              status,
              noShowAt: now,
              noShowByUserId: requireUserActorId(actor),
              noShowReason: reason,
              updatedByUserId: requireUserActorId(actor),
              updatedAt: now
            };
      await transaction.interviews.updateInterview(updated);
      await service.addEvent(updated, status, interview.status, status, reason, {
        administrative: String(administrative)
      });
      await service.audit(actor, organizationId, `interview.${status}`, {
        interviewId: interview.id,
        reasonProvided: "true",
        administrative: String(administrative)
      });
      return service.serializeOwnerAdmin(await service.aggregate(updated), actor);
    });
  }

  private scoped(transaction: InterviewTransaction) {
    return new InterviewService(transaction.core, transaction.interviews, this.runTransaction);
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    deniedAction = "interview.permission_denied"
  ) {
    if (actor.kind === "platform") {
      await this.auditDenied(actor, organizationId, deniedAction, "permission_denied");
      throw forbidden("permission_denied", "Permission denied.");
    }
    const user = await this.core.findUserById(actor.userId);
    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }
    if (organization.status !== "active") {
      await this.auditDenied(actor, organizationId, deniedAction, "organization_archived");
      throw forbidden("organization_archived", "Archived organization cannot be used as context.");
    }
    const membership = await this.core.findMembershipByOrganizationAndUser(
      organizationId,
      actor.userId
    );
    if (!membership || membership.status !== "active") {
      await this.auditDenied(
        actor,
        organizationId,
        "interview.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(actor, organizationId, deniedAction, "permission_denied");
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { actor, organization, role: membership.role };
  }

  private async findInterviewInOrganization(
    actor: Actor,
    organizationId: string,
    interviewId: string
  ) {
    const interview = await this.interviews.findInterviewById(interviewId);
    if (!interview || interview.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "interview.cross_organization_access_denied",
        "interview_organization_mismatch",
        { interviewId }
      );
      throw notFound("interview_not_found", "Interview not found.");
    }
    return interview;
  }

  private async findInterviewInOrganizationForUpdate(
    actor: Actor,
    organizationId: string,
    interviewId: string
  ) {
    const interview = await this.interviews.findInterviewForUpdate(interviewId);
    if (!interview || interview.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "interview.cross_organization_access_denied",
        "interview_organization_mismatch",
        { interviewId }
      );
      throw notFound("interview_not_found", "Interview not found.");
    }
    return interview;
  }

  private async findApplicationInOrganization(
    actor: Actor,
    organizationId: string,
    applicationId: string
  ) {
    const application = await this.interviews.findApplication(applicationId);
    if (!application || application.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "interview.cross_organization_access_denied",
        "candidate_application_organization_mismatch",
        { candidateApplicationId: applicationId }
      );
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    return application;
  }

  private async ensureApplicationUsable(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    auditBlocked: boolean
  ) {
    const application = await this.findApplicationInOrganization(
      actor,
      organizationId,
      applicationId
    );
    if (application.applicationStatus !== "active") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          organizationId,
          "interview.application_final_denied",
          "application_final",
          {
            candidateApplicationId: application.id
          }
        );
      }
      throw conflict("candidate_application_final", "Final application cannot be used.");
    }
    const candidate = await this.findCandidateInOrganization(
      actor,
      organizationId,
      application.candidateId
    );
    if (candidate.status !== "active") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          organizationId,
          "interview.operational_use_denied",
          "candidate_inactive",
          {
            candidateId: candidate.id
          }
        );
      }
      throw conflict("candidate_inactive", "Inactive candidate cannot be used operationally.");
    }
    const consent = await this.interviews.latestConsent(candidate.id);
    if (!consent || consent.status !== "granted") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          organizationId,
          "interview.operational_use_denied",
          "candidate_consent_invalid",
          { candidateId: candidate.id }
        );
      }
      throw conflict("candidate_consent_invalid", "Candidate consent blocks operational use.");
    }
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= Date.now()) {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          organizationId,
          "interview.operational_use_denied",
          "candidate_consent_expired",
          { candidateId: candidate.id }
        );
      }
      throw conflict("candidate_consent_expired", "Candidate consent blocks operational use.");
    }
    return application;
  }

  private async ensureInterviewOperational(
    actor: Actor,
    interview: Interview,
    auditBlocked: boolean
  ) {
    await this.ensureApplicationUsable(
      actor,
      interview.organizationId,
      interview.candidateApplicationId,
      auditBlocked
    );
  }

  private async findCandidateInOrganization(
    actor: Actor,
    organizationId: string,
    candidateId: string
  ) {
    const candidate = await this.interviews.findCandidate(candidateId);
    if (!candidate || candidate.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "interview.cross_organization_access_denied",
        "candidate_organization_mismatch",
        { candidateId }
      );
      throw notFound("candidate_not_found", "Candidate not found.");
    }
    return candidate;
  }

  private async ensureHasLead(interview: Interview) {
    const participants = await this.interviews.listParticipants(interview.id);
    if (!participants.some((participant) => isActiveRole(participant, "lead"))) {
      throw conflict("interview_lead_required", "Interview requires an active lead.");
    }
  }

  private async ensureLastLeadPreserved(
    transaction: InterviewTransaction,
    interview: Interview,
    excludedUserId: string
  ) {
    if (!["scheduled", "in_progress"].includes(interview.status)) {
      return;
    }
    const participants = await transaction.interviews.listParticipants(interview.id);
    const remainingLeads = participants.filter(
      (participant) =>
        participant.userId !== excludedUserId &&
        participant.status === "active" &&
        participant.role === "lead"
    );
    if (remainingLeads.length === 0) {
      throw conflict(
        "interview_last_lead_required",
        "Scheduled or in-progress interviews require at least one active lead."
      );
    }
  }

  private ensureNotFinal(interview: Interview) {
    if (["completed", "cancelled", "no_show"].includes(interview.status)) {
      throw conflict("interview_final", "Final interview cannot change.");
    }
  }

  private async requireOperationalParticipant(
    actor: Actor,
    interview: Interview,
    roles: Array<"lead" | "interviewer">
  ) {
    const participant = await this.interviews.findParticipant(
      interview.id,
      requireUserActorId(actor)
    );
    if (
      !participant ||
      participant.status !== "active" ||
      !roles.includes(participant.role as "lead" | "interviewer")
    ) {
      throw forbidden("permission_denied", "Permission denied.");
    }
    return participant;
  }

  private async ensureParticipantVisible(actor: Actor, aggregate: InterviewAggregate) {
    const participant = aggregate.participants.find(
      (candidate) => candidate.userId === requireUserActorId(actor) && candidate.status === "active"
    );
    if (!participant || !["scheduled", "in_progress"].includes(aggregate.interview.status)) {
      throw notFound("interview_not_found", "Interview not found.");
    }
  }

  private async aggregate(
    interview: Interview,
    includeEvents = false
  ): Promise<InterviewAggregate> {
    const application = await this.interviews.findApplication(interview.candidateApplicationId);
    const candidate = application
      ? await this.interviews.findCandidate(application.candidateId)
      : null;
    const jobOpening = application
      ? await this.interviews.findJobOpening(application.jobOpeningId)
      : null;
    const jobOpeningVersion = application
      ? await this.interviews.findJobOpeningVersion(application.jobOpeningVersionId)
      : null;
    // Reads run sequentially, not via Promise.all: aggregate() is also invoked while
    // scoped to a single pg.PoolClient inside runTransaction(), and node-postgres does
    // not support concurrent queries on one client/connection. Firing them concurrently
    // there triggered a client-level protocol error outside any try/catch, which crashed
    // the Vitest worker process intermittently ("Worker exited unexpectedly").
    const participants = await this.interviews.listParticipants(interview.id);
    const questions = await this.interviews.listQuestions(interview.id);
    const responses = await this.interviews.listResponses(interview.id);
    const evaluations = await this.interviews.listEvaluations(interview.id);
    const events = includeEvents ? await this.interviews.listEvents(interview.id) : undefined;
    return {
      interview,
      application,
      candidate,
      jobOpening,
      jobOpeningVersion,
      participants,
      questions,
      responses,
      evaluations,
      events
    };
  }

  private serializeOwnerAdmin(aggregate: InterviewAggregate, actor: Actor) {
    // While the interview is in_progress, evaluations from other participants stay fully
    // hidden from owner/admin too (not merely stripped of content): only the viewer's own
    // evaluation, if any, is included. Owner/admin only regain full visibility of every
    // evaluation once the interview reaches a final state (matches SPEC-013 "avaliações de
    // outros participantes não ficam visíveis durante a execução").
    const viewerUserId = actor.kind === "user" ? actor.userId : null;
    return {
      ...aggregate.interview,
      candidateApplication: aggregate.application,
      candidate: aggregate.candidate,
      jobOpening: aggregate.jobOpening,
      jobOpeningVersion: aggregate.jobOpeningVersion,
      participants: aggregate.participants,
      questions: aggregate.questions,
      responses: aggregate.responses,
      evaluations:
        aggregate.interview.status === "in_progress"
          ? aggregate.evaluations.filter(
              (evaluation) => evaluation.evaluatorUserId === viewerUserId
            )
          : aggregate.evaluations,
      events: aggregate.events
    };
  }

  private serializeMember(aggregate: InterviewAggregate, userId: string) {
    const participant = aggregate.participants.find(
      (candidate) => candidate.userId === userId && candidate.status === "active"
    );
    if (!participant) {
      throw notFound("interview_not_found", "Interview not found.");
    }
    const canAct = participant.role === "lead" || participant.role === "interviewer";
    return {
      id: aggregate.interview.id,
      title: aggregate.interview.title,
      type: aggregate.interview.type,
      status: aggregate.interview.status,
      scheduled_start_at: aggregate.interview.scheduledStartAt,
      scheduled_end_at: aggregate.interview.scheduledEndAt,
      timezone: aggregate.interview.timezone,
      location_type: aggregate.interview.locationType,
      location_details: aggregate.interview.locationDetails,
      participant_role: participant.role,
      candidate: aggregate.candidate
        ? {
            id: aggregate.candidate.id,
            full_name: aggregate.candidate.fullName,
            preferred_name: aggregate.candidate.preferredName
          }
        : null,
      candidate_application: aggregate.application
        ? {
            id: aggregate.application.id,
            current_stage: aggregate.application.currentStage
          }
        : null,
      job_opening: aggregate.jobOpening
        ? {
            id: aggregate.jobOpening.id,
            title: aggregate.jobOpening.title
          }
        : null,
      job_opening_version: aggregate.jobOpeningVersion
        ? {
            id: aggregate.jobOpeningVersion.id,
            public_title: aggregate.jobOpeningVersion.publicTitle
          }
        : null,
      questions: canAct ? aggregate.questions : undefined,
      responses: canAct
        ? aggregate.responses.filter((response) => response.createdByUserId === userId)
        : undefined,
      evaluations: aggregate.evaluations.filter(
        (evaluation) => evaluation.evaluatorUserId === userId
      )
    };
  }

  private async addEvent(
    interview: Interview,
    eventType: InterviewEvent["eventType"],
    statusBefore: InterviewStatus | null,
    statusAfter: InterviewStatus | null,
    reason: string | null,
    metadata: Record<string, string> = {}
  ) {
    await this.interviews.addEvent({
      id: this.interviews.nextId("intevt"),
      organizationId: interview.organizationId,
      interviewId: interview.id,
      eventType,
      statusBefore,
      statusAfter,
      actorUserId: interview.updatedByUserId,
      reason,
      metadata,
      createdAt: this.interviews.now()
    });
  }

  private async audit(
    actor: Actor,
    organizationId: string | null,
    action: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.core.addAuditEvent({
      id: this.core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "allowed",
      reason: null,
      metadata,
      createdAt: this.core.now()
    });
  }

  private async auditDenied(
    actor: Actor,
    organizationId: string | null,
    action: string,
    reason: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.core.addAuditEvent({
      id: this.core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "denied",
      reason,
      metadata,
      createdAt: this.core.now()
    });
  }
}

export function createPostgresInterviewService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const interviews = new PostgresInterviewRepository(pool);
  const runTransaction: InterviewTransactionRunner = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        interviews: new PostgresInterviewRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  return new InterviewService(core, interviews, runTransaction);
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }
  return actor.userId;
}

function isActiveRole(
  participant: InterviewParticipant | null,
  role: "lead" | "interviewer" | "observer"
) {
  return Boolean(participant && participant.status === "active" && participant.role === role);
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
