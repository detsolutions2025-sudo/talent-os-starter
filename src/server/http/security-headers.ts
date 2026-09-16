// Fase 31 (ADR-0027 secao 6; SPEC-030 v1.0, secao 7.1 a 7.3). Baseline de security headers,
// CSP e HSTS, montada com `helmet` (biblioteca ja escolhida pelo ADR-0027) -- mas nunca com seus
// defaults aceitos as cegas (INV-04): toda opcao abaixo e uma escolha consciente, cada uma
// citando o RN que a exige; qualquer sub-modulo do helmet nao mencionado por nenhum RN desta SPEC
// e desligado explicitamente, para que nenhum header nao revisado apareca por engano numa versao
// futura da biblioteca.
import helmet from "helmet";
import type { NextFunction, Request, RequestHandler, Response } from "express";

// RN-008: valor conservador e reversivel (~180 dias), sem `includeSubDomains`/`preload` nesta
// v1 -- ausencia de topologia de subdominios conhecida (SPEC-030 secao 3/6). Ampliar exige
// evidencia fisica futura de topologia que o justifique.
const HSTS_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

// RN-004: nega no minimo camera/microfone/geolocalizacao -- nenhum desses recursos e usado pelo
// produto hoje (confirmado fisicamente, SPEC-030 secao 3). O helmet nao inclui mais um modulo de
// Permissions-Policy (removido da biblioteca por instabilidade do proprio padrao do cabecalho) --
// aplicado manualmente aqui.
const PERMISSIONS_POLICY_VALUE = "camera=(), microphone=(), geolocation=()";

export function createSecurityHeadersMiddleware(options: {
  isProductionEnv: boolean;
  supabaseAuthOrigin?: string;
}): RequestHandler {
  if (!options.isProductionEnv) {
    // RN-005/RN-007/RN-010: nenhum destes headers e enviado fora de producao/staging -- mesmo
    // padrao ja usado pelo cookie `Secure` (`isProductionEnv`, ver `http/cookies.ts`). No-op
    // completo: o `helmet()` interno nem chega a ser montado, entao nenhum default da biblioteca
    // pode escapar por engano (INV-04) e o Vite dev server/HMR nunca e afetado (CA-003).
    return (_request: Request, _response: Response, next: NextFunction) => next();
  }

  // RN-012: `connect-src` inclui `'self'` e a origem real do projeto Supabase configurado --
  // nunca um `project-ref` fixo/ficticio. `supabaseAuthOrigin` e derivado de `VITE_SUPABASE_URL`
  // no boot (`index.ts`), nunca hardcoded aqui.
  const connectSrc = [
    "'self'",
    ...(options.supabaseAuthOrigin ? [options.supabaseAuthOrigin] : [])
  ];

  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // RN-011: sem 'unsafe-inline'/'unsafe-eval'
        styleSrc: ["'self'"], // RN-011
        connectSrc, // RN-012
        frameAncestors: ["'none'"], // RN-013 (RN-002 via CSP)
        objectSrc: ["'none'"], // RN-014
        baseUri: ["'self'"], // RN-014
        formAction: ["'self'"], // RN-014
        imgSrc: ["'self'"], // RN-015
        fontSrc: ["'self'"] // RN-015
      }
    },
    frameguard: { action: "deny" }, // RN-002 (X-Frame-Options: DENY, alem de frame-ancestors)
    noSniff: true, // RN-001
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }, // RN-003
    hsts: {
      // RN-007/RN-009: helmet so roda dentro deste middleware, isto e, somente quando
      // `isProductionEnv` e verdadeiro -- nunca condicionado a `req.secure`.
      maxAge: HSTS_MAX_AGE_SECONDS,
      includeSubDomains: false, // RN-008
      preload: false // RN-008
    },
    hidePoweredBy: true,
    // Nenhum RN desta SPEC exige os modulos abaixo -- desligados explicitamente (INV-04), nunca
    // deixados no default da biblioteca.
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false,
    dnsPrefetchControl: false,
    ieNoOpen: false,
    xssFilter: false,
    permittedCrossDomainPolicies: false
  });

  return (request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Permissions-Policy", PERMISSIONS_POLICY_VALUE); // RN-004
    helmetMiddleware(request, response, next);
  };
}
