import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createApp,
  createGlobalInstrument,
  createOrganization,
  createPrivateInstrument,
  createUser,
  platformHeaders,
  registerTestCalculator,
  scaleItem,
  TEST_CALCULATION_VERSION,
  unique,
  userHeaders
} from "./helpers";

describe("Fase 19 - Instrumentos e versoes (SPEC-022, secoes 10-18; Correcao Final do Plano Tecnico)", () => {
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

  it("behavioral_instruments nunca tem coluna methodology_key -- pertence exclusivamente a behavioral_instrument_versions", async () => {
    const columns = await database.pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'behavioral_instruments'"
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain("methodology_key");
    const versionColumns = await database.pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'behavioral_instrument_versions'"
    );
    expect(versionColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["methodology_key", "calculation_method_version"])
    );
  });

  it("Platform Admin cria instrumento global; owner/admin de Organization cria instrumento proprio", async () => {
    const global = await createGlobalInstrument(app, "lc-a");
    const globalRow = await database.pool.query(
      "SELECT scope, organization_id FROM behavioral_instruments WHERE id = $1",
      [global.id]
    );
    expect(globalRow.rows[0].scope).toBe("platform");
    expect(globalRow.rows[0].organization_id).toBeNull();

    const owner = await createUser(app, "owner-lc-a");
    const { organization } = await createOrganization(app, owner.id);
    const own = await createPrivateInstrument(app, organization.id, owner.id, "lc-a");
    const ownRow = await database.pool.query(
      "SELECT scope, organization_id FROM behavioral_instruments WHERE id = $1",
      [own.id]
    );
    expect(ownRow.rows[0].scope).toBe("organization");
    expect(ownRow.rows[0].organization_id).toBe(organization.id);
  });

  it("member nunca cria instrumento (nem proprio nem global) -- somente owner/admin/Platform Admin", async () => {
    const owner = await createUser(app, "owner-lc-b");
    const { organization } = await createOrganization(app, owner.id);
    const member = await createUser(app, "member-lc-b");
    await request(app)
      .post(`/api/organizations/${organization.id}/memberships`)
      .set(userHeaders(owner.id))
      .send({ userId: member.id, role: "member" })
      .expect(201);

    await request(app)
      .post(`/api/organizations/${organization.id}/behavioral-instruments`)
      .set(userHeaders(member.id))
      .send({ name: "Nao deveria existir", description: "" })
      .expect(403);

    await request(app)
      .post("/api/platform/behavioral-instruments")
      .set(userHeaders(owner.id))
      .send({ name: "Nao deveria existir", description: "" })
      .expect(403);
  });

  it("ativacao exige calculador registrado -- sem calculador, activate() falha e a versao permanece draft", async () => {
    const owner = await createUser(app, "owner-lc-c");
    const { organization } = await createOrganization(app, owner.id);
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "lc-c");
    const methodologyKey = unique("unregistered-methodology");

    const draft = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [{ code: "energy", name: "Energia", required: true }],
        items: [scaleItem("energy-1", "energy", 0)]
      })
      .expect(201);
    const versionId = (draft.body.version as { id: string }).id;

    const activation = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${versionId}/activate`
      )
      .set(userHeaders(owner.id))
      .expect(409);
    expect(activation.body.error.code).toBe("behavioral_instrument_version_calculator_missing");

    const row = await database.pool.query(
      "SELECT status FROM behavioral_instrument_versions WHERE id = $1",
      [versionId]
    );
    expect(row.rows[0].status).toBe("draft");
  });

  it("validateVersionManifest e SEMPRE chamado na ativacao (regra vinculante) -- manifesto invalido bloqueia activate()", async () => {
    const owner = await createUser(app, "owner-lc-d");
    const { organization } = await createOrganization(app, owner.id);
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "lc-d");
    const methodologyKey = unique("strict-methodology");
    registerTestCalculator(methodologyKey, TEST_CALCULATION_VERSION);

    // Duas dimensoes no manifesto, mas apenas uma delas tem item mapeado -- o calculador de
    // teste lanca em `validateVersionManifest` exatamente neste caso.
    const draft = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [
          { code: "energy", name: "Energia", required: true },
          { code: "focus", name: "Foco", required: true }
        ],
        items: [scaleItem("energy-1", "energy", 0)]
      })
      .expect(201);
    const versionId = (draft.body.version as { id: string }).id;

    const activation = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${versionId}/activate`
      )
      .set(userHeaders(owner.id))
      .expect(409);
    expect(activation.body.error.code).toBe("behavioral_instrument_version_manifest_invalid");

    const row = await database.pool.query(
      "SELECT status FROM behavioral_instrument_versions WHERE id = $1",
      [versionId]
    );
    expect(row.rows[0].status).toBe("draft");
  });

  it("ciclo completo draft -> active -> archived; versao active/archived se torna imutavel (trigger fisica)", async () => {
    const owner = await createUser(app, "owner-lc-e");
    const { organization } = await createOrganization(app, owner.id);
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "lc-e");
    const methodologyKey = unique("full-cycle-methodology");
    registerTestCalculator(methodologyKey, TEST_CALCULATION_VERSION);

    const draft = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [{ code: "energy", name: "Energia", required: true }],
        items: [scaleItem("energy-1", "energy", 0)]
      })
      .expect(201);
    const versionId = (draft.body.version as { id: string }).id;

    await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${versionId}/activate`
      )
      .set(userHeaders(owner.id))
      .expect(200);

    const activeRow = await database.pool.query(
      "SELECT status, published_at FROM behavioral_instrument_versions WHERE id = $1",
      [versionId]
    );
    expect(activeRow.rows[0].status).toBe("active");
    expect(activeRow.rows[0].published_at).not.toBeNull();

    // Trigger fisica: nenhuma mutacao direta em uma versao active alem de status->archived.
    await expect(
      database.pool.query(
        "UPDATE behavioral_instrument_versions SET methodology_key = 'hacked' WHERE id = $1",
        [versionId]
      )
    ).rejects.toThrow();

    await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions/${versionId}/archive`
      )
      .set(userHeaders(owner.id))
      .expect(200);

    const archivedRow = await database.pool.query(
      "SELECT status, archived_at FROM behavioral_instrument_versions WHERE id = $1",
      [versionId]
    );
    expect(archivedRow.rows[0].status).toBe("archived");
    expect(archivedRow.rows[0].archived_at).not.toBeNull();

    // Trigger fisica: versao archived nunca aceita nenhuma mutacao, nem status.
    await expect(
      database.pool.query(
        "UPDATE behavioral_instrument_versions SET status = 'draft' WHERE id = $1",
        [versionId]
      )
    ).rejects.toThrow();

    // Trigger fisica: nenhuma versao (em qualquer status) pode ser deletada.
    await expect(
      database.pool.query("DELETE FROM behavioral_instrument_versions WHERE id = $1", [versionId])
    ).rejects.toThrow();
  });

  it("apenas um rascunho por instrumento -- segunda tentativa de criar versao draft e bloqueada", async () => {
    const owner = await createUser(app, "owner-lc-f");
    const { organization } = await createOrganization(app, owner.id);
    const instrument = await createPrivateInstrument(app, organization.id, owner.id, "lc-f");
    const methodologyKey = unique("draft-conflict-methodology");

    await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [{ code: "energy", name: "Energia", required: true }],
        items: [scaleItem("energy-1", "energy", 0)]
      })
      .expect(201);

    const conflict = await request(app)
      .post(
        `/api/organizations/${organization.id}/behavioral-instruments/${instrument.id}/versions`
      )
      .set(userHeaders(owner.id))
      .send({
        methodologyKey,
        calculationMethodVersion: TEST_CALCULATION_VERSION,
        dimensions: [{ code: "energy", name: "Energia", required: true }],
        items: [scaleItem("energy-1", "energy", 0)]
      })
      .expect(409);
    expect(conflict.body.error.code).toBe("behavioral_instrument_version_draft_exists");
  });

  it("defesa fisica (FK discriminadora): organization_behavioral_instrument_settings nunca referencia instrumento privado", async () => {
    const owner = await createUser(app, "owner-lc-g");
    const { organization } = await createOrganization(app, owner.id);
    const privateInstrument = await createPrivateInstrument(app, organization.id, owner.id, "lc-g");

    // A propria Service ja bloqueia isso em nivel de aplicacao (nunca encontra o instrumento
    // privado de OUTRA organizacao como candidato a habilitacao) -- mas o teste decisivo e a
    // tentativa de INSERT direto no banco, forjando scope='platform' incoerente com o
    // instrumento real (scope='organization'), que deve ser fisicamente rejeitada pela FK
    // composta (id, scope) -> behavioral_instruments(id, scope).
    await expect(
      database.pool.query(
        `INSERT INTO organization_behavioral_instrument_settings
           (id, organization_id, behavioral_instrument_id, behavioral_instrument_scope, enabled, created_by_user_id, updated_by_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'platform', true, $4, $4, now(), now())`,
        [`obis_${crypto.randomUUID()}`, organization.id, privateInstrument.id, owner.id]
      )
    ).rejects.toThrow();

    // Pela API: tentar habilitar o proprio instrumento privado como se fosse global retorna
    // 404 generico (o Service nunca confirma nem nega a existencia de um instrumento fora do
    // catalogo global).
    await request(app)
      .put(
        `/api/organizations/${organization.id}/behavioral-instrument-settings/${privateInstrument.id}`
      )
      .set(userHeaders(owner.id))
      .send({ enabled: true })
      .expect(404);
  });

  it("catalogo global e disponibilidade por Organization: habilitar/desabilitar altera o catalogo disponivel", async () => {
    const global = await createGlobalInstrument(app, "lc-h");
    const owner = await createUser(app, "owner-lc-h");
    const { organization } = await createOrganization(app, owner.id);

    const catalogBefore = await request(app)
      .get(`/api/organizations/${organization.id}/behavioral-instruments`)
      .set(userHeaders(owner.id))
      .expect(200);
    expect((catalogBefore.body as Array<{ id: string }>).some((i) => i.id === global.id)).toBe(
      false
    );

    await request(app)
      .put(`/api/organizations/${organization.id}/behavioral-instrument-settings/${global.id}`)
      .set(userHeaders(owner.id))
      .send({ enabled: true })
      .expect(200);

    const catalogAfter = await request(app)
      .get(`/api/organizations/${organization.id}/behavioral-instruments`)
      .set(userHeaders(owner.id))
      .expect(200);
    expect((catalogAfter.body as Array<{ id: string }>).some((i) => i.id === global.id)).toBe(true);
  });

  it("isolamento entre Organizations: instrumento proprio de A e invisivel para B (404 generico, nunca 403)", async () => {
    const ownerA = await createUser(app, "owner-lc-i-a");
    const { organization: orgA } = await createOrganization(app, ownerA.id);
    const instrumentA = await createPrivateInstrument(app, orgA.id, ownerA.id, "lc-i-a");

    const ownerB = await createUser(app, "owner-lc-i-b");
    const { organization: orgB } = await createOrganization(app, ownerB.id);

    const response = await request(app)
      .get(`/api/organizations/${orgB.id}/behavioral-instruments/${instrumentA.id}`)
      .set(userHeaders(ownerB.id))
      .expect(404);
    expect(response.body.error.code).toBe("behavioral_instrument_not_found");
  });

  it("Platform Admin (adminHeaders) nunca e tratado como owner/admin de uma Organization ao tentar criar instrumento proprio", async () => {
    const owner = await createUser(app, "owner-lc-j");
    const { organization } = await createOrganization(app, owner.id);
    await request(app)
      .post(`/api/organizations/${organization.id}/behavioral-instruments`)
      .set(platformHeaders)
      .send({ name: "Instrumento via platform actor", description: "" })
      .expect(403);
  });
});
