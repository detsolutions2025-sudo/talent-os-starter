import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent } from "../core/types";
import { actorUserIdOrNull } from "./authorization";

// Every AI infrastructure event (SPEC-014 "Auditoria") is recorded through audit_events, the
// same table every other module already uses -- never a parallel/duplicated audit mechanism.
// metadata is always a small, explicit map of ids/categories; callers never pass a full
// domain object, a prompt, a response, or anything that could carry a secret.
export async function recordAudit(
  core: CoreRepository,
  actor: Actor,
  organizationId: string | null,
  action: string,
  result: AuditEvent["result"],
  metadata: Record<string, string | null> = {},
  reason: string | null = null
) {
  const event: AuditEvent = {
    id: core.nextId("aud"),
    organizationId,
    actorUserId: actorUserIdOrNull(actor),
    action,
    result,
    reason,
    metadata,
    createdAt: core.now()
  };
  await core.addAuditEvent(event);
}

export function auditAllowed(
  core: CoreRepository,
  actor: Actor,
  organizationId: string | null,
  action: string,
  metadata: Record<string, string | null> = {}
) {
  return recordAudit(core, actor, organizationId, action, "allowed", metadata);
}

export function auditDenied(
  core: CoreRepository,
  actor: Actor,
  organizationId: string | null,
  action: string,
  reason: string,
  metadata: Record<string, string | null> = {}
) {
  return recordAudit(core, actor, organizationId, action, "denied", metadata, reason);
}
