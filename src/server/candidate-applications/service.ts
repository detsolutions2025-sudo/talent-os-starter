import type pg from "pg";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCandidateApplicationRepository } from "../persistence/postgres-candidate-application-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import type { CandidateApplicationRepository } from "./repository";
import type {
  ApplicationStatus,
  CandidateApplication,
  CandidateApplicationAdminReadInput,
  CandidateApplicationCandidateContext,
  CandidateApplicationEvent,
  CandidateApplicationFinalizationInput,
  CandidateApplicationInput,
  CandidateApplicationNote,
  CandidateApplicationNoteInput,
  CandidateApplicationStageInput
} from "./types";
import {
  applicationStages,
  ensureNoProtectedAssignment,
  requireAdminReason,
  validateCreateApplication,
  validateFinalizationInput,
  validateNoteInput,
  validateStageInput
} from "./validation";

// Exportado para o orquestrador da candidatura publica (Fase 17,
// `src/server/public-applications/service.ts`) reutilizar a mesma transacao fisica aberta por
// ele para Candidate + CandidateConsent + CandidateApplication (SPEC-020 v1.1, secao 12).
export type CandidateApplicationTransaction = {
  core: CoreRepository;
  applications: CandidateApplicationRepository;
};

type CandidateApplicationTransactionRunner = <T>(
  callback: (transaction: CandidateApplicationTransaction) => Promise<T>
) => Promise<T>;

export class CandidateApplicationService {
  constructor(
    private readonly core: CoreRepository,
    private readonly applications: CandidateApplicationRepository,
    private readonly runTransaction: CandidateApplicationTransactionRunner
  ) {}

  async createApplication(actor: Actor, organizationId: string, input: CandidateApplicationInput) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    this.ensureNoOrganizationChange(organizationId, input.organizationId ?? input.organization_id);
    ensureNoProtectedAssignment(input, [
      "candidateId",
      "candidate_id",
      "jobOpeningId",
      "job_opening_id",
      "jobOpeningVersionId",
      "job_opening_version_id",
      "source"
    ]);
    const preflight = validateCreateApplication(input);
    await this.ensureCandidateUsable(actor, organizationId, preflight.candidateId, true);

    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(
        organizationId,
        input.organizationId ?? input.organization_id
      );
      ensureNoProtectedAssignment(input, [
        "candidateId",
        "candidate_id",
        "jobOpeningId",
        "job_opening_id",
        "jobOpeningVersionId",
        "job_opening_version_id",
        "source"
      ]);
      const normalized = validateCreateApplication(input);
      const candidate = await service.ensureCandidateUsable(
        actor,
        organizationId,
        normalized.candidateId,
        false
      );
      const opening = await service.findOpeningInOrganization(
        actor,
        organizationId,
        normalized.jobOpeningId
      );
      const version = await service.findVersionInOrganization(
        actor,
        organizationId,
        normalized.jobOpeningVersionId
      );
      if (version.jobOpeningId !== opening.id) {
        await service.auditDenied(
          actor,
          organizationId,
          "candidate_application.cross_organization_access_denied",
          "job_opening_version_mismatch",
          { jobOpeningId: opening.id, jobOpeningVersionId: version.id }
        );
        throw notFound("job_opening_version_not_found", "Job opening version not found.");
      }
      if (opening.status !== "open") {
        throw conflict("job_opening_not_open", "Job opening must be open.");
      }
      if (version.status !== "published") {
        throw conflict(
          "job_opening_version_not_published",
          "Job opening version must be published."
        );
      }
      if (
        opening.applicationDeadline &&
        new Date(opening.applicationDeadline).getTime() <= Date.now()
      ) {
        throw conflict(
          "job_opening_deadline_expired",
          "Job opening no longer receives applications."
        );
      }
      if (
        await transaction.applications.findActiveApplication(
          organizationId,
          candidate.id,
          opening.id
        )
      ) {
        throw conflict(
          "candidate_application_duplicate",
          "Candidate already has an active application for this job opening."
        );
      }

