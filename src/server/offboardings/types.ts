export type OffboardingStatus = "draft" | "in_progress" | "completed" | "cancelled";
export type OffboardingTaskStatus = "open" | "completed" | "cancelled";
export type OffboardingExitCategory =
  | "voluntary_resignation"
  | "involuntary_termination"
  | "end_of_contract"
  | "mutual_agreement"
  | "other_minimized";

// SPEC-026 s23: diferente do precedente de Onboarding (Fase 23), que nao exige
// Idempotency-Key para operacoes de task, aqui as 8 operacoes mutaveis -- incluindo
// add_task/assign/task_complete/task_cancel -- sao de primeira classe.
export type OffboardingIdempotencyOperation =
  | "create"
  | "start"
  | "add_task"
  | "assign"
  | "task_complete"
  | "task_cancel"
  | "complete"
  | "cancel";

export type Offboarding = {
  id: string;
  organizationId: string;
  employmentId: string;
  status: OffboardingStatus;
  exitCategory: OffboardingExitCategory | null;
  expectedLastDay: string | null;
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

export type OffboardingTask = {
  id: string;
  organizationId: string;
  offboardingId: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  status: OffboardingTaskStatus;
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

export type OffboardingIdempotencyKey = {
  id: string;
  organizationId: string;
  operation: OffboardingIdempotencyOperation;
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

// SPEC-026 s8/s14.2: leitura minima e tenant-safe de `employments` para validar
// elegibilidade (active|ended). Nunca inclui origin_reason, datas de negocio ou
// qualquer dado de OrganizationPerson -- apenas o necessario para a checagem de
// estado (mesmo padrao de `findEmploymentForEligibility`, development-retention).
export type OffboardingEmploymentEligibility = {
  id: string;
  organizationId: string;
  status: "pending" | "active" | "ended" | "cancelled";
};

// employment_id nunca e aceito no payload de criacao -- e sempre derivado do parametro de rota
// (`:employmentId`), nunca confiado do body, mesmo padrao ja aplicado a organization_id em
// todos os modulos pos-contratacao (SPEC-026 s27/s28).
export type OffboardingCreateInput = {
  exitCategory?: unknown;
  exit_category?: unknown;
  expectedLastDay?: unknown;
  expected_last_day?: unknown;
};

export type OffboardingTaskInput = {
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

export type OffboardingAssignInput = {
  assigneeMembershipId?: unknown;
  assignee_membership_id?: unknown;
};

export type OffboardingReasonInput = {
  reason?: unknown;
  cancellationReason?: unknown;
  cancellation_reason?: unknown;
};

export type OffboardingAdminReadInput = {
  reason?: unknown;
};
