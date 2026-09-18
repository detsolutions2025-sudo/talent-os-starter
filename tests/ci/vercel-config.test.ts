import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Wave de Hospedagem (ADR-0028). Prova estrutural de `vercel.json` -- nunca um parser completo
// do motor de rotas da Vercel (que compila `source` via `path-to-regexp`, com semantica de
// ancoragem propria; reimplementar isso aqui daria falsa confianca), apenas as invariantes de
// TEXTO que este projeto realmente depende: ordem dos rewrites (a API precisa ser resolvida
// ANTES do fallback de SPA, senao `/api/*` cairia em `index.html`), e que os `source` de
// fallback/headers excluam explicitamente o prefixo `api/` (nunca um catch-all cego que os
// engoliria) -- headers estaticos duplicando os que `createSecurityHeadersMiddleware` ja gera
// dinamicamente para `/api` (ver src/server/http/security-headers.ts) seria um bug.
const VERCEL_CONFIG_PATH = join(process.cwd(), "vercel.json");
const PACKAGE_JSON_PATH = join(process.cwd(), "package.json");

function readVercelConfig(): {
  buildCommand: string;
  outputDirectory: string;
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
} {
  return JSON.parse(readFileSync(VERCEL_CONFIG_PATH, "utf8"));
}

describe("vercel.json", () => {
  it("aponta para um buildCommand real de package.json e para a pasta de saida do Vite", () => {
    const config = readVercelConfig();
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts: Record<string, string>;
    };

    const [, scriptName] = config.buildCommand.match(/^npm run ([\w:-]+)$/) ?? [];
    expect(
      scriptName,
      `buildCommand "${config.buildCommand}" nao referencia um script real`
    ).toBeDefined();
    expect(packageJson.scripts[scriptName!]).toBeDefined();
    expect(config.outputDirectory).toBe("dist");
  });

  it("o rewrite de /api/* vem antes do fallback de SPA (ordem importa: primeiro match vence)", () => {
    const config = readVercelConfig();
    const apiIndex = config.rewrites.findIndex((rule) => rule.source.startsWith("/api/"));
    const fallbackIndex = config.rewrites.findIndex((rule) => rule.destination === "/index.html");

    expect(apiIndex).toBeGreaterThanOrEqual(0);
    expect(fallbackIndex).toBeGreaterThanOrEqual(0);
    expect(apiIndex).toBeLessThan(fallbackIndex);
  });

  it("o fallback de SPA exclui explicitamente o prefixo api/ (nunca um catch-all cego)", () => {
    const config = readVercelConfig();
    const fallback = config.rewrites.find((rule) => rule.destination === "/index.html");

    expect(fallback?.source).toContain("?!api/");
  });

  it("os headers estaticos excluem explicitamente o prefixo api/ (nunca duplicam os de /api)", () => {
    const config = readVercelConfig();
    expect(config.headers.length).toBeGreaterThan(0);
    for (const rule of config.headers) {
      expect(rule.source).toContain("?!api/");
    }
  });

  it("nenhum header estatico declarado repete um nome que /api ja emite dinamicamente sem revisao explicita", () => {
    const config = readVercelConfig();
    const declaredKeys = config.headers.flatMap((rule) => rule.headers.map((h) => h.key));
    // Content-Security-Policy depende da origem real do Supabase (so conhecida em runtime) --
    // ver docs/operacao/deploy-vercel.md secao 6. Nunca declarado aqui sem essa variavel.
    expect(declaredKeys).not.toContain("Content-Security-Policy");
  });
});