      const now = transaction.applications.now();
      const userId = requireUserActorId(actor);
      const application: CandidateApplication = {
        id: transaction.applications.nextId("capp"),
        organizationId,
        candidateId: candidate.id,
        jobOpeningId: opening.id,
        jobOpeningVersionId: version.id,
        applicationStatus: "active",
        currentStage: "applied",
        source: normalized.source,
        appliedAt: now,
        finalizedAt: null,
        finalizedByUserId: null,
        finalizationReason: null,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now
      };
      try {
        await transaction.applications.createApplication(application);
      } catch (error) {
        if (isUniqueViolation(error, "idx_candidate_applications_one_active")) {
          throw conflict(
            "candidate_application_duplicate",
            "Candidate already has an active application for this job opening."
          );
        }
        throw error;
      }
      await service.addEvent(
        application,
        "application_created",
        null,
        "applied",
        null,
        "active",
        null,
        userId
      );
      await service.audit(actor, organizationId, "candidate_application.created", {
        candidateApplicationId: application.id,
        candidateId: application.candidateId,
        jobOpeningId: application.jobOpeningId,
        jobOpeningVersionId: application.jobOpeningVersionId
      });
      return service.serializeOwnerAdmin(application);
    });
  }

  // Criacao publica (SPEC-012 v1.1, secao 6.1.2; SPEC-020 v1.1) -- sem Actor, sem Membership.
  // Chamada exclusivamente pelo orquestrador `PublicApplicationService`, dentro de uma
  // transacao ja aberta por ele. Reutiliza as mesmas validacoes de Vaga/versao/consentimento
  // do fluxo interno (`createApplication`) e adiciona a politica de reaplicacao determinada
  // pela SPEC-020 v1.1, secao 14 -- exclusiva deste canal, nunca aplicada ao fluxo interno.
  // Nunca escreve auditoria (responsabilidade do orquestrador).
  async createApplicationFromPublicSubmission(
    transaction: CandidateApplicationTransaction,
    organizationId: string,
    input: { candidateId: string; jobOpeningId: string; jobOpeningVersionId: string }
  ): Promise<CandidateApplication> {
    const opening = await this.findOpeningInOrganizationNoAudit(
      transaction,
      organizationId,
      input.jobOpeningId
    );
    const version = await this.findVersionInOrganizationNoAudit(
      transaction,
      organizationId,
      input.jobOpeningVersionId
    );
    if (version.jobOpeningId !== opening.id) {
      throw notFound("job_opening_version_not_found", "Job opening version not found.");
    }
    if (opening.status !== "open") {
      throw conflict("job_opening_not_open", "Job opening must be open.");
    }
    if (version.status !== "published") {
      throw conflict("job_opening_version_not_published", "Job opening version must be published.");
    }
    if (
      opening.applicationDeadline &&
      new Date(opening.applicationDeadline).getTime() <= Date.now()
    ) {
      throw conflict(
        "job_opening_deadline_expired",
        "Job opening no longer receives applications."
      );
    }

    const latest = await transaction.applications.findLatestApplicationByCandidateAndJobOpening(
      organizationId,
      input.candidateId,
      opening.id
    );
    ensureReapplicationAllowed(latest);

    const now = transaction.applications.now();
    const application: CandidateApplication = {
      id: transaction.applications.nextId("capp"),
      organizationId,
      candidateId: input.candidateId,
      jobOpeningId: opening.id,
      jobOpeningVersionId: version.id,
      applicationStatus: "active",
      currentStage: "applied",
      source: "public_portal",
      appliedAt: now,
      finalizedAt: null,
      finalizedByUserId: null,
      finalizationReason: null,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now
    };
    try {
      await transaction.applications.createApplication(application);
    } catch (error) {
      if (isUniqueViolation(error, "idx_candidate_applications_one_active")) {
        // Mesmo codigo/mensagem generico de `ensureReapplicationAllowed` -- concorrencia nao
        // pode revelar mais do que a checagem sequencial ja revela (SPEC-020, secao 22).
        throw conflict(
          "candidate_application_reapplication_blocked",
          "Application could not be completed."
        );
      }
      throw error;
    }
    await transaction.applications.addEvent({
      id: transaction.applications.nextId("caevt"),
      organizationId,
      candidateApplicationId: application.id,
      eventType: "application_created",
      stageBefore: null,
      stageAfter: "applied",
      statusBefore: null,
      statusAfter: "active",
      actorUserId: null,
      reason: null,
      proposalVersionId: null,
      createdAt: transaction.applications.now()
    });
    return application;
  }

  async listApplications(actor: Actor, organizationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const applications = await this.applications.listApplications(organizationId);
    const visible =
      context.role === "member"
        ? applications.filter((application) => application.applicationStatus === "active")
        : applications;
    return Promise.all(
      visible.map((application) =>
        context.role === "member"
          ? this.serializeMember(application)
          : this.serializeOwnerAdmin(application)
      )
    );
  }

  async getApplication(actor: Actor, organizationId: string, applicationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const application = await this.findApplicationInOrganization(
      actor,
      organizationId,
      applicationId
    );
    if (context.role === "member" && application.applicationStatus !== "active") {
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    return context.role === "member"
      ? this.serializeMember(application)
      : this.serializeOwnerAdmin(application, {
          events: await this.applications.listEvents(application.id),
          notes: await this.applications.listNotes(application.id)
        });
  }

  async moveStage(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: CandidateApplicationStageInput
  ) {
    const expectedUpdatedAt = await this.preflightOperationalMutation(
      actor,
      organizationId,
      applicationId,
      ["owner", "admin"]
    );
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const application = await service.findApplicationInOrganizationForUpdate(
        actor,
        organizationId,
        applicationId
      );
      const { currentStage, reason } = validateStageInput(input);
      service.ensureNoConcurrentChange(application, expectedUpdatedAt);
      await service.ensureActive(actor, organizationId, application, false);
      await service.ensureOperationalUseAllowed(actor, application, false);
      const movement = stageIndex(currentStage) - stageIndex(application.currentStage);
      if (movement === 0) {
        throw conflict("candidate_application_stage_unchanged", "Application stage is unchanged.");
      }
      if (Math.abs(movement) > 1 && !reason) {
        throw badRequest("candidate_application_jump_reason_required", "Jump reason is required.");
      }
      const updated = {
        ...application,
        currentStage,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: transaction.applications.now()
      };
      await transaction.applications.updateApplication(updated);
      await service.addEvent(
        updated,
        "stage_changed",
        application.currentStage,
        updated.currentStage,
        application.applicationStatus,
        updated.applicationStatus,
        reason,
        requireUserActorId(actor)
      );
      await service.audit(
        actor,
        organizationId,
        Math.abs(movement) > 1
          ? "candidate_application.stage_jumped"
          : "candidate_application.stage_moved",
        {
          candidateApplicationId: application.id,
          stageBefore: application.currentStage,
          stageAfter: updated.currentStage,
          reasonProvided: reason ? "true" : "false"
        }
      );
      return service.serializeOwnerAdmin(updated);
    });
  }

  async withdraw(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: CandidateApplicationFinalizationInput
  ) {
    return this.finalize(actor, organizationId, applicationId, input, "withdrawn");
  }

  async reject(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: CandidateApplicationFinalizationInput
  ) {
    return this.finalize(actor, organizationId, applicationId, input, "rejected");
  }

  async hire(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: CandidateApplicationFinalizationInput
  ) {
    return this.finalize(actor, organizationId, applicationId, input, "hired");
  }

  async cancel(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: CandidateApplicationFinalizationInput
  ) {
    return this.finalize(actor, organizationId, applicationId, input, "cancelled");
  }

  async addNote(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: CandidateApplicationNoteInput
  ) {
    const expectedUpdatedAt = await this.preflightOperationalMutation(
      actor,
      organizationId,
      applicationId,
      ["owner", "admin"]
    );
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const application = await service.findApplicationInOrganizationForUpdate(
        actor,
        organizationId,
        applicationId
      );
      service.ensureNoConcurrentChange(application, expectedUpdatedAt);
      await service.ensureActive(actor, organizationId, application, false);
      await service.ensureOperationalUseAllowed(actor, application, false);
      const now = transaction.applications.now();
      const note: CandidateApplicationNote = {
        id: transaction.applications.nextId("canote"),
        organizationId,
        candidateApplicationId: application.id,
        content: validateNoteInput(input),
        createdByUserId: requireUserActorId(actor),
        updatedByUserId: requireUserActorId(actor),
        createdAt: now,
        updatedAt: now
      };
      await transaction.applications.addNote(note);
      await service.addEvent(
        application,
        "note_added",
        null,
        null,
        "active",
        "active",
        null,
        requireUserActorId(actor)
      );
      await service.audit(actor, organizationId, "candidate_application.note_created", {
        candidateApplicationId: application.id,
        candidateApplicationNoteId: note.id
      });
      return note;
    });
  }

  async listEvents(actor: Actor, organizationId: string, applicationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const application = await this.findApplicationInOrganization(
      actor,
      organizationId,
      applicationId
    );
    return this.applications.listEvents(application.id);
  }

  async listNotes(actor: Actor, organizationId: string, applicationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const application = await this.findApplicationInOrganization(
      actor,
      organizationId,
      applicationId
    );
    return this.applications.listNotes(application.id);
  }

  async history(actor: Actor, organizationId: string, applicationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const application = await this.findApplicationInOrganization(
      actor,
      organizationId,
      applicationId
    );
    return (await this.core.listAuditEvents()).filter(
      (event) =>
        event.organizationId === organizationId &&
        event.metadata.candidateApplicationId === application.id
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: CandidateApplicationAdminReadInput) {
    const reason = requireAdminReason(input);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }
    const applications = await this.applications.listApplications(organizationId);
    await this.audit(actor, organizationId, "candidate_application.administrative_read", {
      reason,
      candidateApplicationCount: String(applications.length)
    });
    return applications.map((application) => this.serializeAdministrative(application));
  }

  private async finalize(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: CandidateApplicationFinalizationInput,
    status: Exclude<ApplicationStatus, "active">
  ) {
    const expectedUpdatedAt =
      status === "hired"
        ? await this.preflightOperationalMutation(actor, organizationId, applicationId, ["owner"])
        : await this.preflightActiveMutation(actor, organizationId, applicationId, [
            "owner",
            "admin"
          ]);
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      const allowed: MembershipRole[] = status === "hired" ? ["owner"] : ["owner", "admin"];
      await service.authorizeUser(actor, organizationId, allowed);
      const application = await service.findApplicationInOrganizationForUpdate(
        actor,
        organizationId,
        applicationId
      );
      service.ensureNoConcurrentChange(application, expectedUpdatedAt);
      await service.ensureActive(actor, organizationId, application, false);
      if (status === "hired") {
        await service.ensureOperationalUseAllowed(actor, application, false);
      }
      const finalization = validateFinalizationInput(input);
      if (status === "hired" && finalization.proposalVersionId) {
        const proposalVersion =
          await transaction.applications.findAcceptedProposalVersionForApplication(
            organizationId,
            application.id,
            finalization.proposalVersionId
          );
        if (!proposalVersion) {
          throw conflict(
            "candidate_application_proposal_version_invalid",
            "Proposal version must be accepted for this application."
          );
        }
      }
      const now = transaction.applications.now();
      const updated: CandidateApplication = {
        ...application,
        applicationStatus: status,
        finalizedAt: now,
        finalizedByUserId: requireUserActorId(actor),
        finalizationReason: finalization.reason,
        updatedAt: now,
        updatedByUserId: requireUserActorId(actor)
      };
      await transaction.applications.updateApplication(updated);
      await service.addEvent(
        updated,
        status,
        application.currentStage,
        updated.currentStage,
        application.applicationStatus,
        updated.applicationStatus,
        finalization.reason,
        requireUserActorId(actor),
        status === "hired" ? finalization.proposalVersionId : null
      );
      await service.audit(actor, organizationId, `candidate_application.${status}`, {
        candidateApplicationId: application.id,
        statusBefore: application.applicationStatus,
        statusAfter: updated.applicationStatus,
        reasonProvided: "true",
        proposalVersionId: status === "hired" ? (finalization.proposalVersionId ?? "") : ""
      });
      return service.serializeOwnerAdmin(updated);
    });
  }

  private scoped(transaction: CandidateApplicationTransaction) {
    return new CandidateApplicationService(
      transaction.core,
      transaction.applications,
      this.runTransaction
    );
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    deniedAction = "candidate_application.permission_denied"
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
        "candidate_application.cross_organization_access_denied",
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

  private ensureNoOrganizationChange(organizationId: string, inputOrganizationId: unknown) {
    if (inputOrganizationId !== undefined && String(inputOrganizationId) !== organizationId) {
      throw badRequest(
        "candidate_application_organization_immutable",
        "Candidate Application cannot change Organization."
      );
    }
  }

  private async findApplicationInOrganization(
    actor: Actor,
    organizationId: string,
    applicationId: string
  ) {
    const application = await this.applications.findApplicationById(applicationId);
    if (!application || application.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "candidate_application.cross_organization_access_denied",
        "candidate_application_organization_mismatch",
        { candidateApplicationId: applicationId }
      );
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    return application;
  }

  private async findApplicationInOrganizationForUpdate(
    actor: Actor,
    organizationId: string,
    applicationId: string
  ) {
    const application = await this.applications.findApplicationForUpdate(applicationId);
    if (!application || application.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "candidate_application.cross_organization_access_denied",
        "candidate_application_organization_mismatch",
        { candidateApplicationId: applicationId }
      );
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    return application;
  }

  private async preflightOperationalMutation(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    allowedRoles: MembershipRole[]
  ) {
    await this.authorizeUser(actor, organizationId, allowedRoles);
    const application = await this.findApplicationInOrganization(
      actor,
      organizationId,
      applicationId
    );
    await this.ensureActive(actor, organizationId, application, true);
    await this.ensureOperationalUseAllowed(actor, application, true);
    return application.updatedAt;
  }

  private async preflightActiveMutation(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    allowedRoles: MembershipRole[]
  ) {
    await this.authorizeUser(actor, organizationId, allowedRoles);
    const application = await this.findApplicationInOrganization(
      actor,
      organizationId,
      applicationId
    );
    await this.ensureActive(actor, organizationId, application, true);
    return application.updatedAt;
  }

  private ensureNoConcurrentChange(application: CandidateApplication, expectedUpdatedAt: string) {
    if (application.updatedAt !== expectedUpdatedAt) {
      throw conflict(
        "candidate_application_concurrent_change",
        "Candidate application changed concurrently."
      );
    }
  }

  private async ensureCandidateUsable(
    actor: Actor,
    organizationId: string,
    candidateId: string,
    auditBlocked: boolean
  ) {
    const candidate = await this.findCandidateInOrganization(actor, organizationId, candidateId);
    if (candidate.status !== "active") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          organizationId,
          "candidate_application.operational_use_denied",
          "candidate_inactive",
          { candidateId }
        );
      }
      throw conflict("candidate_inactive", "Inactive candidate cannot be used operationally.");
    }
    const consent = await this.applications.latestConsent(candidateId);
    if (!consent || consent.status !== "granted") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          organizationId,
          "candidate_application.operational_use_denied",
          "candidate_consent_invalid",
          { candidateId }
        );
      }
      throw conflict("candidate_consent_invalid", "Candidate consent blocks operational use.");
    }
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= Date.now()) {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          organizationId,
          "candidate_application.operational_use_denied",
          "candidate_consent_expired",
          { candidateId }
        );
      }
      throw conflict("candidate_consent_expired", "Candidate consent blocks operational use.");
    }
    return candidate;
  }

  private async ensureOperationalUseAllowed(
    actor: Actor,
    application: CandidateApplication,
    auditBlocked: boolean
  ) {
    await this.ensureCandidateUsable(
      actor,
      application.organizationId,
      application.candidateId,
      auditBlocked
    );
  }

  private async findCandidateInOrganization(
    actor: Actor,
    organizationId: string,
    candidateId: string
  ) {
    const candidate = await this.applications.findCandidate(candidateId);
    if (!candidate || candidate.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "candidate_application.cross_organization_access_denied",
        "candidate_organization_mismatch",
        { candidateId }
      );
      throw notFound("candidate_not_found", "Candidate not found.");
    }
    return candidate;
  }

  private async findOpeningInOrganization(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string
  ) {
    const opening = await this.applications.findJobOpening(jobOpeningId);
    if (!opening || opening.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "candidate_application.cross_organization_access_denied",
        "job_opening_organization_mismatch",
        { jobOpeningId }
      );
      throw notFound("job_opening_not_found", "Job opening not found.");
    }
    return opening;
  }

  // Variantes sem Actor/auditoria de negacao, usadas exclusivamente pela criacao publica
  // (`createApplicationFromPublicSubmission`), que nao possui Actor para auditar. O
  // orquestrador publico (`PublicApplicationService`) e responsavel por qualquer auditoria de
  // negacao relacionada a Vaga invalida, com o contexto completo que ele ja possui.
  private async findOpeningInOrganizationNoAudit(
    transaction: CandidateApplicationTransaction,
    organizationId: string,
    jobOpeningId: string
  ) {
    const opening = await transaction.applications.findJobOpening(jobOpeningId);
    if (!opening || opening.organizationId !== organizationId) {
      throw notFound("job_opening_not_found", "Job opening not found.");
    }
    return opening;
  }

  private async findVersionInOrganizationNoAudit(
    transaction: CandidateApplicationTransaction,
    organizationId: string,
    jobOpeningVersionId: string
  ) {
    const version = await transaction.applications.findJobOpeningVersion(jobOpeningVersionId);
    if (!version || version.organizationId !== organizationId) {
      throw notFound("job_opening_version_not_found", "Job opening version not found.");
    }
    return version;
  }

  private async findVersionInOrganization(
    actor: Actor,
    organizationId: string,
    jobOpeningVersionId: string
  ) {
    const version = await this.applications.findJobOpeningVersion(jobOpeningVersionId);
    if (!version || version.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "candidate_application.cross_organization_access_denied",
        "job_opening_version_organization_mismatch",
        { jobOpeningVersionId }
      );
      throw notFound("job_opening_version_not_found", "Job opening version not found.");
    }
    return version;
  }

  private async ensureActive(
    actor: Actor,
    organizationId: string,
    application: CandidateApplication,
    auditBlocked: boolean
  ) {
    if (application.applicationStatus !== "active") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          organizationId,
          "candidate_application.final_state_denied",
          "candidate_application_final",
          { candidateApplicationId: application.id }
        );
      }
      throw conflict("candidate_application_final", "Final application cannot change.");
    }
  }

  private async addEvent(
    application: CandidateApplication,
    eventType: CandidateApplicationEvent["eventType"],
    stageBefore: CandidateApplicationEvent["stageBefore"],
    stageAfter: CandidateApplicationEvent["stageAfter"],
    statusBefore: CandidateApplicationEvent["statusBefore"],
    statusAfter: CandidateApplicationEvent["statusAfter"],
    reason: string | null,
    actorUserId: string | null,
    proposalVersionId: string | null = null
  ) {
    await this.applications.addEvent({
      id: this.applications.nextId("caevt"),
      organizationId: application.organizationId,
      candidateApplicationId: application.id,
      eventType,
      stageBefore,
      stageAfter,
      statusBefore,
      statusAfter,
      actorUserId,
      reason,
      proposalVersionId,
      createdAt: this.applications.now()
    });
  }

  private async serializeOwnerAdmin(
    application: CandidateApplication,
    extras: {
      events?: CandidateApplicationEvent[];
      notes?: CandidateApplicationNote[];
    } = {}
  ) {
    return {
      ...application,
      events: extras.events,
      notes: extras.notes
    };
  }

  private async serializeMember(application: CandidateApplication) {
    const candidate = await this.applications.findCandidate(application.candidateId);
    const opening = await this.applications.findJobOpening(application.jobOpeningId);
    const version = await this.applications.findJobOpeningVersion(application.jobOpeningVersionId);
    return {
      id: application.id,
      application_status: application.applicationStatus,
      current_stage: application.currentStage,
      applied_at: application.appliedAt,
      candidate: candidate ? serializeMemberCandidate(candidate) : null,
      job_opening: opening
        ? {
            id: opening.id,
            title: opening.title
          }
        : null,
      job_opening_version: version
        ? {
            id: version.id,
            public_title: version.publicTitle,
            version_number: version.versionNumber
          }
        : null
    };
  }

  private serializeAdministrative(application: CandidateApplication) {
    return {
      id: application.id,
      organizationId: application.organizationId,
      candidateId: application.candidateId,
      jobOpeningId: application.jobOpeningId,
      jobOpeningVersionId: application.jobOpeningVersionId,
      applicationStatus: application.applicationStatus,
      currentStage: application.currentStage,
      source: application.source,
      appliedAt: application.appliedAt,
      finalizedAt: application.finalizedAt,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt
    };
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

export function createPostgresCandidateApplicationService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const applications = new PostgresCandidateApplicationRepository(pool);
  const runTransaction: CandidateApplicationTransactionRunner = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        applications: new PostgresCandidateApplicationRepository(client)
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
  return new CandidateApplicationService(core, applications, runTransaction);
}

