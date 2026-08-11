// Fase 18 (SPEC-021, secao 25.1). Token opaco de acesso do Candidate -- alta entropia, hash-only
// no banco, nunca reconstrutivel a partir do hash. Reaproveita exclusivamente `node:crypto` (a
// mesma familia ja usada em toda `persistence/postgres-*-repository.ts` para `randomUUID`), sem
// dependencia nova.
import { createHash, randomBytes } from "node:crypto";

export function generateRawAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
