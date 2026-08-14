import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent } from "../core/types";

export async function auditCandidateDossier(
  core: CoreRepository,
  actor: Actor,
  organizationId: string | null,
  action: string,
  metadata: AuditEvent["metadata"] = {}
) {
  await core.addAuditEvent({
    id: core.nextId("aud"),
    organizationId,
    actorUserId: actor.kind === "user" ? actor.userId : null,
    action,
    result: "allowed",
    reason: null,
    metadata,
    createdAt: core.now()
  });
}

export async function auditCandidateDossierDenied(
  core: CoreRepository,
  actor: Actor,
  organizationId: string | null,
  action: string,
  reason: string,
  metadata: AuditEvent["metadata"] = {}
) {
  await core.addAuditEvent({
    id: core.nextId("aud"),
    organizationId,
    actorUserId: actor.kind === "user" ? actor.userId : null,
    action,
    result: "denied",
    reason,
    metadata,
    createdAt: core.now()
  });
}
