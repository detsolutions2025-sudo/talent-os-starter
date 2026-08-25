// Fase 29 (ADR-0026; SPEC-028 v1.0). Tipos do dominio de Autenticacao Real.
//
// `AuthIdentity` e a ponte User <-> identidade externa do provider -- nunca fonte de
// autorizacao. `Membership` (core/types.ts) continua sendo, sozinha, a fonte de verdade de
// autorizacao organizacional (SPEC-028 s13); nenhum tipo deste modulo e consumido por
// `authorize()`.

export type AuthProvider = "supabase";

export type AuthIdentity = {
  id: string;
  userId: string;
  provider: AuthProvider;
  externalId: string;
  createdAt: string;
  updatedAt: string;
};

export type PlatformAdminStatus = "active" | "revoked";

export type PlatformAdmin = {
  userId: string;
  status: PlatformAdminStatus;
  grantedByUserId: string | null;
  grantedAt: string;
  revokedAt: string | null;
  revokedByUserId: string | null;
};

export type InvitationRole = "owner" | "admin" | "member";
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export type Invitation = {
  id: string;
  organizationId: string | null;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  createdByUserId: string;
  resolvedUserId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  // Fase 29 (0033; SPEC-028 s16). Dados pendentes da Organization -- preenchidos SOMENTE em
  // convite de bootstrap (organizationId nulo), NULOS em convite normal; imutaveis apos a
  // criacao. `bootstrapOrganizationId` nasce vazio e so passa a existir no aceite (mesma
  // transacao que cria a Organization + primeiro owner), nunca antes.
  organizationName: string | null;
  organizationSlug: string | null;
  bootstrapOrganizationId: string | null;
};

// SPEC-028 s26: criar convite (inclusive bootstrap) exige Idempotency-Key -- mesmo padrao
// module-specific ja usado por access_grant_idempotency_keys (0031).
export type InvitationIdempotencyOperation = "invite" | "bootstrap";

export type InvitationIdempotencyKey = {
  id: string;
  organizationId: string | null;
  operation: InvitationIdempotencyOperation;
  keyHash: string;
  requestFingerprint: string;
  status: "pending" | "completed" | "failed";
  resultResourceId: string | null;
  failureCategory: string | null;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
};

// Verificado localmente (assinatura + issuer + audience + exp) via JWKS -- SPEC-028 s11/s12.
// Nunca contem role/organizationId; e o resultado cru do token, antes de qualquer resolucao de
// Actor.
export type VerifiedProviderClaims = {
  externalId: string; // `sub` do JWT -- auth.users.id do provider.
  email: string | null;
  emailVerified: boolean;
  expiresAt: number; // epoch seconds, `exp` do token.
};

// organizationId nunca e aceito no payload -- sempre derivado do contexto autorizado no servidor
// (rota), nunca confiado do body (mesma disciplina de todo o dominio pos-contratacao).
export type CreateInvitationInput = {
  email?: unknown;
  role?: unknown;
};

export type CancelInvitationInput = Record<string, never>;

export type BootstrapOrganizationInput = {
  organizationName?: unknown;
  organization_name?: unknown;
  organizationSlug?: unknown;
  organization_slug?: unknown;
  ownerEmail?: unknown;
  owner_email?: unknown;
};

export type RevokeSessionInput = {
  reason?: unknown;
};
