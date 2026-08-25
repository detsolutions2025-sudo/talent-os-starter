// @vitest-environment node
// Fase 29 (SPEC-028 s16; CA-024 a CA-026; migration 0033). Bootstrap do primeiro tenant.
//
// GAP FISICO COMPROVADO E FECHADO (ver relatorio final da correcao fisica complementar): o
// caminho B (e-mail ainda nao confirmado, exige convite assincrono + aceite) precisava persistir
// nome/slug da Organization pendente em algum lugar do convite -- a migration 0032 (ja aplicada e
// IMUTAVEL) nao criou essa coluna; a migration 0033 (aditiva, NAO aplicada em DEV nesta tarefa)
// fecha o gap com o menor delta possivel. Este arquivo prova que os dois caminhos funcionam
// integralmente, e nunca de forma silenciosa ou parcial.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../../src/server/auth/service";
import type { AuthTransactionRunner } from "../../src/server/auth/transaction";
import type { Invitation } from "../../src/server/auth/types";
import { PostgresAuthRepository } from "../../src/server/persistence/postgres-auth-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createAuthTestContext,
  createDevAuthApp,
  createUser,
  extractCookieHeader,
  platformHeaders
} from "./helpers";
import { TEST_AUDIENCE, TEST_ISSUER } from "./jwt-fixtures";

// Gate de atomicidade (secao 12 do gate executavel da 0033): prova FISICAMENTE -- nao apenas por
// inspecao de codigo -- que uma falha DEPOIS da Organization+Membership ja criadas mas ANTES do
// commit da transacao de aceite desfaz TUDO (Organization, Membership e o proprio UPDATE do
// convite), nunca deixando bootstrap_organization_id apontar para uma Organization de transacao
// abortada. Mesmo padrao ja usado por
// tests/phase28/access-grant-atomic-revoke-postgres.test.ts (repositorio "envenenado" que falha
// no ultimo passo, injetado via um runner de transacao customizado sobre o MESMO pool real).
class PoisonedAfterOrganizationCreatedAuthRepository extends PostgresAuthRepository {
  async updateInvitation(invitation: Invitation): Promise<void> {
    void invitation;
    throw new Error("forced_failure_after_organization_created");
  }
}

function createPoisonedAuthRunner(pool: pg.Pool): AuthTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        auth: new PoisonedAfterOrganizationCreatedAuthRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}

async function acceptBootstrapViaSessionBridge(
  app: ReturnType<typeof createDevAuthApp>,
  provider: Awaited<ReturnType<typeof createAuthTestContext>>["provider"],
  invitationId: string,
  email: string
) {
  const { accessToken, refreshToken } = await provider.issueSessionForEmail(email);
  const sessionResponse = await request(app)
    .post("/api/auth/session")
    .send({ accessToken, refreshToken });
  expect(sessionResponse.status).toBe(204);
  const cookieHeader = extractCookieHeader(sessionResponse.headers["set-cookie"]);
  return request(app)
    .post(`/api/auth/invitations/${invitationId}/accept`)
    .set("Cookie", cookieHeader);
}

