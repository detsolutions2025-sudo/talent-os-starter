import { randomUUID } from "node:crypto";
import request from "supertest";
import { createServer } from "../../src/server/app";
import { DevActorProvider, SupabaseActorProvider } from "../../src/server/http/actor-provider";
import { createCoreService } from "../../src/server/core/service";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresAuthService } from "../../src/server/auth/service";
import type { SupabaseAdminPort, SupabaseSession } from "../../src/server/auth/supabase-admin-port";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createUser, userHeaders } from "../phase17/helpers";
import { createTestJwks, TEST_AUDIENCE, TEST_ISSUER, type TestJwks } from "./jwt-fixtures";

export { createUser, userHeaders };
export const platformHeaders = { "x-dev-platform-admin": "true" };

// supertest/superagent expoe `Set-Cookie` como array de strings completas (com atributos) em
// runtime (Node normaliza esse header especifico para array mesmo com um unico valor); a
// tipagem do supertest, porem, declara `headers` genericamente como string -- daí o cast interno
// aqui. O header `Cookie` de requisicao so aceita `nome=valor` separados por `; `, sem atributos.
export function extractCookieHeader(setCookieHeaders: string | string[] | undefined) {
  if (!setCookieHeaders) return "";
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return list.map((entry) => entry.split(";")[0]).join("; ");
}

// SPEC-028 s24/s37: fronteira explicita entre a aplicacao e o provider -- mesmo padrao de
// porta/adapter ja usado por `ai/providers` (`FakeProviderAdapter`-equivalente). Nunca chama
// rede; registra as chamadas recebidas para asserts de comportamento (nunca envia e-mail de
// verdade, nunca depende de internet publica).
export class FakeSupabaseAdminPort implements SupabaseAdminPort {
  readonly invitedEmails: string[] = [];
  readonly refreshCalls: string[] = [];
  readonly revokeRefreshCalls: string[] = [];
  readonly signOutAllCalls: string[] = [];
  failNextInvite = false;
  private readonly emailToExternalId = new Map<string, string>();

  constructor(private readonly jwks: TestJwks) {}

  async inviteUserByEmail(email: string) {
    if (this.failNextInvite) {
      this.failNextInvite = false;
      throw new Error("simulated provider outage");
    }
    this.invitedEmails.push(email);
    const externalId = this.emailToExternalId.get(email) ?? randomUUID();
    this.emailToExternalId.set(email, externalId);
    return { externalId };
  }

  // Helper de teste (nao faz parte da interface `SupabaseAdminPort`): permite ao teste "logar"
  // a pessoa convidada, produzindo um access token verificavel para o mesmo `external_id`
  // gerado por `inviteUserByEmail` -- simula a confirmacao do link de convite pelo provider.
  async issueSessionForEmail(email: string, options: { emailVerified?: boolean } = {}) {
    const externalId = this.emailToExternalId.get(email) ?? randomUUID();
    this.emailToExternalId.set(email, externalId);
    const accessToken = await this.jwks.signToken({
      sub: externalId,
      email,
      emailVerified: options.emailVerified ?? true
    });
    return { accessToken, refreshToken: `fake-refresh-${externalId}`, externalId };
  }

  async refreshSession(refreshToken: string): Promise<SupabaseSession> {
    this.refreshCalls.push(refreshToken);
    const externalId = refreshToken.replace("fake-refresh-", "");
    const accessToken = await this.jwks.signToken({
      sub: externalId,
      email: null as unknown as string
    });
    return { accessToken, refreshToken, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  }

  async revokeRefreshToken(refreshToken: string) {
    this.revokeRefreshCalls.push(refreshToken);
  }

  async signOutAllSessions(externalId: string) {
    this.signOutAllCalls.push(externalId);
  }
}

export async function createAuthTestContext(database: PostgresTestDatabase) {
  const jwks = await createTestJwks();
  const provider = new FakeSupabaseAdminPort(jwks);
  const authService = createPostgresAuthService(database.pool, {
    provider,
    getKey: jwks.getKey,
    jwtOptions: { issuer: TEST_ISSUER, audience: TEST_AUDIENCE }
  });
  return { jwks, provider, authService };
}

// App "de producao simulada": ActorProvider e SupabaseActorProvider de verdade (nunca
// DevActorProvider), mesmo com APP_ENV=test no processo -- necessario porque
// `createPostgresTestDatabase`/`assertSafeMigrationEnvironment` exigem APP_ENV != production
// para a infraestrutura de teste funcionar, mas os gates de seguranca (P-01/P-02 e outros)
// precisam de uma instancia real de `SupabaseActorProvider` para provar isolamento.
export function createAuthApp(
  database: PostgresTestDatabase,
  ctx: Awaited<ReturnType<typeof createAuthTestContext>>,
  options: { isProductionEnv?: boolean } = {}
) {
  const actorProvider = new SupabaseActorProvider(ctx.authService);
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    actorProvider,
    undefined, // dna
    undefined, // organizationalUnits
    undefined, // competencies
    undefined, // jobProfiles
    undefined, // questions
    undefined, // jobOpenings
    undefined, // candidates
    undefined, // candidateApplications
    undefined, // interviews
    undefined, // ai
    undefined, // blueprints
    undefined, // publicApplications
    undefined, // preInterviews
    undefined, // behavioralAssessments
    undefined, // preAnalyses
    undefined, // candidateDossiers
    undefined, // proposals
    undefined, // onboardings
    undefined, // employments
    undefined, // developmentRetention
    undefined, // offboardings
    undefined, // accessGrants
    ctx.authService,
    options.isProductionEnv ?? false
  );
}

// App com DevActorProvider (comportamento identico a todas as outras suites de teste) MAS com
// `auth` (AuthService) tambem ligado -- usado por testes que precisam criar Organizations/Users
// de teste via dev headers e, na MESMA app, exercitar convite/aceite/bootstrap.
export function createDevAuthApp(
  database: PostgresTestDatabase,
  ctx: Awaited<ReturnType<typeof createAuthTestContext>>
) {
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    new DevActorProvider(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    ctx.authService,
    false
  );
}

// Fixture completa: Organization + owner real (via dev headers) numa app com `auth` ligado.
export async function createOrganizationFixture(
  database: PostgresTestDatabase,
  ctx: Awaited<ReturnType<typeof createAuthTestContext>>,
  suffix: string
) {
  const app = createDevAuthApp(database, ctx);
  const owner = await createUser(app, `owner-${suffix}`);
  const organization = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({
      name: `Org ${suffix}`,
      slug: `org-${suffix}-${randomUUID().slice(0, 8)}`,
      initialOwnerUserId: owner.id
    })
    .expect(201);
  return {
    app,
    organizationId: organization.body.organization.id as string,
    ownerId: owner.id as string
  };
}
