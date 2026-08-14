import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresCandidateDossierRepository } from "../persistence/postgres-candidate-dossier-repository";
import { auditCandidateDossier, auditCandidateDossierDenied } from "./audit";
import type { CandidateDossierRepository } from "./repository";
import {
  createCandidateDossierTransactionRunner,
  type CandidateDossierTransaction,
  type CandidateDossierTransactionRunner
} from "./transaction";
import {
  candidateDossierSnapshotSchemaVersion,
  type CandidateDossier,
  type CandidateDossierAdminReadDTO,
  type CandidateDossierGenerateInput,
  type CandidateDossierMemberDTO,
  type CandidateDossierOwnerDTO,
  type CandidateDossierSource
} from "./types";
import {
  hashIdempotencyKey,
  validateAdminReadInput,
  validateGenerateInput,
  validateIdempotencyKey
} from "./validation";

export type CandidateDossierTestingHooks = {
  afterSourcesCollected?: () => Promise<void> | void;
  beforePersist?: () => Promise<void> | void;
};

export class CandidateDossierService {
  constructor(
    private readonly core: CoreRepository,
    private readonly candidateDossiers: CandidateDossierRepository,
    private readonly runTransaction: CandidateDossierTransactionRunner,
    private readonly testingHooks: CandidateDossierTestingHooks = {}
  ) {}

