import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  addTask,
  assignTask,
  createActiveEmploymentFixture,
  createOffboarding,
  endEmployment,
  offboardingAction,
  taskAction,
  userHeaders
} from "./helpers";

describe("Fase 27 - Offboarding fluxo", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria Offboarding com Employment active; ciclo completo draft->in_progress->completed", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-lifecycle");
    const created = await createOffboarding(fixture, crypto.randomUUID(), {
      exitCategory: "voluntary_resignation",
      expectedLastDay: "2026-07-01"
    }).expect(201);
    expect(created.body.status).toBe("draft");
    expect(created.body.employmentId).toBe(fixture.employmentId);

    const task = await addTask(fixture, created.body.id, crypto.randomUUID(), {
      title: "Confirmar revogacao de acesso"
    }).expect(201);
    expect(task.body.status).toBe("open");

    // required task sem assignee bloqueia start
    await offboardingAction(fixture, created.body.id, "start").expect(409);

    await assignTask(fixture, task.body.id, await ownerMembershipId(fixture)).expect(200);

    await offboardingAction(fixture, created.body.id, "start").expect(200);

    // completar com task obrigatoria open deve falhar
    await offboardingAction(fixture, created.body.id, "complete").expect(409);

    await taskAction(fixture, task.body.id, "complete").expect(200);

    const completed = await offboardingAction(fixture, created.body.id, "complete").expect(200);
    expect(completed.body.status).toBe("completed");
    expect(completed.body.progress).toEqual({ numerator: 1, denominator: 1, percent: 100 });

    // segundo Offboarding para o mesmo Employment e permitido depois que o primeiro e final.
    const second = await createOffboarding(fixture, crypto.randomUUID()).expect(201);
    expect(second.body.id).not.toBe(created.body.id);
  });

  it("cria Offboarding com Employment ended (segundo caminho elegivel)", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-ended-eligible");
    await endEmployment(fixture);
    const created = await createOffboarding(fixture).expect(201);
    expect(created.body.status).toBe("draft");
  });

  it("bloqueia criacao com Employment pending", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-pending-blocked");
    // cria um segundo Employment `pending` para a mesma OrganizationPerson e' bloqueado pela
    // propria SPEC-025 enquanto o primeiro estiver active; usamos um cenario administrativo
    // isolado em vez disso: Employment pending de outra pessoa, verificando o 409 correto.
    // organizationPersonId omitido -- o fluxo administrativo cria a OrganizationPerson inline
    // a partir de displayName (employments/service.ts resolveOrCreatePerson).
    const pendingEmployment = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        displayName: "Pessoa Pending",
        originType: "administrative",
        originReason: "Admissao administrativa futura.",
        effectiveStartDate: "2026-09-01"
      })
      .expect(201);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${pendingEmployment.body.id}/offboardings`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(409);
  });

  it("bloqueia criacao com Employment cancelled", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-cancelled-blocked");
    const pendingEmployment = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        displayName: "Pessoa Cancelada",
        originType: "administrative",
        originReason: "Admissao administrativa futura.",
        effectiveStartDate: "2026-09-01"
      })
      .expect(201);
    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${pendingEmployment.body.id}/cancel`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ reason: "Erro de cadastro." })
      .expect(200);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${pendingEmployment.body.id}/offboardings`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(409);
  });

  it("RBAC positivo: owner e admin criam/iniciam/concluem; member conclui apenas task propria", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-rbac-positive");
    const admin = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "admin",
      "flow-rbac"
    );
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "flow-rbac"
    );

    const created = await createOffboarding(fixture, crypto.randomUUID(), {}, admin.userId).expect(
      201
    );
    const task = await addTask(
      fixture,
      created.body.id,
      crypto.randomUUID(),
      { title: "Entrevista de desligamento" },
      admin.userId
    ).expect(201);
    await assignTask(
      fixture,
      task.body.id,
      member.membershipId,
      crypto.randomUUID(),
      admin.userId
    ).expect(200);
    await offboardingAction(
      fixture,
      created.body.id,
      "start",
      crypto.randomUUID(),
      {},
      admin.userId
    ).expect(200);

    // member conclui a propria task
    await taskAction(
      fixture,
      task.body.id,
      "complete",
      crypto.randomUUID(),
      {},
      member.userId
    ).expect(200);

    const completed = await offboardingAction(
      fixture,
      created.body.id,
      "complete",
      crypto.randomUUID(),
      {},
      admin.userId
    ).expect(200);
    expect(completed.body.status).toBe("completed");
  });

  it("progresso ignora tasks opcionais e canceladas", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-progress");
    const created = await createOffboarding(fixture).expect(201);
    const required = await addTask(fixture, created.body.id, crypto.randomUUID(), {
      title: "Obrigatoria"
    }).expect(201);
    await addTask(fixture, created.body.id, crypto.randomUUID(), {
      title: "Opcional",
      isRequired: false
    }).expect(201);
    const cancelledRequired = await addTask(fixture, created.body.id, crypto.randomUUID(), {
      title: "Obrigatoria cancelada"
    }).expect(201);
    await taskAction(fixture, cancelledRequired.body.id, "cancel", crypto.randomUUID(), {
      reason: "Nao se aplica."
    }).expect(200);

    const ownerMembership = await ownerMembershipId(fixture);
    await assignTask(fixture, required.body.id, ownerMembership).expect(200);
    await offboardingAction(fixture, created.body.id, "start").expect(200);
    await taskAction(fixture, required.body.id, "complete").expect(200);

    const view = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/offboardings/${created.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(view.body.progress).toEqual({ numerator: 1, denominator: 1, percent: 100 });
  });

  it("rehire: Offboarding do Employment 1 nunca bloqueia nem altera Employment 2", async () => {
    const fixture = await createActiveEmploymentFixture(database, "flow-rehire");
    const offboarding = await createOffboarding(fixture).expect(201);
    await endEmployment(fixture);

    const employment1Row = await database.pool.query(
      "SELECT organization_person_id FROM employments WHERE id = $1",
      [fixture.employmentId]
    );
    const organizationPersonId = String(employment1Row.rows[0].organization_person_id);

    const employment2 = await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        organizationPersonId,
        originType: "administrative",
        originReason: "Recontratacao para teste.",
        effectiveStartDate: "2026-08-01"
      })
      .expect(201);

    await request(fixture.app)
      .post(
        `/api/organizations/${fixture.organizationId}/employments/${employment2.body.id}/activate`
      )
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({})
      .expect(200);

    // Offboarding do vinculo antigo permanece exatamente como estava.
    const oldView = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/offboardings/${offboarding.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(oldView.body.employmentId).toBe(fixture.employmentId);
    expect(oldView.body.employmentId).not.toBe(employment2.body.id);

    // um novo Offboarding para Employment 2 e independente, sem herdar tasks.
    const secondFixture = { ...fixture, employmentId: employment2.body.id as string };
    const created2 = await createOffboarding(secondFixture).expect(201);
    const tasks2 = await request(fixture.app)
      .get(`/api/organizations/${fixture.organizationId}/offboardings/${created2.body.id}/tasks`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    expect(tasks2.body).toEqual([]);
  });
});

async function ownerMembershipId(
  fixture: Awaited<ReturnType<typeof createActiveEmploymentFixture>>
) {
  const memberships = await request(fixture.app)
    .get(`/api/organizations/${fixture.organizationId}/memberships`)
    .set(userHeaders(fixture.ownerId))
    .expect(200);
  const owner = memberships.body.find(
    (membership: { userId: string }) => membership.userId === fixture.ownerId
  );
  return owner.id as string;
}
