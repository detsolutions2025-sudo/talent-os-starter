// Fase 31 (ADR-0027 secao 17; SPEC-030 v1.0, RN-045). Correcao pre-commit (gate 3): nao existe
// mais um segundo modulo de fail-fast independente para esta Fase -- o requisito de
// `TRUSTED_FRONTEND_ORIGINS` em producao/staging e validado pela MESMA autoridade central da
// Fase 30 (`assertProductionConfig`, `config-validation.ts`), estendida via o parametro
// `additionalRequiredVars` que este arquivo prova. `tests/phase30/config-validation.test.ts`
// (protegido, nao alterado) continua provando que chamadas SEM esse parametro preservam
// exatamente o comportamento/mensagens de antes desta Fase.
import { describe, expect, it } from "vitest";
import { assertProductionConfig } from "../../src/server/config-validation";
import {
  parseTrustedOrigins,
  TRUSTED_FRONTEND_ORIGINS_ENV_VAR
} from "../../src/server/http/trusted-origins";

const BASE_VARS = {
  SUPABASE_DATABASE_URL: "postgresql://canary",
  VITE_SUPABASE_URL: "https://canary.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "canary-role-key",
  VITE_SUPABASE_ANON_KEY: "canary-anon-key"
};

describe("Fase 31 - fail-fast integrado ao gate central da Fase 30 (RN-045, ADR-0027 s17)", () => {
  it("production sem TRUSTED_FRONTEND_ORIGINS: assertProductionConfig(env, [var]) lanca nomeando so a variavel ausente", () => {
    const env = { APP_ENV: "production", ...BASE_VARS } as NodeJS.ProcessEnv;
    expect(() => assertProductionConfig(env, [TRUSTED_FRONTEND_ORIGINS_ENV_VAR])).toThrowError(
      "Missing required configuration for APP_ENV=production: TRUSTED_FRONTEND_ORIGINS"
    );
  });

  it("staging sem TRUSTED_FRONTEND_ORIGINS: mesma regra (staging espelha producao, SPEC-030 s8)", () => {
    const env = { APP_ENV: "staging", ...BASE_VARS } as NodeJS.ProcessEnv;
    expect(() => assertProductionConfig(env, [TRUSTED_FRONTEND_ORIGINS_ENV_VAR])).toThrowError(
      "Missing required configuration for APP_ENV=staging: TRUSTED_FRONTEND_ORIGINS"
    );
  });

  it("production com os 4 vars da Fase 30 ausentes E TRUSTED_FRONTEND_ORIGINS ausente: uma unica mensagem nomeia as 5, nunca so as 4 (RN-002 estendido)", () => {
    const env = { APP_ENV: "production" } as NodeJS.ProcessEnv;
    expect(() => assertProductionConfig(env, [TRUSTED_FRONTEND_ORIGINS_ENV_VAR])).toThrowError(
      "Missing required configuration for APP_ENV=production: SUPABASE_DATABASE_URL, " +
        "VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY, TRUSTED_FRONTEND_ORIGINS"
    );
  });

  it("production com todas as 5 presentes: nao lanca", () => {
    const env = {
      APP_ENV: "production",
      ...BASE_VARS,
      TRUSTED_FRONTEND_ORIGINS: "https://app.example.com"
    } as NodeJS.ProcessEnv;
    expect(() => assertProductionConfig(env, [TRUSTED_FRONTEND_ORIGINS_ENV_VAR])).not.toThrow();
  });

  it("string vazia/whitespace e tratada como ausente (mesma primitiva generica de presenca)", () => {
    const env = {
      APP_ENV: "production",
      ...BASE_VARS,
      TRUSTED_FRONTEND_ORIGINS: "   "
    } as NodeJS.ProcessEnv;
    expect(() => assertProductionConfig(env, [TRUSTED_FRONTEND_ORIGINS_ENV_VAR])).toThrow(
      /TRUSTED_FRONTEND_ORIGINS/
    );
  });

  it("RN-046/INV-02: development/test -- ausencia nunca impede o boot (no-op), mesmo passando additionalRequiredVars", () => {
    expect(() =>
      assertProductionConfig({ APP_ENV: "development" } as NodeJS.ProcessEnv, [
        TRUSTED_FRONTEND_ORIGINS_ENV_VAR
      ])
    ).not.toThrow();
    expect(() =>
      assertProductionConfig({ APP_ENV: "test" } as NodeJS.ProcessEnv, [
        TRUSTED_FRONTEND_ORIGINS_ENV_VAR
      ])
    ).not.toThrow();
  });

  it("chamada sem additionalRequiredVars (todo chamador pre-existente) preserva exatamente o comportamento de 4 variaveis -- nunca exige TRUSTED_FRONTEND_ORIGINS por engano", () => {
    const env = { APP_ENV: "production", ...BASE_VARS } as NodeJS.ProcessEnv;
    expect(() => assertProductionConfig(env)).not.toThrow();
  });
});

describe("Fase 31 - parseTrustedOrigins (leitura pos-gate, index.ts)", () => {
  it("producao/staging: apos o gate central garantir presenca, o parse sempre produz um Set nao-vazio", () => {
    const origins = parseTrustedOrigins("https://app.example.com,https://admin.example.com");
    expect(origins.size).toBe(2);
    expect(origins.has("https://app.example.com")).toBe(true);
  });

  it("development/test: variavel ausente produz Set vazio (CORS/CSRF no-op), sem lancar", () => {
    expect(parseTrustedOrigins(undefined).size).toBe(0);
  });
});
