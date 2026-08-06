import type pg from "pg";
import type { CompetencyRepository } from "../competencies/repository";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import type { JobProfileRepository } from "../job-profiles/repository";
import type { OrganizationalUnitRepository } from "../organizational-units/repository";
import { PostgresCompetencyRepository } from "../persistence/postgres-competency-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresJobOpeningRepository } from "../persistence/postgres-job-opening-repository";
import { PostgresJobProfileRepository } from "../persistence/postgres-job-profile-repository";
import { PostgresOrganizationalUnitRepository } from "../persistence/postgres-organizational-unit-repository";
import { PostgresQuestionRepository } from "../persistence/postgres-question-repository";
import type { QuestionRepository } from "../questions/repository";
import type { JobOpeningRepository } from "./repository";
import type {
  JobOpening,
  JobOpeningAdminReadInput,
  JobOpeningCompetencyInput,
  JobOpeningDraftInput,
  JobOpeningInput,
  JobOpeningPublicationInput,
  JobOpeningQuestionInput,
  JobOpeningVersion,
  JobOpeningVersionCompetency,
  JobOpeningVersionQuestion,
  JobOpeningVersionWithLinks,
  NormalizedJobOpeningContent
} from "./types";
import {
  mergeDraftInput,
  requireAdminReason,
  validateCreateJobOpening,
  validateInitialDraft,
  validatePublicationInput,
  validatePublishable,
  validateUpdateJobOpening
} from "./validation";

type JobOpeningTransaction = {
  core: CoreRepository;
  openings: JobOpeningRepository;
  jobProfiles: JobProfileRepository;
  units: OrganizationalUnitRepository;
  competencies: CompetencyRepository;
  questions: QuestionRepository;
};

type JobOpeningTransactionRunner = <T>(
  callback: (transaction: JobOpeningTransaction) => Promise<T>
) => Promise<T>;

export class JobOpeningService {
  constructor(
    private readonly core: CoreRepository,
    private readonly openings: JobOpeningRepository,
    private readonly jobProfiles: JobProfileRepository,
    private readonly units: OrganizationalUnitRepository,
    private readonly competencies: CompetencyRepository,
    private readonly questions: QuestionRepository,
    private readonly runTransaction: JobOpeningTransactionRunner
  ) {}

  async createJobOpening(actor: Actor, organizationId: string, input: JobOpeningInput) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      const normalized = validateCreateJobOpening(input);
      await transaction.openings.lockJobOpenings(organizationId);
      await service.ensureCodeAvailable(organizationId, normalized.normalizedCode, null);
      await service.ensureUnitAllowed(actor, organizationId, normalized.organizationalUnitId);
      await service.ensureJobProfileVersionAllowed(
        actor,
        organizationId,
        normalized.jobProfileVersionId
      );

      const now = transaction.openings.now();
      const userId = requireUserActorId(actor);
      const opening: JobOpening = {
        id: transaction.openings.nextId("jopen"),
        organizationId,
        code: normalized.code,
        normalizedCode: normalized.normalizedCode,
        title: normalized.title,
        status: "draft",
        organizationalUnitId: normalized.organizationalUnitId,
        isPublic: false,
        publicShowSalary: false,
        publicSlug: null,
        publicPublishedAt: null,
        publicUnpublishedAt: null,
        applicationDeadline: null,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now
      };
      const content = validateInitialDraft(input);
      const version: JobOpeningVersion = {
        ...content,
        id: transaction.openings.nextId("jover"),
        jobOpeningId: opening.id,
        organizationId,
        versionNumber: null,
        status: "draft",
        createdByUserId: userId,
        updatedByUserId: userId,
        publishedByUserId: null,
        discardedByUserId: null,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        discardedAt: null
      };

      try {
        await transaction.openings.createJobOpening(opening);
        await transaction.openings.createVersion(version);
      } catch (error) {
        if (isUniqueViolation(error, "job_openings_organization_id_normalized_code_key")) {
          throw conflict("job_opening_code_duplicate", "Job opening code exists.");
        }
        throw error;
      }

