// Fase 30 (ADR-0027; SPEC-029 v1.0). Cobre CA-001 a CA-009, CA-011 a CA-013 do catalogo da
// SPEC-029 (secao 12), mais os cenarios de revisao destrutiva explicitamente listados na tarefa:
// production/staging completos e com cada ausencia individual/multipla, empty/whitespace, ordem
// deterministica, nenhum segredo na mensagem de erro, no-op em development/test,
// APP_ENV ausente/desconhecido, e valores semanticamente invalidos passando pelo gate de
// presenca (esta funcao nunca valida formato).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertProductionConfig, requireConfigValue } from "../../src/server/config-validation";

const REQUIRED_VARS = [
  "SUPABASE_DATABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_ANON_KEY"
] as const;

// Valores-canario: nunca segredos reais, apenas marcadores unicos usados para provar que a
// mensagem de erro nao vaza NENHUM valor de variavel (CA-008/RN-005), sem depender de grep sobre
// o codigo-fonte (ver justificativa no relatorio final da tarefa).
const CANARY_VALUES: Record<(typeof REQUIRED_VARS)[number], string> = {
  SUPABASE_DATABASE_URL: "canary-db-url-marker-9f3a",
  VITE_SUPABASE_URL: "https://canary-project-marker-9f3a.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "canary-service-role-marker-9f3a",
  VITE_SUPABASE_ANON_KEY: "canary-anon-key-marker-9f3a"
};

function envWith(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { APP_ENV: "production", ...CANARY_VALUES, ...overrides } as NodeJS.ProcessEnv;
}

function expectNoCanaryLeak(error: unknown) {
  const message = String(error);
  for (const value of Object.values(CANARY_VALUES)) {
    expect(message).not.toContain(value);
  }
}

