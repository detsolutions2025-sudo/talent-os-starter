import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createHiredFixture,
  createOnboarding,
  startOnboarding,
  userHeaders
} from "./helpers";

describe("Fase 23 - Onboarding fluxo, permissoes e idempotencia", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria apos hired administrativo, nao antes de hired, e nao duplica PII", async () => {
    const fixture = await createHiredFixture(database, "admin-hired");
    const created = await createOnboarding(fixture).expect(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.candidateApplicationId).toBe(fixture.applicationId);
    expect(JSON.stringify(created.body)).not.toContain("@example.com");

    const columns = await database.pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'onboardings'
          AND column_name IN ('job_opening_id', 'job_opening_version_id', 'proposal_version_id')
      `,
      [database.schema]
    );
    expect(columns.rowCount).toBe(0);
  });

  it("aplica idempotencia de create e rejeita mesma chave com payload diferente", async () => {
    const fixture = await createHiredFixture(database, "idem-create");
    const key = crypto.randomUUID();
    const first = await createOnboarding(fixture, key).expect(201);
    const replay = await createOnboarding(fixture, key).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.idempotentReplay).toBe(true);
    await createOnboarding(fixture, key, { expectedPersonStartDate: "2026-10-01" }).expect(409);
  });

  it("nao reserva idempotencia antes de autorizacao ou Organization existente", async () => {
    const fixture = await createHiredFixture(database, "idem-auth-first");
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "idem-auth-first"
    );
    const deniedKey = crypto.randomUUID();
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/onboarding`
      )
      .set(userHeaders(member.userId))
      .set("Idempotency-Key", deniedKey)
      .send({ expectedPersonStartDate: "2026-09-01", initialTasks: [] })
      .expect(403);

    const missingOrgKey = crypto.randomUUID();
    await request(fixture.app)
      .post(
        `/api/organizations/org_missing/candidate-applications/${fixture.applicationId}/onboarding`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", missingOrgKey)
      .send({ expectedPersonStartDate: "2026-09-01", initialTasks: [] })
      .expect(404);

    const rows = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM onboarding_idempotency_keys WHERE key_hash = ANY($1)",
      [[sha256Hex(deniedKey), sha256Hex(missingOrgKey)]]
    );
    expect(rows.rows[0].count).toBe(0);
  });

  it("bloqueia start quando tarefa obrigatoria nao tem responsavel", async () => {
    const fixture = await createHiredFixture(database, "start-assignee-required");
    const created = await createOnboarding(fixture, crypto.randomUUID(), {
      initialTasks: [{ title: "Obrigatoria sem responsavel", isRequired: true }]
    }).expect(201);

    await startOnboarding(fixture, created.body.id).expect(409);
  });

  it("bloqueia lifecycle fisico incoerente por SQL direto", async () => {
    const fixture = await createHiredFixture(database, "physical-lifecycle");
    const created = await createOnboarding(fixture).expect(201);
    await expect(
      database.pool.query(
        `
          UPDATE onboardings
          SET status = 'cancelled',
              started_at = NOW(),
              started_by_user_id = $2,
              cancelled_at = NOW(),
              cancelled_by_user_id = $2,
              cancellation_reason = 'sql direto',
              updated_at = NOW()
          WHERE id = $1
        `,
        [created.body.id, fixture.ownerId]
      )
    ).rejects.toThrow(/onboarding_cancelled_from_draft_cannot_be_started/);

    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "physical-lifecycle"
    );
    const task = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${created.body.id}/tasks`)
      .set(userHeaders(fixture.ownerId))
      .send({ title: "Autoria fisica", assigneeMembershipId: member.membershipId })
      .expect(201);

    await expect(
      database.pool.query(
        `
          UPDATE onboarding_tasks
          SET status = 'completed',
              completed_at = NOW(),
              completed_by_membership_id = $2,
              completed_by_user_id = $3,
              updated_at = NOW()
          WHERE id = $1
        `,
        [task.body.id, member.membershipId, fixture.ownerId]
      )
    ).rejects.toThrow(/onboarding_task_completion_author_ambiguous/);
  });

  it("owner/admin gerenciam, member conclui propria task e required cancelada com motivo sai do progresso", async () => {
    const fixture = await createHiredFixture(database, "task-flow");
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "task-flow"
    );
    const created = await createOnboarding(fixture).expect(201);
    const onboardingId = created.body.id as string;

    const task = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}/tasks`)
      .set(userHeaders(fixture.ownerId))
      .send({
        title: "Preparar primeiro dia",
        isRequired: true,
        assigneeMembershipId: member.membershipId
      })
      .expect(201);

    await startOnboarding(fixture, onboardingId).expect(200);
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/onboarding-tasks/${task.body.id}/complete`
      )
      .set(userHeaders(member.userId))
      .send({})
      .expect(200);

    const optional = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}/tasks`)
      .set(userHeaders(fixture.ownerId))
      .send({ title: "Opcional", isRequired: false, creationReason: "Acompanhamento." })
      .expect(201);
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/onboarding-tasks/${optional.body.id}/cancel`
      )
      .set(userHeaders(fixture.ownerId))
      .send({ reason: "Nao necessario." })
      .expect(200);

    const completed = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${onboardingId}/complete`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);
    expect(completed.body.status).toBe("completed");
    expect(completed.body.progress).toEqual({ numerator: 1, denominator: 1, percent: 100 });
  });

  it("bloqueia member em task alheia, Membership inactive e Organization archived em mutacoes", async () => {
    const fixture = await createHiredFixture(database, "blocked");
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "blocked"
    );
    const other = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "blocked-other"
    );
    const created = await createOnboarding(fixture).expect(201);
    const task = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${created.body.id}/tasks`)
      .set(userHeaders(fixture.ownerId))
      .send({ title: "Assincrona", assigneeMembershipId: other.membershipId })
      .expect(201);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/onboarding-tasks/${task.body.id}/complete`
      )
      .set(userHeaders(member.userId))
      .send({})
      .expect(403);

    await database.pool.query("UPDATE organizations SET status = 'archived' WHERE id = $1", [
      fixture.organizationId
    ]);

    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/onboardings/${created.body.id}/start`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(403);
  });
});

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
