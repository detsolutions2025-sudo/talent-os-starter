// Fase 30 (ADR-0027 "Production Hardening"; SPEC-029 v1.0 "Configuracao e Segredos: Fail-Fast
// de Producao Generalizado"). Ponto unico de validacao de PRESENCA de configuracao obrigatoria
// em producao/staging, chamado no boot (index.ts) antes de qualquer outra inicializacao
// significativa (pool do Postgres, authService, actorProvider, app.listen()).
//
// Este modulo e infraestrutura generica de configuracao: nao importa nada de `./auth/config` nem
// de `./postgres`, e nunca deve passar a importar. `auth/config.ts` e livre para reutilizar a
// primitiva generica de presenca exportada aqui (`requireConfigValue`) -- a dependencia so pode
// existir nesse sentido (Auth -> config-validation), nunca o inverso.
//
// O que este modulo NAO faz (SPEC-029 secao 2 "Fora do Escopo"): validacao de formato/semantica
// de nenhuma variavel (URL bem formada, JWT bem formado, conectividade). Isso continua sendo
// responsabilidade exclusiva dos validators especializados ja existentes e preservados sem
// nenhuma mudanca de comportamento: `requirePostgresDatabaseUrl` (`./postgres`, valida formato de
// `SUPABASE_DATABASE_URL`) e `assertSupabaseAuthConfiguredForProduction` (`./auth/config`, valida
// `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` apenas quando `APP_ENV === "production"`).
// `assertProductionConfig` roda ANTES desses dois na sequencia de boot (index.ts) como o gate de
// presenca consolidado (RN-002/CA-007: nomeia TODAS as ausentes de uma vez, nunca so a primeira);
// os validators especializados continuam rodando depois, na mesma posicao de sempre, como defesa
// em profundidade (SPEC-029 secao 8) -- nenhuma logica de formato/derivacao e duplicada aqui.

// Lista fechada de variaveis obrigatorias em `APP_ENV=production` e `APP_ENV=staging` (SPEC-029
// secao 6). Codigo versionado, nunca configuravel por variavel de ambiente -- nao existe (nem
// pode existir) um jeito de desabilitar esta lista via env (INV-04/RN-006).
const REQUIRED_PRODUCTION_VARS = [
  "SUPABASE_DATABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_ANON_KEY"
] as const;

// Primitiva generica de presenca: string ausente (`undefined`), vazia (`""`) ou composta so de
// espacos em branco conta como ausente (RN-003) -- mesma regra que `auth/config.ts` ja usava
// isoladamente antes desta fase. Nao valida formato/semantica de nada, apenas presenca. E uma
// primitiva de configuracao generica, nao uma regra de negocio de nenhum modulo especifico --
// qualquer modulo pode reutiliza-la sem que este arquivo dependa dele de volta.
export function requireConfigValue(
  env: NodeJS.ProcessEnv,
  name: string,
  message = `${name} is required.`
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(message);
  }
  return value;
}

// Ponto unico de validacao de configuracao de producao/staging (SPEC-029 RN-001 a RN-010).
//
// - development/test (ou qualquer valor nao reconhecido de APP_ENV): no-op -- preserva o
//   comportamento de boot exatamente como hoje (INV-02/RN-004), `dev-auth.ts` continua
//   funcionando sem nenhuma destas variaveis. Ausencia de APP_ENV tambem cai aqui, pois o mesmo
//   default `?? "development"` ja usado pelo resto do boot (index.ts) se aplica.
// - staging: exige exatamente as mesmas quatro variaveis que producao (SPEC-029 secao 8 --
//   "staging deve espelhar producao o maximo possivel"), somente para este gate.
// - production: fail-fast completo (RN-001).
//
// Quando ha uma ou mais ausencias, todas sao coletadas antes de lancar um unico Error (RN-002/
// CA-007), em ordem deterministica (a ordem de `REQUIRED_PRODUCTION_VARS`). A mensagem nomeia
// apenas os NOMES das variaveis ausentes -- nunca um valor, nunca `process.env` serializado
// (RN-005/INV-03/CA-008).
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  const appEnv = env.APP_ENV ?? "development";
  if (appEnv !== "production" && appEnv !== "staging") return;

  const missing = REQUIRED_PRODUCTION_VARS.filter((name) => !env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required configuration for APP_ENV=${appEnv}: ${missing.join(", ")}`);
  }
}
