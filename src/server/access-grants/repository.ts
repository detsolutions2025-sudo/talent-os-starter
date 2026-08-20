import type { Membership } from "../core/types";
import type {
  AccessGrant,
  AccessGrantEmploymentEligibility,
  AccessGrantIdempotencyKey,
  AccessGrantIdempotencyOperation,
  AccessGrantOrganizationPersonEligibility
} from "./types";

export type BeginAccessGrantIdempotencyInput = {
  organizationId: string;
  operation: AccessGrantIdempotencyOperation;
  scopeId: string | null;
  keyHash: string;
  requestFingerprint: string;
};

export interface AccessGrantRepository {
  nextId(prefix: string): string;
  now(): string;
  beginIdempotency(input: BeginAccessGrantIdempotencyInput): Promise<{
    created: boolean;
    idempotency: AccessGrantIdempotencyKey;
  }>;
  markIdempotencyCompleted(id: string, resultResourceId: string): Promise<void>;
  markIdempotencyFailed(id: string, failureCategory: string): Promise<void>;
  // SPEC-027 s8/s9: FOR SHARE, nunca FOR UPDATE -- este modulo nunca escreve em `employments`,
  // apenas trava a linha para impedir que o estado mude por baixo da operacao em curso (mesmo
  // padrao de `findEmploymentForEligibility`, offboardings/development-retention).
  findEmploymentForEligibility(
    employmentId: string
  ): Promise<AccessGrantEmploymentEligibility | null>;
  findOrganizationPersonForEligibility(
    organizationPersonId: string
  ): Promise<AccessGrantOrganizationPersonEligibility | null>;
  // Le/trava a linha de `Membership` diretamente (mesmo padrao de
  // `OffboardingRepository.findMembershipForUpdate`) -- este modulo nunca escreve em
  // `Membership` por conta propria; toda mutacao funcional e delegada a
  // `CoreService.updateMembership` (SPEC-027 s13).
  findMembershipForUpdate(membershipId: string): Promise<Membership | null>;
  findActiveGrantForMembership(
    organizationId: string,
    membershipId: string
  ): Promise<AccessGrant | null>;
  findAccessGrantById(accessGrantId: string): Promise<AccessGrant | null>;
  findAccessGrantForUpdate(accessGrantId: string): Promise<AccessGrant | null>;
  createAccessGrant(accessGrant: AccessGrant): Promise<void>;
  updateAccessGrant(accessGrant: AccessGrant): Promise<void>;
  listAccessGrantsByOrganization(organizationId: string): Promise<AccessGrant[]>;
  listAccessGrantsByPerson(
    organizationId: string,
    organizationPersonId: string
  ): Promise<AccessGrant[]>;
  listAccessGrantsByMembership(
    organizationId: string,
    membershipId: string
  ): Promise<AccessGrant[]>;
  listAccessGrantsByEmployment(
    organizationId: string,
    employmentId: string
  ): Promise<AccessGrant[]>;
}
