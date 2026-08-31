// Fase 30 (ADR-0027; SPEC-029 v1.0). CA-010/RN-008/RN-009: prova, via spawn do entrypoint REAL
// (`src/server/index.ts`) -- nunca `createServer()` direto, que e como o harness de testes sobe
// a aplicacao (RN-009 exclui explicitamente o harness deste mecanismo) --, que configuracao
// invalida em producao/staging impede o processo real de alcancar `app.listen()`. Como
// `assertProductionConfig` roda antes da criacao do pool do Postgres (index.ts), o processo morre
// sem nunca precisar de um banco real, e sem nunca fazer bind de porta -- zero flakiness de porta
// fixa, zero dependencia externa.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../..");
const tsxCli = require.resolve("tsx/cli");
const entrypoint = path.join(repoRoot, "src/server/index.ts");

const REQUIRED_VARS = [
  "SUPABASE_DATABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_ANON_KEY"
] as const;

type SpawnResult = { exitCode: number | null; stdout: string; stderr: string };

const spawnedChildren = new Set<ReturnType<typeof spawn>>();

// Herda o ambiente real do processo de teste (garante que node/tsx resolvem normalmente em
// qualquer plataforma), mas sempre remove as quatro variaveis obrigatorias primeiro -- nenhum
// valor real de `.env` local (se algum dia exportado como variavel de shell, nao apenas em
// arquivo `.env`, que index.ts nao carrega) pode vazar para o processo filho sem passar
// explicitamente por `overrides`.
function buildEnv(
  overrides: Partial<Record<(typeof REQUIRED_VARS)[number] | "APP_ENV", string | undefined>>
): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of REQUIRED_VARS) {
    delete env[name];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env as NodeJS.ProcessEnv;
}

function runEntrypoint(
  overrides: Partial<Record<(typeof REQUIRED_VARS)[number] | "APP_ENV", string | undefined>>,
  // O primeiro spawn de `tsx/cli.mjs` do processo de teste paga um custo de cold-start (esbuild
  // WASM, resolucao de source maps) sensivelmente maior que spawns subsequentes -- observado
  // localmente em Windows: ~20s+ no primeiro spawn vs. ~3s nos seguintes. O timeout aqui e
  // generoso o suficiente para absorver esse cold-start sem depender de porta fixa ou de banco
  // real (o processo morre antes de qualquer I/O de rede).
  timeoutMs = 45_000
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, entrypoint], {
      cwd: repoRoot,
      env: buildEnv(overrides),
      stdio: ["ignore", "pipe", "pipe"]
    });
    spawnedChildren.add(child);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      spawnedChildren.delete(child);
      reject(
        new Error(
          `Entrypoint did not exit within ${timeoutMs}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`
        )
      );
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      spawnedChildren.delete(child);
      reject(error);
    });

    child.on("exit", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      spawnedChildren.delete(child);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

// Cleanup obrigatorio: nunca deixar um processo filho orfao vivo mesmo se um teste falhar/der
// timeout antes do `exit`.
afterEach(() => {
  for (const child of spawnedChildren) {
    child.kill();
  }
  spawnedChildren.clear();
});

describe("bootstrap smoke - entrypoint real (src/server/index.ts)", () => {
  it("APP_ENV=production sem nenhuma variavel obrigatoria: sai com codigo != 0, nunca alcanca app.listen()", async () => {
    const result = await runEntrypoint({ APP_ENV: "production" });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Missing required configuration for APP_ENV=production");
    for (const name of REQUIRED_VARS) {
      expect(result.stderr).toContain(name);
    }
    expect(result.stdout).not.toContain("Talent OS API listening");
    expect(result.stderr).not.toContain("Talent OS API listening");
  }, 50_000);

  it("APP_ENV=production faltando so SUPABASE_DATABASE_URL: sai com codigo != 0, nomeia so essa variavel", async () => {
    const result = await runEntrypoint({
      APP_ENV: "production",
      VITE_SUPABASE_URL: "https://canary-project-9f3a.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "canary-role-key-9f3a",
      VITE_SUPABASE_ANON_KEY: "canary-anon-key-9f3a"
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(
      "Missing required configuration for APP_ENV=production: SUPABASE_DATABASE_URL"
    );
    expect(result.stderr).not.toContain("VITE_SUPABASE_URL,");
    expect(result.stdout).not.toContain("Talent OS API listening");
  }, 50_000);

  it("APP_ENV=staging sem nenhuma variavel obrigatoria: sai com codigo != 0, nunca alcanca app.listen()", async () => {
    const result = await runEntrypoint({ APP_ENV: "staging" });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Missing required configuration for APP_ENV=staging");
    expect(result.stdout).not.toContain("Talent OS API listening");
  }, 50_000);
});
