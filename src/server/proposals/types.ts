export type ProposalVersionStatus =
  "draft" | "issued" | "accepted" | "declined" | "expired" | "cancelled" | "superseded";

export type ProposalGrantStatus = "active" | "revoked" | "expired";

export type ProposalEventType =
  | "draft_created"
  | "draft_updated"
  | "draft_discarded"
  | "issued"
  | "access_grant_rotated"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "superseded";

export type ProposalIdempotencyOperation =
  "issue" | "supersede" | "accept" | "decline" | "cancel" | "rotate_grant";

export type Proposal = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  currentVersionId: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProposalVersion = {
  id: string;
  organizationId: string;
  proposalId: string;
  candidateApplicationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  versionNumber: number | null;
  status: ProposalVersionStatus;
  contentSnapshot: Record<string, unknown>;
  compensationSnapshot: Record<string, unknown>;
  contentHash: string;
  compensationHash: string;
  presentationSchemaVersion: string | null;
  presentationHash: string | null;
  validUntil: string | null;
  issuedAt: string | null;
  issuedByUserId: string | null;
  acceptedAt: string | null;
  acceptedAccessGrantId: string | null;
  acceptanceIpHash: string | null;
  acceptanceUserAgentHash: string | null;
  declinedAt: string | null;
  declinedAccessGrantId: string | null;
  declineIpHash: string | null;
  declineUserAgentHash: string | null;
  declineReason: string | null;
  expiredAt: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  supersededAt: string | null;
  supersededByUserId: string | null;
  supersededByVersionId: string | null;
  discardedAt: string | null;
  discardedByUserId: string | null;
  discardReason: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProposalAccessGrant = {
  id: string;
  organizationId: string;
  proposalId: string;
  proposalVersionId: string;
  candidateApplicationId: string;
  tokenHash: string;
  status: ProposalGrantStatus;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type ProposalEvent = {
  id: string;
  organizationId: string;
  proposalId: string;
  proposalVersionId: string | null;
  candidateApplicationId: string;
  eventType: ProposalEventType;
  actorUserId: string | null;
  metadata: Record<string, string>;
  createdAt: string;
};

export type ProposalIdempotencyKey = {
  id: string;
  organizationId: string;
  operation: ProposalIdempotencyOperation;
  scopeId: string;
  keyHash: string;
  requestFingerprint: string;
  status: "pending" | "completed" | "failed";
  resultResourceId: string | null;
  errorCategory: string | null;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
};

export type ProposalApplicationContext = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  applicationStatus: "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
  currentStage: "applied" | "screening" | "interview" | "assessment" | "offer" | "completed";
  updatedAt: string;
};

export type ProposalCandidateContext = {
  id: string;
  organizationId: string;
  status: "active" | "inactive";
};

export type ProposalConsentContext = {
  status: "granted" | "revoked" | "expired" | "pending";
  expiresAt: string | null;
  purpose: string;
};

export type ProposalDraftInput = {
  contentSnapshot?: unknown;
  content_snapshot?: unknown;
  compensationSnapshot?: unknown;
  compensation_snapshot?: unknown;
  validUntil?: unknown;
  valid_until?: unknown;
};

export type ProposalIssueInput = {
  proposalVersionId?: unknown;
  proposal_version_id?: unknown;
  stageChangeReason?: unknown;
  stage_change_reason?: unknown;
};

export type ProposalSupersedeInput = ProposalIssueInput;

export type ProposalReasonInput = {
  reason?: unknown;
};

export type ProposalPublicActionInput = {
  declineReason?: unknown;
  decline_reason?: unknown;
};

export type ProposalAdminReadInput = {
  reason?: unknown;
};

export type ProposalPublicMeta = {
  ip: string;
  userAgent: string | null;
  idempotencyKey?: unknown;
};
