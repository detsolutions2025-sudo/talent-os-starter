import type pg from "pg";
import type { CompetencyRepository } from "../competencies/repository";
import { forbidden, notFound, conflict, badRequest } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCompetencyRepository } from "../persistence/postgres-competency-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresJobProfileRepository } from "../persistence/postgres-job-profile-repository";
import type { JobProfileRepository } from "./repository";
import type {
  JobProfile,
  JobProfileAdminReadInput,
  JobProfileDraftInput,
  JobProfileInput,
  JobProfileVersion,
  JobProfileVersionCompetency,
  JobProfileVersionWithCompetencies
} from "./types";
import {
  mergeDraftInput,
  requireAdminReason,
  validateCreateJobProfile,
  validatePublishable,
  validateUpdateJobProfile
} from "./validation";

type JobProfileTransaction = {
  core: CoreRepository;
  jobProfiles: JobProfileRepository;
  competencies: CompetencyRepository;
};

type JobProfileTransactionRunner = <T>(
  callback: (transaction: JobProfileTransaction) => Promise<T>
) => Promise<T>;

export class JobProfileService {
  constructor(
    private readonly core: CoreRepository,
    private readonly jobProfiles: JobProfileRepository,
    private readonly competencies: CompetencyRepository,
    private readonly runTransaction: JobProfileTransactionRunner
  ) {}

