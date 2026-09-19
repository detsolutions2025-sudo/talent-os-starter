// @vitest-environment node
// esbuild.build() quebra sob jsdom (o polyfill de TextEncoder do jsdom nao produz um
// Uint8Array real, e esbuild valida esse invariante no boot) -- mesmo padrao ja usado por
// tests/phase29/auth-identity-resolution-postgres.test.ts para jose/Web Crypto.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Wave de Hospedagem (ADR-0028) -- REVISAO DESTRUTIVA (primeiro deploy real quebrou aqui).
//
// `tests/ci/vercel-entrypoint.test.ts` prova o CONTRATO de `src/server/vercel-entry.ts`
// importando a fonte TypeScript diretamente -- mas Vitest (como `tsx`) resolve imports
// relativos sem extensao via bundler (esbuild), exatamente como o processo tradicional
// (`npm run dev:api`). Isso escondeu, por completo, uma classe de bug que so aparece sob o
// loader ESM NATIVO do Node: a Vercel executa a Serverless Function como Node ESM puro
// (`"type": "module"` no package.json raiz) e esse loader EXIGE extensao explicita em todo
// import relativo -- ausente em `src/server/**` inteiro. O primeiro deploy real falhou com
// `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/server/bootstrap'` em TODA
// invocacao, inclusive `/api/health` (rota estatica, sem nenhuma configuracao).
//
// Este teste reproduz a causa raiz de verdade: builda o mesmo bundle que `npm run build:api`
// gera (`esbuild`, mesmas flags), e roda o resultado num processo `node` limpo -- nunca `tsx`,
// nunca o transform do Vitest -- provando que o artefato publicado de fato roda sob o loader
// ESM nativo antes de qualquer deploy real acontecer de novo.
describe("bundle publicado da Serverless Function (api/index.js gerado por npm run build:api)", () => {
  let tempDir: string;
  let bundlePath: string;

  beforeAll(async () => {
    // Dentro de `api/` (gitignored inteiro, ver .gitignore) em vez de `os.tmpdir()`: a
    // resolucao de pacotes externos do Node (`express`, `pg`, ...) sobe o diretorio a partir do
    // arquivo ate achar `node_modules` -- fora da arvore do projeto, esses pacotes nunca
    // seriam encontrados, o que seria um falso-negativo deste teste, nunca um problema do
    // bundle publicado de verdade (que a Vercel sempre coloca junto do node_modules real).
    mkdirSync(join(process.cwd(), "api"), { recursive: true });
    tempDir = mkdtempSync(join(process.cwd(), "api", ".bundle-test-"));
    bundlePath = join(tempDir, "index.mjs");

    // Mesmas flags do script "build:api" em package.json -- qualquer divergencia entre os dois
    // tornaria este teste um falso-positivo.
    await esbuild.build({
      entryPoints: [join(process.cwd(), "src/server/vercel-entry.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      packages: "external",
      outfile: bundlePath
    });
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("roda sob o loader ESM nativo do Node (nunca ERR_MODULE_NOT_FOUND), e /api/health responde 200", async () => {
    const probePath = join(tempDir, "probe.mjs");
    // `import` exige um especificador relativo ou uma URL `file://` -- um caminho absoluto do
    // Windows (`C:\...`) literal quebra o resolvedor ESM nativo do Node.
    const bundleUrl = pathToFileURL(bundlePath).href;
    writeFileSync(
      probePath,
      `
        import handler from ${JSON.stringify(bundleUrl)};
        import http from "node:http";
        const server = http.createServer((req, res) => handler(req, res));
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        const response = await fetch(\`http://127.0.0.1:\${port}/api/health\`);
        const body = await response.json();
        process.stdout.write(JSON.stringify({ status: response.status, body }));
        server.close();
      `
    );

    const result = await runNode(probePath);

    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.status).toBe(200);
    expect(parsed.body).toMatchObject({ status: "ok", service: "talent-os" });
  }, 30_000);
});

function runNode(
  scriptPath: string
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        SUPABASE_DATABASE_URL: "postgresql://user:pass@localhost:5432/postgres",
        APP_ENV: "test"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}
