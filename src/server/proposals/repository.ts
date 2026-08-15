import type {
  Proposal,
  ProposalAccessGrant,
  ProposalApplicationContext,
  ProposalCandidateContext,
  ProposalConsentContext,
  ProposalEvent,
  ProposalIdempotencyKey,
  ProposalIdempotencyOperation,
  ProposalVersion
} from "./types";

export type BeginIdempotencyInput = {
  organizationId: string;
  operation: ProposalIdempotencyOperation;
  scopeId: string;
  keyHash: string;
  requestFingerprint: string;
};

export interface ProposalRepository {
  nextId(prefix: string): string;
  now(): string;
  beginIdempotency(input: BeginIdempotencyInput): Promise<{
    created: boolean;
    idempotency: ProposalIdempotencyKey;
  }>;
  markIdempotencyCompleted(id: string, resultResourceId: string): Promise<void>;
  markIdempotencyFailed(id: string, errorCategory: string): Promise<void>;
  findApplicationForUpdate(applicationId: string): Promise<ProposalApplicationContext | null>;
  updateApplicationStage(
    applicationId: string,
    currentStage: ProposalApplicationContext["currentStage"],
    updatedByUserId: string,
    updatedAt: string
  ): Promise<void>;
  addCandidateApplicationEvent(input: {
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
  }): Promise<void>;
  findCandidate(candidateId: string): Promise<ProposalCandidateContext | null>;
  latestConsent(candidateId: string): Promise<ProposalConsentContext | null>;
  findProposalByApplication(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<Proposal | null>;
  findProposalForUpdate(proposalId: string): Promise<Proposal | null>;
  createProposal(proposal: Proposal): Promise<void>;
  updateProposal(proposal: Proposal): Promise<void>;
  createVersion(version: ProposalVersion): Promise<void>;
  updateVersion(version: ProposalVersion): Promise<void>;
  findVersionById(versionId: string): Promise<ProposalVersion | null>;
  findVersionForUpdate(versionId: string): Promise<ProposalVersion | null>;
  findActiveDraft(organizationId: string, proposalId: string): Promise<ProposalVersion | null>;
  listVersions(organizationId: string, proposalId: string): Promise<ProposalVersion[]>;
  nextVersionNumberForUpdate(organizationId: string, proposalId: string): Promise<number>;
  createGrant(grant: ProposalAccessGrant): Promise<void>;
  updateGrant(grant: ProposalAccessGrant): Promise<void>;
  revokeActiveGrants(
    organizationId: string,
    proposalVersionId: string,
    revokedAt: string
  ): Promise<void>;
  findGrantByTokenHash(tokenHash: string): Promise<ProposalAccessGrant | null>;
  findGrantForUpdate(grantId: string): Promise<ProposalAccessGrant | null>;
  listGrantsForVersionForUpdate(
    organizationId: string,
    proposalVersionId: string
  ): Promise<ProposalAccessGrant[]>;
  addEvent(event: ProposalEvent): Promise<void>;
  listEvents(organizationId: string, proposalId: string): Promise<ProposalEvent[]>;
  listProposals(organizationId: string): Promise<Proposal[]>;
}
