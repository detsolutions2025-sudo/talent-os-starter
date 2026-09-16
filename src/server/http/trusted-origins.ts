// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 11). Fonte unica de origens de frontend confiaveis,
// compartilhada pelo middleware de CORS (`cors.ts`) e pelo middleware de CSRF (`csrf.ts`): a
// SPEC define a validacao de Origin/Referer de CSRF (RN-016) como "contra a origem configurada
// (secao 11)" -- a mesma lista de origens permitidas de CORS (secao 11, item 1). Unificar em uma
// unica lista/variavel evita duas fontes de verdade divergentes para "quem e o frontend legitimo
// desta API" e garante, por construcao (nunca por disciplina de deploy), o sequenciamento exigido
// por INV-03/RN-022: CSRF fica ativo exatamente quando e com a mesma configuracao que CORS
// credenciado, nunca depois.
//
// IMPORTANTE (correcao pre-commit, gate 5): "origem confiavel do frontend" (para CSRF) e "CORS
// esta habilitado" sao coisas DIFERENTES, mesmo compartilhando esta variavel -- CORS so importa
// quando o navegador faz uma requisicao CROSS-origin (Modo B); a validacao de Origin/Referer de
// CSRF (RN-016 a RN-023) se aplica a TODA mutacao cookie-autenticada, inclusive em Modo A
// (same-origin), porque o navegador envia `Origin` mesmo em requisicoes same-origin. Em
// producao/staging, esta variavel e OBRIGATORIA (fail-fast central, ver `config-validation.ts`
// `assertProductionConfig`/`index.ts`) precisamente por causa do CSRF -- nunca porque "CORS
// precisa estar ligado". Um deploy Modo A legitimo configura aqui a PROPRIA origem publica da
// aplicacao (nunca uma lista vazia): CORS permanece, na pratica, irrelevante nesse modo (nenhuma
// requisicao real e cross-origin), mas CSRF continua validando normalmente.
//
// Lista vazia = middleware de CORS nunca aprova nenhuma origem (RN-033) e o middleware de CSRF
// vira no-op (nunca avalia Origin/Referer). Isto SO pode acontecer em development/test: em
// producao/staging o fail-fast central (`assertProductionConfig` com `additionalRequiredVars`)
// impede o boot antes de qualquer requisicao ser aceita, entao esta lista nunca chega vazia la --
// nao e uma excecao de runtime, e uma garantia estrutural de boot. Em development/test, o
// no-op preserva, sem nenhuma mudanca de comportamento, todo ponto de chamada existente de
// `createServer()` que nao conhece este parametro (os ~30 arquivos de teste de fases anteriores a
// esta), exatamente como o default `DevActorProvider` ja faz para `actorProvider` (app.ts).
export const TRUSTED_FRONTEND_ORIGINS_ENV_VAR = "TRUSTED_FRONTEND_ORIGINS";

export function parseTrustedOrigins(rawValue: string | undefined): ReadonlySet<string> {
  if (!rawValue) return new Set();
  const origins = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return new Set(origins);
}
