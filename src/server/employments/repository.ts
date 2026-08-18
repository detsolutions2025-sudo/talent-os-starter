import type { Membership } from "../core/types";
import type {
  Employment,
  EmploymentApplicationContext,
  EmploymentCandidateContext,
  EmploymentIdempotencyKey,
  EmploymentIdempotencyOperation,
  EmploymentProposalVersionContext,
  OrganizationPerson
} from "./types";

export type BeginEmploymentIdempotencyInput = {
  organizationId: string;
  operation: EmploymentIdempotencyOperation;
  scopeId: string | null;
  keyHash: string;
  requestFingerprint: string;
};

export interface EmploymentRepository {
  nextId(prefix: string): string;
  now(): string;
  beginIdempotency(
    input: BeginEmploymentIdempotencyInput
  ): Promise<{ created: boolean; idempotency: EmploymentIdempotencyKey }>;
  markIdempotencyCompleted(id: string, resultResourceId: string): Promise<void>;
  markIdempotencyFailed(id: string, errorCategory: string): Promise<void>;
  findPersonById(personId: string): Promise<OrganizationPerson | null>;
  findPersonForUpdate(personId: string): Promise<OrganizationPerson | null>;
  findPersonByOriginCandidateForUpdate(
    organizationId: string,
    candidateId: string
  ): Promise<OrganizationPerson | null>;
  createPerson(person: OrganizationPerson): Promise<void>;
  listPeople(organizationId: string): Promise<OrganizationPerson[]>;
  findEmploymentById(employmentId: string): Promise<Employment | null>;
  findEmploymentForUpdate(employmentId: string): Promise<Employment | null>;
  listEmployments(organizationId: string, personId?: string): Promise<Employment[]>;
  listEmploymentsForPersonForUpdate(
    organizationId: string,
    personId: string
  ): Promise<Employment[]>;
  createEmployment(employment: Employment): Promise<void>;
  updateEmployment(employment: Employment): Promise<void>;
  findApplicationForUpdate(applicationId: string): Promise<EmploymentApplicationContext | null>;
  findCandidate(candidateId: string): Promise<EmploymentCandidateContext | null>;
  findProposalVersionForUpdate(
    proposalVersionId: string
  ): Promise<EmploymentProposalVersionContext | null>;
  findMembershipForUpdate(membershipId: string): Promise<Membership | null>;
  // Fase 25 (SPEC-017 s20/s28): quando end() transiciona Employment para `ended`, a trigger de
  // banco instalada pela migration da Fase 25 (`trg_reconcile_development_plans_on_employment_end`)
  // fecha reativamente, na MESMA transacao, qualquer DevelopmentPlan nao final como
  // `closed_due_to_employment_end`. Employment nunca decide nem controla essa transicao -- so
  // observa o efeito fisico ja concluido para poder auditar (evento obrigatorio da SPEC-017),
  // porque uma trigger de banco nao pode chamar codigo de aplicacao.
  findPlanIdsClosedDueToEmploymentEnd(
    organizationId: string,
    employmentId: string
  ): Promise<string[]>;
}
