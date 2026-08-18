export type OnboardingStatus = "draft" | "in_progress" | "completed" | "cancelled";
export type OnboardingTaskStatus = "open" | "completed" | "cancelled";
export type OnboardingIdempotencyOperation =
  "create" | "start" | "cancel" | "complete" | "link_employment";

export type Onboarding = {
  id: string;
  organizationId: string;
  candidateApplicationId: string;
  candidateId: string;
  status: OnboardingStatus;
  expectedPersonStartDate: string | null;
  employmentId: string | null;
  createdByUserId: string;
  startedAt: string | null;
  startedByUserId: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OnboardingTask = {
  id: string;
  organizationId: string;
  onboardingId: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  status: OnboardingTaskStatus;
  assigneeMembershipId: string | null;
  dueAt: string | null;
  displayOrder: number | null;
  creationReason: string | null;
  createdByUserId: string;
  completedAt: string | null;
  completedByMembershipId: string | null;
  completedByUserId: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OnboardingIdempotencyKey = {
  id: string;
  organizationId: string;
  operation: OnboardingIdempotencyOperation;
  scopeId: string | null;
  keyHash: string;
  requestFingerprint: string;
  status: "pending" | "completed" | "failed";
  resultResourceId: string | null;
  failureCategory: string | null;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
};

export type OnboardingApplicationContext = {
  id: string;
  organizationId: string;
  candidateId: string;
  applicationStatus: "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
  currentStage: "applied" | "screening" | "interview" | "assessment" | "offer" | "completed";
};

export type OnboardingCandidateContext = {
  id: string;
  organizationId: string;
  status: "active" | "inactive";
};

export type HiredProposalReference = {
  proposalVersionId: string | null;
  conflicting: boolean;
};

export type OnboardingCreateInput = {
  expectedPersonStartDate?: unknown;
  expected_person_start_date?: unknown;
  initialTasks?: unknown;
  initial_tasks?: unknown;
};

export type OnboardingTaskInput = {
  title?: unknown;
  description?: unknown;
  isRequired?: unknown;
  is_required?: unknown;
  assigneeMembershipId?: unknown;
  assignee_membership_id?: unknown;
  dueAt?: unknown;
  due_at?: unknown;
  displayOrder?: unknown;
  display_order?: unknown;
  creationReason?: unknown;
  creation_reason?: unknown;
};

export type OnboardingAssignInput = {
  assigneeMembershipId?: unknown;
  assignee_membership_id?: unknown;
};

export type OnboardingReasonInput = {
  reason?: unknown;
  cancellationReason?: unknown;
  cancellation_reason?: unknown;
};

export type OnboardingAdminReadInput = {
  reason?: unknown;
};

export type OnboardingEmploymentLinkInput = {
  employmentId?: unknown;
  employment_id?: unknown;
};

// Fase 26 (SPEC-016 v1.1 s44): contexto minimo lido de `employments` +
// `organization_people` para validar elegibilidade e coerencia de
// proveniencia antes de gravar o vinculo. Nunca inclui PII (nome, e-mail,
// origin_reason) -- somente identificadores e o `origin_candidate_id` da
// OrganizationPerson, necessario para o caminho B da regra de coerencia.
export type OnboardingEmploymentLinkContext = {
  id: string;
  organizationId: string;
  status: "pending" | "active" | "ended" | "cancelled";
  organizationPersonOriginCandidateId: string | null;
  originCandidateApplicationId: string | null;
};