describe("Bootstrap do primeiro tenant (SPEC-028 s16)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("CA-024: only Platform Admin can trigger bootstrap", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createDevAuthApp(database, ctx);
    const someUser = await createUser(app, "notadmin");
    await request(app)
      .post("/api/platform/organizations/bootstrap")
      .set("x-dev-user-id", someUser.id)
      .send({
        organizationName: "X",
        organizationSlug: `x-${randomUUID()}`,
        ownerEmail: "x@example.com"
      })
      .expect(403);
  });

  it("Path A: bootstrap with an already-confirmed owner email creates Organization + first owner atomically (CA-025, reuses tested CoreService.createOrganization)", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createDevAuthApp(database, ctx);
    const owner = await createUser(app, "bootstrapowner");
    const externalId = `ext-bootstrap-${owner.id}`;
    await database.pool.query(
      `INSERT INTO auth_identities (id, user_id, provider, external_id) VALUES ($1, $2, 'supabase', $3)`,
      [`ai_${owner.id}`, owner.id, externalId]
    );

    const slug = `bootstrap-a-${randomUUID().slice(0, 8)}`;

    // Validacao de input: omitir ownerEmail e recusado com 400, nunca tratado como bootstrap
    // sem owner.
    await request(app)
      .post("/api/platform/organizations/bootstrap")
      .set(platformHeaders)
      .send({ organizationName: "Bootstrapped Org", organizationSlug: slug })
      .expect(400);

    const ownerEmailResult = await database.pool.query(`SELECT email FROM users WHERE id = $1`, [
      owner.id
    ]);
    const created = await request(app)
      .post("/api/platform/organizations/bootstrap")
      .set(platformHeaders)
      .send({
        organizationName: "Bootstrapped Org",
        organizationSlug: slug,
        ownerEmail: ownerEmailResult.rows[0].email
      })
      .expect(201);

    expect(created.body.organization.slug).toBe(slug);
    expect(created.body.membership.userId).toBe(owner.id);
    expect(created.body.membership.role).toBe("owner");

    // Caminho A nunca cria linha em `invitations` -- confirma o achado que motivou o menor
    // delta aditivo (0033 so precisa cobrir o caminho B).
    const invitations = await database.pool.query(
      `SELECT count(*)::int AS count FROM invitations WHERE organization_name = $1`,
      ["Bootstrapped Org"]
    );
    expect(invitations.rows[0].count).toBe(0);

    // CA-026: nenhuma dependencia funcional de /api/dev/users foi usada para o proprio
    // bootstrap (apenas para a fixture de teste montar um owner previamente confirmado, o que
    // em producao real seria feito pelo fluxo de convite/aceite normal, secao 15).
  });

  it("rejects client-controlled organizationId/bootstrap_organization_id injected into the payload (mass assignment defense)", async () => {
    const ctx = await createAuthTestContext(database);
    const app = createDevAuthApp(database, ctx);
    await request(app)
      .post("/api/platform/organizations/bootstrap")
      .set(platformHeaders)
      .set("x-dev-user-id", "usr_irrelevant")
      .set("Idempotency-Key", randomUUID())
      .send({
        organizationName: "Injected",
        organizationSlug: `injected-${randomUUID()}`,
        ownerEmail: `injected-${randomUUID()}@example.com`,
        organizationId: "org_forged",
        organization_id: "org_forged",
        bootstrapOrganizationId: "org_forged"
      })
      .expect(400);
  });

  describe("Path B (owner email not yet confirmed): real invite + accept flow (migration 0033)", () => {
    it("happy path: creates a pending bootstrap invitation, invites via provider, and accepting materializes exactly one Organization + one owner Membership + one AuthIdentity + one User atomically", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin");
      const slug = `bootstrap-b-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `never-confirmed-${randomUUID()}@example.com`;

      const created = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({ organizationName: "Real Bootstrap Org", organizationSlug: slug, ownerEmail })
        .expect(201);

      expect(created.body.status).toBe("pending");
      expect(created.body.organizationId).toBeNull();
      expect(created.body.role).toBe("owner");
      expect(ctx.provider.invitedEmails).toContain(ownerEmail);

      // Nada foi materializado ainda -- nem Organization, nem User, nem AuthIdentity.
      const preOrgs = await database.pool.query(
        `SELECT count(*)::int AS count FROM organizations WHERE slug = $1`,
        [slug]
      );
      expect(preOrgs.rows[0].count).toBe(0);
      const preUsers = await database.pool.query(
        `SELECT count(*)::int AS count FROM users WHERE email = $1`,
        [ownerEmail]
      );
      expect(preUsers.rows[0].count).toBe(0);

      const acceptResponse = await acceptBootstrapViaSessionBridge(
        app,
        ctx.provider,
        created.body.id,
        ownerEmail
      );
      expect(acceptResponse.status).toBe(200);
      expect(acceptResponse.body.membershipId).toBeTruthy();

      const orgs = await database.pool.query(
        `SELECT id, slug, name FROM organizations WHERE slug = $1`,
        [slug]
      );
      expect(orgs.rowCount).toBe(1);
      expect(orgs.rows[0].name).toBe("Real Bootstrap Org");

      const memberships = await database.pool.query(
        `SELECT role, status, user_id FROM memberships WHERE organization_id = $1`,
        [orgs.rows[0].id]
      );
      expect(memberships.rowCount).toBe(1);
      expect(memberships.rows[0].role).toBe("owner");
      expect(memberships.rows[0].status).toBe("active");

      const users = await database.pool.query(`SELECT id FROM users WHERE email = $1`, [
        ownerEmail
      ]);
      expect(users.rowCount).toBe(1);
      expect(users.rows[0].id).toBe(memberships.rows[0].user_id);

      const identities = await database.pool.query(
        `SELECT count(*)::int AS count FROM auth_identities WHERE user_id = $1`,
        [users.rows[0].id]
      );
      expect(identities.rows[0].count).toBe(1);

      const invitation = await database.pool.query(
        `SELECT status, organization_id, bootstrap_organization_id, accepted_by_user_id
         FROM invitations WHERE id = $1`,
        [created.body.id]
      );
      expect(invitation.rows[0].status).toBe("accepted");
      expect(invitation.rows[0].organization_id).toBeNull();
      expect(invitation.rows[0].bootstrap_organization_id).toBe(orgs.rows[0].id);
      expect(invitation.rows[0].accepted_by_user_id).toBe(users.rows[0].id);
    });

    it("owner email belonging to an existing User without AuthIdentity yet (test/legacy) is linked, never duplicated", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin2");
      const legacyOwner = await createUser(app, "legacyowner");
      const ownerEmailResult = await database.pool.query(`SELECT email FROM users WHERE id = $1`, [
        legacyOwner.id
      ]);
      const ownerEmail = ownerEmailResult.rows[0].email as string;
      const slug = `bootstrap-legacy-${randomUUID().slice(0, 8)}`;

      const created = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({ organizationName: "Legacy Bootstrap Org", organizationSlug: slug, ownerEmail })
        .expect(201);
      expect(created.body.resolvedUserId).toBe(legacyOwner.id);

      const acceptResponse = await acceptBootstrapViaSessionBridge(
        app,
        ctx.provider,
        created.body.id,
        ownerEmail
      );
      expect(acceptResponse.status).toBe(200);
      expect(acceptResponse.body.userId).toBe(legacyOwner.id);

      const users = await database.pool.query(
        `SELECT count(*)::int AS count FROM users WHERE email = $1`,
        [ownerEmail]
      );
      expect(users.rows[0].count).toBe(1); // nunca cria um segundo User
    });

    it("replay: accepting an already-accepted bootstrap invitation is idempotent (no duplicate Organization or Membership)", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin3");
      const slug = `bootstrap-replay-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `replay-${randomUUID()}@example.com`;

      const created = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({ organizationName: "Replay Org", organizationSlug: slug, ownerEmail })
        .expect(201);

      const first = await acceptBootstrapViaSessionBridge(
        app,
        ctx.provider,
        created.body.id,
        ownerEmail
      );
      expect(first.status).toBe(200);
      const second = await acceptBootstrapViaSessionBridge(
        app,
        ctx.provider,
        created.body.id,
        ownerEmail
      );
      expect(second.status).toBe(200);
      expect(second.body.idempotentReplay).toBe(true);
      expect(second.body.membershipId).toBe(first.body.membershipId);

      const orgs = await database.pool.query(
        `SELECT count(*)::int AS count FROM organizations WHERE slug = $1`,
        [slug]
      );
      expect(orgs.rows[0].count).toBe(1);
      const memberships = await database.pool.query(
        `SELECT count(*)::int AS count FROM memberships m
         JOIN organizations o ON o.id = m.organization_id WHERE o.slug = $1`,
        [slug]
      );
      expect(memberships.rows[0].count).toBe(1);
    });

    it("atomicity gate: a failure right after Organization+Membership are created, before commit, rolls back EVERYTHING (no orphan Organization, invitation stays pending, bootstrap_organization_id stays null)", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin-atomic");
      const slug = `bootstrap-atomic-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `atomic-${randomUUID()}@example.com`;

      const created = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({ organizationName: "Atomic Org", organizationSlug: slug, ownerEmail })
        .expect(201);

      const { accessToken } = await ctx.provider.issueSessionForEmail(ownerEmail);

      // Mesma AuthService real, MAS com o runner de transacao substituido por um que falha no
      // ultimo INSERT/UPDATE (o que marca o convite `accepted`) -- depois que
      // `CoreService.createOrganization` (Organization + primeiro Membership owner) ja rodou na
      // MESMA transacao fisica.
      const poisonedAuthService = new AuthService({
        core: new PostgresCoreRepository(database.pool),
        auth: new PostgresAuthRepository(database.pool),
        runTransaction: createPoisonedAuthRunner(database.pool),
        provider: ctx.provider,
        getKey: ctx.jwks.getKey,
        jwtOptions: { issuer: TEST_ISSUER, audience: TEST_AUDIENCE }
      });

      await expect(
        poisonedAuthService.acceptInvitation(accessToken, created.body.id)
      ).rejects.toThrow("forced_failure_after_organization_created");

      const orgs = await database.pool.query(
        `SELECT count(*)::int AS count FROM organizations WHERE slug = $1`,
        [slug]
      );
      expect(orgs.rows[0].count).toBe(0);

      const invitation = await database.pool.query(
        `SELECT status, bootstrap_organization_id FROM invitations WHERE id = $1`,
        [created.body.id]
      );
      expect(invitation.rows[0].status).toBe("pending");
      expect(invitation.rows[0].bootstrap_organization_id).toBeNull();

      // Prova que a transacao abortada nao deixou nenhum User/Membership orfao amarrado ao
      // e-mail do owner.
      const memberships = await database.pool.query(
        `SELECT count(*)::int AS count FROM memberships m
         JOIN users u ON u.id = m.user_id WHERE u.email = $1`,
        [ownerEmail]
      );
      expect(memberships.rows[0].count).toBe(0);

      // O aceite real (sem veneno) continua funcionando normalmente sobre o MESMO convite --
      // prova que o rollback nao deixou o convite num estado impossivel de recuperar.
      const retryApp = createDevAuthApp(database, ctx);
      const cookieBridge = await request(retryApp)
        .post("/api/auth/session")
        .send({ accessToken, refreshToken: "fake-refresh-atomic" });
      expect(cookieBridge.status).toBe(204);
      const cookieHeader = extractCookieHeader(cookieBridge.headers["set-cookie"]);
      const finalAccept = await request(retryApp)
        .post(`/api/auth/invitations/${created.body.id}/accept`)
        .set("Cookie", cookieHeader)
        .expect(200);
      expect(finalAccept.body.idempotentReplay).toBe(false);

      const finalOrgs = await database.pool.query(
        `SELECT count(*)::int AS count FROM organizations WHERE slug = $1`,
        [slug]
      );
      expect(finalOrgs.rows[0].count).toBe(1);
    });

    it("expired: accepting a bootstrap invitation past expires_at is refused, never materializes anything", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin4");
      const slug = `bootstrap-expired-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `expired-${randomUUID()}@example.com`;

      const created = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({ organizationName: "Expired Org", organizationSlug: slug, ownerEmail })
        .expect(201);

      await database.pool.query(
        `UPDATE invitations SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
        [created.body.id]
      );

      const acceptResponse = await acceptBootstrapViaSessionBridge(
        app,
        ctx.provider,
        created.body.id,
        ownerEmail
      );
      expect(acceptResponse.status).toBe(409);

      const orgs = await database.pool.query(
        `SELECT count(*)::int AS count FROM organizations WHERE slug = $1`,
        [slug]
      );
      expect(orgs.rows[0].count).toBe(0);
      const invitation = await database.pool.query(`SELECT status FROM invitations WHERE id = $1`, [
        created.body.id
      ]);
      expect(invitation.rows[0].status).toBe("expired");
    });

    it("a second pending bootstrap invitation for the same owner email is refused (409), never sends a duplicate provider invite", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin5");
      const ownerEmail = `dup-${randomUUID()}@example.com`;

      await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({
          organizationName: "First Org",
          organizationSlug: `dup-first-${randomUUID().slice(0, 8)}`,
          ownerEmail
        })
        .expect(201);

      await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({
          organizationName: "Second Org",
          organizationSlug: `dup-second-${randomUUID().slice(0, 8)}`,
          ownerEmail
        })
        .expect(409);

      // A checagem de duplicidade falha ANTES de qualquer chamada ao provider (SPEC-028 s27;
      // secao 11.A desta tarefa: "DB falha antes da chamada perigosa ao provider").
      expect(ctx.provider.invitedEmails.filter((e) => e === ownerEmail).length).toBe(1);
    });

    it("provider failure never blocks the local invitation from existing: it stays pending, provider-unnotified, and can still be accepted (SPEC-028 s27 ordering)", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin6");
      const slug = `bootstrap-providerfail-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `providerfail-${randomUUID()}@example.com`;

      ctx.provider.failNextInvite = true;
      const created = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({ organizationName: "Provider Fail Org", organizationSlug: slug, ownerEmail })
        .expect(201);

      expect(created.body.providerNotified).toBe(false);
      expect(created.body.status).toBe("pending");

      const acceptResponse = await acceptBootstrapViaSessionBridge(
        app,
        ctx.provider,
        created.body.id,
        ownerEmail
      );
      expect(acceptResponse.status).toBe(200);
      const orgs = await database.pool.query(
        `SELECT count(*)::int AS count FROM organizations WHERE slug = $1`,
        [slug]
      );
      expect(orgs.rows[0].count).toBe(1);
    });

    it("retrying the same Idempotency-Key with the same payload returns the same pending invitation and never invites the provider twice", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin7");
      const key = randomUUID();
      const ownerEmail = `idem-${randomUUID()}@example.com`;
      const body = {
        organizationName: "Idempotent Org",
        organizationSlug: `bootstrap-idem-${randomUUID().slice(0, 8)}`,
        ownerEmail
      };

      const first = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", key)
        .send(body)
        .expect(201);
      const second = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", key)
        .send(body)
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body.idempotentReplay).toBe(true);
      expect(ctx.provider.invitedEmails.filter((e) => e === ownerEmail).length).toBe(1);

      const rows = await database.pool.query(
        `SELECT key_hash FROM invitation_idempotency_keys WHERE operation = 'bootstrap' AND organization_id IS NULL`
      );
      expect(rows.rowCount).toBeGreaterThanOrEqual(1);
      for (const row of rows.rows) {
        expect(row.key_hash).not.toBe(key);
        expect(String(row.key_hash)).toHaveLength(64);
      }
    });

    it("cancelling is not exposed for bootstrap invitations (no organization-scoped cancel route applies -- organizationId is null); a stale/rejected session simply cannot accept", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin8");
      const slug = `bootstrap-mismatch-${randomUUID().slice(0, 8)}`;
      const invitedEmail = `mismatch-${randomUUID()}@example.com`;
      const otherEmail = `other-${randomUUID()}@example.com`;

      const created = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({
          organizationName: "Mismatch Org",
          organizationSlug: slug,
          ownerEmail: invitedEmail
        })
        .expect(201);

      // Defesa em profundidade: sessao de um e-mail diferente do convite nunca aceita, mesmo
      // sabendo o invitationId (SPEC-028 s15, ja testado genericamente para convite normal;
      // aqui prova que o mesmo mecanismo cobre bootstrap sem excecao).
      const acceptResponse = await acceptBootstrapViaSessionBridge(
        app,
        ctx.provider,
        created.body.id,
        otherEmail
      );
      expect(acceptResponse.status).toBe(403);

      const orgs = await database.pool.query(
        `SELECT count(*)::int AS count FROM organizations WHERE slug = $1`,
        [slug]
      );
      expect(orgs.rows[0].count).toBe(0);
    });

    it("audit trail for a full bootstrap flow never contains a secret and always ties the acceptance to the created Organization", async () => {
      const ctx = await createAuthTestContext(database);
      const app = createDevAuthApp(database, ctx);
      const platformAdmin = await createUser(app, "platformadmin9");
      const slug = `bootstrap-audit-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `audit-${randomUUID()}@example.com`;

      const created = await request(app)
        .post("/api/platform/organizations/bootstrap")
        .set(platformHeaders)
        .set("x-dev-user-id", platformAdmin.id)
        .set("Idempotency-Key", randomUUID())
        .send({ organizationName: "Audit Org", organizationSlug: slug, ownerEmail })
        .expect(201);

      const acceptResponse = await acceptBootstrapViaSessionBridge(
        app,
        ctx.provider,
        created.body.id,
        ownerEmail
      );
      expect(acceptResponse.status).toBe(200);

      const orgs = await database.pool.query(`SELECT id FROM organizations WHERE slug = $1`, [
        slug
      ]);
      const events = await database.pool.query(
        `SELECT action, organization_id, metadata FROM audit_events
         WHERE action IN ('auth.bootstrap_organization_requested', 'auth.invitation_accepted')
           AND (organization_id = $1 OR metadata->>'invitationId' = $2)
         ORDER BY created_at`,
        [orgs.rows[0].id, created.body.id]
      );
      expect(events.rowCount).toBeGreaterThanOrEqual(2);

      const requested = events.rows.find(
        (r) => r.action === "auth.bootstrap_organization_requested"
      );
      expect(requested.organization_id).toBeNull(); // Organization ainda nao existia neste evento.
      expect(requested.metadata.invitationId).toBe(created.body.id);

      const accepted = events.rows.find((r) => r.action === "auth.invitation_accepted");
      expect(accepted.organization_id).toBe(orgs.rows[0].id); // amarrado a Organization criada.

      const serialized = JSON.stringify(events.rows);
      for (const forbidden of [
        "password",
        "access_token",
        "refresh_token",
        "Authorization",
        "cookie",
        "jwt"
      ]) {
        expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    });
  });
});
