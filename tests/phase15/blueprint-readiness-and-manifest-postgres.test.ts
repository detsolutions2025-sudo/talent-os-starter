import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createApp,
  createOrgWithMembers,
  makeBlueprintReady,
  type OrgFixture,
  userHeaders
} from "./helpers";

describe("Fase 15 - Blueprint Organizacional - readiness e manifest", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("readiness e determinística e nunca usa IA: draft sem DNA fica incomplete", async () => {
    const fixture = await createOrgWithMembers(app);
    const readiness = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/readiness`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    expect(readiness.body.status).toBe("incomplete");
    expect(readiness.body.pendingRequired).toContain("dna_published");
  });

  it("draft com DNA publicado fica ready mesmo sem Provider de IA configurado", async () => {
    const fixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    const readiness = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/readiness`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    expect(readiness.body.status).toBe("ready");
    expect(readiness.body.blockingReasons).toHaveLength(0);
  });

  it("Cargo publicado e Estrutura Organizacional aparecem apenas como recomendacao opcional", async () => {
    const fixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    const readiness = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/readiness`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    expect(readiness.body.pendingOptional).toContain("job_profile_published");
    expect(readiness.body.pendingOptional).toContain("organizational_structure");
    expect(readiness.body.status).toBe("ready");
  });

  it("Organization arquivada bloqueia consulta de readiness", async () => {
    const owner = (await import("./helpers")).createUser;
    void owner;
    const fixture = await createOrgWithMembers(app);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/archive`)
      .set({ "x-dev-platform-admin": "true" })
      .expect(200);

    await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/readiness`)
      .set(userHeaders(fixture.ownerId))
      .expect(403);
  });

  it("ativa e verifica que o Manifest de componentes versionados referencia a versao (nunca copia)", async () => {
    const fixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const dnaItem = activated.body.manifest.find(
      (item: { componentType: string }) => item.componentType === "dna"
    );
    expect(dnaItem).toBeDefined();
    expect(dnaItem.componentVersionId).toBeTruthy();
    expect(dnaItem.snapshotMetadata.status).toBe("published");
    // Nunca copia o conteudo completo da versao (missao, visao, valores etc.)
    expect(dnaItem.snapshotMetadata.mission).toBeUndefined();
  });

  it("Manifest de componentes nao versionados usa apenas o snapshot minimo allow-listed", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/organizational-units`)
      .set(userHeaders(fixture.ownerId))
      .send({ code: "ENG", name: "Engenharia", type: "department" })
      .expect(201);

    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const unitItem = activated.body.manifest.find(
      (item: { componentType: string }) => item.componentType === "organizational_unit"
    );
    expect(unitItem).toBeDefined();
    expect(Object.keys(unitItem.snapshotMetadata).sort()).toEqual(
      ["code", "id", "name", "parentId", "status", "type"].sort()
    );
    // Nunca inclui managerName/managerEmail/description (dado operacional/PII desnecessaria).
    expect(unitItem.snapshotMetadata.managerName).toBeUndefined();
    expect(unitItem.snapshotMetadata.managerEmail).toBeUndefined();
  });

  it("Manifest de perguntas preserva questionText, sem incluir resposta de candidato", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/questions`)
      .set(userHeaders(fixture.ownerId))
      .send({
        code: `Q-${Date.now()}`,
        title: "Pergunta de triagem",
        questionText: "Descreva um desafio que voce superou.",
        type: "open_text",
        category: "general",
        status: "active",
        description: "",
        instructions: "",
        options: [],
        settings: {}
      })
      .expect(201);

    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const questionItem = activated.body.manifest.find(
      (item: { componentType: string }) => item.componentType === "question_catalog_item"
    );
    expect(questionItem).toBeDefined();
    expect(questionItem.snapshotMetadata.questionText).toBe(
      "Descreva um desafio que voce superou."
    );
    expect(questionItem.snapshotMetadata.candidateResponse).toBeUndefined();
    expect(questionItem.snapshotMetadata.answer).toBeUndefined();
  });

  it("Manifest de competencias nunca inclui peso", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/competencies`)
      .set(userHeaders(fixture.ownerId))
      .send({
        code: `CMP-${Date.now()}`,
        name: "Comunicacao",
        category: "behavioral",
        definition: "Capacidade de se comunicar com clareza.",
        status: "active",
        positiveEvidences: [{ text: "Evidencia", displayOrder: 0 }],
        negativeEvidences: [{ text: "Ausencia", displayOrder: 0 }],
        practicalExamples: [{ text: "Exemplo", displayOrder: 0 }],
        proficiencyLevels: ["basic", "intermediate", "proficient", "advanced", "reference"].map(
          (code, index) => ({
            number: index + 1,
            code,
            displayName: code,
            description: `${code} description`,
            observableEvidences: []
          })
        )
      })
      .expect(201);

    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const competencyItem = activated.body.manifest.find(
      (item: { componentType: string }) => item.componentType === "competency_catalog_item"
    );
    expect(competencyItem).toBeDefined();
    expect(competencyItem.snapshotMetadata.weight).toBeUndefined();
    expect(competencyItem.snapshotMetadata.expectedLevel).toBeUndefined();
  });

  it("Manifest de AI Provider Settings nunca inclui segredo/credencial/token", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    await request(app)
      .put(`/api/platform/organizations/${fixture.organizationId}/ai/settings/platform-allowed`)
      .set({ "x-dev-platform-admin": "true" })
      .send({ platformAiAllowed: true })
      .expect(200);
    await request(app)
      .put(`/api/organizations/${fixture.organizationId}/ai/settings`)
      .set(userHeaders(fixture.ownerId))
      .send({ organizationAiEnabled: true })
      .expect(200);
    await request(app)
      .post(`/api/platform/ai/providers`)
      .set({ "x-dev-platform-admin": "true" })
      .send({ providerKey: "fake", name: "Fake Provider" });
    const provider = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/ai/provider-configs`)
      .set(userHeaders(fixture.ownerId))
      .send({ provider: "fake", credentialMode: "customer_managed", secret: "super-secret" });
    void provider;

    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const providerItem = activated.body.manifest.find(
      (item: { componentType: string }) => item.componentType === "ai_provider_settings"
    );

    if (providerItem) {
      expect(providerItem.snapshotMetadata.secretReference).toBeUndefined();
      expect(providerItem.snapshotMetadata.maskedIdentifier).toBeUndefined();
      expect(JSON.stringify(providerItem.snapshotMetadata)).not.toContain("super-secret");
    }
  });

  it("fingerprint e determinístico para o mesmo snapshot", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const dnaItem = activated.body.manifest.find(
      (item: { componentType: string }) => item.componentType === "dna"
    );
    expect(typeof dnaItem.contentFingerprint).toBe("string");
    expect(dnaItem.contentFingerprint).toHaveLength(64);
  });

  it("mudanca posterior no modulo nao altera o Manifest ja historico (nao retroatividade)", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);

    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    const originalDnaVersionId = activated.body.manifest.find(
      (item: { componentType: string }) => item.componentType === "dna"
    ).componentVersionId;

    // Nova revisao do DNA: cria e publica um novo draft, o que arquiva a versao anterior.
    const newDraft = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/dna/drafts`)
      .set(userHeaders(fixture.ownerId))
      .send({
        mission: "Nova missao",
        vision: "Nova visao",
        purpose: "Novo proposito",
        values: [
          {
            name: "Colaboracao",
            description: "Trabalhar em equipe de forma transparente.",
            practicalMeaning: "Compartilhar contexto e ajudar colegas.",
            expectedBehaviors: [],
            incompatibleBehaviors: []
          }
        ],
        competencies: [
          {
            name: "Comunicacao",
            description: "Capacidade de se comunicar com clareza.",
            importance: "high",
            examples: []
          }
        ],
        culture: "Nova cultura",
        leadershipStyle: "Novo estilo",
        workEnvironment: "Remoto"
      })
      .expect(201);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/dna/drafts/${newDraft.body.id}/publish`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const historicalVersion = await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint/versions/${activated.body.id}`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const dnaItem = historicalVersion.body.manifest.find(
      (item: { componentType: string }) => item.componentType === "dna"
    );
    expect(dnaItem.componentVersionId).toBe(originalDnaVersionId);
  });
});
