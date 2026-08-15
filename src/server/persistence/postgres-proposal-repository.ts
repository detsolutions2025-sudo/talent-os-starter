import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { BeginIdempotencyInput, ProposalRepository } from "../proposals/repository";
import type {
  Proposal,
  ProposalAccessGrant,
  ProposalApplicationContext,
  ProposalCandidateContext,
  ProposalConsentContext,
  ProposalEvent,
  ProposalIdempotencyKey,
  ProposalVersion
} from "../proposals/types";

export class PostgresProposalRepository implements ProposalRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async beginIdempotency(input: BeginIdempotencyInput) {
    const id = this.nextId("propidem");
    const now = this.now();
    const result = await this.connection.query(
      `
        INSERT INTO proposal_idempotency_keys (
          id, organization_id, operation, scope_id, key_hash, request_fingerprint, status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
        ON CONFLICT (organization_id, operation, scope_id, key_hash) DO NOTHING
        RETURNING *
      `,
      [
        id,
        input.organizationId,
        input.operation,
        input.scopeId,
        input.keyHash,
        input.requestFingerprint,
        now
      ]
    );
    if (result.rows[0]) {
      return { created: true, idempotency: mapIdempotency(result.rows[0]) };
    }
    const existing = await this.connection.query(
      `
        SELECT *
        FROM proposal_idempotency_keys
        WHERE organization_id = $1
          AND operation = $2
          AND scope_id = $3
          AND key_hash = $4
        FOR UPDATE
      `,
      [input.organizationId, input.operation, input.scopeId, input.keyHash]
    );
    return { created: false, idempotency: mapIdempotency(existing.rows[0]) };
  }

  async markIdempotencyCompleted(id: string, resultResourceId: string) {
    await this.connection.query(
      `
        UPDATE proposal_idempotency_keys
        SET status = 'completed', result_resource_id = $2, completed_at = $3
        WHERE id = $1
      `,
      [id, resultResourceId, this.now()]
    );
  }

  async markIdempotencyFailed(id: string, errorCategory: string) {
    await this.connection.query(
      `
        UPDATE proposal_idempotency_keys
        SET status = 'failed', error_category = $2, failed_at = $3
        WHERE id = $1
      `,
      [id, errorCategory.slice(0, 100), this.now()]
    );
  }

  async findApplicationForUpdate(applicationId: string) {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, candidate_id, job_opening_id, job_opening_version_id,
               application_status, current_stage, updated_at
        FROM candidate_applications
        WHERE id = $1
        FOR UPDATE
      `,
      [applicationId]
    );
    return result.rows[0] ? mapApplication(result.rows[0]) : null;
  }

  async updateApplicationStage(
    applicationId: string,
    currentStage: ProposalApplicationContext["currentStage"],
    updatedByUserId: string,
    updatedAt: string
  ) {
    await this.connection.query(
      `
        UPDATE candidate_applications
        SET current_stage = $2, updated_by_user_id = $3, updated_at = $4
        WHERE id = $1
      `,
      [applicationId, currentStage, updatedByUserId, updatedAt]
    );
  }

  async addCandidateApplicationEvent(input: {
    id: string;
    organizationId: string;
    candidateApplicationId: string;
    eventType: "stage_changed" | "hired";
    stageBefore: ProposalApplicationContext["currentStage"] | null;
    stageAfter: ProposalApplicationContext["currentStage"] | null;
    statusBefore: ProposalApplicationContext["applicationStatus"] | null;
    statusAfter: ProposalApplicationContext["applicationStatus"] | null;
    actorUserId: string | null;
    reason: string | null;
    proposalVersionId: string | null;
    createdAt: string;
  }) {
    await this.connection.query(
      `
        INSERT INTO candidate_application_events (
          id, organization_id, candidate_application_id, event_type, stage_before, stage_after,
          status_before, status_after, actor_user_id, reason, proposal_version_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        input.id,
        input.organizationId,
        input.candidateApplicationId,
        input.eventType,
        input.stageBefore,
        input.stageAfter,
        input.statusBefore,
        input.statusAfter,
        input.actorUserId,
        input.reason,
        input.proposalVersionId,
        input.createdAt
      ]
    );
  }

  async findCandidate(candidateId: string) {
    const result = await this.connection.query(
      "SELECT id, organization_id, status FROM candidates WHERE id = $1",
      [candidateId]
    );
    return result.rows[0] ? mapCandidate(result.rows[0]) : null;
  }

  async latestConsent(candidateId: string) {
    const result = await this.connection.query(
      `
        SELECT status, expires_at, purpose
        FROM candidate_consents
        WHERE candidate_id = $1
        ORDER BY consent_at DESC, created_at DESC, id DESC
        LIMIT 1
      `,
      [candidateId]
    );
    return result.rows[0] ? mapConsent(result.rows[0]) : null;
  }

  async findProposalByApplication(organizationId: string, candidateApplicationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM proposals WHERE organization_id = $1 AND candidate_application_id = $2",
      [organizationId, candidateApplicationId]
    );
    return result.rows[0] ? mapProposal(result.rows[0]) : null;
  }

  async findProposalForUpdate(proposalId: string) {
    const result = await this.connection.query("SELECT * FROM proposals WHERE id = $1 FOR UPDATE", [
      proposalId
    ]);
    return result.rows[0] ? mapProposal(result.rows[0]) : null;
  }

  async createProposal(proposal: Proposal) {
    await this.connection.query(
      `
        INSERT INTO proposals (
          id, organization_id, candidate_application_id, candidate_id, job_opening_id,
          job_opening_version_id, current_version_id, created_by_user_id, updated_by_user_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      proposalParams(proposal)
    );
  }

  async updateProposal(proposal: Proposal) {
    await this.connection.query(
      `
        UPDATE proposals
        SET current_version_id = $7, updated_by_user_id = $9, updated_at = $11
        WHERE id = $1
          AND organization_id = $2
          AND candidate_application_id = $3
          AND candidate_id = $4
          AND job_opening_id = $5
          AND job_opening_version_id = $6
          AND created_by_user_id = $8
          AND created_at = $10
      `,
      proposalParams(proposal)
    );
  }

  async createVersion(version: ProposalVersion) {
    await this.connection.query(
      `
        INSERT INTO proposal_versions (
          id, organization_id, proposal_id, candidate_application_id, candidate_id,
          job_opening_id, job_opening_version_id, version_number, status, content_snapshot,
          compensation_snapshot, content_hash, compensation_hash, presentation_schema_version,
          presentation_hash, valid_until, issued_at, issued_by_user_id, accepted_at,
          accepted_access_grant_id, acceptance_ip_hash, acceptance_user_agent_hash, declined_at,
          declined_access_grant_id, decline_ip_hash, decline_user_agent_hash, decline_reason,
          expired_at, cancelled_at, cancelled_by_user_id, cancellation_reason, superseded_at,
          superseded_by_user_id, superseded_by_version_id, discarded_at, discarded_by_user_id,
          discard_reason, created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
          $35, $36, $37, $38, $39, $40, $41
        )
      `,
      versionParams(version)
    );
  }

  async updateVersion(version: ProposalVersion) {
    await this.connection.query(
      `
        UPDATE proposal_versions
        SET version_number = $8,
            status = $9,
            content_snapshot = $10,
            compensation_snapshot = $11,
            content_hash = $12,
            compensation_hash = $13,
            presentation_schema_version = $14,
            presentation_hash = $15,
            valid_until = $16,
            issued_at = $17,
            issued_by_user_id = $18,
            accepted_at = $19,
            accepted_access_grant_id = $20,
            acceptance_ip_hash = $21,
            acceptance_user_agent_hash = $22,
            declined_at = $23,
            declined_access_grant_id = $24,
            decline_ip_hash = $25,
            decline_user_agent_hash = $26,
            decline_reason = $27,
            expired_at = $28,
            cancelled_at = $29,
            cancelled_by_user_id = $30,
            cancellation_reason = $31,
            superseded_at = $32,
            superseded_by_user_id = $33,
            superseded_by_version_id = $34,
            discarded_at = $35,
            discarded_by_user_id = $36,
            discard_reason = $37,
            updated_by_user_id = $39,
            updated_at = $41
        WHERE id = $1 AND organization_id = $2
          AND proposal_id = $3
          AND candidate_application_id = $4
          AND candidate_id = $5
          AND job_opening_id = $6
          AND job_opening_version_id = $7
          AND created_by_user_id = $38
          AND created_at = $40
      `,
      versionParams(version)
    );
  }

  async findVersionById(versionId: string) {
    const result = await this.connection.query("SELECT * FROM proposal_versions WHERE id = $1", [
      versionId
    ]);
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findVersionForUpdate(versionId: string) {
    const result = await this.connection.query(
      "SELECT * FROM proposal_versions WHERE id = $1 FOR UPDATE",
      [versionId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async findActiveDraft(organizationId: string, proposalId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM proposal_versions
        WHERE organization_id = $1
          AND proposal_id = $2
          AND status = 'draft'
          AND discarded_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [organizationId, proposalId]
    );
    return result.rows[0] ? mapVersion(result.rows[0]) : null;
  }

  async listVersions(organizationId: string, proposalId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM proposal_versions
        WHERE organization_id = $1 AND proposal_id = $2
        ORDER BY created_at ASC, id ASC
      `,
      [organizationId, proposalId]
    );
    return result.rows.map(mapVersion);
  }

  async nextVersionNumberForUpdate(organizationId: string, proposalId: string) {
    await this.connection.query(
      `
        SELECT id
        FROM proposal_versions
        WHERE organization_id = $1 AND proposal_id = $2
        ORDER BY id ASC
        FOR UPDATE
      `,
      [organizationId, proposalId]
    );
    const result = await this.connection.query(
      `
        SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version_number
        FROM proposal_versions
        WHERE organization_id = $1 AND proposal_id = $2
      `,
      [organizationId, proposalId]
    );
    return Number(result.rows[0].next_version_number);
  }

  async createGrant(grant: ProposalAccessGrant) {
    await this.connection.query(
      `
        INSERT INTO proposal_access_grants (
          id, organization_id, proposal_id, proposal_version_id, candidate_application_id,
          token_hash, status, issued_at, expires_at, revoked_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      grantParams(grant)
    );
  }

  async updateGrant(grant: ProposalAccessGrant) {
    await this.connection.query(
      `
        UPDATE proposal_access_grants
        SET status = $7, expires_at = $9, revoked_at = $10
        WHERE id = $1
          AND organization_id = $2
          AND proposal_id = $3
          AND proposal_version_id = $4
          AND candidate_application_id = $5
          AND token_hash = $6
          AND issued_at = $8
          AND created_at = $11
      `,
      grantParams(grant)
    );
  }

  async revokeActiveGrants(organizationId: string, proposalVersionId: string, revokedAt: string) {
    await this.connection.query(
      `
        UPDATE proposal_access_grants
        SET status = 'revoked', revoked_at = $3
        WHERE organization_id = $1
          AND proposal_version_id = $2
          AND status = 'active'
      `,
      [organizationId, proposalVersionId, revokedAt]
    );
  }

  async findGrantByTokenHash(tokenHash: string) {
    const result = await this.connection.query(
      "SELECT * FROM proposal_access_grants WHERE token_hash = $1",
      [tokenHash]
    );
    return result.rows[0] ? mapGrant(result.rows[0]) : null;
  }

  async findGrantForUpdate(grantId: string) {
    const result = await this.connection.query(
      "SELECT * FROM proposal_access_grants WHERE id = $1 FOR UPDATE",
      [grantId]
    );
    return result.rows[0] ? mapGrant(result.rows[0]) : null;
  }

  async listGrantsForVersionForUpdate(organizationId: string, proposalVersionId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM proposal_access_grants
        WHERE organization_id = $1 AND proposal_version_id = $2
        ORDER BY id ASC
        FOR UPDATE
      `,
      [organizationId, proposalVersionId]
    );
    return result.rows.map(mapGrant);
  }

  async addEvent(event: ProposalEvent) {
    await this.connection.query(
      `
        INSERT INTO proposal_events (
          id, organization_id, proposal_id, proposal_version_id, candidate_application_id,
          event_type, actor_user_id, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        event.id,
        event.organizationId,
        event.proposalId,
        event.proposalVersionId,
        event.candidateApplicationId,
        event.eventType,
        event.actorUserId,
        event.metadata,
        event.createdAt
      ]
    );
  }

  async listEvents(organizationId: string, proposalId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM proposal_events
        WHERE organization_id = $1 AND proposal_id = $2
        ORDER BY created_at ASC, id ASC
      `,
      [organizationId, proposalId]
    );
    return result.rows.map(mapEvent);
  }

  async listProposals(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM proposals WHERE organization_id = $1 ORDER BY created_at DESC, id DESC",
      [organizationId]
    );
    return result.rows.map(mapProposal);
  }
}

