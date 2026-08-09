import { badRequest } from "../core/errors";

// Mass assignment (SPEC-018 secao 33 do pedido de implementacao): estes campos sao
// controlados exclusivamente pelo servidor e nunca podem ser aceitos de um payload de
// cliente, em nenhuma rota do modulo Blueprint.
const controlledFields = new Set([
  "id",
  "organizationId",
  "organization_id",
  "versionNumber",
  "version_number",
  "status",
  "createdSource",
  "created_source",
  "createdByUserId",
  "created_by_user_id",
  "activatedByUserId",
  "activated_by_user_id",
  "activatedAt",
  "activated_at",
  "archivedAt",
  "archived_at",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "manifest",
  "manifestItems",
  "manifest_items",
  "contentFingerprint",
  "content_fingerprint",
  "activationReadinessSnapshot",
  "activation_readiness_snapshot"
]);

export function rejectControlledFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return;
  }

  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (controlledFields.has(key)) {
      throw badRequest(
        "blueprint_field_forbidden",
        `Field "${key}" is controlled exclusively by the server.`
      );
    }
  }
}

export function requireAdminReason(reason: unknown) {
  const text = typeof reason === "string" ? reason.trim() : "";

  if (!text) {
    throw badRequest("admin_reason_required", "Administrative reason is required.");
  }

  return text;
}