function serializeMemberCandidate(candidate: CandidateApplicationCandidateContext) {
  return {
    id: candidate.id,
    full_name: candidate.fullName,
    preferred_name: candidate.preferredName
  };
}

function stageIndex(stage: CandidateApplication["currentStage"]) {
  return applicationStages.indexOf(stage);
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }
  return actor.userId;
}

// SPEC-020 v1.1, secao 14 -- politica de reaplicacao do canal publico. Determinista: nunca
// interpreta `finalizationReason` (texto livre). Exclusiva deste canal -- nao altera o
// comportamento do fluxo interno de criacao (secao 6.1.1), que continua usando apenas
// `findActiveApplication`.
//
// As tres causas de bloqueio (`active` duplicada; `cancelled`/`rejected` bloqueados nesta v1;
// `hired` bloqueado) usam **o mesmo codigo e a mesma mensagem genericos**, de proposito: a
// SPEC-020 (secao 22, protecao contra enumeracao) proibe que a resposta publica permita
// distinguir "ja existe candidatura ativa" de "candidatura anterior foi rejeitada/aceita" --
// essa distincao, sozinha, ja seria um vazamento de resultado de selecao. O motivo interno
// real fica disponivel apenas via auditoria (nunca na resposta HTTP).
function ensureReapplicationAllowed(latest: CandidateApplication | null) {
  if (!latest || latest.applicationStatus === "withdrawn") {
    return;
  }
  throw conflict(
    "candidate_application_reapplication_blocked",
    "Application could not be completed."
  );
}

function isUniqueViolation(error: unknown, constraint: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "constraint" in error &&
    (error as { code?: string; constraint?: string }).code === "23505" &&
    (error as { code?: string; constraint?: string }).constraint === constraint
  );
}
