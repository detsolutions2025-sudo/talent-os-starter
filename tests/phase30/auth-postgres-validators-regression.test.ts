// Fase 30 (ADR-0027; SPEC-029 v1.0). Nao existiam testes dedicados para os exports de
// `auth/config.ts` antes desta fase. `assertProductionConfig` (`config-validation.ts`) ABSORVE,
// nunca duplica ou enfraquece, `assertSupabaseAuthConfiguredForProduction` e
// `requireSupabaseAuthConfig` (Fase 29) nem `requirePostgresDatabaseUrl` (Fase 1.1) -- RN-007/
// INV-05/CA-012. Estes testes minimos provam que extrair a primitiva generica de presenca
// (`requireVar` -> `requireConfigValue`, reexportada de `../../src/server/config-validation`)
// NAO alterou nenhum contrato publico, mensagem ou comportamento existente. Nao e uma suite geral
// de Auth -- apenas prova de ausencia de regressao introduzida por esta fase.
import { describe, expect, it } from "vitest";
import {
  assertSupabaseAuthConfiguredForProduction,
  requireSupabaseAuthConfig
} from "../../src/server/auth/config";
import { requirePostgresDatabaseUrl } from "../../src/server/postgres";

describe("requireSupabaseAuthConfig (Fase 29, contrato preservado)", () => {
  it("lanca a mensagem publica exata quando VITE_SUPABASE_URL esta ausente", () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: "role-key" } as NodeJS.ProcessEnv;
    expect(() => requireSupabaseAuthConfig(env)).toThrow(
      "VITE_SUPABASE_URL is required for Supabase Auth."
    );
  });

  it("lanca a mensagem publica exata quando SUPABASE_SERVICE_ROLE_KEY esta ausente", () => {
    const env = { VITE_SUPABASE_URL: "https://project.supabase.co" } as NodeJS.ProcessEnv;
    expect(() => requireSupabaseAuthConfig(env)).toThrow(
      "SUPABASE_SERVICE_ROLE_KEY is required for Supabase Auth."
    );
  });

  it("string vazia continua tratada como ausente", () => {
    const env = {
      VITE_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "role-key"
    } as NodeJS.ProcessEnv;
    expect(() => requireSupabaseAuthConfig(env)).toThrow(
      "VITE_SUPABASE_URL is required for Supabase Auth."
    );
  });

  it("retorna a config completa, com jwks/issuer/audience derivados, quando presentes", () => {
    const env = {
      VITE_SUPABASE_URL: "https://project.supabase.co/",
      SUPABASE_SERVICE_ROLE_KEY: "role-key"
    } as NodeJS.ProcessEnv;
    expect(requireSupabaseAuthConfig(env)).toEqual({
      url: "https://project.supabase.co/",
      serviceRoleKey: "role-key",
      jwksUrl: "https://project.supabase.co/auth/v1/.well-known/jwks.json",
      issuer: "https://project.supabase.co/auth/v1",
      audience: "authenticated"
    });
  });

  it("continua respeitando SUPABASE_JWKS_URL/ISSUER/AUDIENCE explicitos quando presentes", () => {
    const env = {
      VITE_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "role-key",
      SUPABASE_JWKS_URL: "https://custom.example/jwks.json",
      SUPABASE_JWT_ISSUER: "https://custom.example/issuer",
      SUPABASE_JWT_AUDIENCE: "custom-audience"
    } as NodeJS.ProcessEnv;
    expect(requireSupabaseAuthConfig(env)).toEqual({
      url: "https://project.supabase.co",
      serviceRoleKey: "role-key",
      jwksUrl: "https://custom.example/jwks.json",
      issuer: "https://custom.example/issuer",
      audience: "custom-audience"
    });
  });
});

describe("assertSupabaseAuthConfiguredForProduction (Fase 29, contrato preservado)", () => {
  it("continua no-op fora de production, mesmo sem nenhuma variavel", () => {
    expect(() =>
      assertSupabaseAuthConfiguredForProduction({ APP_ENV: "development" } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("continua exigindo a configuracao completa quando APP_ENV=production", () => {
    expect(() =>
      assertSupabaseAuthConfiguredForProduction({ APP_ENV: "production" } as NodeJS.ProcessEnv)
    ).toThrow("VITE_SUPABASE_URL is required for Supabase Auth.");
  });

  it("nao trata staging como production -- Fase 30 nao amplia o contrato deste validator (Gate 9)", () => {
    expect(() =>
      assertSupabaseAuthConfiguredForProduction({ APP_ENV: "staging" } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("passa em production quando VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estao presentes", () => {
    expect(() =>
      assertSupabaseAuthConfiguredForProduction({
        APP_ENV: "production",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "role-key"
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });
});

describe("requirePostgresDatabaseUrl (Fase 1.1, contrato preservado)", () => {
  it("continua exigindo presenca", () => {
    expect(() => requirePostgresDatabaseUrl(undefined)).toThrow(
      "SUPABASE_DATABASE_URL is required for PostgreSQL operations."
    );
  });

  it("continua validando formato PostgreSQL (rejeita valor nao-URL)", () => {
    expect(() => requirePostgresDatabaseUrl("not-a-url")).toThrow(
      "SUPABASE_DATABASE_URL must be a valid PostgreSQL connection string."
    );
  });

  it("continua validando formato PostgreSQL (rejeita protocolo nao-postgres)", () => {
    expect(() => requirePostgresDatabaseUrl("https://example.com")).toThrow(
      "SUPABASE_DATABASE_URL must be a PostgreSQL connection string."
    );
  });

  it("continua aceitando uma connection string postgres/postgresql valida", () => {
    const value = "postgresql://user:pass@localhost:5432/db";
    expect(requirePostgresDatabaseUrl(value)).toBe(value);
  });
});