function proposalParams(proposal: Proposal) {
  return [
    proposal.id,
    proposal.organizationId,
    proposal.candidateApplicationId,
    proposal.candidateId,
    proposal.jobOpeningId,
    proposal.jobOpeningVersionId,
    proposal.currentVersionId,
    proposal.createdByUserId,
    proposal.updatedByUserId,
    proposal.createdAt,
    proposal.updatedAt
  ];
}

function versionParams(version: ProposalVersion) {
  return [
    version.id,
    version.organizationId,
    version.proposalId,
    version.candidateApplicationId,
    version.candidateId,
    version.jobOpeningId,
    version.jobOpeningVersionId,
    version.versionNumber,
    version.status,
    version.contentSnapshot,
    version.compensationSnapshot,
    version.contentHash,
    version.compensationHash,
    version.presentationSchemaVersion,
    version.presentationHash,
    version.validUntil,
    version.issuedAt,
    version.issuedByUserId,
    version.acceptedAt,
    version.acceptedAccessGrantId,
    version.acceptanceIpHash,
    version.acceptanceUserAgentHash,
    version.declinedAt,
    version.declinedAccessGrantId,
    version.declineIpHash,
    version.declineUserAgentHash,
    version.declineReason,
    version.expiredAt,
    version.cancelledAt,
    version.cancelledByUserId,
    version.cancellationReason,
    version.supersededAt,
    version.supersededByUserId,
    version.supersededByVersionId,
    version.discardedAt,
    version.discardedByUserId,
    version.discardReason,
    version.createdByUserId,
    version.updatedByUserId,
    version.createdAt,
    version.updatedAt
  ];
}

