import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createActiveApplicationFixture,
  createHiredFixture,
  createRecruitmentEmployment,
  employmentAction,
  userHeaders
} from "./helpers";

describe("Fase 24 - cenarios destrutivos de runtime", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("create Employment x create Employment nunca gera dois vinculos nao finais", async () => {
    const fixture = await createHiredFixture(database, "race-create");
    const responses = await Promise.all([
      createRecruitmentEmployment(fixture, `race-a-${crypto.randomUUID()}`),
      createRecruitmentEmployment(fixture, `race-b-${crypto.randomUUID()}`)
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    const count = await database.pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM employments
        WHERE organization_id = $1 AND status IN ('pending', 'active')
      `,
      [fixture.organizationId]
    );
    expect(count.rows[0].count).toBe(1);

    // SPEC-025 s25 (eventos minimos): a corrida real (INSERT colidindo com
    // idx_employments_one_non_final) deve ser auditada como
    // employment.concurrent_operation_conflict, nao apenas silenciosamente convertida em 409.
    const auditEvents = await database.pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE organization_id = $1 AND action = 'employment.concurrent_operation_conflict'
      `,
      [fixture.organizationId]
    );
    expect(auditEvents.rows[0].count).toBeGreaterThanOrEqual(1);
  });

  it("activate x activate, activate x cancel e end x end retornam conflito seguro sem 500", async () => {
    const activate = await createHiredFixture(database, "race-activate");
    const activationTarget = await createRecruitmentEmployment(activate).expect(201);
    const activateResponses = await Promise.all([
      employmentAction(
        activate,
        activationTarget.body.id,
        "activate",
        `act-a-${crypto.randomUUID()}`
      ),
      employmentAction(
        activate,
        activationTarget.body.id,
        "activate",
        `act-b-${crypto.randomUUID()}`
      )
    ]);
    expect(activateResponses.map((response) => response.status).sort()).toEqual([200, 409]);

    const activateCancel = await createHiredFixture(database, "race-activate-cancel");
    const activateCancelTarget = await createRecruitmentEmployment(activateCancel).expect(201);
    const activateCancelResponses = await Promise.all([
      employmentAction(
        activateCancel,
        activateCancelTarget.body.id,
        "activate",
        `act-c-${crypto.randomUUID()}`
      ),
      employmentAction(
        activateCancel,
        activateCancelTarget.body.id,
        "cancel",
        `can-c-${crypto.randomUUID()}`,
        {
          reason: "Cancelamento concorrente."
        }
      )
    ]);
    expect(activateCancelResponses.map((response) => response.status).sort()).toEqual([200, 409]);

    const end = await createHiredFixture(database, "race-end");
    const endTarget = await createRecruitmentEmployment(end).expect(201);
    await employmentAction(end, endTarget.body.id, "activate").expect(200);
    const endResponses = await Promise.all([
      employmentAction(end, endTarget.body.id, "end", `end-a-${crypto.randomUUID()}`, {
        endDate: "2026-10-01",
        reason: "Encerramento concorrente A."
      }),
      employmentAction(end, endTarget.body.id, "end", `end-b-${crypto.randomUUID()}`, {
        endDate: "2026-10-01",
        reason: "Encerramento concorrente B."
      })
    ]);
    expect(endResponses.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it("rehire x end preserva historico e nunca deixa mais de um nao-final", async () => {
    const fixture = await createHiredFixture(database, "race-rehire-end");
    const active = await createRecruitmentEmployment(fixture).expect(201);
    await employmentAction(fixture, active.body.id, "activate").expect(200);

    const [endResponse, rehireResponse] = await Promise.all([
      employmentAction(fixture, active.body.id, "end", `rehire-end-${crypto.randomUUID()}`, {
        endDate: "2026-10-01",
        reason: "Encerrar para recontratacao."
      }),
      createRecruitmentEmployment(fixture, `rehire-create-${crypto.randomUUID()}`, {
        effectiveStartDate: "2026-11-01"
      })
    ]);
    expect([200, 409]).toContain(endResponse.status);
    expect([201, 409]).toContain(rehireResponse.status);

    const nonFinal = await database.pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM employments
        WHERE organization_id = $1 AND status IN ('pending', 'active')
      `,
      [fixture.organizationId]
    );
    expect(nonFinal.rows[0].count).toBeLessThanOrEqual(1);
  });

  it("Proposal accepted coerente permite Employment e Proposal invalida bloqueia", async () => {
    const accepted = await createAcceptedProposalFixture(database, "proposal-accepted");
    await request(accepted.app)
      .post(
        `/api/organizations/${accepted.organizationId}/candidate-applications/${accepted.applicationId}/hire`
      )
      .set(userHeaders(accepted.ownerId))
      .send({ reason: "Aceite recebido.", proposalVersionId: accepted.proposalVersionId })
      .expect(200);
    await createRecruitmentEmployment(accepted, crypto.randomUUID(), {
      proposalVersionId: accepted.proposalVersionId
    }).expect(201);

    const other = await createAcceptedProposalFixture(database, "proposal-other");
    const target = await createHiredFixture(database, "proposal-invalid-target");
    await createRecruitmentEmployment(target, crypto.randomUUID(), {
      proposalVersionId: other.proposalVersionId
    }).expect(409);
  });

  it("falha de auditoria critica faz rollback de pessoa/vinculo e nao marca idempotencia completed", async () => {
    const fixture = await createHiredFixture(database, "audit-rollback");
    const key = `audit-fail-${crypto.randomUUID()}`;
    await database.pool.query(`
      CREATE OR REPLACE FUNCTION fail_employment_created_audit()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.action = 'employment.created' THEN
          RAISE EXCEPTION 'simulated_audit_failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await database.pool.query(`
      CREATE TRIGGER trg_fail_employment_created_audit
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_employment_created_audit();
    `);
    try {
      await createRecruitmentEmployment(fixture, key).expect(500);
    } finally {
      await database.pool.query(
        "DROP TRIGGER IF EXISTS trg_fail_employment_created_audit ON audit_events"
      );
    }

    const counts = await database.pool.query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM organization_people WHERE organization_id = $1) AS people,
          (SELECT COUNT(*)::int FROM employments WHERE organization_id = $1) AS employments,
          (SELECT status FROM employment_idempotency_keys WHERE organization_id = $1 LIMIT 1) AS idem_status
      `,
      [fixture.organizationId]
    );
    expect(counts.rows[0].people).toBe(0);
    expect(counts.rows[0].employments).toBe(0);
    expect(counts.rows[0].idem_status).toBe("failed");
  });

  it("bloqueia mass assignment e FK fisica cross-tenant", async () => {
    const fixture = await createHiredFixture(database, "mass-assignment");
    await request(fixture.app)
      .post(`/api/organizations/${fixture.organizationId}/employments`)
      .set(userHeaders(fixture.ownerId))
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        originType: "recruitment",
        candidateApplicationId: fixture.applicationId,
        effectiveStartDate: "2026-09-01",
        originReason: "Tentativa com campos protegidos.",
        status: "active",
        organizationId: "org_forged",
        createdByUserId: "usr_forged"
      })
      .expect(400);

    const other = await createHiredFixture(database, "physical-cross-tenant");
    const otherEmployment = await createRecruitmentEmployment(other).expect(201);
    await expect(
      database.pool.query(
        `
          INSERT INTO employments (
            id, organization_id, organization_person_id, status, origin_type, origin_reason,
            effective_start_date, created_by_user_id
          )
          VALUES ($1, $2, $3, 'pending', 'administrative', 'cross tenant bruto', '2026-09-01', $4)
        `,
        [
          `empl_${crypto.randomUUID()}`,
          fixture.organizationId,
          otherEmployment.body.organizationPersonId,
          fixture.ownerId
        ]
      )
    ).rejects.toThrow();
  });

  it("Employment ended nao desativa Membership", async () => {
    const fixture = await createHiredFixture(database, "membership-unchanged");
    const member = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "membership-unchanged"
    );
    const employment = await createRecruitmentEmployment(fixture).expect(201);
    await employmentAction(fixture, employment.body.id, "activate").expect(200);
    await employmentAction(fixture, employment.body.id, "end", crypto.randomUUID(), {
      endDate: "2026-10-01",
      reason: "Encerramento nao altera acesso."
    }).expect(200);

    const membership = await database.pool.query("SELECT status FROM memberships WHERE id = $1", [
      member.membershipId
    ]);
    expect(membership.rows[0].status).toBe("active");
  });
});

