export type DevelopmentPlanStatus =
  "draft" | "active" | "completed" | "cancelled" | "closed_due_to_employment_end";

export type DevelopmentPlan = {
  id: string;
  organizationId: string;
  employmentId: string;
  title: string;
  purpose: string | null;
  status: DevelopmentPlanStatus;
  // SPEC-017 s15/s36: RBAC de member para goal/check-in e "somente se explicitamente
  // autorizado no plano" -- a autorizacao vive aqui, no Plan, nao por Goal individual.
  assigneeMembershipId: string | null;
  createdByMembershipId: string;
  activatedByMembershipId: string | null;
  completedByMembershipId: string | null;
  cancelledByMembershipId: string | null;
  createdAt: string;
  activatedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  updatedAt: string;
};

export type DevelopmentGoalStatus = "open" | "completed" | "cancelled";

export type DevelopmentGoal = {
  id: string;
  organizationId: string;
  employmentId: string;
  developmentPlanId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: DevelopmentGoalStatus;
  createdByMembershipId: string;
  completedByMembershipId: string | null;
  cancelledByMembershipId: string | null;
  cancelReason: string | null;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
};

export type DevelopmentCheckInVisibility = "owner_admin_only" | "owner_admin_and_assignee";

export type DevelopmentCheckIn = {
  id: string;
  organizationId: string;
  employmentId: string;
  developmentPlanId: string;
  summary: string;
  visibility: DevelopmentCheckInVisibility;
  submittedByMembershipId: string;
  submittedAt: string;
  createdAt: string;
};

export type RetentionConcernSource =
  | "person_explicit_statement"
  | "human_observation"
  | "development_check_in"
  | "administrative_decision";

export type RetentionConcernCategory =
  "career_growth" | "work_context" | "management_attention" | "role_fit" | "other_minimized";

export type RetentionConcernStatus = "open" | "resolved" | "cancelled";

export type RetentionConcern = {
  id: string;
  organizationId: string;
  employmentId: string;
  source: RetentionConcernSource;
  category: RetentionConcernCategory;
  description: string;
  status: RetentionConcernStatus;
  visibility: DevelopmentCheckInVisibility;
  createdByMembershipId: string;
  resolvedByMembershipId: string | null;
  cancelledByMembershipId: string | null;
  resolutionSummary: string | null;
  cancelReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
};

export type RetentionActionType =
  | "conversation"
  | "follow_up"
  | "role_context_review"
  | "development_alignment"
  | "administrative_support"
  | "other_minimized";

export type RetentionActionStatus = "open" | "completed" | "cancelled";

export type RetentionAction = {
  id: string;
  organizationId: string;
  employmentId: string;
  retentionConcernId: string | null;
  actionType: RetentionActionType;
  description: string;
  status: RetentionActionStatus;
  createdByMembershipId: string;
  completedByMembershipId: string | null;
  cancelledByMembershipId: string | null;
  cancelReason: string | null;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
};

export type DevelopmentRetentionIdempotencyOperation =
  | "create_plan"
  | "activate_plan"
  | "complete_plan"
  | "cancel_plan"
  | "create_goal"
  | "complete_goal"
  | "cancel_goal"
  | "create_checkin"
  | "create_concern"
  | "resolve_concern"
  | "cancel_concern"
  | "create_action"
  | "complete_action"
  | "cancel_action";

export type DevelopmentRetentionIdempotencyKey = {
  id: string;
  organizationId: string;
  operation: DevelopmentRetentionIdempotencyOperation;
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

export type EmploymentEligibilityContext = {
  id: string;
  organizationId: string;
  status: "pending" | "active" | "ended" | "cancelled";
};

// -------------------------------------------------------------------------------------
// Inputs (mass assignment defense: every field is validated by an explicit allow-list in
// validation.ts; unknown keys are rejected before reaching the service).
// -------------------------------------------------------------------------------------

export type DevelopmentPlanCreateInput = {
  title?: unknown;
  purpose?: unknown;
  assigneeMembershipId?: unknown;
  assignee_membership_id?: unknown;
};

export type DevelopmentPlanCancelInput = {
  reason?: unknown;
};

export type DevelopmentGoalCreateInput = {
  title?: unknown;
  description?: unknown;
  dueDate?: unknown;
  due_date?: unknown;
};

export type DevelopmentGoalCancelInput = {
  reason?: unknown;
};

export type DevelopmentCheckInCreateInput = {
  summary?: unknown;
  visibility?: unknown;
};

export type RetentionConcernCreateInput = {
  source?: unknown;
  category?: unknown;
  description?: unknown;
  visibility?: unknown;
};

export type RetentionConcernResolveInput = {
  resolutionSummary?: unknown;
  resolution_summary?: unknown;
};

export type RetentionConcernCancelInput = {
  reason?: unknown;
};

export type RetentionActionCreateInput = {
  retentionConcernId?: unknown;
  retention_concern_id?: unknown;
  actionType?: unknown;
  action_type?: unknown;
  description?: unknown;
};

export type RetentionActionCancelInput = {
  reason?: unknown;
};

export type DevelopmentRetentionAdminReadInput = {
  reason?: unknown;
};