      await service.audit(actor, organizationId, "job_opening.created", {
        jobOpeningId: opening.id,
        versionId: version.id
      });
      void version;
      return service.serializeOpening(opening, "admin", null);
    });
  }

  async listJobOpenings(actor: Actor, organizationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const openings =
      context.role === "member"
        ? await this.openings.listJobOpeningsByStatus(organizationId, ["open"])
        : await this.openings.listJobOpenings(organizationId);
    return Promise.all(
      openings.map(async (opening) => {
        const published = await this.openings.findPublished(opening.id);
        return this.serializeOpening(
          opening,
          context.role,
          published ? await this.withLinks(published) : null
        );
      })
    );
  }

  async listInactive(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.openings.listJobOpeningsByStatus(organizationId, ["paused", "closed", "cancelled"]);
  }

  async getJobOpening(actor: Actor, organizationId: string, jobOpeningId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const opening = await this.findOpeningInOrganization(actor, organizationId, jobOpeningId);
    if (context.role === "member" && opening.status !== "open") {
      throw notFound("job_opening_not_found", "Job opening not found.");
    }
    const published = await this.openings.findPublished(jobOpeningId);
    return this.serializeOpening(
      opening,
      context.role,
      published ? await this.withLinks(published) : null
    );
  }

  async updateJobOpening(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string,
    input: JobOpeningInput
  ) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      const context = await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      await transaction.openings.lockJobOpenings(organizationId);
      const opening = await service.findOpeningInOrganization(actor, organizationId, jobOpeningId);
      if (["closed", "cancelled"].includes(opening.status)) {
        throw conflict("job_opening_final", "Final job opening cannot be updated.");
      }
      const patch = validateUpdateJobOpening(input);
      if (patch.normalizedCode && patch.normalizedCode !== opening.normalizedCode) {
        if (context.role !== "owner") {
          await service.auditDenied(
            actor,
            organizationId,
            "job_opening.permission_denied",
            "permission_denied",
            { jobOpeningId }
          );
          throw forbidden("permission_denied", "Permission denied.");
        }
        await service.ensureCodeAvailable(organizationId, patch.normalizedCode, opening.id);
      }
      if (patch.organizationalUnitId !== undefined) {
        await service.ensureUnitAllowed(actor, organizationId, patch.organizationalUnitId);
      }
      const updated: JobOpening = {
        ...opening,
        ...definedPatch(patch),
        updatedByUserId: requireUserActorId(actor),
        updatedAt: transaction.openings.now()
      };
      await transaction.openings.updateJobOpening(updated);
      await service.audit(actor, organizationId, "job_opening.updated", { jobOpeningId });
      if (opening.code !== updated.code) {
        await service.audit(actor, organizationId, "job_opening.code_changed", { jobOpeningId });
      }
      return updated;
    });
  }

  async createDraft(actor: Actor, organizationId: string, jobOpeningId: string) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await transaction.openings.lockVersions(jobOpeningId);
      const opening = await service.findOpeningInOrganization(actor, organizationId, jobOpeningId);
      if (["closed", "cancelled"].includes(opening.status)) {
        throw conflict("job_opening_final", "Final job opening cannot receive draft.");
      }
      if (await transaction.openings.findActiveDraft(jobOpeningId)) {
        throw conflict(
          "job_opening_active_draft_exists",
          "Job opening already has an active draft."
        );
      }
      const published = await transaction.openings.findPublished(jobOpeningId);
      if (!published) {
        throw notFound(
          "job_opening_published_not_found",
          "Published job opening version not found."
        );
      }
      const competencyInputs = (await transaction.openings.listCompetencies(published.id)).map(
        toCompetencyInput
      );
      const questionInputs = (await transaction.openings.listQuestions(published.id)).map(
        toQuestionInput
      );
      await service.ensureCompetenciesAllowed(actor, organizationId, competencyInputs);
      await service.ensureQuestionsAllowed(actor, organizationId, questionInputs);
      const now = transaction.openings.now();
      const draft: JobOpeningVersion = {
        ...toContent(published),
        id: transaction.openings.nextId("jover"),
        jobOpeningId,
        organizationId,
        versionNumber: null,
        status: "draft",
        createdByUserId: requireUserActorId(actor),
        updatedByUserId: requireUserActorId(actor),
        publishedByUserId: null,
        discardedByUserId: null,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        discardedAt: null
      };
      await transaction.openings.createVersion(draft);
      await transaction.openings.replaceCompetencies(
        draft.id,
        competencyInputs.map((competency) =>
          toVersionCompetency(transaction.openings, organizationId, draft.id, competency, now)
        )
      );
      await transaction.openings.replaceQuestions(
        draft.id,
        questionInputs.map((question) =>
          toVersionQuestion(transaction.openings, organizationId, draft.id, question, now)
        )
      );
      await service.audit(actor, organizationId, "job_opening.draft_created", {
        jobOpeningId,
        versionId: draft.id
      });
      return service.withLinks(draft);
    });
  }

  async getActiveDraft(actor: Actor, organizationId: string, jobOpeningId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    await this.findOpeningInOrganization(actor, organizationId, jobOpeningId);
    const draft = await this.openings.findActiveDraft(jobOpeningId);
    if (!draft) {
      throw notFound("job_opening_draft_not_found", "Job opening draft not found.");
    }
    return this.withLinks(draft);
  }

  async getPublished(actor: Actor, organizationId: string, jobOpeningId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const opening = await this.findOpeningInOrganization(actor, organizationId, jobOpeningId);
    if (context.role === "member" && opening.status !== "open") {
      throw notFound("job_opening_not_found", "Job opening not found.");
    }
    const published = await this.openings.findPublished(jobOpeningId);
    if (!published) {
      throw notFound("job_opening_published_not_found", "Published job opening version not found.");
    }
    const withLinks = await this.withLinks(published);
    return context.role === "member" ? redactVersion(withLinks) : withLinks;
  }

  async listVersions(actor: Actor, organizationId: string, jobOpeningId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    await this.findOpeningInOrganization(actor, organizationId, jobOpeningId);
    return Promise.all(
      (await this.openings.listVersions(jobOpeningId)).map((version) => this.withLinks(version))
    );
  }

  async getVersion(actor: Actor, organizationId: string, jobOpeningId: string, versionId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const opening = await this.findOpeningInOrganization(actor, organizationId, jobOpeningId);
    const version = await this.openings.findVersionById(versionId);
    if (
      !version ||
      version.organizationId !== organizationId ||
      version.jobOpeningId !== jobOpeningId
    ) {
      throw notFound("job_opening_version_not_found", "Job opening version not found.");
    }
    if (
      context.role === "member" &&
      (opening.status !== "open" || version.status !== "published")
    ) {
      throw notFound("job_opening_version_not_found", "Job opening version not found.");
    }
    const withLinks = await this.withLinks(version);
    return context.role === "member" ? redactVersion(withLinks) : withLinks;
  }

  async updateDraft(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string,
    versionId: string,
    input: JobOpeningDraftInput
  ) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      await transaction.openings.lockVersions(jobOpeningId);
      await service.findOpeningInOrganization(actor, organizationId, jobOpeningId);
      const draft = await service.findActiveDraft(organizationId, jobOpeningId, versionId);
      const normalized = mergeDraftInput(
        toContent(draft),
        (await transaction.openings.listCompetencies(versionId)).map(toCompetencyInput),
        (await transaction.openings.listQuestions(versionId)).map(toQuestionInput),
        input
      );
      await service.ensureJobProfileVersionAllowed(
        actor,
        organizationId,
        normalized.content.jobProfileVersionId
      );
      await service.ensureCompetenciesAllowed(actor, organizationId, normalized.competencies);
      await service.ensureQuestionsAllowed(actor, organizationId, normalized.questions);
      const now = transaction.openings.now();
      const updated: JobOpeningVersion = {
        ...draft,
        ...normalized.content,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: now
      };
      await transaction.openings.updateVersion(updated);
      await transaction.openings.replaceCompetencies(
        versionId,
        normalized.competencies.map((competency) =>
          toVersionCompetency(transaction.openings, organizationId, versionId, competency, now)
        )
      );
      await transaction.openings.replaceQuestions(
        versionId,
        normalized.questions.map((question) =>
          toVersionQuestion(transaction.openings, organizationId, versionId, question, now)
        )
      );
      await service.audit(actor, organizationId, "job_opening.draft_updated", {
        jobOpeningId,
        versionId
      });
      if (draft.jobProfileVersionId !== updated.jobProfileVersionId) {
        await service.audit(actor, organizationId, "job_opening.job_profile_changed_in_draft", {
          jobOpeningId,
          versionId
        });
      }
      return service.withLinks(updated);
    });
  }

  async discardDraft(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string,
    versionId: string
  ) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await transaction.openings.lockVersions(jobOpeningId);
      await service.findOpeningInOrganization(actor, organizationId, jobOpeningId);
      const draft = await service.findActiveDraft(organizationId, jobOpeningId, versionId);
      const now = transaction.openings.now();
      const discarded = {
        ...draft,
        discardedAt: now,
        discardedByUserId: requireUserActorId(actor),
        updatedByUserId: requireUserActorId(actor),
        updatedAt: now
      };
      await transaction.openings.updateVersion(discarded);
      await service.audit(actor, organizationId, "job_opening.draft_discarded", {
        jobOpeningId,
        versionId
      });
      return service.withLinks(discarded);
    });
  }

  async publishDraft(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string,
    versionId: string
  ) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner"], "job_opening.publish_denied");
      await transaction.openings.lockVersions(jobOpeningId);
      await service.findOpeningInOrganization(actor, organizationId, jobOpeningId);
      const draft = await service.findActiveDraft(organizationId, jobOpeningId, versionId);
      const competencyInputs = (await transaction.openings.listCompetencies(versionId)).map(
        toCompetencyInput
      );
      const questionInputs = (await transaction.openings.listQuestions(versionId)).map(
        toQuestionInput
      );
      validatePublishable(toContent(draft), competencyInputs, questionInputs);
      await service.ensureJobProfileVersionAllowed(
        actor,
        organizationId,
        draft.jobProfileVersionId
      );
      await service.ensureCompetenciesAllowed(actor, organizationId, competencyInputs);
      await service.ensureQuestionsAllowed(actor, organizationId, questionInputs);
      const published = await transaction.openings.findPublished(jobOpeningId);
      const now = transaction.openings.now();
      if (published) {
        await transaction.openings.updateVersion({
          ...published,
          status: "archived",
          updatedAt: now,
          updatedByUserId: requireUserActorId(actor)
        });
        await service.audit(actor, organizationId, "job_opening.previous_version_archived", {
          jobOpeningId,
          versionId: published.id
        });
      }
      const nextVersionNumber = (await transaction.openings.maxVersionNumber(jobOpeningId)) + 1;
      const next: JobOpeningVersion = {
        ...draft,
        versionNumber: nextVersionNumber,
        status: "published",
        updatedByUserId: requireUserActorId(actor),
        publishedByUserId: requireUserActorId(actor),
        updatedAt: now,
        publishedAt: now
      };
      await transaction.openings.updateVersion(next);
      await service.audit(actor, organizationId, "job_opening.published", {
        jobOpeningId,
        versionId,
        versionNumber: String(nextVersionNumber)
      });
      return service.withLinks(next);
    });
  }

  async transition(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string,
    status: JobOpening["status"]
  ) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      const allowed: MembershipRole[] =
        status === "open" || status === "cancelled" ? ["owner"] : ["owner", "admin"];
      await service.authorizeUser(actor, organizationId, allowed);
      await transaction.openings.lockJobOpenings(organizationId);
      const opening = await service.findOpeningInOrganization(actor, organizationId, jobOpeningId);
      const published = await transaction.openings.findPublished(jobOpeningId);
      service.ensureTransition(opening, status, Boolean(published));
      const now = transaction.openings.now();
      const updated: JobOpening = {
        ...opening,
        status,
        isPublic: status === "open" ? opening.isPublic : false,
        publicShowSalary: status === "open" ? opening.publicShowSalary : false,
        publicUnpublishedAt: status === "open" ? opening.publicUnpublishedAt : now,
        updatedAt: now,
        updatedByUserId: requireUserActorId(actor)
      };
      await transaction.openings.updateJobOpening(updated);
      await service.audit(actor, organizationId, actionForStatus(status), { jobOpeningId });
      if (opening.isPublic && !updated.isPublic) {
        await service.audit(actor, organizationId, "job_opening.public_unpublished", {
          jobOpeningId
        });
      }
      return updated;
    });
  }

  async configurePublication(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string,
    input: JobOpeningPublicationInput
  ) {
    return this.runTransaction(async (transaction) => {
      const service = this.scoped(transaction);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await transaction.openings.lockJobOpenings(organizationId);
      const opening = await service.findOpeningInOrganization(actor, organizationId, jobOpeningId);
      const published = await transaction.openings.findPublished(jobOpeningId);
      if (!published || !published.publishedByUserId) {
        throw conflict("job_opening_not_published", "Job opening must be internally published.");
      }
      if (opening.status !== "open") {
        throw conflict("job_opening_not_open", "Job opening must be open.");
      }
      const publication = validatePublicationInput(input);
      if (
        opening.publicSlug &&
        publication.publicSlug &&
        opening.publicSlug !== publication.publicSlug
      ) {
        throw conflict("job_opening_slug_immutable", "Public slug cannot be changed.");
      }
      if (publication.publicSlug) {
        const existing = await transaction.openings.findJobOpeningByPublicSlug(
          publication.publicSlug
        );
        if (existing && existing.id !== opening.id) {
          throw conflict("job_opening_slug_duplicate", "Public slug is already reserved.");
        }
      }
      const now = transaction.openings.now();
      const updated: JobOpening = {
        ...opening,
        isPublic: publication.isPublic,
        publicShowSalary: publication.isPublic ? publication.publicShowSalary : false,
        publicSlug: opening.publicSlug ?? publication.publicSlug,
        publicPublishedAt: publication.isPublic
          ? (opening.publicPublishedAt ?? now)
          : opening.publicPublishedAt,
        publicUnpublishedAt: publication.isPublic ? null : now,
        applicationDeadline: publication.applicationDeadline,
        updatedAt: now,
        updatedByUserId: requireUserActorId(actor)
      };
      await transaction.openings.updateJobOpening(updated);
      await service.audit(
        actor,
        organizationId,
        publication.isPublic ? "job_opening.public_published" : "job_opening.public_unpublished",
        { jobOpeningId }
      );
      return service.serializeOpening(updated, "admin", await service.withLinks(published));
    });
  }

  async getPublicBySlug(slug: string) {
    const opening = await this.openings.findJobOpeningByPublicSlug(slug.toLowerCase());
    if (!opening) {
      throw notFound("job_opening_public_not_found", "Job opening not found.");
    }
    const organization = await this.core.findOrganizationById(opening.organizationId);
    if (!organization || organization.status !== "active") {
      throw notFound("job_opening_public_not_found", "Job opening not found.");
    }
    const published = await this.openings.findPublished(opening.id);
    if (!published) {
      throw notFound("job_opening_public_not_found", "Job opening not found.");
    }
    return this.serializePublic(opening, await this.withLinks(published));
  }

  async history(actor: Actor, organizationId: string, jobOpeningId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    await this.findOpeningInOrganization(actor, organizationId, jobOpeningId);
    return (await this.core.listAuditEvents()).filter(
      (event) =>
        event.organizationId === organizationId && event.metadata.jobOpeningId === jobOpeningId
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: JobOpeningAdminReadInput) {
    const reason = requireAdminReason(input.reason);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }
    const openings = await this.openings.listJobOpenings(organizationId);
    await this.audit(actor, organizationId, "job_opening.administrative_read", {
      reason,
      jobOpeningCount: String(openings.length)
    });
    return openings;
  }

  private scoped(transaction: JobOpeningTransaction) {
    return new JobOpeningService(
      transaction.core,
      transaction.openings,
      transaction.jobProfiles,
      transaction.units,
      transaction.competencies,
      transaction.questions,
      this.runTransaction
    );
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    deniedAction = "job_opening.permission_denied"
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
        "job_opening.cross_organization_access_denied",
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

  private async ensureCodeAvailable(
    organizationId: string,
    normalizedCode: string,
    currentId: string | null
  ) {
    const existing = await this.openings.findJobOpeningByNormalizedCode(
      organizationId,
      normalizedCode
    );
    if (existing && existing.id !== currentId) {
      throw conflict("job_opening_code_duplicate", "Job opening code exists.");
    }
  }

  private async findOpeningInOrganization(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string
  ) {
    const opening = await this.openings.findJobOpeningById(jobOpeningId);
    if (!opening || opening.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "job_opening.cross_organization_access_denied",
        "job_opening_organization_mismatch",
        { jobOpeningId }
      );
      throw notFound("job_opening_not_found", "Job opening not found.");
    }
    return opening;
  }

  private async findActiveDraft(organizationId: string, jobOpeningId: string, versionId: string) {
    const draft = await this.openings.findVersionById(versionId);
    if (!draft || draft.organizationId !== organizationId || draft.jobOpeningId !== jobOpeningId) {
      throw notFound("job_opening_version_not_found", "Job opening version not found.");
    }
    if (draft.status !== "draft" || draft.discardedAt) {
      throw conflict("job_opening_draft_inactive", "Job opening draft is not active.");
    }
    return draft;
  }

  private async ensureJobProfileVersionAllowed(
    actor: Actor,
    organizationId: string,
    versionId: string
  ) {
    const version = await this.jobProfiles.findVersionById(versionId);
    if (!version || version.organizationId !== organizationId || version.status !== "published") {
      await this.auditDenied(
        actor,
        organizationId,
        "job_opening.publish_denied",
        "invalid_job_profile_version",
        { jobProfileVersionId: versionId }
      );
      throw badRequest(
        "job_opening_job_profile_version_invalid",
        "Job profile version is invalid."
      );
    }
    const profile = await this.jobProfiles.findJobProfileById(version.jobProfileId);
    if (!profile || profile.organizationId !== organizationId || profile.status !== "active") {
      throw badRequest("job_opening_job_profile_inactive", "Job profile is invalid.");
    }
  }

  private async ensureUnitAllowed(actor: Actor, organizationId: string, unitId: string | null) {
    if (!unitId) {
      return;
    }
    const unit = await this.units.findUnitById(unitId);
    if (!unit || unit.organizationId !== organizationId || unit.status !== "active") {
      await this.auditDenied(
        actor,
        organizationId,
        "job_opening.cross_organization_access_denied",
        "invalid_organizational_unit",
        { organizationalUnitId: unitId }
      );
      throw badRequest(
        "job_opening_organizational_unit_invalid",
        "Organizational Unit is invalid."
      );
    }
  }

  private async ensureCompetenciesAllowed(
    actor: Actor,
    organizationId: string,
    competencyInputs: { competencyCatalogItemId: string }[]
  ) {
    for (const competency of competencyInputs) {
      const item = await this.competencies.findCatalogItemById(competency.competencyCatalogItemId);
      if (!item || item.organizationId !== organizationId || item.status !== "active") {
        await this.auditDenied(
          actor,
          organizationId,
          "job_opening.invalid_competency_denied",
          "invalid_competency",
          { competencyCatalogItemId: competency.competencyCatalogItemId }
        );
        throw badRequest("job_opening_competency_invalid", "Competency catalog item is invalid.");
      }
    }
  }

  private async ensureQuestionsAllowed(
    actor: Actor,
    organizationId: string,
    questionInputs: { questionCatalogItemId: string }[]
  ) {
    for (const question of questionInputs) {
      const item = await this.questions.findCatalogItemById(question.questionCatalogItemId);
      if (!item || item.organizationId !== organizationId || item.status !== "active") {
        await this.auditDenied(
          actor,
          organizationId,
          "job_opening.invalid_question_denied",
          "invalid_question",
          { questionCatalogItemId: question.questionCatalogItemId }
        );
        throw badRequest("job_opening_question_invalid", "Question catalog item is invalid.");
      }
    }
  }

  private ensureTransition(opening: JobOpening, next: JobOpening["status"], hasPublished: boolean) {
    if (["closed", "cancelled"].includes(opening.status)) {
      throw conflict("job_opening_final", "Final job opening cannot transition.");
    }
    if (next === "cancelled" && opening.status === "draft") {
      return;
    }
    if (!hasPublished) {
      throw conflict("job_opening_published_required", "Published version is required.");
    }
    const allowed = new Set([
      "draft:open",
      "open:paused",
      "paused:open",
      "open:closed",
      "paused:closed",
      "open:cancelled",
      "paused:cancelled"
    ]);
    if (!allowed.has(`${opening.status}:${next}`)) {
      throw conflict("job_opening_transition_invalid", "Job opening transition is invalid.");
    }
  }

  private ensureNoOrganizationChange(
    organizationId: string,
    inputOrganizationId: string | undefined
  ) {
    if (inputOrganizationId !== undefined && inputOrganizationId !== organizationId) {
      throw badRequest(
        "job_opening_organization_immutable",
        "Job Opening cannot change Organization."
      );
    }
  }

  private async withLinks(version: JobOpeningVersion): Promise<JobOpeningVersionWithLinks> {
    return {
      ...version,
      competencies: await this.openings.listCompetencies(version.id),
      questions: await this.openings.listQuestions(version.id)
    };
  }

  private serializeOpening(
    opening: JobOpening,
    role: MembershipRole | "admin",
    publishedVersion: JobOpeningVersionWithLinks | null
  ) {
    const safeVersion =
      publishedVersion && role === "member" ? redactVersion(publishedVersion) : publishedVersion;
    return {
      ...opening,
      isPubliclyAvailable: isPubliclyAvailable(opening),
      publishedVersion: safeVersion
    };
  }

  private serializePublic(opening: JobOpening, version: JobOpeningVersionWithLinks) {
    return {
      slug: opening.publicSlug,
      title: version.publicTitle,
      description: version.description,
      responsibilities: version.responsibilities,
      requirements: version.requirements,
      benefits: version.benefits,
      location: version.location,
      workModel: version.workModel,
      workSchedule: version.workSchedule,
      salaryRange: opening.isPublic && opening.publicShowSalary ? version.salaryRange : null,
      positionsCount: version.positionsCount,
      expectedStartDate: version.expectedStartDate,
      publicInstructions: version.publicInstructions,
      applicationDeadline: opening.applicationDeadline,
      isPubliclyAvailable: isPubliclyAvailable(opening)
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

export function createPostgresJobOpeningService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const openings = new PostgresJobOpeningRepository(pool);
  const jobProfiles = new PostgresJobProfileRepository(pool);
  const units = new PostgresOrganizationalUnitRepository(pool);
  const competencies = new PostgresCompetencyRepository(pool);
  const questions = new PostgresQuestionRepository(pool);
  const runTransaction: JobOpeningTransactionRunner = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        openings: new PostgresJobOpeningRepository(client),
        jobProfiles: new PostgresJobProfileRepository(client),
        units: new PostgresOrganizationalUnitRepository(client),
        competencies: new PostgresCompetencyRepository(client),
        questions: new PostgresQuestionRepository(client)
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
  return new JobOpeningService(
    core,
    openings,
    jobProfiles,
    units,
    competencies,
    questions,
    runTransaction
  );
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }
  return actor.userId;
}