  async generate(
    actor: Actor,
    organizationId: string,
    input: CandidateDossierGenerateInput,
    rawIdempotencyKey: unknown
  ): Promise<CandidateDossierOwnerDTO> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], {
      allowArchivedOrganization: false
    });
    const { candidateApplicationId, generationKind, finalRecordReason } =
      validateGenerateInput(input);
    const idempotencyKeyHash = hashIdempotencyKey(validateIdempotencyKey(rawIdempotencyKey));

    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"], {
        allowArchivedOrganization: false
      });

      const application =
        await tx.candidateDossiers.findApplicationForUpdate(candidateApplicationId);
      if (!application || application.organizationId !== organizationId) {
        await auditCandidateDossierDenied(
          tx.core,
          actor,
          organizationId,
          "candidate_dossier.cross_organization_access_denied",
          "candidate_application_organization_mismatch",
          { candidateApplicationId }
        );
        throw notFound("candidate_application_not_found", "Candidate application not found.");
      }
      if (application.candidateStatus !== "active") {
        throw conflict("candidate_dossier_candidate_inactive", "Candidate is not active.");
      }
      if (generationKind === "regular" && application.applicationStatus !== "active") {
        throw conflict(
          "candidate_dossier_application_not_active",
          "CandidateApplication is not active."
        );
      }
      if (
        generationKind === "final_record" &&
        application.applicationStatus !== "rejected" &&
        application.applicationStatus !== "hired"
      ) {
        throw conflict(
          "candidate_dossier_final_record_status_invalid",
          "Final record is only allowed for rejected or hired applications."
        );
      }

      const consent = await tx.candidateDossiers.latestConsent(application.candidateId);
      if (!isConsentValid(consent, tx.candidateDossiers.now())) {
        throw conflict(
          "candidate_dossier_consent_invalid",
          "A granted candidate consent is required."
        );
      }

      const requestFingerprint = fingerprint({
        organizationId,
        candidateApplicationId,
        generationKind,
        finalRecordReason
      });
      const replay = await tx.candidateDossiers.findByIdempotencyKeyHash(
        organizationId,
        candidateApplicationId,
        idempotencyKeyHash
      );
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) {
          throw conflict(
            "candidate_dossier_idempotency_conflict",
            "Idempotency-Key was already used for a different request."
          );
        }
        return service.toOwnerDTO(
          replay,
          await tx.candidateDossiers.countSources(organizationId, replay.id)
        );
      }

      const previous = await tx.candidateDossiers.latestByApplication(
        organizationId,
        candidateApplicationId
      );
      if (generationKind === "final_record" && previous?.generationKind === "final_record") {
        throw conflict(
          "candidate_dossier_final_record_already_exists",
          "Final record already exists for this CandidateApplication."
        );
      }
      const now = tx.candidateDossiers.now();
      const dossierId = tx.candidateDossiers.nextId("cd");
      const sources = await tx.candidateDossiers.collectSources(
        organizationId,
        candidateApplicationId,
        application.candidateId,
        application.jobOpeningId,
        application.jobOpeningVersionId,
        dossierId
      );
      await this.testingHooks.afterSourcesCollected?.();
      if (sources.length === 0) {
        throw conflict(
          "candidate_dossier_without_sources",
          "Candidate dossier requires at least one source."
        );
      }

      const sourcesWithHashes = sources.map((source) => ({
        ...source,
        contentHash: fingerprint({
          sourceType: source.sourceType,
          value: source.presentedValueSnapshot
        })
      }));
      const presentedSnapshot = buildPresentedSnapshot({
        application,
        generationKind,
        finalRecordReason,
        versionNumber: (previous?.versionNumber ?? 0) + 1,
        previousVersionId: previous?.id ?? null,
        generatedAt: now,
        sources: sourcesWithHashes
      });
      const contentHash = fingerprint(presentedSnapshot);
      const blueprintVersionId = resolveSingleBlueprintVersionId(sourcesWithHashes);
      const dossier: CandidateDossier = {
        id: dossierId,
        organizationId,
        candidateApplicationId,
        candidateId: application.candidateId,
        jobOpeningId: application.jobOpeningId,
        jobOpeningVersionId: application.jobOpeningVersionId,
        blueprintVersionId,
        versionNumber: (previous?.versionNumber ?? 0) + 1,
        previousVersionId: previous?.id ?? null,
        status: "generated",
        generationKind,
        finalRecordReason,
        presentedSnapshot,
        snapshotSchemaVersion: candidateDossierSnapshotSchemaVersion,
        contentHash,
        idempotencyKeyHash,
        requestFingerprint,
        generatedByUserId: actorUserId(actor),
        generatedAt: now,
        createdAt: now,
        updatedAt: now
      };

      await this.testingHooks.beforePersist?.();
      await tx.candidateDossiers.addDossier(dossier);
      await tx.candidateDossiers.addSources(sourcesWithHashes);
      await auditCandidateDossier(tx.core, actor, organizationId, "candidate_dossier.generated", {
        candidateApplicationId,
        candidateDossierId: dossier.id,
        versionNumber: String(dossier.versionNumber),
        generationKind
      });
      return service.toOwnerDTO(dossier, sourcesWithHashes.length);
    });
  }

  async listByApplication(actor: Actor, organizationId: string, candidateApplicationId: string) {
    const { role } = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"], {
      allowArchivedOrganization: true
    });
    const list = await this.candidateDossiers.listByApplication(
      organizationId,
      candidateApplicationId
    );
    if (role === "member") return list.slice(0, 1).map(toMemberDTO);
    const counts = new Map<string, number>();
    for (const item of list) {
      counts.set(item.id, await this.candidateDossiers.countSources(organizationId, item.id));
    }
    return list.map((item) => this.toOwnerDTO(item, counts.get(item.id) ?? 0));
  }

  async getForOwner(actor: Actor, organizationId: string, dossierId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], {
      allowArchivedOrganization: true
    });
    const found = await this.findOwned(organizationId, dossierId);
    return this.toOwnerDTO(
      found,
      await this.candidateDossiers.countSources(organizationId, found.id)
    );
  }

  async getForMember(
    actor: Actor,
    organizationId: string,
    dossierId: string
  ): Promise<CandidateDossierMemberDTO> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"], {
      allowArchivedOrganization: true
    });
    return toMemberDTO(await this.findOwned(organizationId, dossierId));
  }

  async getSources(actor: Actor, organizationId: string, dossierId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"], {
      allowArchivedOrganization: true
    });
    await this.findOwned(organizationId, dossierId);
    return this.candidateDossiers.listSources(organizationId, dossierId);
  }

  async adminRead(
    actor: Actor,
    organizationId: string,
    input: { reason?: unknown; candidateDossierId?: unknown; candidate_dossier_id?: unknown }
  ): Promise<CandidateDossierAdminReadDTO> {
    if (actor.kind !== "platform") {
      throw forbidden("candidate_dossier_admin_only", "Platform Admin only.");
    }
    const { reason, candidateDossierId } = validateAdminReadInput(input);
    const found = await this.candidateDossiers.findById(organizationId, candidateDossierId);
    if (!found) {
      await auditCandidateDossierDenied(
        this.core,
        actor,
        organizationId,
        "candidate_dossier.administrative_read_denied",
        "candidate_dossier_not_found",
        { candidateDossierId, reason }
      );
      throw notFound("candidate_dossier_not_found", "Candidate dossier not found.");
    }
    await auditCandidateDossier(
      this.core,
      actor,
      organizationId,
      "candidate_dossier.administrative_read",
      {
        candidateDossierId: found.id,
        reason
      }
    );
    return {
      id: found.id,
      organizationId: found.organizationId,
      candidateApplicationId: found.candidateApplicationId,
      versionNumber: found.versionNumber,
      generationKind: found.generationKind,
      generatedByUserId: found.generatedByUserId,
      generatedAt: found.generatedAt,
      sourceCount: await this.candidateDossiers.countSources(organizationId, found.id)
    };
  }

  private async findOwned(organizationId: string, dossierId: string) {
    const found = await this.candidateDossiers.findById(organizationId, dossierId);
    if (!found) throw notFound("candidate_dossier_not_found", "Candidate dossier not found.");
    return found;
  }

  private scoped(tx: CandidateDossierTransaction) {
    return new CandidateDossierService(
      tx.core,
      tx.candidateDossiers,
      this.runTransaction,
      this.testingHooks
    );
  }

  private toOwnerDTO(dossier: CandidateDossier, sourceCount = 0): CandidateDossierOwnerDTO {
    return {
      id: dossier.id,
      candidateApplicationId: dossier.candidateApplicationId,
      versionNumber: dossier.versionNumber,
      previousVersionId: dossier.previousVersionId,
      status: dossier.status,
      generationKind: dossier.generationKind,
      finalRecordReason: dossier.finalRecordReason,
      presentedSnapshot: dossier.presentedSnapshot,
      contentHash: dossier.contentHash,
      sourceCount,
      generatedByUserId: dossier.generatedByUserId,
      generatedAt: dossier.generatedAt
    };
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    options: { allowArchivedOrganization?: boolean } = {},
    deniedAction = "candidate_dossier.permission_denied"
  ) {
    if (actor.kind === "platform") {
      await auditCandidateDossierDenied(
        this.core,
        actor,
        organizationId,
        deniedAction,
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }
    const user = await this.core.findUserById(actor.userId);
    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) throw notFound("organization_not_found", "Organization not found.");
    if (organization.status !== "active" && !options.allowArchivedOrganization) {
      await auditCandidateDossierDenied(
        this.core,
        actor,
        organizationId,
        deniedAction,
        "organization_archived"
      );
      throw forbidden("organization_archived", "Archived organization cannot be used as context.");
    }
    const membership = await this.core.findMembershipByOrganizationAndUser(
      organizationId,
      actor.userId
    );
    if (!membership || membership.status !== "active") {
      await auditCandidateDossierDenied(
        this.core,
        actor,
        organizationId,
        "candidate_dossier.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await auditCandidateDossierDenied(
        this.core,
        actor,
        organizationId,
        deniedAction,
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { actor, organization, role: membership.role };
  }
}

function buildPresentedSnapshot(input: {
  application: {
    id: string;
    candidateId: string;
    jobOpeningId: string;
    jobOpeningVersionId: string;
  };
  generationKind: string;
  finalRecordReason: string | null;
  versionNumber: number;
  previousVersionId: string | null;
  generatedAt: string;
  sources: CandidateDossierSource[];
}) {
  return {
    schemaVersion: candidateDossierSnapshotSchemaVersion,
    candidateApplicationId: input.application.id,
    candidateId: input.application.candidateId,
    jobOpeningId: input.application.jobOpeningId,
    jobOpeningVersionId: input.application.jobOpeningVersionId,
    generationKind: input.generationKind,
    finalRecordReason: input.finalRecordReason,
    versionNumber: input.versionNumber,
    previousVersionId: input.previousVersionId,
    generatedAt: input.generatedAt,
    sourceCount: input.sources.length,
    sections: groupSources(input.sources)
  };
}

function groupSources(sources: CandidateDossierSource[]) {
  const byType: Record<string, Array<Record<string, unknown>>> = {};
  for (const source of sources) {
    const list = byType[source.sourceType] ?? [];
    list.push({
      id: source.id,
      originKind: source.originKind,
      fieldName: source.fieldName,
      presentedOrder: source.presentedOrder,
      value: source.presentedValueSnapshot,
      contentHash: source.contentHash
    });
    byType[source.sourceType] = list;
  }
  return byType;
}

function resolveSingleBlueprintVersionId(sources: CandidateDossierSource[]) {
  const ids = new Set(
    sources
      .filter((source) => source.sourceType === "blueprint_version" && source.blueprintVersionId)
      .map((source) => source.blueprintVersionId as string)
  );
  return ids.size === 1 ? [...ids][0] : null;
}

function actorUserId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("candidate_dossier_actor_invalid", "A user actor is required.");
  }
  return actor.userId;
}

function isConsentValid(
  consent: { status: string; expiresAt: string | null } | null,
  nowIso: string
) {
  if (!consent || consent.status !== "granted") return false;
  if (consent.expiresAt && consent.expiresAt <= nowIso) return false;
  return true;
}

function toMemberDTO(dossier: CandidateDossier): CandidateDossierMemberDTO {
  return {
    id: dossier.id,
    status: dossier.status,
    versionNumber: dossier.versionNumber
  };
}

export function createPostgresCandidateDossierService(
  pool: pg.Pool,
  testingHooks: CandidateDossierTestingHooks = {}
) {
  return new CandidateDossierService(
    new PostgresCoreRepository(pool),
    new PostgresCandidateDossierRepository(pool),
    createCandidateDossierTransactionRunner(pool),
    testingHooks
  );
}
