import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { badRequest, conflict, forbidden, gone, notFound, tooManyRequests } from "../core/errors";
import { RateLimiter, type RateLimitConfig } from "../core/rate-limiter";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresProposalRepository } from "../persistence/postgres-proposal-repository";
import { generateRawProposalToken, hashProposalToken, sha256Hex } from "./access-token";
import type { ProposalRepository } from "./repository";
import {
  createProposalTransactionRunner,
  type ProposalTransaction,
  type ProposalTransactionRunner
} from "./transaction";
import type {
  Proposal,
  ProposalAccessGrant,
  ProposalAdminReadInput,
  ProposalApplicationContext,
  ProposalDraftInput,
  ProposalEventType,
  ProposalIdempotencyOperation,
  ProposalIssueInput,
  ProposalPublicActionInput,
  ProposalPublicMeta,
  ProposalReasonInput,
  ProposalVersion
} from "./types";
import {
  validateAdminReason,
  validateDraftInput,
  validateIdempotencyKey,
  validateIssueInput,
  validatePublicActionInput,
  validateReasonInput
} from "./validation";

const DEFAULT_GRANT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const PRESENTATION_SCHEMA_VERSION = "proposal_public_v1";
const DEFAULT_RATE_LIMITS = {
  publicByIp: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig,
  publicByTokenHash: { limit: 30, windowMs: 60_000 } satisfies RateLimitConfig
};
type ProposalRateLimitNamespace = keyof typeof DEFAULT_RATE_LIMITS;

type IdempotentResult<T> = T & {
  idempotentReplay?: boolean;
  rawAccessToken?: string | null;
  tokenReturned?: boolean;
};

export class ProposalService {
  constructor(
    private readonly core: CoreRepository,
    private readonly proposals: ProposalRepository,
    private readonly runTransaction: ProposalTransactionRunner,
    private readonly rateLimiter: RateLimiter<ProposalRateLimitNamespace> = new RateLimiter(
      DEFAULT_RATE_LIMITS
    )
  ) {}