function toContent(version: JobOpeningVersion): NormalizedJobOpeningContent {
  return {
    jobProfileVersionId: version.jobProfileVersionId,
    publicTitle: version.publicTitle,
    description: version.description,
    responsibilities: version.responsibilities,
    requirements: version.requirements,
    benefits: version.benefits,
    location: version.location,
    workModel: version.workModel,
    workSchedule: version.workSchedule,
    salaryRange: version.salaryRange,
    positionsCount: version.positionsCount,
    expectedStartDate: version.expectedStartDate,
    internalInstructions: version.internalInstructions,
    publicInstructions: version.publicInstructions
  };
}

function toCompetencyInput(competency: JobOpeningVersionCompetency): JobOpeningCompetencyInput {
  return {
    competencyCatalogItemId: competency.competencyCatalogItemId,
    expectedLevel: competency.expectedLevel,
    required: competency.required,
    weight: competency.weight,
    displayOrder: competency.displayOrder,
    note: competency.note
  };
}

function toQuestionInput(question: JobOpeningVersionQuestion): JobOpeningQuestionInput {
  return {
    questionCatalogItemId: question.questionCatalogItemId,
    required: question.required,
    displayOrder: question.displayOrder,
    weight: question.weight,
    contextSettings: question.contextSettings
  };
}

