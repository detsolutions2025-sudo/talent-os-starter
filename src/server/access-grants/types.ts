export type AccessGrantStatus = "active" | "revoked";
export type AccessGrantProvenanceType = "employment" | "administrative";
export type AccessGrantRevocationReasonCategory =
  | "employment_ended"
  | "role_change"
  | "security_concern"
  | "administrative_correction"
  | "other_minimized";

// SPEC-027 s23/s25: as duas unicas operacoes mutaveis (conceder, revogar) exigem
// Idempotency-Key -- mesmo padrao module-specific ja usado por employments/offboardings.
export type AccessGrantIdempotencyOperation = "grant" | "revoke";

export type AccessGrant = {
  id: string;
  organizationId: string;
  organizationPersonId: string;
  membershipId: string;
  employmentId: string | null;
  provenanceType: AccessGrantProvenanceType;
  grantReason: string | null;
  status: AccessGrantStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revocationReasonCategory: AccessGrantRevocationReasonCategory | null;
};

export type AccessGrantIdempotencyKey = {
  id: string;
  organizationId: string;
  operation: AccessGrantIdempotencyOperation;
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

// SPEC-027 s8/s9: leitura minima e tenant-safe de `employments` para validar elegibilidade
// (active|ended) e coerencia de OrganizationPerson -- nunca inclui origin_reason, datas de
// negocio ou qualquer outro dado de Employment, mesmo padrao de
// `OffboardingEmploymentEligibility` (offboardings) e `findEmploymentForEligibility`
// (development-retention).
export type AccessGrantEmploymentEligibility = {
  id: string;
  organizationId: string;
  organizationPersonId: string;
  status: "pending" | "active" | "ended" | "cancelled";
};

// SPEC-027 s8: leitura minima e tenant-safe de `organization_people` -- apenas o necessario
// para validar pertencimento a mesma Organization.
export type AccessGrantOrganizationPersonEligibility = {
  id: string;
  organizationId: string;
};

// organizationId nunca e aceito no payload -- e sempre derivado do contexto autorizado no
// servidor (rota), nunca confiado do body, mesmo padrao ja aplicado em todo o dominio
// pos-contratacao (SPEC-027 s31).
export type AccessGrantCreateInput = {
  organizationPersonId?: unknown;
  organization_person_id?: unknown;
  membershipId?: unknown;
  membership_id?: unknown;
  provenanceType?: unknown;
  provenance_type?: unknown;
  employmentId?: unknown;
  employment_id?: unknown;
  grantReason?: unknown;
  grant_reason?: unknown;
};

export type AccessGrantRevokeInput = {
  revocationReasonCategory?: unknown;
  revocation_reason_category?: unknown;
};

export type AccessGrantAdminReadInput = {
  reason?: unknown;
};
