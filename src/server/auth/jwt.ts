// Fase 29 (SPEC-028 s11/s12). Verificacao LOCAL de assinatura via JWKS, nunca decode sem
// verificacao. `jose` resolve nativamente cache com TTL e revalidacao por `kid` desconhecido
// (createRemoteJWKSet) -- Constituicao "Codigo" probe reinventar crypto/JWT manual quando uma
// biblioteca madura resolve.
//
// Este modulo NUNCA consulta `auth_identities`/`users` -- produz apenas as claims verificadas
// do token (`VerifiedProviderClaims`). A resolucao de `Actor` (lookup de AuthIdentity/User) e
// responsabilidade de `http/actor-provider.ts`, deliberadamente separada: o endpoint de aceite
// de convite (SPEC-028 s10, "estado transitorio aceitavel") precisa da MESMA verificacao de
// assinatura sem exigir que a AuthIdentity ja exista -- reaproveita `verifyProviderToken`
// diretamente, nunca duplica a logica de assinatura.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { forbidden } from "../core/errors";
import type { VerifiedProviderClaims } from "./types";

export type ProviderJwtVerifierOptions = {
  issuer: string;
  audience: string;
};

// Chamado UMA VEZ no boot do processo (index.ts) -- o `GetKeyFunction` retornado carrega estado
// de cache interno (chaves + TTL); criar um novo a cada requisicao descartaria o cache e voltaria
// a bater na rede do provider por request, exatamente o que SPEC-028 s11 probe.
export function createRemoteProviderJwks(jwksUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: 10 * 60 * 1000, // TTL do cache -- SPEC-028 s11 "key rotation"
    cooldownDuration: 30 * 1000 // evita martelar o endpoint em `kid` desconhecido repetido
  });
}

// `getKey` e injetavel deliberadamente: producao passa `createRemoteProviderJwks(...)` (rede,
// cacheada); testes passam `createLocalJWKSet(...)` (jose) sobre um par de chaves gerado em
// memoria, nunca dependente de internet publica.
export async function verifyProviderToken(
  token: string,
  getKey: JWTVerifyGetKey,
  options: ProviderJwtVerifierOptions
): Promise<VerifiedProviderClaims> {
  let payload;

  try {
    const result = await jwtVerify(token, getKey, {
      issuer: options.issuer,
      audience: options.audience
    });
    payload = result.payload;
  } catch {
    // INV-09 (SPEC-028 s5): assinatura invalida, expirado, issuer/audience incorretos, `kid`
    // desconhecido mesmo apos revalidacao -- todos tratados identicamente, fail-closed, erro
    // generico (nunca detalha qual causa, evita ajudar enumeracao/probing -- mesmo principio de
    // RN-009/SPEC-002).
    throw forbidden("invalid_session", "Session is invalid or expired.");
  }

  const externalId = payload.sub;
  if (!externalId || typeof externalId !== "string") {
    throw forbidden("invalid_session", "Session is invalid or expired.");
  }

  const email = typeof payload.email === "string" ? payload.email : null;
  // Nota de integracao: a forma exata da claim de verificacao de e-mail varia por versao do
  // GoTrue (`email_verified` top-level em alguns projetos, aninhada em `user_metadata` em
  // outros). Defensivo: aceita qualquer uma, nunca assume verificado por ausencia da claim --
  // a ser confirmado contra um projeto Supabase real na primeira integracao ao vivo (nao
  // exercitada nesta tarefa, sem credenciais de projeto configuradas).
  const userMetadata =
    typeof payload.user_metadata === "object" && payload.user_metadata !== null
      ? (payload.user_metadata as Record<string, unknown>)
      : {};
  const emailVerified = payload.email_verified === true || userMetadata.email_verified === true;

  const expiresAt = typeof payload.exp === "number" ? payload.exp : 0;

  return { externalId, email, emailVerified, expiresAt };
}