function toVersionCompetency(
  repository: JobOpeningRepository,
  organizationId: string,
  versionId: string,
  competency: JobOpeningCompetencyInput,
  now: string
): JobOpeningVersionCompetency {
  return {
    id: repository.nextId("jocmp"),
    organizationId,
    jobOpeningVersionId: versionId,
    competencyCatalogItemId: competency.competencyCatalogItemId,
    expectedLevel: competency.expectedLevel,
    required: competency.required,
    weight: competency.weight,
    displayOrder: competency.displayOrder,
    note: competency.note,
    createdAt: now,
    updatedAt: now
  };
}

function toVersionQuestion(
  repository: JobOpeningRepository,
  organizationId: string,
  versionId: string,
  question: JobOpeningQuestionInput,
  now: string
): JobOpeningVersionQuestion {
  return {
    id: repository.nextId("joq"),
    organizationId,
    jobOpeningVersionId: versionId,
    questionCatalogItemId: question.questionCatalogItemId,
    required: question.required,
    displayOrder: question.displayOrder,
    weight: question.weight,
    contextSettings: question.contextSettings,
    createdAt: now,
    updatedAt: now
  };
}

function redactVersion(version: JobOpeningVersionWithLinks): JobOpeningVersionWithLinks {
  return { ...version, salaryRange: null, internalInstructions: "" };
}

function isPubliclyAvailable(opening: JobOpening) {
  return (
    opening.status === "open" &&
    opening.isPublic &&
    (!opening.applicationDeadline || new Date(opening.applicationDeadline).getTime() > Date.now())
  );
}

function actionForStatus(status: JobOpening["status"]) {
  return {
    draft: "job_opening.updated",
    open: "job_opening.opened",
    paused: "job_opening.paused",
    closed: "job_opening.closed",
    cancelled: "job_opening.cancelled"
  }[status];
}

function definedPatch<T extends Record<string, unknown>>(patch: T) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
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
