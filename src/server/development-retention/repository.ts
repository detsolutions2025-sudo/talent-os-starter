import type {
  DevelopmentCheckIn,
  DevelopmentGoal,
  DevelopmentPlan,
  DevelopmentRetentionIdempotencyKey,
  DevelopmentRetentionIdempotencyOperation,
  EmploymentEligibilityContext,
  RetentionAction,
  RetentionConcern
} from "./types";

export type BeginDevelopmentRetentionIdempotencyInput = {
  organizationId: string;
  operation: DevelopmentRetentionIdempotencyOperation;
  scopeId: string | null;
  keyHash: string;
  requestFingerprint: string;
};

export interface DevelopmentRetentionRepository {
  nextId(prefix: string): string;
  now(): string;

  beginIdempotency(
    input: BeginDevelopmentRetentionIdempotencyInput
  ): Promise<{ created: boolean; idempotency: DevelopmentRetentionIdempotencyKey }>;
  markIdempotencyCompleted(id: string, resultResourceId: string): Promise<void>;
  markIdempotencyFailed(id: string, errorCategory: string): Promise<void>;

  findEmploymentForEligibility(employmentId: string): Promise<EmploymentEligibilityContext | null>;

  findPlanById(planId: string): Promise<DevelopmentPlan | null>;
  findPlanForUpdate(planId: string): Promise<DevelopmentPlan | null>;
  listPlans(organizationId: string, employmentId?: string): Promise<DevelopmentPlan[]>;
  createPlan(plan: DevelopmentPlan): Promise<void>;
  updatePlan(plan: DevelopmentPlan): Promise<void>;

  findGoalById(goalId: string): Promise<DevelopmentGoal | null>;
  findGoalForUpdate(goalId: string): Promise<DevelopmentGoal | null>;
  listGoalsForPlan(organizationId: string, planId: string): Promise<DevelopmentGoal[]>;
  listGoalsForPlanForUpdate(organizationId: string, planId: string): Promise<DevelopmentGoal[]>;
  createGoal(goal: DevelopmentGoal): Promise<void>;
  updateGoal(goal: DevelopmentGoal): Promise<void>;

  findCheckInById(checkInId: string): Promise<DevelopmentCheckIn | null>;
  listCheckInsForPlan(organizationId: string, planId: string): Promise<DevelopmentCheckIn[]>;
  createCheckIn(checkIn: DevelopmentCheckIn): Promise<void>;

  findConcernById(concernId: string): Promise<RetentionConcern | null>;
  findConcernForUpdate(concernId: string): Promise<RetentionConcern | null>;
  listConcerns(organizationId: string, employmentId?: string): Promise<RetentionConcern[]>;
  createConcern(concern: RetentionConcern): Promise<void>;
  updateConcern(concern: RetentionConcern): Promise<void>;

  findActionById(actionId: string): Promise<RetentionAction | null>;
  findActionForUpdate(actionId: string): Promise<RetentionAction | null>;
  listActions(organizationId: string, employmentId?: string): Promise<RetentionAction[]>;
  createAction(action: RetentionAction): Promise<void>;
  updateAction(action: RetentionAction): Promise<void>;
}