  async createJobProfile(actor: Actor, organizationId: string, input: JobProfileInput) {
    return this.runTransaction(async ({ core, jobProfiles, competencies }) => {
      const service = this.scoped(core, jobProfiles, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      await jobProfiles.lockJobProfiles(organizationId);
      const normalized = validateCreateJobProfile(input);
      await service.ensureCodeAvailable(organizationId, normalized.normalizedCode, null);
      const now = jobProfiles.now();
      const userId = requireUserActorId(actor);
      const profile: JobProfile = {
        id: jobProfiles.nextId("job"),
        organizationId,
        code: normalized.code,
        normalizedCode: normalized.normalizedCode,
        name: normalized.name,
        status: "active",
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
        inactivatedAt: null
      };

      try {
        await jobProfiles.createJobProfile(profile);
      } catch (error) {
        if (isUniqueViolation(error, "job_profiles_organization_id_normalized_code_key")) {
          throw conflict("job_profile_code_duplicate", "Job profile code exists.");
        }
        throw error;
      }

      await service.audit(actor, organizationId, "job_profile.created", {
        jobProfileId: profile.id
      });

      return profile;
    });
  }

  async listActive(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.jobProfiles.listJobProfilesByStatus(organizationId, "active");
  }

  async listInactive(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.jobProfiles.listJobProfilesByStatus(organizationId, "inactive");
  }

  async getJobProfile(actor: Actor, organizationId: string, jobProfileId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const profile = await this.findProfileInOrganization(actor, organizationId, jobProfileId);

    if (context.role === "member" && profile.status !== "active") {
      throw notFound("job_profile_not_found", "Job profile not found.");
    }

    return profile;
  }

  async updateJobProfile(
    actor: Actor,
    organizationId: string,
    jobProfileId: string,
    input: JobProfileInput
  ) {
    return this.runTransaction(async ({ core, jobProfiles, competencies }) => {
      const service = this.scoped(core, jobProfiles, competencies);
      const context = await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      await jobProfiles.lockJobProfiles(organizationId);
      const profile = await service.findProfileInOrganization(actor, organizationId, jobProfileId);
      const patch = validateUpdateJobProfile(input);

      if (patch.normalizedCode && patch.normalizedCode !== profile.normalizedCode) {
        if (context.role !== "owner") {
          await service.auditDenied(
            actor,
            organizationId,
            "job_profile.permission_denied",
            "permission_denied",
            {
              jobProfileId
            }
          );
          throw forbidden("permission_denied", "Permission denied.");
        }
        await service.ensureCodeAvailable(organizationId, patch.normalizedCode, profile.id);
      }

      const updated: JobProfile = {
        ...profile,
        ...definedPatch(patch),
        updatedByUserId: requireUserActorId(actor),
        updatedAt: jobProfiles.now()
      };
      await jobProfiles.updateJobProfile(updated);
      await service.audit(actor, organizationId, "job_profile.updated", {
        jobProfileId,
        fields: changedProfileFields(profile, updated).join(",")
      });

      if (profile.code !== updated.code) {
        await service.audit(actor, organizationId, "job_profile.code_changed", { jobProfileId });
      }

      return updated;
    });
  }

  async setJobProfileStatus(
    actor: Actor,
    organizationId: string,
    jobProfileId: string,
    status: JobProfile["status"]
  ) {
    return this.runTransaction(async ({ core, jobProfiles, competencies }) => {
      const service = this.scoped(core, jobProfiles, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await jobProfiles.lockJobProfiles(organizationId);
      const profile = await service.findProfileInOrganization(actor, organizationId, jobProfileId);
      const now = jobProfiles.now();
      const updated: JobProfile = {
        ...profile,
        status,
        inactivatedAt: status === "inactive" ? now : null,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: now
      };

      await jobProfiles.updateJobProfile(updated);
      await service.audit(
        actor,
        organizationId,
        status === "active" ? "job_profile.activated" : "job_profile.inactivated",
        { jobProfileId }
      );
      return updated;
    });
  }

  async createDraft(
    actor: Actor,
    organizationId: string,
    jobProfileId: string,
    input: JobProfileDraftInput
  ) {
    return this.runTransaction(async ({ core, jobProfiles, competencies }) => {
      const service = this.scoped(core, jobProfiles, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      await jobProfiles.lockVersions(jobProfileId);
      const profile = await service.findActiveProfileInOrganization(
        actor,
        organizationId,
        jobProfileId
      );

      if (await jobProfiles.findActiveDraft(jobProfileId)) {
        throw conflict(
          "job_profile_active_draft_exists",
          "Job profile already has an active draft."
        );
      }

      const published = await jobProfiles.findPublished(jobProfileId);
      const publishedCompetencies = published
        ? await jobProfiles.listCompetencies(published.id)
        : [];
      const base = published ? toContent(published) : emptyContent(profile.name);
      const currentCompetencies = publishedCompetencies.map(toCompetencyInput);
      const normalized =
        published || Object.keys(input).length
          ? mergeDraftInput(base, currentCompetencies, input)
          : { content: base, competencies: [] };

      await service.ensureCompetenciesAllowed(actor, organizationId, normalized.competencies);
      const now = jobProfiles.now();
      const userId = requireUserActorId(actor);
      const draft: JobProfileVersion = {
        ...normalized.content,
        id: jobProfiles.nextId("jver"),
        jobProfileId,
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
        await jobProfiles.createVersion(draft);
      } catch (error) {
        if (isUniqueViolation(error, "idx_job_profile_versions_active_draft")) {
          throw conflict(
            "job_profile_active_draft_exists",
            "Job profile already has an active draft."
          );
        }
        throw error;
      }

      await jobProfiles.replaceCompetencies(
        draft.id,
        normalized.competencies.map((competency) =>
          toVersionCompetency(jobProfiles, organizationId, draft.id, competency, now)
        )
      );
      await service.audit(actor, organizationId, "job_profile.draft_created", {
        jobProfileId,
        versionId: draft.id
      });

      return service.withCompetencies(draft);
    });
  }

  async getActiveDraft(actor: Actor, organizationId: string, jobProfileId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    await this.findProfileInOrganization(actor, organizationId, jobProfileId);
    const draft = await this.jobProfiles.findActiveDraft(jobProfileId);

    if (!draft) {
      throw notFound("job_profile_draft_not_found", "Job profile draft not found.");
    }

    return this.withCompetencies(draft);
  }

  async updateDraft(
    actor: Actor,
    organizationId: string,
    jobProfileId: string,
    versionId: string,
    input: JobProfileDraftInput
  ) {
    return this.runTransaction(async ({ core, jobProfiles, competencies }) => {
      const service = this.scoped(core, jobProfiles, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      await jobProfiles.lockVersions(jobProfileId);
      await service.findActiveProfileInOrganization(actor, organizationId, jobProfileId);
      const draft = await service.findActiveDraftInProfile(organizationId, jobProfileId, versionId);
      const currentCompetencies = (await jobProfiles.listCompetencies(versionId)).map(
        toCompetencyInput
      );
      const normalized = mergeDraftInput(toContent(draft), currentCompetencies, input);
      await service.ensureCompetenciesAllowed(actor, organizationId, normalized.competencies);
      const updated: JobProfileVersion = {
        ...draft,
        ...normalized.content,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: jobProfiles.now()
      };

      await jobProfiles.updateVersion(updated);
      await jobProfiles.replaceCompetencies(
        versionId,
        normalized.competencies.map((competency) =>
          toVersionCompetency(jobProfiles, organizationId, versionId, competency, updated.updatedAt)
        )
      );
      await service.audit(actor, organizationId, "job_profile.draft_updated", {
        jobProfileId,
        versionId,
        fields: changedVersionFields(draft, updated).join(",")
      });

      return service.withCompetencies(updated);
    });
  }

  async discardDraft(
    actor: Actor,
    organizationId: string,
    jobProfileId: string,
    versionId: string
  ) {
    return this.runTransaction(async ({ core, jobProfiles, competencies }) => {
      const service = this.scoped(core, jobProfiles, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await jobProfiles.lockVersions(jobProfileId);
      await service.findProfileInOrganization(actor, organizationId, jobProfileId);
      const draft = await service.findActiveDraftInProfile(organizationId, jobProfileId, versionId);
      const now = jobProfiles.now();
      const discarded: JobProfileVersion = {
        ...draft,
        discardedAt: now,
        discardedByUserId: requireUserActorId(actor),
        updatedByUserId: requireUserActorId(actor),
        updatedAt: now
      };

      await jobProfiles.updateVersion(discarded);
      await service.audit(actor, organizationId, "job_profile.draft_discarded", {
        jobProfileId,
        versionId
      });
      return service.withCompetencies(discarded);
    });
  }

  async publishDraft(
    actor: Actor,
    organizationId: string,
    jobProfileId: string,
    versionId: string
  ) {
    return this.runTransaction(async ({ core, jobProfiles, competencies }) => {
      const service = this.scoped(core, jobProfiles, competencies);
      await service.authorizeUser(actor, organizationId, ["owner"], "job_profile.publish_denied");
      await jobProfiles.lockVersions(jobProfileId);
      await service.findActiveProfileInOrganization(actor, organizationId, jobProfileId);
      const draft = await service.findActiveDraftInProfile(organizationId, jobProfileId, versionId);
      const competencyInputs = (await jobProfiles.listCompetencies(versionId)).map(
        toCompetencyInput
      );
      validatePublishable(toContent(draft), competencyInputs);
      await service.ensureCompetenciesAllowed(actor, organizationId, competencyInputs);
      const published = await jobProfiles.findPublished(jobProfileId);
      const now = jobProfiles.now();

      if (published) {
        await jobProfiles.updateVersion({
          ...published,
          status: "archived",
          updatedAt: now,
          updatedByUserId: requireUserActorId(actor)
        });
        await service.audit(actor, organizationId, "job_profile.previous_version_archived", {
          jobProfileId,
          versionId: published.id
        });
      }

      const nextVersionNumber = (await jobProfiles.maxVersionNumber(jobProfileId)) + 1;
      const next: JobProfileVersion = {
        ...draft,
        versionNumber: nextVersionNumber,
        status: "published",
        updatedByUserId: requireUserActorId(actor),
        publishedByUserId: requireUserActorId(actor),
        updatedAt: now,
        publishedAt: now
      };
      await jobProfiles.updateVersion(next);
      await service.audit(actor, organizationId, "job_profile.published", {
        jobProfileId,
        versionId,
        versionNumber: String(nextVersionNumber)
      });

      return service.withCompetencies(next);
    });
  }

  async getPublished(actor: Actor, organizationId: string, jobProfileId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const profile = await this.findProfileInOrganization(actor, organizationId, jobProfileId);

    if (context.role === "member" && profile.status !== "active") {
      throw notFound("job_profile_not_found", "Job profile not found.");
    }

    const published = await this.jobProfiles.findPublished(jobProfileId);

    if (!published) {
      throw notFound("job_profile_published_not_found", "Published job profile not found.");
    }

    return this.serializeVersion(await this.withCompetencies(published), context.role);
  }

  async listVersions(actor: Actor, organizationId: string, jobProfileId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    await this.findProfileInOrganization(actor, organizationId, jobProfileId);
    return Promise.all(
      (await this.jobProfiles.listVersions(jobProfileId)).map((version) =>
        this.withCompetencies(version)
      )
    );
  }

  async getVersion(actor: Actor, organizationId: string, jobProfileId: string, versionId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    await this.findProfileInOrganization(actor, organizationId, jobProfileId);
    const version = await this.findVersionInProfile(organizationId, jobProfileId, versionId);

    if (context.role === "member" && version.status !== "published") {
      throw notFound("job_profile_version_not_found", "Job profile version not found.");
    }

    return this.serializeVersion(await this.withCompetencies(version), context.role);
  }

  async history(actor: Actor, organizationId: string, jobProfileId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    await this.findProfileInOrganization(actor, organizationId, jobProfileId);
    return (await this.core.listAuditEvents()).filter(
      (event) =>
        event.organizationId === organizationId && event.metadata.jobProfileId === jobProfileId
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: JobProfileAdminReadInput) {
    const reason = requireAdminReason(input.reason);

    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }

    const organization = await this.core.findOrganizationById(organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    const profiles = await this.jobProfiles.listJobProfiles(organizationId);
    await this.audit(actor, organizationId, "job_profile.administrative_read", {
      reason,
      jobProfileCount: String(profiles.length)
    });
    return profiles;
  }

  private scoped(
    core: CoreRepository,
    jobProfiles: JobProfileRepository,
    competencies: CompetencyRepository
  ) {
    return new JobProfileService(core, jobProfiles, competencies, this.runTransaction);
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    deniedAction = "job_profile.permission_denied"
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
        "job_profile.cross_organization_access_denied",
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
    const existing = await this.jobProfiles.findJobProfileByNormalizedCode(
      organizationId,
      normalizedCode
    );

    if (existing && existing.id !== currentId) {
      throw conflict("job_profile_code_duplicate", "Job profile code exists.");
    }
  }

  private async findProfileInOrganization(
    actor: Actor,
    organizationId: string,
    jobProfileId: string
  ) {
    const profile = await this.jobProfiles.findJobProfileById(jobProfileId);

    if (!profile || profile.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "job_profile.cross_organization_access_denied",
        "job_profile_organization_mismatch",
        { jobProfileId }
      );
      throw notFound("job_profile_not_found", "Job profile not found.");
    }

    return profile;
  }

  private async findActiveProfileInOrganization(
    actor: Actor,
    organizationId: string,
    jobProfileId: string
  ) {
    const profile = await this.findProfileInOrganization(actor, organizationId, jobProfileId);

    if (profile.status !== "active") {
      throw conflict("job_profile_inactive", "Inactive job profile cannot be used.");
    }

    return profile;
  }

  private async findVersionInProfile(
    organizationId: string,
    jobProfileId: string,
    versionId: string
  ) {
    const version = await this.jobProfiles.findVersionById(versionId);

    if (
      !version ||
      version.organizationId !== organizationId ||
      version.jobProfileId !== jobProfileId
    ) {
      throw notFound("job_profile_version_not_found", "Job profile version not found.");
    }

    return version;
  }

  private async findActiveDraftInProfile(
    organizationId: string,
    jobProfileId: string,
    versionId: string
  ) {
    const draft = await this.findVersionInProfile(organizationId, jobProfileId, versionId);

    if (draft.status !== "draft" || draft.discardedAt) {
      throw conflict("job_profile_draft_inactive", "Job profile draft is not active.");
    }

    return draft;
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
          "job_profile.invalid_competency_denied",
          "invalid_competency",
          { competencyCatalogItemId: competency.competencyCatalogItemId }
        );
        throw badRequest("job_profile_competency_invalid", "Competency catalog item is invalid.");
      }
    }
  }

  private ensureNoOrganizationChange(
    organizationId: string,
    inputOrganizationId: string | undefined
  ) {
    if (inputOrganizationId !== undefined && inputOrganizationId !== organizationId) {
      throw badRequest(
        "job_profile_organization_immutable",
        "Job Profile cannot change Organization."
      );
    }
  }

  private async withCompetencies(
    version: JobProfileVersion
  ): Promise<JobProfileVersionWithCompetencies> {
    return { ...version, competencies: await this.jobProfiles.listCompetencies(version.id) };
  }

  private serializeVersion(version: JobProfileVersionWithCompetencies, role: MembershipRole) {
    if (role !== "member") {
      return version;
    }

    return { ...version, salaryRange: null };
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

export function createPostgresJobProfileService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const jobProfiles = new PostgresJobProfileRepository(pool);
  const competencies = new PostgresCompetencyRepository(pool);
  const runTransaction: JobProfileTransactionRunner = async (callback) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        jobProfiles: new PostgresJobProfileRepository(client),
        competencies: new PostgresCompetencyRepository(client)
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

  return new JobProfileService(core, jobProfiles, competencies, runTransaction);
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }

  return actor.userId;
}

function emptyContent(title: string) {
  return {
    title,
    mission: "",
    summary: "",
    responsibilities: [],
    requirements: [],
    education: { level: "not_required" as const, area: "", required: false, note: "" },
    certifications: [],
    languages: [],
    tools: [],
    workModel: "onsite" as const,
    workSchedule: { weeklyHours: 0, description: "", shift: "" },
    travelRequirement: "none" as const,
    salaryRange: null,
    notes: ""
  };
}

function toContent(version: JobProfileVersion) {
  return {
    title: version.title,
    mission: version.mission,
    summary: version.summary,
    responsibilities: version.responsibilities,
    requirements: version.requirements,
    education: version.education,
    certifications: version.certifications,
    languages: version.languages,
    tools: version.tools,
    workModel: version.workModel,
    workSchedule: version.workSchedule,
    travelRequirement: version.travelRequirement,
    salaryRange: version.salaryRange,
    notes: version.notes
  };
}

function toCompetencyInput(competency: JobProfileVersionCompetency) {
  return {
    competencyCatalogItemId: competency.competencyCatalogItemId,
    expectedLevel: competency.expectedLevel,
    required: competency.required,
    displayOrder: competency.displayOrder,
    note: competency.note
  };
}

function toVersionCompetency(
  repository: JobProfileRepository,
  organizationId: string,
  versionId: string,
  competency: ReturnType<typeof toCompetencyInput>,
  now: string
): JobProfileVersionCompetency {
  return {
    id: repository.nextId("jcmp"),
    organizationId,
    jobProfileVersionId: versionId,
    competencyCatalogItemId: competency.competencyCatalogItemId,
    expectedLevel: competency.expectedLevel,
    required: competency.required,
    displayOrder: competency.displayOrder,
    note: competency.note,
    createdAt: now,
    updatedAt: now
  };
}

function changedProfileFields(before: JobProfile, after: JobProfile) {
  return ["code", "name", "status"].filter(
    (field) => before[field as keyof JobProfile] !== after[field as keyof JobProfile]
  );
}

function changedVersionFields(before: JobProfileVersion, after: JobProfileVersion) {
  return [
    "title",
    "mission",
    "summary",
    "responsibilities",
    "requirements",
    "education",
    "certifications",
    "languages",
    "tools",
    "workModel",
    "workSchedule",
    "travelRequirement",
    "notes"
  ].filter(
    (field) =>
      JSON.stringify(before[field as keyof JobProfileVersion]) !==
      JSON.stringify(after[field as keyof JobProfileVersion])
  );
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
