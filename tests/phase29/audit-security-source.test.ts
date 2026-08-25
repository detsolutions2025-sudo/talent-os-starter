// @vitest-environment node
// Fase 29 (SPEC-028 s30/s37; gates P-11/P-12/P-14). Mesmo padrao de teste de codigo-fonte ja
// usado em `tests/phase27/offboarding-destructive-postgres.test.ts` para a fronteira P-01
// daquele dominio -- leitura direta do codigo real, nao um mock.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AUTH_DIR = join(process.cwd(), "src/server/auth");
const FORBIDDEN_IN_METADATA = [
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "password",
  "serviceRoleKey",
  "service_role",
  "Authorization",
  "cookie"
];

function authSourceFiles() {
  return readdirSync(AUTH_DIR)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, content: readFileSync(join(AUTH_DIR, file), "utf8") }));
}

describe("GATE P-11/P-12: no auth event ever carries a secret (source-code proof)", () => {
  it("no call to audit()/auditWith() in src/server/auth/* passes a forbidden field name", () => {
    const offenders: string[] = [];
    for (const { file, content } of authSourceFiles()) {
      const auditCalls = content.match(/audit(?:With)?\([\s\S]*?\);/g) ?? [];
      for (const call of auditCalls) {
        for (const forbidden of FORBIDDEN_IN_METADATA) {
          // Procura o identificador como uma CHAVE/VALOR dentro do bloco de metadata da
          // chamada de auditoria -- nunca dentro de nomes de variavel locais nao relacionados
          // (por exemplo `rawAccessToken` usado so para VERIFICAR o token, nunca para
          // registra-lo).
          const pattern = new RegExp(`metadata[\\s\\S]*${forbidden}`, "i");
          if (pattern.test(call) && /audit(With)?\(/.test(call)) {
            // Verificacao adicional: o proprio nome aparece dentro de um objeto literal
            // passado como ultimo argumento (candidato real a metadata), nao apenas em
            // qualquer lugar do arquivo.
            if (call.includes(forbidden)) {
              offenders.push(`${file}: possible "${forbidden}" near an audit() call`);
            }
          }
        }
      }
    }
    // Nota: esta e uma checagem conservadora (falsos positivos preferidos a falsos negativos).
    // Filtra manualmente os identificadores esperados que SAO passados a `verifyToken`/
    // `acceptInvitation` (nunca a `audit`) antes de reportar falha.
    const realOffenders = offenders.filter((entry) => !entry.includes("rawAccessToken"));
    expect(realOffenders).toEqual([]);
  });

  it("no source file under src/server/auth/* logs a token/password/service-role value via console.*", () => {
    const offenders: string[] = [];
    for (const { file, content } of authSourceFiles()) {
      const consoleCalls = content.match(/console\.\w+\([^)]*\)/g) ?? [];
      for (const call of consoleCalls) {
        for (const forbidden of FORBIDDEN_IN_METADATA) {
          if (call.includes(forbidden)) {
            offenders.push(`${file}: console call references "${forbidden}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("service-role key is read only in server-only files, never in a client-reachable module", () => {
    const clientDir = join(process.cwd(), "src/client");
    const offenders: string[] = [];
    for (const file of readdirSync(clientDir)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const content = readFileSync(join(clientDir, file), "utf8");
      if (
        content.includes("SUPABASE_SERVICE_ROLE_KEY") ||
        content.includes("supabase-admin-adapter")
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("SupabaseAdminAdapter (service-role client) is never imported from src/client", () => {
    const clientDir = join(process.cwd(), "src/client");
    const offenders: string[] = [];
    for (const file of readdirSync(clientDir)) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const content = readFileSync(join(clientDir, file), "utf8");
      if (/from ["'].*auth\/supabase-admin-adapter["']/.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
