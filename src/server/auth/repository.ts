import type {
  AuthIdentity,
  Invitation,
  InvitationIdempotencyKey,
  InvitationIdempotencyOperation,
  PlatformAdmin
} from "./types";

export type BeginInvitationIdempotencyInput = {
  organizationId: string | null;
  operation: InvitationIdempotencyOperation;
  keyHash: string;
  requestFingerprint: string;
};

export interface AuthRepository {
  nextId(prefix: string): string;
  now(): string;

  // auth_identities -- ponte global (nunca tenant-scoped), SPEC-028 s6/s10.
  findAuthIdentityByExternalId(
    provider: "supabase",
    externalId: string
  ): Promise<AuthIdentity | null>;
  findAuthIdentityByUserId(userId: string): Promise<AuthIdentity | null>;
  createAuthIdentity(identity: AuthIdentity): Promise<void>;

  // platform_admins -- allow-list interna, SPEC-028 s21.
  findPlatformAdmin(userId: string): Promise<PlatformAdmin | null>;

  // invitations -- SPEC-028 s15/s16.
  findInvitationById(invitationId: string): Promise<Invitation | null>;
  findInvitationForUpdate(invitationId: string): Promise<Invitation | null>;
  findPendingInvitation(organizationId: string | null, email: string): Promise<Invitation | null>;
  createInvitation(invitation: Invitation): Promise<void>;
  updateInvitation(invitation: Invitation): Promise<void>;
  listInvitationsByOrganization(organizationId: string): Promise<Invitation[]>;

  // idempotencia module-specific -- SPEC-028 s26.
  beginIdempotency(input: BeginInvitationIdempotencyInput): Promise<{
    created: boolean;
    idempotency: InvitationIdempotencyKey;
  }>;
  markIdempotencyCompleted(id: string, resultResourceId: string): Promise<void>;
  markIdempotencyFailed(id: string, failureCategory: string): Promise<void>;
}
