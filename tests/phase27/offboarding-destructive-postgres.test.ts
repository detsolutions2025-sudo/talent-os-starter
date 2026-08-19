import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  addTask,
  createActiveEmploymentFixture,
  createOffboarding,
  endEmployment,
  offboardingAction,
  platformHeaders,
  taskAction,
  userHeaders
} from "./helpers";

describe("Fase 27 - Offboarding destrutivo", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  // ---------------------------------------------------------------------------------------
  // GATE CRITICO P-01 (SPEC-026 s15): busca de codigo-fonte -- este teste falha se qualquer
  // arquivo de src/server/offboardings/* passar a chamar uma API de mutacao de User/Membership.
  // Isso NAO e um mock: e leitura direta do codigo-fonte real do modulo.
  // ---------------------------------------------------------------------------------------
  it("GATE P-01: nenhum arquivo de src/server/offboardings/* muta User ou Membership", () => {
    const moduleDir = join(process.cwd(), "src/server/offboardings");
    const forbiddenPatterns = [
      /core\.updateMembership\s*\(/,
      /\.updateMembership\s*\(/,
      /core\.addUser\s*\(/,
      /\.addUser\s*\(/,
      /core\.addMembership\s*\(/,
      /\.addMembership\s*\(/,
      /deactivateMembership/i,
      /activateMembership/i,
      /disableUser/i,
      /revokeSession/i,
      /revokeAccess/i
    ];
    const files = readdirSync(moduleDir).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(join(moduleDir, file), "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(content),
          `${file} matched forbidden User/Membership mutation pattern: ${pattern}`
        ).toBe(false);
      }
    }
  });

  it("GATE P-01: postgres-offboarding-repository.ts nao expoe mutacao de User/Membership", () => {
    const filePath = join(
      process.cwd(),
      "src/server/persistence/postgres-offboarding-repository.ts"
    );
    const content = readFileSync(filePath, "utf8");
    expect(content).not.toMatch(/UPDATE\s+memberships/i);
    expect(content).not.toMatch(/UPDATE\s+users/i);
    expect(content).not.toMatch(/INSERT INTO\s+memberships/i);
    expect(content).not.toMatch(/INSERT INTO\s+users/i);
  });

  // ---------------------------------------------------------------------------------------
  // Zero IA
  // ---------------------------------------------------------------------------------------
  it("zero IA: nenhuma referencia a AIGateway/ai_execution/score/ranking no modulo", () => {
    const moduleDir = join(process.cwd(), "src/server/offboardings");
    const forbidden = [
      /AIGateway/,
      /ai_execution/i,
      /\bscore\b/i,
      /\branking\b/i,
      /flight[_-]?risk/i
    ];
    for (const file of readdirSync(moduleDir).filter((name) => name.endsWith(".ts"))) {
      const content = readFileSync(join(moduleDir, file), "utf8");
      for (const pattern of forbidden) {
        expect(pattern.test(content)).toBe(false);
      }
    }
  });

  // ---------------------------------------------------------------------------------------
  // Lifecycle proibido
  // ---------------------------------------------------------------------------------------
  it("bloqueia todas as transicoes fora da matriz de Offboarding", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-lifecycle");
    const created = await createOffboarding(fixture).expect(201);

    // draft -> completed direto
    await offboardingAction(fixture, created.body.id, "complete").expect(409);

    await offboardingAction(fixture, created.body.id, "start").expect(200);
    await offboardingAction(fixture, created.body.id, "complete").expect(200);

    // completed e final: start/complete/cancel devem falhar
    await offboardingAction(fixture, created.body.id, "start").expect(409);
    await offboardingAction(fixture, created.body.id, "complete").expect(409);
    await offboardingAction(fixture, created.body.id, "cancel", crypto.randomUUID(), {
      reason: "Tentativa apos final."
    }).expect(409);
  });

  it("bloqueia reabertura de Offboarding cancelled", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-cancelled-final");
    const created = await createOffboarding(fixture).expect(201);
    await offboardingAction(fixture, created.body.id, "cancel", crypto.randomUUID(), {
      reason: "Criado por engano."
    }).expect(200);
    await offboardingAction(fixture, created.body.id, "start").expect(409);
    await offboardingAction(fixture, created.body.id, "complete").expect(409);
  });

  it("bloqueia task nova em Offboarding completed/cancelled", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-task-final-parent");
    const cancelled = await createOffboarding(fixture).expect(201);
    await offboardingAction(fixture, cancelled.body.id, "cancel", crypto.randomUUID(), {
      reason: "Cancelado."
    }).expect(200);
    await addTask(fixture, cancelled.body.id).expect(409);
  });

  it("bloqueia reabertura de task completed/cancelled", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-task-final");
    const created = await createOffboarding(fixture).expect(201);
    const task = await addTask(fixture, created.body.id, crypto.randomUUID(), {
      isRequired: false
    }).expect(201);
    await taskAction(fixture, task.body.id, "complete").expect(200);
    await taskAction(fixture, task.body.id, "complete").expect(409);
    await taskAction(fixture, task.body.id, "cancel", crypto.randomUUID(), {
      reason: "Nao aplicavel."
    }).expect(409);
  });

  // ---------------------------------------------------------------------------------------
  // Elegibilidade de Employment
  // ---------------------------------------------------------------------------------------
  it("bloqueia segundo Offboarding nao-final para o mesmo Employment", async () => {
    const fixture = await createActiveEmploymentFixture(
      database,
      "destructive-duplicate-non-final"
    );
    await createOffboarding(fixture).expect(201);
    await createOffboarding(fixture, crypto.randomUUID()).expect(409);
  });

  it("Employment.end() nao cria nem fecha Offboarding automaticamente", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-end-no-auto");
    const created = await createOffboarding(fixture).expect(201);
    await offboardingAction(fixture, created.body.id, "start").expect(200);
    await endEmployment(fixture);

    const view = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/offboardings/${created.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    // continua in_progress -- Employment.end() nao fechou nem alterou o Offboarding.
    expect(view.body.status).toBe("in_progress");

    const employments = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    // Offboarding.complete() nunca foi chamado -- Employment nao foi alterado por Offboarding.
    expect(
      employments.body.find((employment: { id: string }) => employment.id === fixture.employmentId)
        .status
    ).toBe("ended");
  });

  // ---------------------------------------------------------------------------------------
  // RBAC negativo
  // ---------------------------------------------------------------------------------------
  it("member nao cria, nao inicia, nao cancela nem conclui Offboarding", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-rbac-member");
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "rbac-negative"
    );

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/offboardings`
      )
      .set(userHeaders(member.userId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(403);

    const created = await createOffboarding(fixture).expect(201);
    await offboardingAction(
      fixture,
      created.body.id,
      "start",
      crypto.randomUUID(),
      {},
      member.userId
    ).expect(403);
    await offboardingAction(
      fixture,
      created.body.id,
      "cancel",
      crypto.randomUUID(),
      {
        reason: "x"
      },
      member.userId
    ).expect(403);
    await addTask(fixture, created.body.id, crypto.randomUUID(), {}, member.userId).expect(403);
  });

  it("member nao conclui task de outro membro", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-rbac-task-owner");
    const memberA = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "task-owner-a"
    );
    const memberB = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "task-owner-b"
    );
    const created = await createOffboarding(fixture).expect(201);
    const task = await addTask(fixture, created.body.id, crypto.randomUUID(), {
      assigneeMembershipId: memberA.membershipId
    }).expect(201);
    await offboardingAction(fixture, created.body.id, "start").expect(200);

    await taskAction(
      fixture,
      task.body.id,
      "complete",
      crypto.randomUUID(),
      {},
      memberB.userId
    ).expect(403);
    await taskAction(
      fixture,
      task.body.id,
      "complete",
      crypto.randomUUID(),
      {},
      memberA.userId
    ).expect(200);
  });

  it("Platform Admin nunca opera funcionalmente; admin-read exige motivo", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-platform-admin");
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/offboardings`
      )
      .set(platformHeaders)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(403);

    await request(fixture.app)
      .post(`/api/platform/organizations/${fixture.organizationId}/offboardings/admin-read`)
      .set(platformHeaders)
      .send({})
      .expect(400);

    await request(fixture.app)
      .post(`/api/platform/organizations/${fixture.organizationId}/offboardings/admin-read`)
      .set(platformHeaders)
      .send({ reason: "Auditoria de conformidade." })
      .expect(200);
  });

  // ---------------------------------------------------------------------------------------
  // Organization archived
  // ---------------------------------------------------------------------------------------
  it("Organization archived bloqueia mutacoes e permite leitura historica", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-archived");
    const created = await createOffboarding(fixture).expect(201);

    await database.pool.query("UPDATE organizations SET status = 'archived' WHERE id = $1", [
      fixture.organizationId
    ]);

    await createOffboarding(fixture, crypto.randomUUID()).expect(403);
    await offboardingAction(fixture, created.body.id, "start").expect(403);
    await addTask(fixture, created.body.id).expect(403);

    await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/offboardings/${created.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
  });

  // ---------------------------------------------------------------------------------------
  // No-delete e imutabilidade
  // ---------------------------------------------------------------------------------------
  it("nenhuma exclusao fisica de Offboarding ou Offboarding Task ocorre", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-no-delete");
    const created = await createOffboarding(fixture).expect(201);
    const task = await addTask(fixture, created.body.id).expect(201);

    await expect(
      database.pool.query("DELETE FROM offboardings WHERE id = $1", [created.body.id])
    ).rejects.toThrow(/offboarding_no_physical_delete/);
    await expect(
      database.pool.query("DELETE FROM offboarding_tasks WHERE id = $1", [task.body.id])
    ).rejects.toThrow(/offboarding_task_no_physical_delete/);
  });

  it("bloqueia UPDATE direto que viole a matriz de transicao ou a imutabilidade de contexto", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-trigger-defense");
    const created = await createOffboarding(fixture).expect(201);

    await expect(
      database.pool.query("UPDATE offboardings SET status = 'completed' WHERE id = $1", [
        created.body.id
      ])
    ).rejects.toThrow(/offboarding_invalid_status_transition/);

    await expect(
      database.pool.query("UPDATE offboardings SET employment_id = $2 WHERE id = $1", [
        created.body.id,
        "some-other-employment"
      ])
    ).rejects.toThrow(/offboarding_parent_immutable/);
  });

  // ---------------------------------------------------------------------------------------
  // Auditoria critica e atomicidade
  // ---------------------------------------------------------------------------------------
  it("falha de auditoria critica reverte a criacao do Offboarding inteira", async () => {
    const fixture = await createActiveEmploymentFixture(database, "audit-rollback");
    const key = `audit-fail-${crypto.randomUUID()}`;
    await database.pool.query(`
      CREATE OR REPLACE FUNCTION fail_offboarding_created_audit()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.action = 'offboarding.created' THEN
          RAISE EXCEPTION 'simulated_audit_failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await database.pool.query(`
      CREATE TRIGGER trg_fail_offboarding_created_audit
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_offboarding_created_audit();
    `);
    try {
      await createOffboarding(fixture, key).expect(500);
    } finally {
      await database.pool.query(
        "DROP TRIGGER IF EXISTS trg_fail_offboarding_created_audit ON audit_events"
      );
    }

    const counts = await database.pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM offboardings WHERE employment_id = $1) AS offboardings,
          (SELECT status FROM offboarding_idempotency_keys WHERE organization_id = $2 LIMIT 1)
            AS idem_status
      `,
      [fixture.employmentId, fixture.organizationId]
    );
    expect(counts.rows[0].offboardings).toBe(0);
    expect(counts.rows[0].idem_status).toBe("failed");
  });

  // ---------------------------------------------------------------------------------------
  // Idempotency poisoning (chave presa em `pending`)
  // ---------------------------------------------------------------------------------------
  it("Idempotency-Key presa em pending nunca duplica efeito; retorna conflito seguro", async () => {
    const fixture = await createActiveEmploymentFixture(database, "idem-poisoning");
    const key = crypto.randomUUID();
    const keyHash = createHash("sha256").update(key).digest("hex");
    await database.pool.query(
      `
        INSERT INTO offboarding_idempotency_keys (
          id, organization_id, operation, scope_id, key_hash, request_fingerprint, status, created_at
        )
        VALUES ($1, $2, 'create', $3, $4, $5, 'pending', NOW())
      `,
      [
        "offbidem_poisoning_test",
        fixture.organizationId,
        fixture.employmentId,
        keyHash,
        "0".repeat(64)
      ]
    );

    await createOffboarding(fixture, key).expect(409);

    const rows = await database.pool.query(
      "SELECT COUNT(*) AS count FROM offboardings WHERE employment_id = $1",
      [fixture.employmentId]
    );
    expect(Number(rows.rows[0].count)).toBe(0);
  });

  it("trigger fisica bloqueia INSERT de Offboarding para Employment pending/cancelled", async () => {
    const fixture = await createActiveEmploymentFixture(database, "destructive-insert-trigger");
    const pendingEmployment = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        displayName: "Pessoa Trigger",
        originType: "administrative",
        originReason: "Teste de trigger fisica.",
        effectiveStartDate: "2026-09-01"
      })
      .expect(201);

    await expect(
      database.pool.query(
        `
          INSERT INTO offboardings (id, organization_id, employment_id, status, created_by_user_id)
          VALUES ('offb_direct_insert_test', $1, $2, 'draft', $3)
        `,
        [fixture.organizationId, pendingEmployment.body.id, fixture.ownerId]
      )
    ).rejects.toThrow(/offboarding_employment_not_eligible/);
  });
});
