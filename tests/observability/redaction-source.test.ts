// @vitest-environment node
// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 11, redacao explicita). Mesmo padrao de
// teste de codigo-fonte ja usado em `tests/phase29/audit-security-source.test.ts` -- leitura
// direta do codigo real, nao um mock -- estendido (ADR-0027 secao 11: "Production Hardening deve
// ESTENDER essa mesma garantia... para qualquer logger operacional novo") do dominio de auth para
// o novo logger operacional desta Fase.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REDACT_PATHS } from "../../src/server/observability/logger";

const OBSERVABILITY_DIR = join(process.cwd(), "src/server/observability");
const EXTRA_SOURCE_FILES = [
  join(process.cwd(), "src/server/app.ts"),
  join(process.cwd(), "src/server/index.ts")
];

const REQUIRED_REDACTED_SUBSTRINGS = [
  "authorization",
  "cookie",
  "password",
  "token",
  "service_role",
  "serviceRoleKey",
  "connectionString",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];

const FORBIDDEN_DIRECT_LOG_FIELDS = [
  "password",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "serviceRoleKey",
  "service_role",
  "connectionString",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];

function observabilitySourceFiles() {
  return readdirSync(OBSERVABILITY_DIR)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({
      file: `observability/${file}`,
      content: readFileSync(join(OBSERVABILITY_DIR, file), "utf8")
    }))
    .concat(
      EXTRA_SOURCE_FILES.map((path) => ({
        file: path.replace(process.cwd(), "").replace(/^[/\\]/, ""),
        content: readFileSync(path, "utf8")
      }))
    );
}

describe("Observabilidade - redacao de segredos (source-code proof, ADR-0027 s11)", () => {
  it("REDACT_PATHS cobre explicitamente Authorization/cookie/password/token/service-role/connection string", () => {
    const joined = REDACT_PATHS.join(" ").toLowerCase();
    for (const required of REQUIRED_REDACTED_SUBSTRINGS) {
      expect(joined).toContain(required.toLowerCase());
    }
  });

  it("nenhuma chamada logger.*()/console.*() em app.ts/index.ts/observability/* passa um campo proibido diretamente", () => {
    const offenders: string[] = [];
    for (const { file, content } of observabilitySourceFiles()) {
      const calls = content.match(/(?:logger|console)\.\w+\([\s\S]*?\);/g) ?? [];
      for (const call of calls) {
        for (const forbidden of FORBIDDEN_DIRECT_LOG_FIELDS) {
          if (call.includes(forbidden)) {
            offenders.push(`${file}: log call references "${forbidden}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("o logger nunca e usado para auditoria de negocio (addAuditEvent permanece completamente separado, ADR-0027 s11)", () => {
    // Verifica uma CHAMADA real (nunca uma mencao em comentario/docstring, como a que este
    // proprio modulo faz deliberadamente para documentar a separacao).
    const offenders: string[] = [];
    for (const { file, content } of observabilitySourceFiles()) {
      if (/\baddAuditEvent\s*\(/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