type AcceptedProposalFixture = Awaited<ReturnType<typeof createActiveApplicationFixture>> & {
  proposalVersionId: string;
};

async function createAcceptedProposalFixture(
  database: PostgresTestDatabase,
  suffix: string
): Promise<AcceptedProposalFixture> {
  const fixture = await createActiveApplicationFixture(database, suffix);
  const draft = await request(fixture.app)
    .post(
      `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/draft`
    )
    .set(userHeaders(fixture.ownerId))
    .send({
      contentSnapshot: { text: "Oferta operacional para Employment." },
      compensationSnapshot: { salary: 1000, currency: "BRL", periodicity: "monthly" },
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })
    .expect(201);
  const proposalVersionId = draft.body.currentVersion.id as string;
  const issued = await request(fixture.app)
    .post(
      `/api/organizations/${fixture.organizationId}/candidate-applications/${fixture.applicationId}/proposals/issue`
    )
    .set(userHeaders(fixture.ownerId))
    .set("Idempotency-Key", `issue-${crypto.randomUUID()}`)
    .send({ proposalVersionId, stageChangeReason: "Mover para proposta." })
    .expect(201);
  await request(fixture.app)
    .post("/api/public/proposals/accept")
    .set({ Authorization: `Proposal ${issued.body.rawAccessToken}` })
    .send({})
    .expect(200);
  return { ...fixture, proposalVersionId };
}
