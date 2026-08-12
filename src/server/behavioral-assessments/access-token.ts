// Fase 19 (SPEC-022, secao 26). Token opaco de acesso do Candidate -- alta entropia, hash-only
// no banco, nunca reconstrutivel a partir do hash. Mesmos invariantes ja validados pela Fase
// 18 (SPEC-021, secao 25.1), tabela propria (`behavioral_assessment_access_tokens`), nunca
// compartilhada com `pre_interview_access_tokens`. Reaproveita exclusivamente `node:crypto`,
// sem dependencia nova.
import { createHash, randomBytes } from "node:crypto";

export function generateRawAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