  async createDraft(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: ProposalDraftInput
  ) {
    const normalized = validateDraftInput(input);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const application = await service.lockApplication(actor, organizationId, applicationId);
      await service.ensureOperationalDomain(actor, organizationId, application);
      let proposal = await tx.proposals.findProposalByApplication(organizationId, application.id);
      if (proposal) {
        proposal = await tx.proposals.findProposalForUpdate(proposal.id);
      }
      const now = tx.proposals.now();
      const userId = requireUserActorId(actor);
      if (!proposal) {
        proposal = {
          id: tx.proposals.nextId("prop"),
          organizationId,
          candidateApplicationId: application.id,
          candidateId: application.candidateId,
          jobOpeningId: application.jobOpeningId,
          jobOpeningVersionId: application.jobOpeningVersionId,
          currentVersionId: null,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now
        };
        await tx.proposals.createProposal(proposal);
      }
      await service.ensureCanCreateDraft(proposal);
      const activeDraft = await tx.proposals.findActiveDraft(organizationId, proposal.id);
      const hashes = snapshotHashes(normalized.contentSnapshot, normalized.compensationSnapshot);
      let version: ProposalVersion;
      let eventType: ProposalEventType;
      if (activeDraft) {
        version = {
          ...activeDraft,
          contentSnapshot: normalized.contentSnapshot,
          compensationSnapshot: normalized.compensationSnapshot,
          contentHash: hashes.contentHash,
          compensationHash: hashes.compensationHash,
          validUntil: normalized.validUntil,
          updatedByUserId: userId,
          updatedAt: now
        };
        await tx.proposals.updateVersion(version);
        eventType = "draft_updated";
      } else {
        version = emptyVersion({
          id: tx.proposals.nextId("propv"),
          proposal,
          contentSnapshot: normalized.contentSnapshot,
          compensationSnapshot: normalized.compensationSnapshot,
          contentHash: hashes.contentHash,
          compensationHash: hashes.compensationHash,
          validUntil: normalized.validUntil,
          userId,
          now
        });
        await tx.proposals.createVersion(version);
        eventType = "draft_created";
      }
      await service.addEvent(tx, proposal, version.id, eventType, userId);
      await service.audit(actor, organizationId, `proposal.${eventType}`, {
        proposalId: proposal.id,
        proposalVersionId: version.id,
        candidateApplicationId: application.id
      });
      return service.serializeOwnerAdmin(proposal, version);
    });
  }

  async issue(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: ProposalIssueInput,
    idempotencyKeyRaw: unknown
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const normalized = validateIssueInput(input);
    return this.withIdempotency(
      organizationId,
      "issue",
      applicationId,
      idempotencyKeyRaw,
      { ...normalized, applicationId },
      async () => {
        let rawAccessToken = "";
        const result = await this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          await service.authorizeUser(actor, organizationId, ["owner"]);
          const application = await service.lockApplication(actor, organizationId, applicationId);
          await service.ensureOperationalDomain(actor, organizationId, application);
          const proposal = await service.lockProposalForApplication(organizationId, application.id);
          if (proposal.currentVersionId !== null) {
            throw conflict("proposal_already_issued", "Proposal already has an issued version.");
          }
          const version = await service.lockDraftForIssue(proposal, normalized.proposalVersionId);
          await service.moveApplicationToOfferIfNeeded(
            tx,
            actor,
            application,
            normalized.stageChangeReason,
            version.id
          );
          const now = tx.proposals.now();
          const userId = requireUserActorId(actor);
          const versionNumber = await tx.proposals.nextVersionNumberForUpdate(
            organizationId,
            proposal.id
          );
          const presentation = presentationHash(version);
          const issued: ProposalVersion = {
            ...version,
            versionNumber,
            status: "issued",
            presentationSchemaVersion: PRESENTATION_SCHEMA_VERSION,
            presentationHash: presentation,
            issuedAt: now,
            issuedByUserId: userId,
            updatedByUserId: userId,
            updatedAt: now
          };
          await tx.proposals.updateVersion(issued);
          rawAccessToken = generateRawProposalToken();
          const grant = service.buildGrant(tx, issued, rawAccessToken, now);
          await tx.proposals.createGrant(grant);
          await tx.proposals.updateProposal({
            ...proposal,
            currentVersionId: issued.id,
            updatedByUserId: userId,
            updatedAt: now
          });
          await service.addEvent(tx, proposal, issued.id, "issued", userId, {
            versionNumber: String(versionNumber)
          });
          await service.audit(actor, organizationId, "proposal.issued", {
            proposalId: proposal.id,
            proposalVersionId: issued.id,
            candidateApplicationId: application.id
          });
          return service.serializeIssueResult(proposal, issued, rawAccessToken);
        });
        return result;
      }
    );
  }

  async supersede(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: ProposalIssueInput,
    idempotencyKeyRaw: unknown
  ) {
    const normalized = validateIssueInput(input);
    return this.withIdempotency(
      organizationId,
      "supersede",
      applicationId,
      idempotencyKeyRaw,
      { ...normalized, applicationId },
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          await service.authorizeUser(actor, organizationId, ["owner"]);
          const application = await service.lockApplication(actor, organizationId, applicationId);
          await service.ensureOperationalDomain(actor, organizationId, application);
          const proposal = await service.lockProposalForApplication(organizationId, application.id);
          if (!proposal.currentVersionId) {
            throw conflict("proposal_not_issued", "Proposal has no current issued version.");
          }
          const oldVersion = await service.lockVersionInProposal(
            proposal,
            proposal.currentVersionId
          );
          if (oldVersion.status !== "issued") {
            throw conflict(
              "proposal_supersede_not_allowed",
              "Only issued proposals can be superseded."
            );
          }
          const newDraft = await service.lockDraftForIssue(proposal, normalized.proposalVersionId);
          const now = tx.proposals.now();
          const userId = requireUserActorId(actor);
          const versionNumber = await tx.proposals.nextVersionNumberForUpdate(
            organizationId,
            proposal.id
          );
          const newIssued: ProposalVersion = {
            ...newDraft,
            versionNumber,
            status: "issued",
            presentationSchemaVersion: PRESENTATION_SCHEMA_VERSION,
            presentationHash: presentationHash(newDraft),
            issuedAt: now,
            issuedByUserId: userId,
            updatedByUserId: userId,
            updatedAt: now
          };
          await tx.proposals.updateVersion({
            ...oldVersion,
            status: "superseded",
            supersededAt: now,
            supersededByUserId: userId,
            supersededByVersionId: newIssued.id,
            updatedByUserId: userId,
            updatedAt: now
          });
          await tx.proposals.revokeActiveGrants(organizationId, oldVersion.id, now);
          await tx.proposals.updateVersion(newIssued);
          const rawAccessToken = generateRawProposalToken();
          const grant = service.buildGrant(tx, newIssued, rawAccessToken, now);
          await tx.proposals.createGrant(grant);
          await tx.proposals.updateProposal({
            ...proposal,
            currentVersionId: newIssued.id,
            updatedByUserId: userId,
            updatedAt: now
          });
          await service.addEvent(tx, proposal, oldVersion.id, "superseded", userId, {
            supersededByVersionId: newIssued.id
          });
          await service.addEvent(tx, proposal, newIssued.id, "issued", userId, {
            versionNumber: String(versionNumber)
          });
          await service.audit(actor, organizationId, "proposal.superseded", {
            proposalId: proposal.id,
            oldProposalVersionId: oldVersion.id,
            newProposalVersionId: newIssued.id,
            candidateApplicationId: application.id
          });
          return service.serializeIssueResult(proposal, newIssued, rawAccessToken);
        })
    );
  }

  async rotateGrant(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    idempotencyKeyRaw: unknown
  ) {
    return this.withIdempotency(
      organizationId,
      "rotate_grant",
      applicationId,
      idempotencyKeyRaw,
      { applicationId },
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          await service.authorizeUser(actor, organizationId, ["owner"]);
          const application = await service.lockApplication(actor, organizationId, applicationId);
          await service.ensureOperationalDomain(actor, organizationId, application);
          const proposal = await service.lockProposalForApplication(organizationId, application.id);
          const version = await service.lockCurrentIssued(proposal);
          const now = tx.proposals.now();
          await tx.proposals.listGrantsForVersionForUpdate(organizationId, version.id);
          await tx.proposals.revokeActiveGrants(organizationId, version.id, now);
          const rawAccessToken = generateRawProposalToken();
          await tx.proposals.createGrant(service.buildGrant(tx, version, rawAccessToken, now));
          await service.addEvent(
            tx,
            proposal,
            version.id,
            "access_grant_rotated",
            requireUserActorId(actor)
          );
          await service.audit(actor, organizationId, "proposal.access_grant_rotated", {
            proposalId: proposal.id,
            proposalVersionId: version.id,
            candidateApplicationId: application.id
          });
          return service.serializeIssueResult(proposal, version, rawAccessToken);
        })
    );
  }

  async cancel(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: ProposalReasonInput,
    idempotencyKeyRaw: unknown
  ) {
    const reason = validateReasonInput(input, "proposal_cancel_reason_required");
    return this.withIdempotency(
      organizationId,
      "cancel",
      applicationId,
      idempotencyKeyRaw,
      { applicationId, reason },
      async () =>
        this.runTransaction(async (tx) => {
          const service = this.scoped(tx);
          await service.authorizeUser(actor, organizationId, ["owner"]);
          const application = await service.lockApplication(actor, organizationId, applicationId);
          await service.ensureOperationalDomain(actor, organizationId, application);
          const proposal = await service.lockProposalForApplication(organizationId, application.id);
          const version = await service.lockCurrentIssued(proposal);
          const now = tx.proposals.now();
          const userId = requireUserActorId(actor);
          await tx.proposals.revokeActiveGrants(organizationId, version.id, now);
          const cancelled = {
            ...version,
            status: "cancelled" as const,
            cancelledAt: now,
            cancelledByUserId: userId,
            cancellationReason: reason,
            updatedByUserId: userId,
            updatedAt: now
          };
          await tx.proposals.updateVersion(cancelled);
          await service.addEvent(tx, proposal, version.id, "cancelled", userId);
          await service.audit(actor, organizationId, "proposal.cancelled", {
            proposalId: proposal.id,
            proposalVersionId: version.id,
            candidateApplicationId: application.id,
            reasonProvided: "true"
          });
          return service.serializeOwnerAdmin(proposal, cancelled);
        })
    );
  }

  async discardDraft(
    actor: Actor,
    organizationId: string,
    applicationId: string,
    input: ProposalReasonInput
  ) {
    const reason = validateReasonInput(input, "proposal_discard_reason_required");
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const application = await service.lockApplication(actor, organizationId, applicationId);
      await service.ensureOperationalDomain(actor, organizationId, application);
      const proposal = await service.lockProposalForApplication(organizationId, application.id);
      const draft = await tx.proposals.findActiveDraft(organizationId, proposal.id);
      if (!draft) throw notFound("proposal_draft_not_found", "Proposal draft not found.");
      const now = tx.proposals.now();
      const userId = requireUserActorId(actor);
      const discarded = {
        ...draft,
        discardedAt: now,
        discardedByUserId: userId,
        discardReason: reason,
        updatedByUserId: userId,
        updatedAt: now
      };
      await tx.proposals.updateVersion(discarded);
      await service.addEvent(tx, proposal, draft.id, "draft_discarded", userId);
      await service.audit(actor, organizationId, "proposal.draft_discarded", {
        proposalId: proposal.id,
        proposalVersionId: draft.id,
        candidateApplicationId: application.id
      });
      return service.serializeOwnerAdmin(proposal, discarded);
    });
  }

  async getProposal(actor: Actor, organizationId: string, applicationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const application = await this.proposals.findApplicationForUpdate(applicationId);
    if (!application || application.organizationId !== organizationId) {
      throw notFound("proposal_not_found", "Proposal not found.");
    }
    const proposal = await this.proposals.findProposalByApplication(organizationId, applicationId);
    if (!proposal) throw notFound("proposal_not_found", "Proposal not found.");
    const current = proposal.currentVersionId
      ? await this.proposals.findVersionById(proposal.currentVersionId)
      : await this.proposals.findActiveDraft(organizationId, proposal.id);
    if (context.role === "member") return this.serializeMember(proposal, current);
    return this.serializeOwnerAdmin(proposal, current);
  }

  async listVersions(actor: Actor, organizationId: string, applicationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const proposal = await this.proposals.findProposalByApplication(organizationId, applicationId);
    if (!proposal) return [];
    const versions = await this.proposals.listVersions(organizationId, proposal.id);
    return context.role === "member"
      ? versions.map((version) => this.serializeVersionMinimum(version))
      : versions.map((version) => this.serializeVersionOwnerAdmin(version));
  }

  async listEvents(actor: Actor, organizationId: string, applicationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const proposal = await this.proposals.findProposalByApplication(organizationId, applicationId);
    if (!proposal) return [];
    return this.proposals.listEvents(organizationId, proposal.id);
  }

  async adminRead(actor: Actor, organizationId: string, input: ProposalAdminReadInput) {
    const reason = validateAdminReason(input);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const proposals = await this.proposals.listProposals(organizationId);
    await this.audit(actor, organizationId, "proposal.administrative_read", {
      reason,
      proposalCount: String(proposals.length)
    });
    return proposals.map((proposal) => ({
      id: proposal.id,
      organizationId: proposal.organizationId,
      candidateApplicationId: proposal.candidateApplicationId,
      currentVersionId: proposal.currentVersionId,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt
    }));
  }

  async getPublic(rawToken: string, meta: ProposalPublicMeta) {
    const tokenHash = this.publicRateLimit(rawToken, meta.ip);
    return this.runTransaction(async (tx) => {
      const { proposal, version } = await this.publicWithValidGrant(tx, tokenHash, null);
      return this.serializePublic(proposal, version);
    });
  }

  async accept(rawToken: string, input: ProposalPublicActionInput, meta: ProposalPublicMeta) {
    validatePublicActionInput(input);
    const tokenHash = this.publicRateLimit(rawToken, meta.ip);
    return this.withPublicIdempotency(tokenHash, "accept", meta.idempotencyKey, {}, async () =>
      this.runTransaction(async (tx) => {
        const { proposal, version, grant } = await this.publicWithValidGrant(
          tx,
          tokenHash,
          "accept"
        );
        const now = tx.proposals.now();
        const accepted = {
          ...version,
          status: "accepted" as const,
          acceptedAt: now,
          acceptedAccessGrantId: grant.id,
          acceptanceIpHash: meta.ip ? sha256Hex(meta.ip) : null,
          acceptanceUserAgentHash: meta.userAgent ? sha256Hex(meta.userAgent) : null,
          updatedAt: now
        };
        await tx.proposals.updateVersion(accepted);
        await tx.proposals.revokeActiveGrants(version.organizationId, version.id, now);
        await this.addEvent(tx, proposal, version.id, "accepted", null);
        await this.auditSystem(tx, version.organizationId, "proposal.accepted", {
          proposalId: proposal.id,
          proposalVersionId: version.id,
          candidateApplicationId: version.candidateApplicationId
        });
        return this.serializePublic(proposal, accepted);
      })
    );
  }

  async decline(rawToken: string, input: ProposalPublicActionInput, meta: ProposalPublicMeta) {
    const normalized = validatePublicActionInput(input);
    const tokenHash = this.publicRateLimit(rawToken, meta.ip);
    return this.withPublicIdempotency(
      tokenHash,
      "decline",
      meta.idempotencyKey,
      { declineReason: normalized.declineReason },
      async () =>
        this.runTransaction(async (tx) => {
          const { proposal, version, grant } = await this.publicWithValidGrant(
            tx,
            tokenHash,
            "decline"
          );
          const now = tx.proposals.now();
          const declined = {
            ...version,
            status: "declined" as const,
            declinedAt: now,
            declinedAccessGrantId: grant.id,
            declineIpHash: meta.ip ? sha256Hex(meta.ip) : null,
            declineUserAgentHash: meta.userAgent ? sha256Hex(meta.userAgent) : null,
            declineReason: normalized.declineReason,
            updatedAt: now
          };
          await tx.proposals.updateVersion(declined);
          await tx.proposals.revokeActiveGrants(version.organizationId, version.id, now);
          await this.addEvent(tx, proposal, version.id, "declined", null);
          await this.auditSystem(tx, version.organizationId, "proposal.declined", {
            proposalId: proposal.id,
            proposalVersionId: version.id,
            candidateApplicationId: version.candidateApplicationId,
            reasonProvided: normalized.declineReason ? "true" : "false"
          });
          return this.serializePublic(proposal, declined);
        })
    );
  }

  private async withIdempotency<T extends Record<string, unknown>>(
    organizationId: string,
    operation: ProposalIdempotencyOperation,
    scopeId: string,
    rawKey: unknown,
    payload: Record<string, unknown>,
    callback: () => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const key = validateIdempotencyKey(rawKey);
    const keyHash = sha256Hex(key);
    const requestFingerprint = fingerprint(payload);
    const begin = await this.proposals.beginIdempotency({
      organizationId,
      operation,
      scopeId,
      keyHash,
      requestFingerprint
    });
    if (!begin.created) {
      const existing = begin.idempotency;
      if (existing.requestFingerprint !== requestFingerprint) {
        throw conflict("proposal_idempotency_conflict", "Idempotency-Key was used differently.");
      }
      if (existing.status === "pending") {
        throw conflict("proposal_idempotency_in_progress", "Request is already being processed.");
      }
      if (existing.status === "failed") {
        throw conflict("proposal_idempotency_failed", "Use a new Idempotency-Key to retry.");
      }
      return {
        idempotentReplay: true,
        tokenReturned: false,
        rawAccessToken: null,
        resultResourceId: existing.resultResourceId
      } as unknown as IdempotentResult<T>;
    }
    try {
      const result = await callback();
      const resultId = String(result.proposalVersionId ?? result.id ?? scopeId);
      await this.proposals.markIdempotencyCompleted(begin.idempotency.id, resultId);
      return result as IdempotentResult<T>;
    } catch (error) {
      await this.proposals.markIdempotencyFailed(begin.idempotency.id, errorCode(error));
      throw error;
    }
  }

  private async withPublicIdempotency<T extends { proposalVersionId?: string }>(
    tokenHash: string,
    operation: "accept" | "decline",
    rawKey: unknown,
    payload: Record<string, unknown>,
    callback: () => Promise<T>
  ) {
    if (rawKey === undefined || rawKey === null || rawKey === "") {
      return callback();
    }
    const grant = await this.proposals.findGrantByTokenHash(tokenHash);
    if (!grant) throw notFound("proposal_not_found", "Proposal not found.");
    const key = validateIdempotencyKey(rawKey);
    const begin = await this.proposals.beginIdempotency({
      organizationId: grant.organizationId,
      operation,
      scopeId: grant.proposalVersionId,
      keyHash: sha256Hex(key),
      requestFingerprint: fingerprint({ operation, tokenHash, ...payload })
    });
    if (!begin.created) {
      if (
        begin.idempotency.requestFingerprint !== fingerprint({ operation, tokenHash, ...payload })
      ) {
        throw conflict("proposal_idempotency_conflict", "Idempotency-Key was used differently.");
      }
      if (begin.idempotency.status === "pending") {
        throw conflict("proposal_idempotency_in_progress", "Request is already being processed.");
      }
      if (begin.idempotency.status === "failed") {
        throw conflict("proposal_idempotency_failed", "Use a new Idempotency-Key to retry.");
      }
      const version = begin.idempotency.resultResourceId
        ? await this.proposals.findVersionById(begin.idempotency.resultResourceId)
        : null;
      const proposal = version
        ? await this.proposals.findProposalForUpdate(version.proposalId)
        : null;
      if (!version || !proposal) {
        throw conflict(
          "proposal_idempotency_result_unavailable",
          "Idempotent result is unavailable."
        );
      }
      return this.serializePublic(proposal, version);
    }
    try {
      const result = await callback();
      await this.proposals.markIdempotencyCompleted(
        begin.idempotency.id,
        String(result.proposalVersionId ?? grant.proposalVersionId)
      );
      return result;
    } catch (error) {
      await this.proposals.markIdempotencyFailed(begin.idempotency.id, errorCode(error));
      throw error;
    }
  }

  private scoped(tx: ProposalTransaction) {
    return new ProposalService(tx.core, tx.proposals, this.runTransaction, this.rateLimiter);
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[]
  ) {
    if (actor.kind === "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const user = await this.core.findUserById(actor.userId);
    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) throw notFound("organization_not_found", "Organization not found.");
    if (organization.status !== "active") {
      throw forbidden("organization_archived", "Archived organization cannot be used as context.");
    }
    const membership = await this.core.findMembershipByOrganizationAndUser(
      organizationId,
      actor.userId
    );
    if (!membership || membership.status !== "active") {
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { organization, role: membership.role };
  }

  private async lockApplication(actor: Actor, organizationId: string, applicationId: string) {
    const application = await this.proposals.findApplicationForUpdate(applicationId);
    if (!application || application.organizationId !== organizationId) {
      await this.audit(actor, organizationId, "proposal.cross_organization_access_denied", {
        candidateApplicationId: applicationId
      });
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    return application;
  }

  private async ensureOperationalDomain(
    actor: Actor,
    organizationId: string,
    application: ProposalApplicationContext
  ) {
    if (application.applicationStatus !== "active") {
      throw conflict("candidate_application_final", "Final application cannot change.");
    }
    const candidate = await this.proposals.findCandidate(application.candidateId);
    if (!candidate || candidate.organizationId !== organizationId) {
      await this.audit(actor, organizationId, "proposal.cross_organization_access_denied", {
        candidateId: application.candidateId
      });
      throw notFound("candidate_not_found", "Candidate not found.");
    }
    if (candidate.status !== "active") {
      throw conflict("candidate_inactive", "Inactive candidate cannot be used operationally.");
    }
    const consent = await this.proposals.latestConsent(candidate.id);
    if (!consent || consent.status !== "granted") {
      throw conflict("candidate_consent_invalid", "Candidate consent blocks operational use.");
    }
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= Date.now()) {
      throw conflict("candidate_consent_expired", "Candidate consent blocks operational use.");
    }
  }

  private async ensureCanCreateDraft(proposal: Proposal) {
    if (!proposal.currentVersionId) return;
    const current = await this.proposals.findVersionById(proposal.currentVersionId);
    if (current && ["accepted", "declined", "expired", "cancelled"].includes(current.status)) {
      throw conflict("proposal_final_no_new_draft", "Final proposal cannot receive a new draft.");
    }
  }

  private async lockProposalForApplication(organizationId: string, applicationId: string) {
    const proposal = await this.proposals.findProposalByApplication(organizationId, applicationId);
    if (!proposal) throw notFound("proposal_not_found", "Proposal not found.");
    const locked = await this.proposals.findProposalForUpdate(proposal.id);
    if (!locked || locked.organizationId !== organizationId) {
      throw notFound("proposal_not_found", "Proposal not found.");
    }
    return locked;
  }

  private async lockDraftForIssue(proposal: Proposal, proposalVersionId: string) {
    const version = await this.lockVersionInProposal(proposal, proposalVersionId);
    if (version.status !== "draft" || version.discardedAt) {
      throw conflict("proposal_draft_invalid", "Only an active draft can be issued.");
    }
    return version;
  }

  private async lockVersionInProposal(proposal: Proposal, proposalVersionId: string) {
    const version = await this.proposals.findVersionForUpdate(proposalVersionId);
    if (
      !version ||
      version.organizationId !== proposal.organizationId ||
      version.proposalId !== proposal.id
    ) {
      throw notFound("proposal_version_not_found", "Proposal version not found.");
    }
    return version;
  }

  private async lockCurrentIssued(proposal: Proposal) {
    if (!proposal.currentVersionId) {
      throw conflict("proposal_not_issued", "Proposal has no current issued version.");
    }
    const version = await this.lockVersionInProposal(proposal, proposal.currentVersionId);
    if (version.status !== "issued") {
      throw conflict("proposal_current_not_issued", "Only current issued proposal can change.");
    }
    return version;
  }

  private async moveApplicationToOfferIfNeeded(
    tx: ProposalTransaction,
    actor: Actor,
    application: ProposalApplicationContext,
    reason: string | null,
    proposalVersionId: string
  ) {
    if (application.currentStage === "offer") return;
    const movement = stageIndex("offer") - stageIndex(application.currentStage);
    if (Math.abs(movement) > 1 && !reason) {
      throw badRequest("candidate_application_jump_reason_required", "Jump reason is required.");
    }
    const now = tx.proposals.now();
    const userId = requireUserActorId(actor);
    await tx.proposals.updateApplicationStage(application.id, "offer", userId, now);
    await tx.proposals.addCandidateApplicationEvent({
      id: tx.proposals.nextId("caevt"),
      organizationId: application.organizationId,
      candidateApplicationId: application.id,
      eventType: "stage_changed",
      stageBefore: application.currentStage,
      stageAfter: "offer",
      statusBefore: application.applicationStatus,
      statusAfter: application.applicationStatus,
      actorUserId: userId,
      reason,
      proposalVersionId: null,
      createdAt: now
    });
    await this.audit(actor, application.organizationId, "candidate_application.stage_moved", {
      candidateApplicationId: application.id,
      stageBefore: application.currentStage,
      stageAfter: "offer",
      proposalVersionId
    });
  }

  private buildGrant(
    tx: ProposalTransaction,
    version: ProposalVersion,
    rawToken: string,
    now: string
  ): ProposalAccessGrant {
    return {
      id: tx.proposals.nextId("propgrant"),
      organizationId: version.organizationId,
      proposalId: version.proposalId,
      proposalVersionId: version.id,
      candidateApplicationId: version.candidateApplicationId,
      tokenHash: hashProposalToken(rawToken),
      status: "active",
      issuedAt: now,
      expiresAt: new Date(new Date(now).getTime() + DEFAULT_GRANT_TTL_MS).toISOString(),
      revokedAt: null,
      createdAt: now
    };
  }

  private publicRateLimit(rawToken: string, ip: string) {
    const tokenHash = hashProposalToken(rawToken);
    if (!this.rateLimiter.checkAndRecord("publicByIp", ip || "unknown")) {
      throw tooManyRequests("proposal_rate_limited", "Too many requests.");
    }
    if (!this.rateLimiter.checkAndRecord("publicByTokenHash", tokenHash)) {
      throw tooManyRequests("proposal_rate_limited", "Too many requests.");
    }
    return tokenHash;
  }

  private async publicWithValidGrant(
    tx: ProposalTransaction,
    tokenHash: string,
    action: "accept" | "decline" | null
  ) {
    const grant = await tx.proposals.findGrantByTokenHash(tokenHash);
    if (!grant) throw notFound("proposal_not_found", "Proposal not found.");
    const lockedGrant = await tx.proposals.findGrantForUpdate(grant.id);
    if (!lockedGrant || lockedGrant.status !== "active") {
      throw gone("proposal_access_unavailable", "Proposal is unavailable.");
    }
    if (lockedGrant.expiresAt && new Date(lockedGrant.expiresAt).getTime() <= Date.now()) {
      await tx.proposals.updateGrant({
        ...lockedGrant,
        status: "expired",
        revokedAt: tx.proposals.now()
      });
      throw gone("proposal_access_unavailable", "Proposal is unavailable.");
    }
    const proposal = await tx.proposals.findProposalForUpdate(lockedGrant.proposalId);
    if (!proposal) throw notFound("proposal_not_found", "Proposal not found.");
    const version = await tx.proposals.findVersionForUpdate(lockedGrant.proposalVersionId);
    if (!version || proposal.currentVersionId !== version.id || version.status !== "issued") {
      throw gone("proposal_access_unavailable", "Proposal is unavailable.");
    }
    const application = await tx.proposals.findApplicationForUpdate(version.candidateApplicationId);
    if (!application || application.organizationId !== version.organizationId) {
      throw gone("proposal_access_unavailable", "Proposal is unavailable.");
    }
    const organization = await tx.core.findOrganizationById(version.organizationId);
    if (!organization || organization.status !== "active") {
      throw gone("proposal_access_unavailable", "Proposal is unavailable.");
    }
    await this.ensurePublicOperationalDomain(tx, version.organizationId, application);
    if (version.validUntil && new Date(version.validUntil).getTime() <= Date.now()) {
      const expired = {
        ...version,
        status: "expired" as const,
        expiredAt: tx.proposals.now(),
        updatedAt: tx.proposals.now()
      };
      await tx.proposals.updateVersion(expired);
      await tx.proposals.revokeActiveGrants(version.organizationId, version.id, expired.expiredAt!);
      await this.addEvent(tx, proposal, version.id, "expired", null);
      await this.auditSystem(tx, version.organizationId, "proposal.expired", {
        proposalId: proposal.id,
        proposalVersionId: version.id,
        candidateApplicationId: version.candidateApplicationId
      });
      throw gone("proposal_expired", "Proposal is expired.");
    }
    void action;
    return { proposal, version, grant: lockedGrant };
  }

  private async addEvent(
    tx: ProposalTransaction,
    proposal: Proposal,
    proposalVersionId: string | null,
    eventType: ProposalEventType,
    actorUserId: string | null,
    metadata: Record<string, string> = {}
  ) {
    await tx.proposals.addEvent({
      id: tx.proposals.nextId("propevt"),
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      proposalVersionId,
      candidateApplicationId: proposal.candidateApplicationId,
      eventType,
      actorUserId,
      metadata,
      createdAt: tx.proposals.now()
    });
  }

  private async ensurePublicOperationalDomain(
    tx: ProposalTransaction,
    organizationId: string,
    application: ProposalApplicationContext
  ) {
    if (application.applicationStatus !== "active") {
      throw gone("proposal_access_unavailable", "Proposal is unavailable.");
    }
    const candidate = await tx.proposals.findCandidate(application.candidateId);
    if (
      !candidate ||
      candidate.organizationId !== organizationId ||
      candidate.status !== "active"
    ) {
      throw gone("proposal_access_unavailable", "Proposal is unavailable.");
    }
    const consent = await tx.proposals.latestConsent(candidate.id);
    if (!consent || consent.status !== "granted") {
      throw gone("proposal_access_unavailable", "Proposal is unavailable.");
    }
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= Date.now()) {
      throw gone("proposal_access_unavailable", "Proposal is unavailable.");
    }
  }

  private serializeIssueResult(
    proposal: Proposal,
    version: ProposalVersion,
    rawAccessToken: string
  ) {
    return {
      ...this.serializeOwnerAdmin(proposal, version),
      proposalVersionId: version.id,
      rawAccessToken,
      tokenReturned: true
    };
  }

  private serializeOwnerAdmin(proposal: Proposal, currentVersion: ProposalVersion | null) {
    return {
      id: proposal.id,
      candidateApplicationId: proposal.candidateApplicationId,
      currentVersionId: proposal.currentVersionId,
      currentVersion: currentVersion ? this.serializeVersionOwnerAdmin(currentVersion) : null
    };
  }

  private serializeMember(proposal: Proposal, currentVersion: ProposalVersion | null) {
    return {
      id: proposal.id,
      candidateApplicationId: proposal.candidateApplicationId,
      currentVersionId: proposal.currentVersionId,
      currentVersion: currentVersion ? this.serializeVersionMinimum(currentVersion) : null
    };
  }

  private serializeVersionOwnerAdmin(version: ProposalVersion) {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      contentSnapshot: version.contentSnapshot,
      compensationSnapshot: version.compensationSnapshot,
      validUntil: version.validUntil,
      issuedAt: version.issuedAt,
      acceptedAt: version.acceptedAt,
      declinedAt: version.declinedAt,
      expiredAt: version.expiredAt,
      cancelledAt: version.cancelledAt,
      supersededAt: version.supersededAt,
      discardedAt: version.discardedAt,
      presentationHash: version.presentationHash
    };
  }

  private serializeVersionMinimum(version: ProposalVersion) {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      issuedAt: version.issuedAt,
      acceptedAt: version.acceptedAt,
      declinedAt: version.declinedAt,
      expiredAt: version.expiredAt,
      cancelledAt: version.cancelledAt,
      supersededAt: version.supersededAt
    };
  }

  private serializePublic(proposal: Proposal, version: ProposalVersion) {
    return {
      proposalId: proposal.id,
      proposalVersionId: version.id,
      status: version.status,
      content: version.contentSnapshot,
      compensation: version.compensationSnapshot,
      validUntil: version.validUntil,
      presentationSchemaVersion: version.presentationSchemaVersion,
      presentationHash: version.presentationHash
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

  private async auditSystem(
    tx: ProposalTransaction,
    organizationId: string,
    action: string,
    metadata: AuditEvent["metadata"]
  ) {
    await tx.core.addAuditEvent({
      id: tx.core.nextId("aud"),
      organizationId,
      actorUserId: null,
      action,
      result: "allowed",
      reason: null,
      metadata,
      createdAt: tx.core.now()
    });
  }
}

export function createPostgresProposalService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const proposals = new PostgresProposalRepository(pool);
  return new ProposalService(
    core,
    proposals,
    createProposalTransactionRunner(pool),
    new RateLimiter(DEFAULT_RATE_LIMITS)
  );
}

