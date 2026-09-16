// Fase 31 (ADR-0027; SPEC-030 v1.0, secao 7.4). Segunda camada de defesa contra CSRF, alem de
// `SameSite=Lax` (ja existente, Fase 29) -- validacao de `Origin` (ou `Referer` como fallback)
// para toda mutacao cookie-autenticada (classes E/F/G da matriz, SPEC-030 secao 6). Nenhuma
// biblioteca dedicada de CSRF/double-submit-token (ADR-0027 secao 8 ja avaliou como
// desnecessario) -- apenas comparacao de string contra a mesma lista de origens confiaveis usada
// por CORS (`trusted-origins.ts`).
//
// RN-017: rotas publicas (classes B/C/D, todas sob o prefixo `/public/` por convencao ja
// existente no roteador) nunca exigem Origin/Referer, pois nao ha cookie de sessao a proteger.
// Nenhuma excecao adicional e criada para a classe G (RN-023): `/auth/session`, `/auth/refresh`,
// `/auth/logout`, `/auth/invitations/:id/accept` e `/platform/organizations/bootstrap` nao
// comecam com `/public/`, entao caem na validacao normal. Correcao pre-commit (gate 7):
// reverificado por varredura EXAUSTIVA de `routes.ts` (todas as ~280 rotas registradas, nao
// apenas uma amostra) -- nenhuma rota token-based (Authorization: PreInterview/
// BehavioralAssessment/Proposal <token>) existe fora de `/public/`, e nenhuma rota sob
// `/public/` le cookie de sessao. A fronteira `/public/` e uma convencao estrutural unica e
// consistente do roteador (nao uma lista de URLs mantida a parte), entao corresponde
// exatamente a linha classes B/C/D vs. E/F/G da matriz da SPEC (secao 6).
//
// Guarda de ativacao: quando `trustedOrigins` esta vazio, este middleware e um no-op completo --
// nunca avalia Origin/Referer, nunca rejeita nada. Correcao pre-commit (gates 3/4/5): esta lista
// SO pode chegar vazia em development/test -- em producao/staging o fail-fast central
// (`assertProductionConfig` com `TRUSTED_FRONTEND_ORIGINS` em `additionalRequiredVars`, ver
// `index.ts`/`config-validation.ts`) impede o boot antes de qualquer requisicao ser aceita, entao
// esta funcao NUNCA e construida com um `trustedOrigins` vazio num processo de producao/staging
// real -- e uma garantia estrutural do boot, nunca um bypass condicional de runtime. O no-op
// existe exclusivamente como acomodacao de development/test (preserva, sem nenhuma alteracao, os
// ~30 arquivos de teste de fases anteriores a esta que nunca enviam `Origin`/`Referer` em suas
// requisicoes de mutacao), nunca como uma leitura valida de "ausencia de configuracao = toda
// origem e confiavel" em producao.
import type { NextFunction, Request, RequestHandler, Response } from "express";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originFromReferer(referer: string): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function createCsrfMiddleware(trustedOrigins: ReadonlySet<string>): RequestHandler {
  if (trustedOrigins.size === 0) {
    return (_request: Request, _response: Response, next: NextFunction) => next();
  }

  return (request: Request, response: Response, next: NextFunction) => {
    if (!MUTATING_METHODS.has(request.method)) {
      next();
      return;
    }

    // RN-017: caminho relativo ao ponto de montagem (`app.use("/api", ...)`, ver app.ts) -- o
    // mesmo prefixo `/public/` ja usado por toda rota das classes B/C/D em `routes.ts`.
    if (request.path.startsWith("/public/")) {
      next();
      return;
    }

    // RN-018/RN-019: `Origin` presente (incluindo o literal `"null"`) precisa casar exatamente
    // com a lista configurada -- nunca tratado como fallback para Referer quando presente, ainda
    // que hostil.
    const origin = request.header("Origin");
    if (origin !== undefined) {
      if (trustedOrigins.has(origin)) {
        next();
        return;
      }
      rejectOrigin(response);
      return;
    }

    // RN-020: na ausencia de Origin, extrai apenas o componente de origem do Referer e aplica a
    // mesma regra de igualdade exata.
    const referer = request.header("Referer");
    if (referer) {
      const refererOrigin = originFromReferer(referer);
      if (refererOrigin && trustedOrigins.has(refererOrigin)) {
        next();
        return;
      }
    }

    // RN-021: ausencia simultanea de Origin e Referer (ou Referer invalido/hostil) = fail-closed.
    rejectOrigin(response);
  };
}

function rejectOrigin(response: Response) {
  response.status(403).json({
    error: {
      code: "origin_rejected",
      message: "Request origin is not allowed."
    }
  });
}
