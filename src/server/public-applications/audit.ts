import type { AuditEvent } from "../core/types";
import type { CoreRepository } from "../core/repository";

// `actorUserId` e sempre null nesta SPEC: nao ha User autenticado no fluxo publico, e a
// ausencia e representada pela propria acao/origem registrada em `metadata`, nunca por um
// ator inventado (SPEC-011 v1.2 RN-058/RN-065; SPEC-012 v1.1 RN-078).
export async function auditPublicSuccess(
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

// Usado com o `core` ligado ao Pool (nao transacional) sempre que a negacao precisar
// sobreviver a um ROLLBACK da transacao de negocio principal -- mesmo padrao de
// "preflight fora da transacao apenas para auditoria" ja usado pela Fase 15 (Blueprint) para
// evitar que uma negacao comum simplesmente desapareca junto com o rollback.
export async function auditPublicDenied(
  core: CoreRepository,
  organizationId: string | null,
  action: string,
  reason: string,
  metadata: AuditEvent["metadata"] = {}
) {
  await core.addAuditEvent({
    id: core.nextId("aud"),
    organizationId,
    actorUserId: null,
    action,
    result: "denied",
    reason,
    metadata,
    createdAt: core.now()
  });
}
