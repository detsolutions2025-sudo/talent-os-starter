import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createApp, createUser, platformHeaders, unique, userHeaders } from "./helpers";

// Hook que sempre falha, usado para provar rollback real (item 2 da revisao final): por
// construcao, `CoreService.createOrganization` so invoca `onOrganizationCreated` DEPOIS que a
// Organization e a Membership do primeiro Owner ja foram inseridas na mesma transacao
// (core/service.ts) -- entao qualquer hook que lance aqui exercita exatamente o cenario
// "insert da Organization ja executado, hook de Blueprint falha em seguida".
async function alwaysFailingBlueprintHook(): Promise<void> {
  throw new Error("simulated_blueprint_hook_failure");
}

describe("Fase 15 - Blueprint Organizacional - criacao e backfill", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria automaticamente um Blueprint Version draft junto com a Organization (RN-001/RN-002)", async () => {
    const owner = await createUser(app, "owner");
    const org = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({
        name: `Org ${unique("x")}`,
        slug: unique("bp-creation"),
        initialOwnerUserId: owner.id
      })
      .expect(201);

    const status = await request(app)
      .get(`/api/organizations/${org.body.organization.id}/blueprint`)
      .set(userHeaders(owner.id))
      .expect(200);

    expect(status.body.draft).not.toBeNull();
    expect(status.body.draft.status).toBe("draft");
    expect(status.body.draft.versionNumber).toBe(1);
    expect(status.body.active).toBeNull();
  });

  it("nunca ativa automaticamente o Blueprint na criacao da Organization (RN-003)", async () => {
    const owner = await createUser(app, "owner");
    const org = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({
        name: `Org ${unique("x")}`,
        slug: unique("bp-no-auto"),
        initialOwnerUserId: owner.id
      })
      .expect(201);

    const status = await request(app)
      .get(`/api/organizations/${org.body.organization.id}/blueprint`)
      .set(userHeaders(owner.id))
      .expect(200);

    expect(status.body.active).toBeNull();
  });

  it("falha na criacao da Organization faz rollback tambem do draft (atomicidade)", async () => {
    // Slug duplicado forca a criacao da Organization a falhar dentro da mesma transacao que
    // tentaria criar o Blueprint Version -- nenhuma linha de nenhuma das duas tabelas deve
    // sobreviver para o slug rejeitado.
    const owner = await createUser(app, "owner");
    const slug = unique("bp-atomic");

    await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "First", slug, initialOwnerUserId: owner.id })
      .expect(201);

    await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Duplicate", slug, initialOwnerUserId: owner.id })
      .expect(409);

    const countResult = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM organization_blueprint_versions v " +
        "JOIN organizations o ON o.id = v.organization_id WHERE o.slug = $1",
      [slug]
    );

    // Exatamente um Blueprint Version (o da primeira Organization criada com sucesso) --
    // nenhum residuo da tentativa duplicada rejeitada.
    expect(countResult.rows[0].count).toBe(1);
  });

  it("todas as Organizations pre-existentes recebem Blueprint draft via backfill da migration", async () => {
    // A migration 0016 ja rodou (createPostgresTestDatabase aplica todas as migrations do
    // repositorio) antes de qualquer Organization deste arquivo de teste ser criada; para
    // provar o backfill isoladamente, criamos uma Organization diretamente no banco (sem
    // passar pelo hook de onboarding da Fase 15) e confirmamos que ela nao tem Blueprint --
    // simulando o estado "antes do backfill" -- depois inserimos manualmente uma linha de
    // backfill com a mesma forma usada pela migration, para validar seu formato exato.
    const owner = await createUser(app, "owner");
    const orgId = `org_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await database.pool.query(
      `INSERT INTO organizations (id, name, slug, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $4)`,
      [orgId, `Legacy ${unique("x")}`, unique("bp-legacy"), now]
    );
    await database.pool.query(
      `INSERT INTO memberships (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'owner', 'active', $4, $4, $4)`,
      [`mem_${crypto.randomUUID()}`, orgId, owner.id, now]
    );

    const beforeBackfill = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM organization_blueprint_versions WHERE organization_id = $1",
      [orgId]
    );
    expect(beforeBackfill.rows[0].count).toBe(0);

    // Reaplica a logica de backfill da migration 0016 diretamente, com a mesma forma exata
    // (created_by_user_id NULL, created_source migration_backfill, status draft).
    await database.pool.query(
      `INSERT INTO organization_blueprint_versions (
         id, organization_id, version_number, status, created_by_user_id, created_source,
         created_at, updated_at
       )
       SELECT 'bpv_backfill_' || o.id, o.id, 1, 'draft', NULL, 'migration_backfill', NOW(), NOW()
       FROM organizations o
       WHERE NOT EXISTS (SELECT 1 FROM organization_blueprint_versions v WHERE v.organization_id = o.id)`
    );

    const version = await database.pool.query(
      "SELECT * FROM organization_blueprint_versions WHERE organization_id = $1",
      [orgId]
    );

    expect(version.rows).toHaveLength(1);
    expect(version.rows[0].status).toBe("draft");
    expect(version.rows[0].created_source).toBe("migration_backfill");
    expect(version.rows[0].created_by_user_id).toBeNull();
    expect(version.rows[0].version_number).toBe(1);
  });

  it("backfill e idempotente: reexecutar a insercao nao duplica nem sobrescreve", async () => {
    const orgId = `org_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await database.pool.query(
      `INSERT INTO organizations (id, name, slug, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $4)`,
      [orgId, `Legacy ${unique("x")}`, unique("bp-idempotent"), now]
    );

    const backfillOnce = `
      INSERT INTO organization_blueprint_versions (
        id, organization_id, version_number, status, created_by_user_id, created_source,
        created_at, updated_at
      )
      SELECT 'bpv_backfill_' || o.id, o.id, 1, 'draft', NULL, 'migration_backfill', NOW(), NOW()
      FROM organizations o
      WHERE o.id = $1
        AND NOT EXISTS (SELECT 1 FROM organization_blueprint_versions v WHERE v.organization_id = o.id)
    `;

    await database.pool.query(backfillOnce, [orgId]);
    await database.pool.query(backfillOnce, [orgId]);

    const version = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM organization_blueprint_versions WHERE organization_id = $1",
      [orgId]
    );
    expect(version.rows[0].count).toBe(1);
  });

  it("nenhuma coluna de Maturity existe no schema (Indice de Maturidade nao implementado nesta fase)", async () => {
    const columns = await database.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'organization_blueprint_versions'`
    );
    const names = columns.rows.map((row: { column_name: string }) => row.column_name);
    expect(names).not.toContain("maturity_snapshot");
    expect(names).not.toContain("maturity_score");
  });

  it("nenhuma coluna intends_to_recruit existe no schema", async () => {
    const columns = await database.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'organization_blueprint_versions'`
    );
    const names = columns.rows.map((row: { column_name: string }) => row.column_name);
    expect(names).not.toContain("intends_to_recruit");
  });

  it("falha real no hook de Blueprint (apos insert da Organization) faz rollback total: 0 Organization, 0 Blueprint Version", async () => {
    const failingApp = createApp(database, alwaysFailingBlueprintHook);
    const owner = await createUser(app, "owner-failhook");
    const slug = unique("bp-hook-failure");

    const response = await request(failingApp)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({ name: "Deve falhar", slug, initialOwnerUserId: owner.id });

    // O hook lanca um erro generico (nao AppError), entao o error handler responde 500 -- o
    // ponto central do teste nao e o status HTTP, e a garantia de que nada foi persistido.
    expect(response.status).toBeGreaterThanOrEqual(400);

    const organizationCount = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM organizations WHERE slug = $1",
      [slug]
    );
    expect(organizationCount.rows[0].count).toBe(0);

    const membershipCount = await database.pool.query(
      `SELECT COUNT(*)::int AS count FROM memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE o.slug = $1`,
      [slug]
    );
    expect(membershipCount.rows[0].count).toBe(0);

    const blueprintCount = await database.pool.query(
      `SELECT COUNT(*)::int AS count FROM organization_blueprint_versions v
       JOIN organizations o ON o.id = v.organization_id
       WHERE o.slug = $1`,
      [slug]
    );
    expect(blueprintCount.rows[0].count).toBe(0);

    const auditCount = await database.pool.query(
      `SELECT COUNT(*)::int AS count FROM audit_events
       WHERE metadata->>'organizationId' IS NOT NULL
         AND action = 'organization.created'
         AND metadata->>'organizationId' IN (
           SELECT id::text FROM organizations WHERE slug = $1
         )`,
      [slug]
    );
    // Nenhum evento de auditoria "organization.created" sobrevive tambem, porque o audit foi
    // escrito dentro da MESMA transacao que sofreu ROLLBACK (core/service.ts, `scopedService.
    // audit(...)` roda antes do hook, ainda dentro do `repository.transaction(...)`).
    expect(auditCount.rows[0].count).toBe(0);
  });
});
