import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addPublicJobOpeningToOrganization,
  applicationPayload,
  createApp,
  createPublicJobOpeningFixture,
  submitApplication,
  userHeaders
} from "./helpers";

// Testes adicionados pela Revisao Final Destrutiva da Fase 17: fingerprint canonico,
// concorrencia real (23505 em transacao abortada, chaves diferentes), rollback provado por
// injecao de falha, reaplicacao concorrente apos withdrawn, enumeracao (codigos identicos),
// Idempotency-Key invalida, mass assignment aninhado, e reuso de consentimento.
describe("Fase 17 - Candidatura Publica - revisao destrutiva final", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  describe("fingerprint canonico (itens 6/7/8)", () => {
    it("mesma chave + payload com ordem de propriedades diferente (location) e tratado como o mesmo fingerprint (replay)", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "fp-order");
      const key = crypto.randomUUID();
      const email = `${crypto.randomUUID()}@example.com`;

      const first = await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ email, location: { city: "Sao Paulo", state: "SP" } }),
        key
      ).expect(201);

      const second = await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ email, location: { state: "SP", city: "Sao Paulo" } }),
        key
      ).expect(201);

      expect(second.body.submissionId).toBe(first.body.submissionId);
      const applications = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
        [fixture.organizationId]
      );
      expect(applications.rows[0].count).toBe(1);
    });

    it("mesma chave + e-mail com case/espacos diferentes mas normalizado igual e tratado como replay", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "fp-email-norm");
      const key = crypto.randomUUID();
      const rawEmail = `Fingerprint.${crypto.randomUUID()}@Example.com`;

      const first = await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ email: `  ${rawEmail}  ` }),
        key
      ).expect(201);
      const second = await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ email: rawEmail.toLowerCase() }),
        key
      ).expect(201);

      expect(second.body.submissionId).toBe(first.body.submissionId);
    });

    it("mesma chave + fullName diferente => conflito seguro (409), nenhuma nova submissao", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "fp-name");
      const key = crypto.randomUUID();
      await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ fullName: "Ana Silva" }),
        key
      ).expect(201);
      const conflicting = await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ fullName: "Ana Maria Silva" }),
        key
      );
      expect(conflicting.status).toBe(409);
    });

    it("mesma chave + telefone diferente => conflito seguro (409)", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "fp-phone");
      const key = crypto.randomUUID();
      await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ phone: "+55 11 90000-0001" }),
        key
      ).expect(201);
      const conflicting = await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ phone: "+55 11 90000-0002" }),
        key
      );
      expect(conflicting.status).toBe(409);
    });

    it("mesma chave + consent.granted diferente => conflito seguro (409)", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "fp-consent");
      const key = crypto.randomUUID();
      const email = `${crypto.randomUUID()}@example.com`;
      await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ email, consent: { granted: true, termsVersion: "1.0" } }),
        key
      ).expect(201);
      const conflicting = await submitApplication(
        app,
        fixture.slug,
        applicationPayload({ email, consent: { granted: false, termsVersion: "1.0" } }),
        key
      );
      // granted:false tambem seria recusado por falta de consentimento (400), mas nunca deve
      // ser tratado como o MESMO fingerprint da tentativa anterior.
      expect(conflicting.status).not.toBe(201);
    });
  });

  describe("concorrencia real (itens 11/12/15)", () => {
    it("duas Idempotency-Key diferentes, mesmo e-mail NOVO, mesma Vaga, verdadeiramente concorrentes: exatamente um Candidate e uma CandidateApplication active", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "concurrent-new-candidate");
      const email = `${crypto.randomUUID()}@example.com`;
      const payload = applicationPayload({ email });

      const [first, second] = await Promise.all([
        submitApplication(app, fixture.slug, payload, crypto.randomUUID()),
        submitApplication(app, fixture.slug, payload, crypto.randomUUID())
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
      expect(statuses).toContain(201);

      const candidates = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
        [fixture.organizationId, email.toLowerCase()]
      );
      expect(candidates.rows[0].count).toBe(1);

      const applications = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1 AND application_status = 'active'",
        [fixture.organizationId]
      );
      expect(applications.rows[0].count).toBe(1);
    });

    it("reaplicacao concorrente apos withdrawn: apenas uma nova active, historico withdrawn intacto", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "concurrent-withdrawn");
      const email = `${crypto.randomUUID()}@example.com`;
      await submitApplication(app, fixture.slug, applicationPayload({ email })).expect(201);
      const originalRow = await database.pool.query(
        "SELECT id FROM candidate_applications WHERE organization_id = $1",
        [fixture.organizationId]
      );
      const originalId = originalRow.rows[0].id as string;
      await request(app)
        .post(
          `/api/organizations/${fixture.organizationId}/candidate-applications/${originalId}/withdraw`
        )
        .set(userHeaders(fixture.ownerId))
        .send({ reason: "Candidato desistiu." })
        .expect(200);

      const [first, second] = await Promise.all([
        submitApplication(app, fixture.slug, applicationPayload({ email }), crypto.randomUUID()),
        submitApplication(app, fixture.slug, applicationPayload({ email }), crypto.randomUUID())
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
      expect(statuses).toContain(201);

      const allApplications = await database.pool.query(
        "SELECT id, application_status FROM candidate_applications WHERE organization_id = $1 ORDER BY applied_at",
        [fixture.organizationId]
      );
      expect(allApplications.rows).toHaveLength(2);
      expect(allApplications.rows[0].id).toBe(originalId);
      expect(allApplications.rows[0].application_status).toBe("withdrawn");
      const activeCount = allApplications.rows.filter(
        (row: { application_status: string }) => row.application_status === "active"
      ).length;
      expect(activeCount).toBe(1);
    });
  });

  describe("rollback real via injecao de falha (itens 13/14/32)", () => {
    it("Candidate novo: falha apos Candidate+Consent escritos reverte TUDO (Candidate, Consent, CandidateApplication, submission)", async () => {
      const localApp = createApp(database, {
        afterCandidateAndConsent: () => {
          throw new Error("falha deliberada para teste de rollback");
        }
      });
      // A Organization/Vaga sao criadas via `app` (servidor normal); a submissao em si e
      // feita via `localApp` (mesmo pool/schema, servidor diferente apenas para injetar o
      // hook de falha na transacao da submissao).
      const fixture = await createPublicJobOpeningFixture(app, "rollback-new");
      const email = `${crypto.randomUUID()}@example.com`;

      const response = await submitApplication(
        localApp,
        fixture.slug,
        applicationPayload({ email })
      );
      expect(response.status).toBe(500);

      const candidates = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
        [fixture.organizationId, email.toLowerCase()]
      );
      expect(candidates.rows[0].count).toBe(0);

      const applications = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1",
        [fixture.organizationId]
      );
      expect(applications.rows[0].count).toBe(0);

      const submissions = await database.pool.query(
        "SELECT status FROM public_application_submissions WHERE organization_id = $1",
        [fixture.organizationId]
      );
      expect(submissions.rows).toHaveLength(1);
      expect(submissions.rows[0].status).toBe("failed");
    });

    it("Candidate existente: falha apos Consent escrito preserva o Candidate historico intacto e nao cria Consent/CandidateApplication novos", async () => {
      const fixtureNormal = await createPublicJobOpeningFixture(app, "rollback-existing-a");
      const email = `${crypto.randomUUID()}@example.com`;
      await submitApplication(app, fixtureNormal.slug, applicationPayload({ email })).expect(201);

      const candidateBefore = await database.pool.query(
        "SELECT * FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
        [fixtureNormal.organizationId, email.toLowerCase()]
      );
      expect(candidateBefore.rows).toHaveLength(1);
      const consentsBefore = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidate_consents WHERE candidate_id = $1",
        [candidateBefore.rows[0].id]
      );

      const localApp = createApp(database, {
        afterCandidateAndConsent: () => {
          throw new Error("falha deliberada para teste de rollback (candidate existente)");
        }
      });
      const { slug: secondSlug } = await addPublicJobOpeningToOrganization(
        app,
        fixtureNormal.organizationId,
        fixtureNormal.ownerId,
        "rollback-existing-b"
      );

      const response = await submitApplication(localApp, secondSlug, applicationPayload({ email }));
      expect(response.status).toBe(500);

      const candidateAfter = await database.pool.query("SELECT * FROM candidates WHERE id = $1", [
        candidateBefore.rows[0].id
      ]);
      expect(candidateAfter.rows[0].full_name).toBe(candidateBefore.rows[0].full_name);
      expect(candidateAfter.rows[0].status).toBe("active");

      const consentsAfter = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidate_consents WHERE candidate_id = $1",
        [candidateBefore.rows[0].id]
      );
      expect(consentsAfter.rows[0].count).toBe(consentsBefore.rows[0].count);

      const applications = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidate_applications WHERE organization_id = $1 AND candidate_id = $2",
        [fixtureNormal.organizationId, candidateBefore.rows[0].id]
      );
      // Apenas a candidatura original (da primeira vaga) deve existir -- nenhuma nova.
      expect(applications.rows[0].count).toBe(1);
    });
  });

  describe("enumeracao (itens 21/22)", () => {
    it("Candidate inativo e reaplicacao apos hired produzem exatamente o mesmo codigo/mensagem publicos", async () => {
      const inactiveFixture = await createPublicJobOpeningFixture(app, "enum-inactive");
      const inactivePayload = applicationPayload();
      await submitApplication(app, inactiveFixture.slug, inactivePayload).expect(201);
      const candidateRow = await database.pool.query(
        "SELECT id FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
        [inactiveFixture.organizationId, String(inactivePayload.email).toLowerCase()]
      );
      await request(app)
        .post(
          `/api/organizations/${inactiveFixture.organizationId}/candidates/${candidateRow.rows[0].id}/inactivate`
        )
        .set(userHeaders(inactiveFixture.ownerId))
        .expect(200);
      const inactiveResponse = await submitApplication(
        app,
        inactiveFixture.slug,
        applicationPayload({ email: inactivePayload.email })
      );

      const hiredFixture = await createPublicJobOpeningFixture(app, "enum-hired");
      const hiredPayload = applicationPayload();
      await submitApplication(app, hiredFixture.slug, hiredPayload).expect(201);
      const hiredAppRow = await database.pool.query(
        "SELECT id FROM candidate_applications WHERE organization_id = $1",
        [hiredFixture.organizationId]
      );
      await request(app)
        .post(
          `/api/organizations/${hiredFixture.organizationId}/candidate-applications/${hiredAppRow.rows[0].id}/hire`
        )
        .set(userHeaders(hiredFixture.ownerId))
        .send({ reason: "Aprovado." })
        .expect(200);
      const hiredResponse = await submitApplication(
        app,
        hiredFixture.slug,
        applicationPayload({ email: hiredPayload.email })
      );

      expect(inactiveResponse.status).toBe(hiredResponse.status);
      expect(inactiveResponse.body.error.code).toBe(hiredResponse.body.error.code);
      expect(inactiveResponse.body.error.message).toBe(hiredResponse.body.error.message);
    });

    it("submissionId e um identificador opaco (UUID-like), nunca um ID interno previsivel", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "enum-submission-id");
      const response = await submitApplication(app, fixture.slug, applicationPayload()).expect(201);
      expect(response.body.submissionId).toMatch(/^pasub_[0-9a-f-]{36}$/);
      expect(JSON.stringify(response.body)).not.toMatch(/cand_|capp_|ccon_|org_/);
    });
  });

  describe("Idempotency-Key invalida (item 23)", () => {
    it("recusa chave muito longa (> 200 caracteres)", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "key-too-long");
      const response = await submitApplication(
        app,
        fixture.slug,
        applicationPayload(),
        "a".repeat(201)
      );
      expect(response.status).toBe(400);
    });

    it("recusa chave com caracteres invalidos (espacos)", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "key-invalid-chars");
      const response = await submitApplication(
        app,
        fixture.slug,
        applicationPayload(),
        "chave com espacos invalida"
      );
      expect(response.status).toBe(400);
    });

    it("aceita chave normal dentro dos limites", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "key-valid");
      const response = await submitApplication(
        app,
        fixture.slug,
        applicationPayload(),
        crypto.randomUUID()
      );
      expect(response.status).toBe(201);
    });
  });

  describe("mass assignment aninhado (item 35)", () => {
    it("ignora campos aninhados protegidos em consent e location", async () => {
      const fixture = await createPublicJobOpeningFixture(app, "nested-mass-assignment");
      const email = `${crypto.randomUUID()}@example.com`;
      const response = await submitApplication(app, fixture.slug, {
        fullName: "Nested Test",
        email,
        consent: {
          granted: true,
          termsVersion: "1.0",
          status: "revoked",
          createdByUserId: "usr_forged",
          source: "manual",
          revokedAt: "2020-01-01T00:00:00.000Z"
        },
        location: {
          city: "Rio de Janeiro",
          state: "RJ",
          organizationId: "org_forged",
          createdByUserId: "usr_forged"
        }
      }).expect(201);
      void response;

      const consentRow = await database.pool.query(
        `SELECT cc.* FROM candidate_consents cc
         JOIN candidates c ON c.id = cc.candidate_id
         WHERE c.organization_id = $1 AND c.normalized_email = $2`,
        [fixture.organizationId, email.toLowerCase()]
      );
      expect(consentRow.rows).toHaveLength(1);
      expect(consentRow.rows[0].status).toBe("granted");
      expect(consentRow.rows[0].source).toBe("public_application");
      expect(consentRow.rows[0].created_by_user_id).toBeNull();
      expect(consentRow.rows[0].revoked_at).toBeNull();

      const candidateRow = await database.pool.query(
        "SELECT location FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
        [fixture.organizationId, email.toLowerCase()]
      );
      expect(candidateRow.rows[0].location).not.toHaveProperty("organizationId");
      expect(candidateRow.rows[0].location).not.toHaveProperty("createdByUserId");
      expect(candidateRow.rows[0].location.city).toBe("Rio de Janeiro");
    });
  });

  describe("reuso de consentimento (item 31)", () => {
    it("Candidate existente com consentimento granted valido reutiliza o registro, sem duplicar", async () => {
      const fixtureA = await createPublicJobOpeningFixture(app, "consent-reuse-a");
      const email = `${crypto.randomUUID()}@example.com`;
      await submitApplication(app, fixtureA.slug, applicationPayload({ email })).expect(201);

      const candidateRow = await database.pool.query(
        "SELECT id FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
        [fixtureA.organizationId, email.toLowerCase()]
      );
      const consentsBefore = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidate_consents WHERE candidate_id = $1",
        [candidateRow.rows[0].id]
      );
      expect(consentsBefore.rows[0].count).toBe(1);

      const { slug: secondSlug } = await addPublicJobOpeningToOrganization(
        app,
        fixtureA.organizationId,
        fixtureA.ownerId,
        "consent-reuse-b"
      );
      await submitApplication(app, secondSlug, applicationPayload({ email })).expect(201);

      const consentsAfter = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidate_consents WHERE candidate_id = $1",
        [candidateRow.rows[0].id]
      );
      expect(consentsAfter.rows[0].count).toBe(1);
    });

    it("Candidate existente com consentimento revogado gera uma nova manifestacao (novo registro)", async () => {
      const fixtureA = await createPublicJobOpeningFixture(app, "consent-revoked-a");
      const email = `${crypto.randomUUID()}@example.com`;
      await submitApplication(app, fixtureA.slug, applicationPayload({ email })).expect(201);

      const candidateRow = await database.pool.query(
        "SELECT id FROM candidates WHERE organization_id = $1 AND normalized_email = $2",
        [fixtureA.organizationId, email.toLowerCase()]
      );
      await request(app)
        .post(
          `/api/organizations/${fixtureA.organizationId}/candidates/${candidateRow.rows[0].id}/consents/revoke`
        )
        .set(userHeaders(fixtureA.ownerId))
        .expect(201);

      const { slug: secondSlug } = await addPublicJobOpeningToOrganization(
        app,
        fixtureA.organizationId,
        fixtureA.ownerId,
        "consent-revoked-b"
      );
      await submitApplication(app, secondSlug, applicationPayload({ email })).expect(201);

      const consentsAfter = await database.pool.query(
        "SELECT status FROM candidate_consents WHERE candidate_id = $1 ORDER BY consent_at DESC, created_at DESC LIMIT 1",
        [candidateRow.rows[0].id]
      );
      expect(consentsAfter.rows[0].status).toBe("granted");
      const totalConsents = await database.pool.query(
        "SELECT COUNT(*)::int AS count FROM candidate_consents WHERE candidate_id = $1",
        [candidateRow.rows[0].id]
      );
      // 1) granted original (primeira submissao publica); 2) revoked (acao interna); 3) nova
      // manifestacao granted (segunda submissao publica, apos a revogacao).
      expect(totalConsents.rows[0].count).toBe(3);
    });
  });
});