// Restauracao rigorosa: nenhum teste deste arquivo deveria precisar mutar process.env (todos
// passam um `env` explicito para `assertProductionConfig`), mas o snapshot/restauracao global
// garante que nenhum estado vaze entre testes mesmo que um caso futuro precise mutar.
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("assertProductionConfig - production", () => {
  it("CA-009: passa com as quatro variaveis presentes e nao-vazias", () => {
    expect(() => assertProductionConfig(envWith())).not.toThrow();
  });

  it("CA-004: falha nomeando SUPABASE_DATABASE_URL quando ausente", () => {
    expect(() => assertProductionConfig(envWith({ SUPABASE_DATABASE_URL: undefined }))).toThrow(
      /SUPABASE_DATABASE_URL/
    );
  });

  it("CA-002: falha nomeando VITE_SUPABASE_URL quando ausente", () => {
    expect(() => assertProductionConfig(envWith({ VITE_SUPABASE_URL: undefined }))).toThrow(
      /VITE_SUPABASE_URL/
    );
  });

  it("CA-001: falha nomeando SUPABASE_SERVICE_ROLE_KEY quando ausente", () => {
    expect(() => assertProductionConfig(envWith({ SUPABASE_SERVICE_ROLE_KEY: undefined }))).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  it("CA-003: falha nomeando VITE_SUPABASE_ANON_KEY quando ausente (fecha o gap fisico da SPEC-029 s3)", () => {
    expect(() => assertProductionConfig(envWith({ VITE_SUPABASE_ANON_KEY: undefined }))).toThrow(
      /VITE_SUPABASE_ANON_KEY/
    );
  });

  it("todas as quatro ausentes -> mensagem nomeia todas, em ordem deterministica", () => {
    const env = { APP_ENV: "production" } as NodeJS.ProcessEnv;
    expect(() => assertProductionConfig(env)).toThrowError(
      "Missing required configuration for APP_ENV=production: SUPABASE_DATABASE_URL, " +
        "VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY"
    );
  });

  it("CA-007: multiplas ausentes (nao adjacentes) -> mensagem nomeia todas, ordem estavel", () => {
    const env = envWith({ VITE_SUPABASE_URL: undefined, VITE_SUPABASE_ANON_KEY: undefined });
    expect(() => assertProductionConfig(env)).toThrowError(
      "Missing required configuration for APP_ENV=production: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY"
    );
  });

  it("ordem do erro independe da ordem em que as ausencias foram introduzidas no objeto env", () => {
    // Constroi o objeto com as chaves em ordem inversa da lista normativa -- a mensagem deve,
    // ainda assim, seguir a ordem normativa (SUPABASE_DATABASE_URL, VITE_SUPABASE_URL,
    // SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY), nunca a ordem de insercao no objeto.
    const env = {
      VITE_SUPABASE_ANON_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      VITE_SUPABASE_URL: CANARY_VALUES.VITE_SUPABASE_URL,
      SUPABASE_DATABASE_URL: undefined,
      APP_ENV: "production"
    } as NodeJS.ProcessEnv;
    expect(() => assertProductionConfig(env)).toThrowError(
      "Missing required configuration for APP_ENV=production: SUPABASE_DATABASE_URL, " +
        "SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY"
    );
  });

  it("string vazia e tratada como ausente", () => {
    expect(() => assertProductionConfig(envWith({ SUPABASE_SERVICE_ROLE_KEY: "" }))).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  it("CA-011: valor composto so de espacos em branco e tratado como ausente", () => {
    expect(() => assertProductionConfig(envWith({ VITE_SUPABASE_ANON_KEY: "   " }))).toThrow(
      /VITE_SUPABASE_ANON_KEY/
    );
  });

  it("CA-008/RN-005: a mensagem de erro nunca contem nenhum valor-canario de variavel", () => {
    const env = envWith({ SUPABASE_DATABASE_URL: undefined, VITE_SUPABASE_URL: undefined });
    try {
      assertProductionConfig(env);
      throw new Error("assertProductionConfig deveria ter lancado, mas nao lancou");
    } catch (error) {
      expectNoCanaryLeak(error);
    }
  });

  it("segredo com caracteres especiais nao aparece na mensagem quando presente e outra variavel falta", () => {
    const specialSecret = "s3cr#t!@#$%^&*()_+={}[]|\\:;\"'<>,.?/~`-canary";
    const env = envWith({
      SUPABASE_SERVICE_ROLE_KEY: specialSecret,
      VITE_SUPABASE_ANON_KEY: undefined
    });
    try {
      assertProductionConfig(env);
      throw new Error("assertProductionConfig deveria ter lancado, mas nao lancou");
    } catch (error) {
      expect(String(error)).not.toContain(specialSecret);
    }
  });

  it("segredo longo nao aparece na mensagem quando presente e outra variavel falta", () => {
    const longSecret = "x".repeat(4096) + "-canary";
    const env = envWith({ SUPABASE_DATABASE_URL: longSecret, VITE_SUPABASE_URL: undefined });
    try {
      assertProductionConfig(env);
      throw new Error("assertProductionConfig deveria ter lancado, mas nao lancou");
    } catch (error) {
      expect(String(error)).not.toContain(longSecret);
    }
  });

  it("valores semanticamente invalidos mas presentes passam pelo gate de presenca (formato nao e validado aqui)", () => {
    const env = envWith({
      SUPABASE_DATABASE_URL: "not-a-url-at-all",
      VITE_SUPABASE_URL: "also-not-a-url",
      SUPABASE_SERVICE_ROLE_KEY: "x",
      VITE_SUPABASE_ANON_KEY: "y"
    });
    expect(() => assertProductionConfig(env)).not.toThrow();
  });
});

describe("assertProductionConfig - staging (SPEC-029 s8: espelha producao para este gate)", () => {
  it("passa com as quatro variaveis presentes e nao-vazias", () => {
    expect(() => assertProductionConfig(envWith({ APP_ENV: "staging" }))).not.toThrow();
  });

  it.each(REQUIRED_VARS)("falha quando %s esta ausente", (name) => {
    const env = envWith({ APP_ENV: "staging", [name]: undefined });
    expect(() => assertProductionConfig(env)).toThrow(new RegExp(name));
  });

  it("multiplas ausentes -> mensagem consolidada nomeia todas", () => {
    const env = envWith({
      APP_ENV: "staging",
      SUPABASE_DATABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined
    });
    expect(() => assertProductionConfig(env)).toThrowError(
      "Missing required configuration for APP_ENV=staging: SUPABASE_DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
    );
  });

  it("todas as quatro ausentes -> mensagem nomeia todas, em ordem deterministica (igual a producao)", () => {
    const env = { APP_ENV: "staging" } as NodeJS.ProcessEnv;
    expect(() => assertProductionConfig(env)).toThrowError(
      "Missing required configuration for APP_ENV=staging: SUPABASE_DATABASE_URL, " +
        "VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY"
    );
  });

  it("nenhum valor-canario vaza na mensagem de erro", () => {
    const env = envWith({ APP_ENV: "staging", VITE_SUPABASE_ANON_KEY: undefined });
    try {
      assertProductionConfig(env);
      throw new Error("assertProductionConfig deveria ter lancado, mas nao lancou");
    } catch (error) {
      expectNoCanaryLeak(error);
    }
  });
});

describe("assertProductionConfig - development/test (no-op, INV-02/RN-004)", () => {
  it("CA-005: development, nenhuma variavel presente, boot nao e interrompido", () => {
    expect(() =>
      assertProductionConfig({ APP_ENV: "development" } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("CA-006: test, nenhuma variavel presente, boot nao e interrompido", () => {
    expect(() => assertProductionConfig({ APP_ENV: "test" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("development com variaveis parcialmente presentes tambem nao e afetado", () => {
    expect(() =>
      assertProductionConfig({
        APP_ENV: "development",
        SUPABASE_DATABASE_URL: "postgresql://x"
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });
});

describe("assertProductionConfig - APP_ENV ausente/desconhecido (comportamento herdado, fora de escopo)", () => {
  it("APP_ENV ausente -> herda o default de development, gate no-op", () => {
    expect(() => assertProductionConfig({} as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("APP_ENV com valor desconhecido -> nao e tratado automaticamente como production", () => {
    expect(() =>
      assertProductionConfig({ APP_ENV: "homolog-legado" } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });
});

describe("assertProductionConfig - CA-013: nenhuma variavel consegue desabilitar a validacao", () => {
  it("uma variavel de ambiente extra nao e reconhecida como escape hatch", () => {
    const env = envWith({
      SUPABASE_DATABASE_URL: undefined,
      SKIP_CONFIG_VALIDATION: "true"
    } as Partial<NodeJS.ProcessEnv>);
    expect(() => assertProductionConfig(env)).toThrow(/SUPABASE_DATABASE_URL/);
  });
});

describe("assertProductionConfig - parametro default usa process.env real", () => {
  it("sem argumento, le process.env do processo real", () => {
    process.env.APP_ENV = "development";
    expect(() => assertProductionConfig()).not.toThrow();
  });
});

describe("requireConfigValue (primitiva generica de presenca reutilizada por auth/config.ts)", () => {
  it("retorna o valor presente, trimado", () => {
    expect(requireConfigValue({ FOO: "  bar  " } as NodeJS.ProcessEnv, "FOO")).toBe("bar");
  });

  it("lanca com mensagem default nomeando a variavel quando ausente", () => {
    expect(() => requireConfigValue({} as NodeJS.ProcessEnv, "FOO")).toThrow("FOO is required.");
  });

  it("lanca com mensagem customizada quando fornecida", () => {
    expect(() =>
      requireConfigValue({} as NodeJS.ProcessEnv, "FOO", "mensagem customizada")
    ).toThrow("mensagem customizada");
  });

  it("trata string vazia e whitespace-only como ausente", () => {
    expect(() => requireConfigValue({ FOO: "" } as NodeJS.ProcessEnv, "FOO")).toThrow();
    expect(() => requireConfigValue({ FOO: "   " } as NodeJS.ProcessEnv, "FOO")).toThrow();
  });
});
