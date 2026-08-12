import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent } from "../core/types";

export async function auditBehavioralAssessment(
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

export async function auditBehavioralAssessmentDenied(
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

// Sem User autenticado -- fluxo publico do Candidate (iniciar/salvar/enviar/expirar). A
// criacao de aplicacao em si e SEMPRE administrativa (SPEC-022, secao 9.1), entao nunca existe
// um "created" sem ator; mas as operacoes seguintes do Candidate nao tem ator humano, mesmo
// principio ja usado por `pre_interviews/audit.ts::auditPreInterviewSystem` (Fase 18).
export async function auditBehavioralAssessmentSystem(
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
