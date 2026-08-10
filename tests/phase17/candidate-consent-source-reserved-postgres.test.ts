import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  applicationPayload,
  createApp,
  createOrganization,
  createPublicJobOpeningFixture,
  createUser,
  submitApplication,
  userHeaders
} from "./helpers";

// Correcao pontual (revisao final da Fase 17): `candidate_consents.source = "public_application"`
// e reservado exclusivamente ao fluxo publico (SPEC-011 v1.2, RN-061 a RN-065). O fluxo interno
// precisa recusar esse valor na camada de aplicacao, nao apenas confiar na constraint fisica de
// `0018` (que nao foi alterada nesta correcao).
describe("Fase 17 - correcao pontual - source reservado do CandidateConsent", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  function candidatePayload(email: string) {
    return {
      fullName: "Ana Candidate",
      email,
      source: "manual",
      consent: {
        status: "granted",
        source: "manual",
        termsVersion: "v1",
        purpose: "Recruiting"
      }
    };
  }

  it("recusa User interno criando Candidate com consent.source = public_application", async () => {
    const owner = await createUser(app, "owner-reserved-create");
    const { organization } = await createOrganization(app, owner.id);
    const response = await request(app)
      .post(`/api/organizations/${organization.id}/candidates`)
      .set(userHeaders(owner.id))
      .send({
        fullName: "Ana Candidate",
        email: `${crypto.randomUUID()}@example.com`,
        source: "manual",
        consent: {
          status: "granted",
          source: "public_application",
          termsVersion: "v1",
          purpose: "Recruiting"
        }
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("candidate_consent_source_reserved");

    const count = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidates WHERE organization_id = $1",
      [organization.id]
    );
    expect(count.rows[0].count).toBe(0);
  });

  it("recusa User interno registrando novo Consent com source = public_application em Candidate existente", async () => {
    const owner = await createUser(app, "owner-reserved-addconsent");
    const { organization } = await createOrganization(app, owner.id);
    const email = `${crypto.randomUUID()}@example.com`;
    const created = await request(app)
      .post(`/api/organizations/${organization.id}/candidates`)
      .set(userHeaders(owner.id))
      .send(candidatePayload(email))
      .expect(201);

    const consentCountBefore = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_consents WHERE candidate_id = $1",
      [created.body.id]
    );

    const response = await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/consents`)
      .set(userHeaders(owner.id))
      .send({
        status: "granted",
        source: "public_application",
        termsVersion: "v1",
        purpose: "Recruiting"
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("candidate_consent_source_reserved");

    const consentCountAfter = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM candidate_consents WHERE candidate_id = $1",
      [created.body.id]
    );
    expect(consentCountAfter.rows[0].count).toBe(consentCountBefore.rows[0].count);
  });

  it("consent interno com source permitido continua funcionando normalmente (created_by_user_id preenchido)", async () => {
    const owner = await createUser(app, "owner-reserved-ok");
    const { organization } = await createOrganization(app, owner.id);
    const email = `${crypto.randomUUID()}@example.com`;
    const created = await request(app)
      .post(`/api/organizations/${organization.id}/candidates`)
      .set(userHeaders(owner.id))
      .send(candidatePayload(email))
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${created.body.id}/consents`)
      .set(userHeaders(owner.id))
      .send({
        status: "granted",
        source: "manual",
        termsVersion: "v2",
        purpose: "Recruiting update"
      })
      .expect(201);

    const consents = await database.pool.query(
      "SELECT source, created_by_user_id FROM candidate_consents WHERE candidate_id = $1 ORDER BY created_at DESC LIMIT 1",
      [created.body.id]
    );
    expect(consents.rows[0].source).toBe("manual");
    expect(consents.rows[0].created_by_user_id).toBe(owner.id);
  });

  it("fluxo publico continua gravando source = public_application com created_by_user_id nulo", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "reserved-public-ok");
    const payload = applicationPayload();
    await submitApplication(app, fixture.slug, payload).expect(201);

    const consent = await database.pool.query(
      `SELECT cc.source, cc.created_by_user_id FROM candidate_consents cc
       JOIN candidates c ON c.id = cc.candidate_id
       WHERE c.organization_id = $1 AND c.normalized_email = $2`,
      [fixture.organizationId, String(payload.email).toLowerCase()]
    );
    expect(consent.rows).toHaveLength(1);
    expect(consent.rows[0].source).toBe("public_application");
    expect(consent.rows[0].created_by_user_id).toBeNull();
  });

  it("cliente publico tentando sobrescrever consent.source no body nunca altera o valor persistido", async () => {
    const fixture = await createPublicJobOpeningFixture(app, "reserved-public-mass-assignment");
    const email = `${crypto.randomUUID()}@example.com`;
    const response = await submitApplication(app, fixture.slug, {
      fullName: "Forged Source",
      email,
      consent: { granted: true, termsVersion: "1.0", source: "manual" }
    }).expect(201);
    void response;

    const consent = await database.pool.query(
      `SELECT cc.source FROM candidate_consents cc
       JOIN candidates c ON c.id = cc.candidate_id
       WHERE c.organization_id = $1 AND c.normalized_email = $2`,
      [fixture.organizationId, email.toLowerCase()]
    );
    expect(consent.rows[0].source).toBe("public_application");
  });
});
