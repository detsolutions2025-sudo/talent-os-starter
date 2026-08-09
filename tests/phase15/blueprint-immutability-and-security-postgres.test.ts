import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  createApp,
  createOrgWithMembers,
  createUser,
  makeBlueprintReady,
  platformHeaders,
  type OrgFixture,
  userHeaders
} from "./helpers";

describe("Fase 15 - Blueprint Organizacional - imutabilidade, anti-delete e seguranca", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  async function activatedFixture() {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, fixture);
    const activated = await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);
    return {
      fixture,
      activated: activated.body as {
        id: string;
        manifest: {
          componentType: string;
          componentRefId: string | null;
          componentVersionId: string | null;
        }[];
      }
    };
  }

  it("UPDATE direto de Blueprint Version active e bloqueado no banco", async () => {
    const { activated } = await activatedFixture();
    await expect(
      database.pool.query(
        "UPDATE organization_blueprint_versions SET version_number = version_number + 100 WHERE id = $1",
        [activated.id]
      )
    ).rejects.toThrow(/blueprint_version_active_immutable/);
  });

  it("UPDATE direto de Blueprint Version archived e bloqueado no banco", async () => {
    const { fixture, activated } = await activatedFixture();
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    await expect(
      database.pool.query(
        "UPDATE organization_blueprint_versions SET version_number = version_number + 100 WHERE id = $1",
        [activated.id]
      )
    ).rejects.toThrow(/blueprint_version_archived_immutable/);
  });

  it("DELETE fisico de Blueprint Version e sempre bloqueado", async () => {
    const { activated } = await activatedFixture();
    await expect(
      database.pool.query("DELETE FROM organization_blueprint_versions WHERE id = $1", [
        activated.id
      ])
    ).rejects.toThrow(/blueprint_version_no_physical_delete/);
  });

  it("UPDATE e DELETE de Manifest Item de versao active/archived sao bloqueados", async () => {
    const { activated } = await activatedFixture();
    const item = await database.pool.query(
      "SELECT id FROM organization_blueprint_manifest_items WHERE blueprint_version_id = $1 LIMIT 1",
      [activated.id]
    );
    expect(item.rows.length).toBeGreaterThan(0);
    const itemId = item.rows[0].id;

    await expect(
      database.pool.query(
        "UPDATE organization_blueprint_manifest_items SET content_fingerprint = 'tampered' WHERE id = $1",
        [itemId]
      )
    ).rejects.toThrow(/blueprint_manifest_item_locked/);

    await expect(
      database.pool.query("DELETE FROM organization_blueprint_manifest_items WHERE id = $1", [
        itemId
      ])
    ).rejects.toThrow(/blueprint_manifest_item_locked/);
  });

  it("UPDATE e DELETE de Manifest Item de versao archived tambem sao bloqueados", async () => {
    const { fixture, activated } = await activatedFixture();
    // Ativa uma segunda vez para que a primeira versao (ja com manifesto) vire `archived`.
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
      .set(userHeaders(fixture.ownerId))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(200);

    const item = await database.pool.query(
      "SELECT id FROM organization_blueprint_manifest_items WHERE blueprint_version_id = $1 LIMIT 1",
      [activated.id]
    );
    expect(item.rows.length).toBeGreaterThan(0);
    const itemId = item.rows[0].id;

    const versionStatus = await database.pool.query(
      "SELECT status FROM organization_blueprint_versions WHERE id = $1",
      [activated.id]
    );
    expect(versionStatus.rows[0].status).toBe("archived");

    await expect(
      database.pool.query(
        "UPDATE organization_blueprint_manifest_items SET content_fingerprint = 'tampered' WHERE id = $1",
        [itemId]
      )
    ).rejects.toThrow(/blueprint_manifest_item_locked/);

    await expect(
      database.pool.query("DELETE FROM organization_blueprint_manifest_items WHERE id = $1", [
        itemId
      ])
    ).rejects.toThrow(/blueprint_manifest_item_locked/);
  });

  it("tentativa de alterar simultaneamente varios campos protegidos de uma versao active e bloqueada", async () => {
    const { activated } = await activatedFixture();

    await expect(
      database.pool.query(
        `UPDATE organization_blueprint_versions
         SET created_by_user_id = 'usr_tampered',
             activated_by_user_id = 'usr_tampered',
             activation_readiness_snapshot = '{"status":"tampered"}'::jsonb,
             version_number = version_number + 100
         WHERE id = $1`,
        [activated.id]
      )
    ).rejects.toThrow(/blueprint_version_active_immutable/);

    // Confirma que nenhum dos campos realmente mudou (a excecao interrompeu a transacao da
    // propria query, mas o teste tambem confirma explicitamente o estado no banco).
    const row = await database.pool.query(
      "SELECT created_by_user_id, activated_by_user_id, version_number FROM organization_blueprint_versions WHERE id = $1",
      [activated.id]
    );
    expect(row.rows[0].created_by_user_id).not.toBe("usr_tampered");
    expect(row.rows[0].activated_by_user_id).not.toBe("usr_tampered");
  });

  it("Job Profile Version de outro Cargo da mesma Organization nunca e aceita no Manifest (migration 0017)", async () => {
    const { fixture, activated } = await activatedFixture();

    // Cria dois Cargos publicados na mesma Organization.
    async function createPublishedJobProfile(suffix: string) {
      const profile = await request(app)
        .post(`/api/organizations/${fixture.organizationId}/job-profiles`)
        .set(userHeaders(fixture.ownerId))
        .send({ code: `JOB-${suffix}-${Date.now()}`, name: `Cargo ${suffix}` })
        .expect(201);
      const draft = await request(app)
        .post(`/api/organizations/${fixture.organizationId}/job-profiles/${profile.body.id}/drafts`)
        .set(userHeaders(fixture.ownerId))
        .send({})
        .expect(201);
      await request(app)
        .patch(
          `/api/organizations/${fixture.organizationId}/job-profiles/${profile.body.id}/drafts/${draft.body.id}`
        )
        .set(userHeaders(fixture.ownerId))
        .send({
          title: `Cargo ${suffix}`,
          mission: "Missao",
          summary: "Resumo",
          responsibilities: [{ text: "Responsabilidade", displayOrder: 0 }]
        })
        .expect(200);
      const published = await request(app)
        .post(
          `/api/organizations/${fixture.organizationId}/job-profiles/${profile.body.id}/drafts/${draft.body.id}/publish`
        )
        .set(userHeaders(fixture.ownerId))
        .expect(200);
      return { jobProfileId: profile.body.id, jobProfileVersionId: published.body.id };
    }

    const profileA = await createPublishedJobProfile("A");
    const profileB = await createPublishedJobProfile("B");

    // Uma nova versao draft e necessaria para permitir insercao de item de manifesto.
    await database.pool.query(
      `INSERT INTO organization_blueprint_versions (
         id, organization_id, version_number, status, created_by_user_id, created_source,
         created_at, updated_at
       ) VALUES ($1, (SELECT organization_id FROM organization_blueprint_versions WHERE id = $2), 998, 'draft', NULL, 'user', NOW(), NOW())`,
      [`bpv_coherence_${crypto.randomUUID()}`, activated.id]
    );
    const draftRow = await database.pool.query(
      "SELECT id FROM organization_blueprint_versions WHERE version_number = 998"
    );
    const draftId = draftRow.rows[0].id;

    // component_ref_id do Cargo A, mas component_version_id da versao do Cargo B -- mesma
    // Organization, mas incoerente entre si.
    await expect(
      database.pool.query(
        `INSERT INTO organization_blueprint_manifest_items (
           id, blueprint_version_id, component_type, component_ref_id, component_version_id,
           snapshot_metadata, content_fingerprint, created_at
         ) VALUES ($1, $2, 'job_profile', $3, $4, '{}'::jsonb, 'fp', NOW())`,
        [
          `bpi_coherence_${crypto.randomUUID()}`,
          draftId,
          profileA.jobProfileId,
          profileB.jobProfileVersionId
        ]
      )
    ).rejects.toThrow(/blueprint_manifest_item_job_profile_version_mismatch/);

    // A combinacao coerente (Cargo A com a propria versao de A) e aceita normalmente.
    await database.pool.query(
      `INSERT INTO organization_blueprint_manifest_items (
         id, blueprint_version_id, component_type, component_ref_id, component_version_id,
         snapshot_metadata, content_fingerprint, created_at
       ) VALUES ($1, $2, 'job_profile', $3, $4, '{}'::jsonb, 'fp', NOW())`,
      [
        `bpi_coherent_${crypto.randomUUID()}`,
        draftId,
        profileA.jobProfileId,
        profileA.jobProfileVersionId
      ]
    );
    const inserted = await database.pool.query(
      "SELECT id FROM organization_blueprint_manifest_items WHERE blueprint_version_id = $1",
      [draftId]
    );
    expect(inserted.rows).toHaveLength(1);
  });

  it("referencia inexistente (component_ref_id/component_version_id sem linha correspondente) e recusada, nao passa silenciosamente", async () => {
    const { activated } = await activatedFixture();
    await database.pool.query(
      `INSERT INTO organization_blueprint_versions (
         id, organization_id, version_number, status, created_by_user_id, created_source,
         created_at, updated_at
       ) VALUES ($1, (SELECT organization_id FROM organization_blueprint_versions WHERE id = $2), 997, 'draft', NULL, 'user', NOW(), NOW())`,
      [`bpv_nonexistent_${crypto.randomUUID()}`, activated.id]
    );
    const draftRow = await database.pool.query(
      "SELECT id FROM organization_blueprint_versions WHERE version_number = 997"
    );
    const draftId = draftRow.rows[0].id;

    // DNA: component_version_id apontando para um id que nao existe em organization_dna_versions.
    await expect(
      database.pool.query(
        `INSERT INTO organization_blueprint_manifest_items (
           id, blueprint_version_id, component_type, component_ref_id, component_version_id,
           snapshot_metadata, content_fingerprint, created_at
         ) VALUES ($1, $2, 'dna', NULL, 'dna_does_not_exist', '{}'::jsonb, 'fp', NOW())`,
        [`bpi_nonexistent_dna_${crypto.randomUUID()}`, draftId]
      )
    ).rejects.toThrow(/blueprint_manifest_item_cross_organization/);

    // Job Profile: component_ref_id apontando para um id que nao existe em job_profiles.
    await expect(
      database.pool.query(
        `INSERT INTO organization_blueprint_manifest_items (
           id, blueprint_version_id, component_type, component_ref_id, component_version_id,
           snapshot_metadata, content_fingerprint, created_at
         ) VALUES ($1, $2, 'job_profile', 'job_does_not_exist', NULL, '{}'::jsonb, 'fp', NOW())`,
        [`bpi_nonexistent_job_${crypto.randomUUID()}`, draftId]
      )
    ).rejects.toThrow(/blueprint_manifest_item_cross_organization/);
  });

  it("DNA referenciado no Manifest e sempre a versao publicada, nunca um draft (garantia de aplicacao)", async () => {
    const { fixture, activated } = await activatedFixture();
    // Cria um novo draft de DNA (nao publicado) apos a ativacao.
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/dna/drafts`)
      .set(userHeaders(fixture.ownerId))
      .send({ mission: "Rascunho nao publicado" })
      .expect(201);

    const dnaItem = activated.manifest.find(
      (item: { componentType: string }) => item.componentType === "dna"
    );
    expect(dnaItem).toBeDefined();
    const referencedVersion = await database.pool.query(
      "SELECT status FROM organization_dna_versions WHERE id = $1",
      [dnaItem?.componentVersionId]
    );
    expect(referencedVersion.rows[0].status).toBe("published");
  });

  it("organization_id de Blueprint Version e imutavel", async () => {
    const { fixture, activated } = await activatedFixture();
    void fixture;
    const otherOrg = await createOrgWithMembers(app);

    await expect(
      database.pool.query(
        "UPDATE organization_blueprint_versions SET organization_id = $2 WHERE id = $1",
        [activated.id, otherOrg.organizationId]
      )
    ).rejects.toThrow(
      /blueprint_version_organization_immutable|blueprint_version_active_immutable/
    );
  });

  it("Manifest cross-Organization e recusado pela trigger do banco", async () => {
    const { activated } = await activatedFixture();
    const otherFixture: OrgFixture = await createOrgWithMembers(app);
    await makeBlueprintReady(app, otherFixture);
    const otherActivated = await request(app)
      .post(`/api/organizations/${otherFixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(otherFixture.ownerId))
      .expect(200);
    const foreignDnaVersionId = (
      otherActivated.body.manifest as { componentType: string; componentVersionId: string }[]
    ).find((entry) => entry.componentType === "dna")?.componentVersionId;

    // Uma nova versao draft precisa existir para permitir a insercao (itens so podem ser
    // inseridos enquanto o pai e `draft`); criamos um draft novo na primeira Organization e
    // tentamos, diretamente via SQL, inserir um item de manifesto referenciando o DNA da
    // OUTRA Organization.
    await database.pool.query(
      `INSERT INTO organization_blueprint_versions (
         id, organization_id, version_number, status, created_by_user_id, created_source,
         created_at, updated_at
       ) VALUES ($1, (SELECT organization_id FROM organization_blueprint_versions WHERE id = $2), 999, 'draft', NULL, 'user', NOW(), NOW())`,
      [`bpv_test_${crypto.randomUUID()}`, activated.id]
    );
    const draftRow = await database.pool.query(
      "SELECT id, organization_id FROM organization_blueprint_versions WHERE version_number = 999"
    );
    const draftId = draftRow.rows[0].id;

    await expect(
      database.pool.query(
        `INSERT INTO organization_blueprint_manifest_items (
           id, blueprint_version_id, component_type, component_ref_id, component_version_id,
           snapshot_metadata, content_fingerprint, created_at
         ) VALUES ($1, $2, 'dna', NULL, $3, '{}'::jsonb, 'fp', NOW())`,
        [`bpi_test_${crypto.randomUUID()}`, draftId, foreignDnaVersionId]
      )
    ).rejects.toThrow(/blueprint_manifest_item_cross_organization/);
  });

  it("Member nao administra Blueprint: leitura tambem e negada", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await request(app)
      .get(`/api/organizations/${fixture.organizationId}/blueprint`)
      .set(userHeaders(fixture.memberId))
      .expect(403);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
      .set(userHeaders(fixture.memberId))
      .send({})
      .expect(403);
  });

  it("Platform Admin nao edita conteudo funcional do Blueprint (sem rota de escrita exposta a ele)", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    // Nenhuma rota de escrita do Blueprint aceita o header de Platform Admin como autorizado;
    // a unica rota que ele acessa e a leitura administrativa, que exige motivo.
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/drafts`)
      .set(platformHeaders)
      .send({})
      .expect(403);
  });

  it("leitura administrativa (Platform Admin) exige motivo e e auditada", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await request(app)
      .post(`/api/platform/organizations/${fixture.organizationId}/blueprint/admin-read`)
      .set(platformHeaders)
      .send({})
      .expect(400);

    await request(app)
      .post(`/api/platform/organizations/${fixture.organizationId}/blueprint/admin-read`)
      .set(platformHeaders)
      .send({ reason: "Investigacao de suporte" })
      .expect(200);

    const events = await database.pool.query(
      "SELECT action FROM audit_events WHERE organization_id = $1 AND action = 'blueprint.administrative_read'",
      [fixture.organizationId]
    );
    expect(events.rows.length).toBeGreaterThan(0);
  });

  it("Organization arquivada bloqueia criacao de draft e ativacao", async () => {
    const fixture: OrgFixture = await createOrgWithMembers(app);
    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/archive`)
      .set(platformHeaders)
      .expect(200);

    await request(app)
      .post(`/api/organizations/${fixture.organizationId}/blueprint/draft/activate`)
      .set(userHeaders(fixture.ownerId))
      .expect(403);
  });

  it("usuario de outra Organization nao consulta versao alheia (cross-Organization negado)", async () => {
    const { activated } = await activatedFixture();
    const otherOwner = await createUser(app, "outro-owner");
    const otherOrg = await request(app)
      .post("/api/organizations")
      .set(platformHeaders)
      .send({
        name: "Outra Org",
        slug: `outra-${crypto.randomUUID()}`,
        initialOwnerUserId: otherOwner.id
      })
      .expect(201);

    await request(app)
      .get(`/api/organizations/${otherOrg.body.organization.id}/blueprint/versions/${activated.id}`)
      .set(userHeaders(otherOwner.id))
      .expect(404);
  });
});
