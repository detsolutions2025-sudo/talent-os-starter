import type { Membership } from "../core/types";
import type {
  Offboarding,
  OffboardingEmploymentEligibility,
  OffboardingIdempotencyKey,
  OffboardingIdempotencyOperation,
  OffboardingTask
} from "./types";

export type BeginOffboardingIdempotencyInput = {
  organizationId: string;
  operation: OffboardingIdempotencyOperation;
  scopeId: string | null;
  keyHash: string;
  requestFingerprint: string;
};

export interface OffboardingRepository {
  nextId(prefix: string): string;
  now(): string;
  beginIdempotency(input: BeginOffboardingIdempotencyInput): Promise<{
    created: boolean;
    idempotency: OffboardingIdempotencyKey;
  }>;
  markIdempotencyCompleted(id: string, resultResourceId: string): Promise<void>;
  markIdempotencyFailed(id: string, failureCategory: string): Promise<void>;
  // SPEC-026 s8/s14.2: FOR SHARE, nunca FOR UPDATE -- este modulo nunca escreve em
  // `employments` (mesmo padrao de `findEmploymentForEligibility`, development-retention, e de
  // `findEmploymentForLink`, onboardings).
  findEmploymentForEligibility(
    employmentId: string
  ): Promise<OffboardingEmploymentEligibility | null>;
  findOffboardingById(offboardingId: string): Promise<Offboarding | null>;
  findOffboardingForUpdate(offboardingId: string): Promise<Offboarding | null>;
  listOffboardingsForEmployment(
    organizationId: string,
    employmentId: string
  ): Promise<Offboarding[]>;
  createOffboarding(offboarding: Offboarding): Promise<void>;
  updateOffboarding(offboarding: Offboarding): Promise<void>;
  createTask(task: OffboardingTask): Promise<void>;
  updateTask(task: OffboardingTask): Promise<void>;
  findTaskForUpdate(taskId: string): Promise<OffboardingTask | null>;
  listTasks(organizationId: string, offboardingId: string): Promise<OffboardingTask[]>;
  listTasksForUpdate(organizationId: string, offboardingId: string): Promise<OffboardingTask[]>;
  listTasksForMembership(organizationId: string, membershipId: string): Promise<OffboardingTask[]>;
  findMembershipForUpdate(membershipId: string): Promise<Membership | null>;
  listOffboardings(organizationId: string): Promise<Offboarding[]>;
}
