import { badRequest } from "../core/errors";
import { normalizeEmail } from "../core/normalization";
import type {
  BootstrapOrganizationInput,
  CreateInvitationInput,
  InvitationRole,
  RevokeSessionInput
} from "./types";

const INVITABLE_ROLES: InvitationRole[] = ["admin", "member"];

// SPEC-028 s31 (por analogia com SPEC-027 s31): allow-list explicita. Nunca aceita
// organization_id, status, created_by_user_id, resolved_user_id ou qualquer metadata de
// auditoria vinda do payload -- organization_id sempre vem do path/contexto autorizado.
export function validateCreateInvitationInput(input: CreateInvitationInput) {
  ensureAllowedKeys(input, ["email", "role"]);

  const email = normalizeEmail(requiredText(input.email, "email", 320));
  if (!email.includes("@")) {
    throw badRequest("invitation_email_invalid", "A valid email is required.");
  }

  const role = input.role;
  if (typeof role !== "string" || !INVITABLE_ROLES.includes(role as InvitationRole)) {
    throw badRequest("invitation_role_invalid", "role must be admin or member.");
  }

  return { email, role: role as "admin" | "member" };
}

// SPEC-028 s16: bootstrap so aceita role owner (imposto pelo servico, nunca pelo payload) e
// exige os dados minimos da Organization a criar quando o e-mail ainda nao pertence a um User
// confirmado.
export function validateBootstrapInput(input: BootstrapOrganizationInput) {
  ensureAllowedKeys(input, [
    "organizationName",
    "organization_name",
    "organizationSlug",
    "organization_slug",
    "ownerEmail",
    "owner_email"
  ]);

  const organizationName = requiredText(
    input.organizationName ?? input.organization_name,
    "organization_name",
    200
  );
  const organizationSlug = requiredText(
    input.organizationSlug ?? input.organization_slug,
    "organization_slug",
    200
  );
  const ownerEmail = normalizeEmail(
    requiredText(input.ownerEmail ?? input.owner_email, "owner_email", 320)
  );
  if (!ownerEmail.includes("@")) {
    throw badRequest("bootstrap_owner_email_invalid", "A valid owner email is required.");
  }

  return { organizationName, organizationSlug, ownerEmail };
}

export function validateRevokeSessionInput(input: RevokeSessionInput) {
  ensureAllowedKeys(input, ["reason"]);
  return { reason: requiredText(input.reason, "reason", 500) };
}

export function validateIdempotencyKey(value: unknown) {
  const key = requiredText(value, "idempotency_key", 200);
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) {
    throw badRequest("idempotency_key_invalid", "Idempotency-Key is invalid.");
  }
  return key;
}

function ensureAllowedKeys(input: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw badRequest("auth_unknown_field", `${key} is not allowed.`);
    }
  }
}

function requiredText(value: unknown, field: string, max: number) {
  if (typeof value !== "string") {
    throw badRequest(`${field}_invalid`, `${field} is invalid.`);
  }
  const text = value.trim();
  if (!text || text.length > max) {
    throw badRequest(`${field}_invalid`, `${field} is invalid.`);
  }
  return text;
}
