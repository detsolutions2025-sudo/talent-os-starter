// Fase 29. Par de chaves gerado em memoria (ECDSA P-256, o mesmo algoritmo usado pelo Supabase
// Auth para JWT Signing Keys assimetricas) -- nunca dependente de rede publica ou de um projeto
// Supabase real, satisfazendo a exigencia de testes obrigatorios futuros (SPEC-028 s39, item 28:
// "teste de adapter... quando o plano tecnico decidir a ferramenta" -- decidido aqui: JWKS local
// via `jose.createLocalJWKSet`).
import { exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { createLocalJWKSet } from "jose";

export const TEST_ISSUER = "https://test-project.supabase.co/auth/v1";
export const TEST_AUDIENCE = "authenticated";
const KID = "test-key-1";

export async function createTestJwks() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const publicJwk = await exportJWK(publicKey);
  const jwks = { keys: [{ ...publicJwk, kid: KID, alg: "ES256", use: "sig" }] };
  const getKey: JWTVerifyGetKey = createLocalJWKSet(jwks);

  // Segundo par de chaves, nunca publicado no JWKS acima -- usado para simular assinatura
  // forjada/adulterada (P-03 style: token com assinatura invalida deve ser rejeitado mesmo com
  // `sub`/`iss`/`aud`/`exp` corretos).
  const forged = await generateKeyPair("ES256");

  return {
    getKey,
    privateKey,
    forgedPrivateKey: forged.privateKey,
    async signToken(claims: {
      sub: string;
      email?: string;
      emailVerified?: boolean;
      issuer?: string;
      audience?: string;
      expiresInSeconds?: number;
      signWithForgedKey?: boolean;
    }) {
      const now = Math.floor(Date.now() / 1000);
      const jwt = new SignJWT({
        email: claims.email,
        email_verified: claims.emailVerified ?? true
      })
        .setProtectedHeader({ alg: "ES256", kid: KID })
        .setSubject(claims.sub)
        .setIssuer(claims.issuer ?? TEST_ISSUER)
        .setAudience(claims.audience ?? TEST_AUDIENCE)
        .setIssuedAt(now)
        .setExpirationTime(now + (claims.expiresInSeconds ?? 3600));
      return jwt.sign(claims.signWithForgedKey ? forged.privateKey : privateKey);
    }
  };
}

export type TestJwks = Awaited<ReturnType<typeof createTestJwks>>;
