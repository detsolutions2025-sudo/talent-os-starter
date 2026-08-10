// Canonicalizacao + hash SHA-256 -- componente generico e compartilhado.
//
// Originalmente introduzido na Fase 15 (SPEC-018) dentro de `blueprints/manifest.ts`, para o
// fingerprint do Manifest do Blueprint. Extraido para `core/` na Fase 17 (revisao destrutiva,
// itens 6/7) porque a candidatura publica tambem precisa de um fingerprint canonico e
// deterministico do payload da submissao, para a validacao de reuso de `Idempotency-Key`
// (SPEC-020 v1.1, secao 15) -- sem criar nenhum acoplamento entre os dois modulos.
//
// `blueprints/manifest.ts` reexporta `fingerprint` a partir daqui, preservando exatamente o
// mesmo caminho de import e comportamento ja usado por `tests/phase15/blueprint-fingerprint.test.ts`.
import { createHash } from "node:crypto";

export function fingerprint(payload: Record<string, unknown>) {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}
