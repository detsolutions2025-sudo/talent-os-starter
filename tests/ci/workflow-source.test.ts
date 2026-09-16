// FAST TRACK CI/CD + Observabilidade (ADR-0027 secao 3/21). Prova de codigo-fonte do workflow --
// nunca um parser YAML completo (evita nova dependencia so para este teste): checagens
// estruturais/regex suficientes para os tres objetivos pedidos: (1) coerencia sintatica minima,
// (2) nenhum secret hardcoded, (3) todo script `npm run X` referenciado existe em package.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW_PATH = join(process.cwd(), ".github/workflows/ci.yml");
const DEPENDABOT_PATH = join(process.cwd(), ".github/dependabot.yml");
const PACKAGE_JSON_PATH = join(process.cwd(), "package.json");

function readWorkflow() {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

describe("CI - workflow do GitHub Actions (ADR-0027 s3/s21, source-code proof)", () => {
  it("o arquivo de workflow existe e define os gatilhos/concurrency esperados", () => {
    const content = readWorkflow();
    expect(content).toMatch(/^on:/m);
    expect(content).toMatch(/pull_request:/);
    expect(content).toMatch(/push:/);
    expect(content).toMatch(/branches:\s*\[main\]/);
    expect(content).toMatch(/^concurrency:/m);
    expect(content).toMatch(/cancel-in-progress:\s*true/);
  });

  it("todo `uses:` de Action de terceiros e pinado por hash de commit (40 chars hex), nunca por tag mutavel", () => {
    const content = readWorkflow();
    const usesLines = content.match(/uses:\s*\S+@\S+/g) ?? [];
    expect(usesLines.length).toBeGreaterThan(0);
    for (const line of usesLines) {
      const ref = line.split("@")[1]?.split(/\s/)[0];
      expect(ref, `${line} deve ser pinado por commit hash, nao por tag`).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("todo `npm run <script>` referenciado no workflow existe em package.json", () => {
    const content = readWorkflow();
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts: Record<string, string>;
    };
    const referenced = [...content.matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const scriptName of referenced) {
      expect(
        packageJson.scripts[scriptName],
        `script "${scriptName}" nao existe em package.json`
      ).toBeDefined();
    }
  });

  it("nenhum secret real hardcoded -- apenas o placeholder do container Postgres efemero do proprio job", () => {
    const content = readWorkflow();
    // O unico "segredo" aceitavel no arquivo e a credencial local do container efemero
    // (existe e morre dentro do job, nunca corresponde a nenhum ambiente real).
    expect(content).toMatch(/POSTGRES_PASSWORD:\s*postgres\b/);
    // Nenhuma referencia ao project ref real, hostname real do Supabase DEV, ou a
    // `secrets\.` do GitHub sendo usada para popular a connection string do Postgres efemero
    // (que deve continuar sendo a credencial local do container, nunca um GitHub Actions Secret
    // real neste arquivo).
    expect(content).not.toMatch(/hxsybwibajgmberzwwyv/);
    expect(content).not.toMatch(/\$\{\{\s*secrets\./);
  });

  it("a estrategia de banco em CI nunca aponta para o Supabase DEV compartilhado (ADR-0027 s22)", () => {
    const content = readWorkflow();
    expect(content).toMatch(/postgresql:\/\/postgres:postgres@localhost:5432\/postgres/);
    expect(content).not.toMatch(/supabase\.co/);
  });

  it("dependabot.yml existe e cobre npm e github-actions (ADR-0027 s21)", () => {
    const content = readFileSync(DEPENDABOT_PATH, "utf8");
    expect(content).toMatch(/package-ecosystem:\s*npm/);
    expect(content).toMatch(/package-ecosystem:\s*github-actions/);
    expect(content).toMatch(/semver-major/);
  });
});
