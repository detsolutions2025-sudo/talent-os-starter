import type { Membership } from "../core/types";
import type {
  HiredProposalReference,
  Onboarding,
  OnboardingApplicationContext,
  OnboardingCandidateContext,
  OnboardingEmploymentLinkContext,
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
  // Fase 26 (SPEC-016 v1.1 s44-s45): leitura minima e tenant-safe de
  // `employments` + `organization_people`, com `FOR SHARE` -- Onboarding
  // nunca escreve em Employment, apenas trava a linha para impedir que o
  // estado mude por baixo do vinculo sendo criado (mesmo padrao ja usado por
  // `findEmploymentForEligibility` em `development-retention`).
  findEmploymentForLink(
    organizationId: string,
    employmentId: string
  ): Promise<OnboardingEmploymentLinkContext | null>;
}
