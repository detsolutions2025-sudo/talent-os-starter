// Fase 29 (ADR-0026 s"Configuracao e Segredos"; SPEC-028 s37). Mesmo padrao de fail-fast ja
// usado por `requirePostgresDatabaseUrl` (postgres.ts) -- nunca um default silencioso em
// producao. `VITE_`-prefixadas sao frontend-safe (Vite so expoe ao bundle o que comeca com esse
// prefixo -- mecanismo do proprio bundler, nao apenas disciplina); as demais sao server-only.

export type SupabaseAuthConfig = {
  url: string;
  serviceRoleKey: string;
  jwksUrl: string;
  issuer: string;
  audience: string;
};

export function requireSupabaseAuthConfig(env = process.env): SupabaseAuthConfig {
  // `VITE_SUPABASE_URL`: mesma variavel lida pelo frontend (Vite so expoe ao bundle o que
  // comeca com esse prefixo) e pelo servidor (dotenv carrega toda `.env` em `process.env`,
  // independente de prefixo) -- uma unica fonte, nunca duplicada.
  const url = requireVar(env, "VITE_SUPABASE_URL");
  const serviceRoleKey = requireVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const jwksUrl =
    env.SUPABASE_JWKS_URL?.trim() || `${trimTrailingSlash(url)}/auth/v1/.well-known/jwks.json`;
  const issuer = env.SUPABASE_JWT_ISSUER?.trim() || `${trimTrailingSlash(url)}/auth/v1`;
  const audience = env.SUPABASE_JWT_AUDIENCE?.trim() || "authenticated";

  return { url, serviceRoleKey, jwksUrl, issuer, audience };
}

// Chamado no boot (index.ts) somente quando APP_ENV=production -- falha alto e cedo, nunca um
// fallback silencioso para dev-auth (SPEC-028 s22/CA-030). Fora de producao, a configuracao e
// opcional: dev/test usam dev-auth.ts e nunca instanciam SupabaseActorProvider.
export function assertSupabaseAuthConfiguredForProduction(env = process.env) {
  const appEnv = env.APP_ENV ?? "development";
  if (appEnv !== "production") return;
  requireSupabaseAuthConfig(env);
}

function requireVar(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Supabase Auth.`);
  }
  return value;
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