function emptyVersion(input: {
  id: string;
  proposal: Proposal;
  contentSnapshot: Record<string, unknown>;
  compensationSnapshot: Record<string, unknown>;
  contentHash: string;
  compensationHash: string;
  validUntil: string | null;
  userId: string;
  now: string;
}): ProposalVersion {
  return {
    id: input.id,
    organizationId: input.proposal.organizationId,
    proposalId: input.proposal.id,
    candidateApplicationId: input.proposal.candidateApplicationId,
    candidateId: input.proposal.candidateId,
    jobOpeningId: input.proposal.jobOpeningId,
    jobOpeningVersionId: input.proposal.jobOpeningVersionId,
    versionNumber: null,
    status: "draft",
    contentSnapshot: input.contentSnapshot,
    compensationSnapshot: input.compensationSnapshot,
    contentHash: input.contentHash,
    compensationHash: input.compensationHash,
    presentationSchemaVersion: null,
    presentationHash: null,
    validUntil: input.validUntil,
    issuedAt: null,
    issuedByUserId: null,
    acceptedAt: null,
    acceptedAccessGrantId: null,
    acceptanceIpHash: null,
    acceptanceUserAgentHash: null,
    declinedAt: null,
    declinedAccessGrantId: null,
    declineIpHash: null,
    declineUserAgentHash: null,
    declineReason: null,
    expiredAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    supersededAt: null,
    supersededByUserId: null,
    supersededByVersionId: null,
    discardedAt: null,
    discardedByUserId: null,
    discardReason: null,
    createdByUserId: input.userId,
    updatedByUserId: input.userId,
    createdAt: input.now,
    updatedAt: input.now
  };
}

function snapshotHashes(content: Record<string, unknown>, compensation: Record<string, unknown>) {
  return {
    contentHash: fingerprint(content),
    compensationHash: fingerprint(compensation)
  };
}

function presentationHash(version: ProposalVersion) {
  return fingerprint({
    presentationSchemaVersion: PRESENTATION_SCHEMA_VERSION,
    proposalVersionId: version.id,
    content: version.contentSnapshot,
    compensation: version.compensationSnapshot,
    validUntil: version.validUntil
  });
}

function stageIndex(stage: ProposalApplicationContext["currentStage"]) {
  return ["applied", "screening", "interview", "assessment", "offer", "completed"].indexOf(stage);
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }
  return actor.userId;
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code)
    : "unexpected_error";
}
