export type OrganizationPerson = {
  id: string;
  organizationId: string;
  displayName: string;
  preferredName: string | null;
  primaryEmail: string | null;
  originCandidateId: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmploymentStatus = "pending" | "active" | "ended" | "cancelled";
export type EmploymentOriginType = "recruitment" | "administrative";

export type Employment = {
  id: string;
  organizationId: string;
  organizationPersonId: string;
  status: EmploymentStatus;
  originType: EmploymentOriginType;
  originReason: string;
  originCandidateId: string | null;
  originCandidateApplicationId: string | null;
  originProposalVersionId: string | null;
  originJobOpeningId: string | null;
  originJobOpeningVersionId: string | null;
  decisionAt: string | null;
  effectiveStartDate: string;
  startedAt: string | null;
  endDate: string | null;
  endedAt: string | null;
  endReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdByUserId: string;
  activatedByUserId: string | null;
  endedByUserId: string | null;
  cancelledByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmploymentIdempotencyOperation =
  | "create_person"
  | "create_employment"
  | "create_person_and_employment"
  | "activate"
  | "cancel"
  | "end";

export type EmploymentIdempotencyKey = {
  id: string;
  organizationId: string;
  operation: EmploymentIdempotencyOperation;
  scopeId: string | null;
  keyHash: string;
  requestFingerprint: string;
  status: "pending" | "completed" | "failed";
  resultResourceId: string | null;
  errorCategory: string | null;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
};

export type EmploymentApplicationContext = {
  id: string;
  organizationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  applicationStatus: "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
  finalizedAt: string | null;
};

export type EmploymentCandidateContext = {
  id: string;
  organizationId: string;
  status: "active" | "inactive";
  fullName: string;
  preferredName: string | null;
  email: string | null;
};

export type EmploymentProposalVersionContext = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  status: string;
};

export type OrganizationPersonInput = {
  organizationPersonId?: unknown;
  organization_person_id?: unknown;
  displayName?: unknown;
  display_name?: unknown;
  preferredName?: unknown;
  preferred_name?: unknown;
  primaryEmail?: unknown;
  primary_email?: unknown;
  originCandidateId?: unknown;
  origin_candidate_id?: unknown;
};

export type EmploymentCreateInput = OrganizationPersonInput & {
  originType?: unknown;
  origin_type?: unknown;
  originReason?: unknown;
  origin_reason?: unknown;
  candidateApplicationId?: unknown;
  candidate_application_id?: unknown;
  proposalVersionId?: unknown;
  proposal_version_id?: unknown;
  decisionAt?: unknown;
  decision_at?: unknown;
  effectiveStartDate?: unknown;
  effective_start_date?: unknown;
};

export type EmploymentReasonInput = {
  reason?: unknown;
  endReason?: unknown;
  end_reason?: unknown;
  cancellationReason?: unknown;
  cancellation_reason?: unknown;
  endDate?: unknown;
  end_date?: unknown;
};

export type EmploymentActivationInput = {
  reason?: unknown;
};

export type EmploymentAdminReadInput = {
  reason?: unknown;
};
