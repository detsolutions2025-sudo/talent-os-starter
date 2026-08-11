import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent } from "../core/types";

export async function auditPreInterview(
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

export async function auditPreInterviewDenied(
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

// Sem User autenticado (criacao automatica pos-candidatura publica, SPEC-021, secao 8.4) --
// mesmo principio ja usado por `public-applications/audit.ts`: a ausencia de ator e
// representada pelo proprio `created_source` em `metadata`, nunca por um ator inventado.
export async function auditPreInterviewSystem(
  core: CoreRepository,
  organizationId: string | null,
  action: string,
  metadata: AuditEvent["metadata"] = {}
) {
  await core.addAuditEvent({
    id: core.nextId("aud"),
    organizationId,
    actorUserId: null,
    action,
    result: "allowed",
    reason: null,
    metadata,
    createdAt: core.now()
  });
}
