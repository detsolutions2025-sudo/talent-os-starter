// Nomes de auditoria conceituais registrados pela SPEC-018, secao 27 do pedido de
// implementacao, seguindo o mesmo padrao ja usado em `organization_dna.*` (SPEC-005) e
// `job_profile.*` (SPEC-008).
export const BlueprintAuditAction = {
  deploymentStarted: "blueprint.deployment_started",
  draftCreated: "blueprint.draft_created",
  readinessEvaluated: "blueprint.readiness_evaluated",
  activationRequested: "blueprint.activation_requested",
  activated: "blueprint.activated",
  activationDenied: "blueprint.activation_denied",
  previousVersionArchived: "blueprint.previous_version_archived",
  administrativeRead: "blueprint.administrative_read",
  permissionDenied: "blueprint.permission_denied",
  crossOrganizationAccessDenied: "blueprint.cross_organization_access_denied"
} as const;