function grantParams(grant: ProposalAccessGrant) {
  return [
    grant.id,
    grant.organizationId,
    grant.proposalId,
    grant.proposalVersionId,
    grant.candidateApplicationId,
    grant.tokenHash,
    grant.status,
    grant.issuedAt,
    grant.expiresAt,
    grant.revokedAt,
    grant.createdAt
  ];
}

function mapProposal(row: Record<string, unknown>): Proposal {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateApplicationId: String(row.candidate_application_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    currentVersionId: nullableString(row.current_version_id),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapVersion(row: Record<string, unknown>): ProposalVersion {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    proposalId: String(row.proposal_id),
    candidateApplicationId: String(row.candidate_application_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    versionNumber: row.version_number === null ? null : Number(row.version_number),
    status: row.status as ProposalVersion["status"],
    contentSnapshot: objectJson(row.content_snapshot),
    compensationSnapshot: objectJson(row.compensation_snapshot),
    contentHash: String(row.content_hash),
    compensationHash: String(row.compensation_hash),
    presentationSchemaVersion: nullableString(row.presentation_schema_version),
    presentationHash: nullableString(row.presentation_hash),
    validUntil: nullableIso(row.valid_until),
    issuedAt: nullableIso(row.issued_at),
    issuedByUserId: nullableString(row.issued_by_user_id),
    acceptedAt: nullableIso(row.accepted_at),
    acceptedAccessGrantId: nullableString(row.accepted_access_grant_id),
    acceptanceIpHash: nullableString(row.acceptance_ip_hash),
    acceptanceUserAgentHash: nullableString(row.acceptance_user_agent_hash),
    declinedAt: nullableIso(row.declined_at),
    declinedAccessGrantId: nullableString(row.declined_access_grant_id),
    declineIpHash: nullableString(row.decline_ip_hash),
    declineUserAgentHash: nullableString(row.decline_user_agent_hash),
    declineReason: nullableString(row.decline_reason),
    expiredAt: nullableIso(row.expired_at),
    cancelledAt: nullableIso(row.cancelled_at),
    cancelledByUserId: nullableString(row.cancelled_by_user_id),
    cancellationReason: nullableString(row.cancellation_reason),
    supersededAt: nullableIso(row.superseded_at),
    supersededByUserId: nullableString(row.superseded_by_user_id),
    supersededByVersionId: nullableString(row.superseded_by_version_id),
    discardedAt: nullableIso(row.discarded_at),
    discardedByUserId: nullableString(row.discarded_by_user_id),
    discardReason: nullableString(row.discard_reason),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapGrant(row: Record<string, unknown>): ProposalAccessGrant {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    proposalId: String(row.proposal_id),
    proposalVersionId: String(row.proposal_version_id),
    candidateApplicationId: String(row.candidate_application_id),
    tokenHash: String(row.token_hash),
    status: row.status as ProposalAccessGrant["status"],
    issuedAt: toIso(row.issued_at),
    expiresAt: nullableIso(row.expires_at),
    revokedAt: nullableIso(row.revoked_at),
    createdAt: toIso(row.created_at)
  };
}

function mapEvent(row: Record<string, unknown>): ProposalEvent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    proposalId: String(row.proposal_id),
    proposalVersionId: nullableString(row.proposal_version_id),
    candidateApplicationId: String(row.candidate_application_id),
    eventType: row.event_type as ProposalEvent["eventType"],
    actorUserId: nullableString(row.actor_user_id),
    metadata: objectJson(row.metadata) as Record<string, string>,
    createdAt: toIso(row.created_at)
  };
}

function mapIdempotency(row: Record<string, unknown>): ProposalIdempotencyKey {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    operation: row.operation as ProposalIdempotencyKey["operation"],
    scopeId: String(row.scope_id),
    keyHash: String(row.key_hash),
    requestFingerprint: String(row.request_fingerprint),
    status: row.status as ProposalIdempotencyKey["status"],
    resultResourceId: nullableString(row.result_resource_id),
    errorCategory: nullableString(row.error_category),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    failedAt: nullableIso(row.failed_at)
  };
}

function mapApplication(row: Record<string, unknown>): ProposalApplicationContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    candidateId: String(row.candidate_id),
    jobOpeningId: String(row.job_opening_id),
    jobOpeningVersionId: String(row.job_opening_version_id),
    applicationStatus: row.application_status as ProposalApplicationContext["applicationStatus"],
    currentStage: row.current_stage as ProposalApplicationContext["currentStage"],
    updatedAt: toIso(row.updated_at)
  };
}

function mapCandidate(row: Record<string, unknown>): ProposalCandidateContext {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: row.status as ProposalCandidateContext["status"]
  };
}

function mapConsent(row: Record<string, unknown>): ProposalConsentContext {
  return {
    status: row.status as ProposalConsentContext["status"],
    expiresAt: nullableIso(row.expires_at),
    purpose: String(row.purpose)
  };
}

function objectJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function nullableIso(value: unknown) {
  return value === null || value === undefined ? null : toIso(value);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
