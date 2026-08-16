import type { Membership } from "../core/types";
import type {
  HiredProposalReference,
  Onboarding,
  OnboardingApplicationContext,
  OnboardingCandidateContext,
  OnboardingIdempotencyKey,
  OnboardingIdempotencyOperation,
  OnboardingTask
} from "./types";

export type BeginOnboardingIdempotencyInput = {
  organizationId: string;
  operation: OnboardingIdempotencyOperation;
  scopeId: string | null;
  keyHash: string;
  requestFingerprint: string;
};

export interface OnboardingRepository {
  nextId(prefix: string): string;
  now(): string;
  beginIdempotency(input: BeginOnboardingIdempotencyInput): Promise<{
    created: boolean;
    idempotency: OnboardingIdempotencyKey;
  }>;
  markIdempotencyCompleted(id: string, resultResourceId: string): Promise<void>;
  markIdempotencyFailed(id: string, failureCategory: string): Promise<void>;
  findApplicationForUpdate(applicationId: string): Promise<OnboardingApplicationContext | null>;
  findCandidate(candidateId: string): Promise<OnboardingCandidateContext | null>;
  findHiredProposalReference(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<HiredProposalReference>;
  acceptedProposalVersionExists(
    organizationId: string,
    candidateApplicationId: string,
    proposalVersionId: string
  ): Promise<boolean>;
  findOnboardingByApplication(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<Onboarding | null>;
  findOnboardingById(onboardingId: string): Promise<Onboarding | null>;
  findOnboardingForUpdate(onboardingId: string): Promise<Onboarding | null>;
  createOnboarding(onboarding: Onboarding): Promise<void>;
  updateOnboarding(onboarding: Onboarding): Promise<void>;
  createTask(task: OnboardingTask): Promise<void>;
  updateTask(task: OnboardingTask): Promise<void>;
  findTaskForUpdate(taskId: string): Promise<OnboardingTask | null>;
  listTasks(organizationId: string, onboardingId: string): Promise<OnboardingTask[]>;
  listTasksForUpdate(organizationId: string, onboardingId: string): Promise<OnboardingTask[]>;
  listTasksForMembership(organizationId: string, membershipId: string): Promise<OnboardingTask[]>;
  findMembershipForUpdate(membershipId: string): Promise<Membership | null>;
  listOnboardings(organizationId: string): Promise<Onboarding[]>;
}
