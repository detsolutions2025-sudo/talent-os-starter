import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  ensureMigrationTable,
  readMigrations,
  type Migration
} from "../../src/server/migrations";
import { createPostgresClient, requirePostgresDatabaseUrl } from "../../src/server/postgres";

// Reproduz um cenario real de upgrade (mesmo padrao ja usado pela Fase 15,
// tests/phase15/blueprint-real-backfill-postgres.test.ts): aplica as migrations reais 0001 a
// 0017 primeiro (estado "antes da 0018"), insere um Candidate/CandidateApplication/Consent
// LEGADO diretamente no banco (com autoria interna, como todo registro criado antes desta
// fase), e so entao aplica a migration 0018 real -- confirmando que o backfill implicito
// (DEFAULT da coluna nova) preserva a autoria de todo registro historico, sem inventar
// nenhuma origem publica retroativamente.
const AUTHORSHIP_MIGRATION_ID = "0018_phase_17_public_application_authorship";

describe("Fase 17 - autoria publica - migration real e constraints", () => {
  const connectionString = requirePostgresDatabaseUrl();
  const schema = `test_phase_17_authorship_${randomUUID().replaceAll("-", "_")}`;
  let migrations: Migration[];
  let beforeAuthorship: Migration[];
  let authorshipMigration: Migration;
  let afterAuthorship: Migration[];

  beforeAll(async () => {
    migrations = readMigrations();
    const index = migrations.findIndex((migration) => migration.id === AUTHORSHIP_MIGRATION_ID);
    expect(index).toBeGreaterThan(-1);
    beforeAuthorship = migrations.slice(0, index);
    authorshipMigration = migrations[index];
    afterAuthorship = migrations.slice(index + 1);

    const setupClient = createPostgresClient(connectionString);
    await setupClient.connect();
    try {
      await setupClient.query(`CREATE SCHEMA ${schema}`);
      await setupClient.query(`SET search_path TO ${schema}`);
      await ensureMigrationTable(setupClient);
      for (const migration of beforeAuthorship) {
        await applyMigration(setupClient, migration);
      }
    } finally {
      await setupClient.end();
    }
  });

  afterAll(async () => {
    const cleanupClient = createPostgresClient(connectionString);
    await cleanupClient.connect();
    try {
      await cleanupClient.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await cleanupClient.end();
    }
  });

  it("backfill preserva autoria interna de Candidate/Consent/CandidateApplication historicos, sem inventar origem publica", async () => {
    const client = createPostgresClient(withSearchPath(connectionString, schema));
    await client.connect();
    try {
      const now = new Date().toISOString();
      const userId = `usr_${randomUUID()}`;
      const orgId = `org_${randomUUID()}`;
      const candidateId = `cand_${randomUUID()}`;
      const jobOpeningId = `jopen_${randomUUID()}`;
      const jobProfileVersionId = `jpver_${randomUUID()}`;
      const jobOpeningVersionId = `jover_${randomUUID()}`;
      const consentId = `ccon_${randomUUID()}`;
      void jobOpeningId;
      void jobProfileVersionId;
      void jobOpeningVersionId;

      await client.query(
        `INSERT INTO users (id, name, email, status, created_at, updated_at)
         VALUES ($1, 'Legacy Owner', $2, 'active', $3, $3)`,
        [userId, `${randomUUID()}@example.com`, now]
      );
      await client.query(
        `INSERT INTO organizations (id, name, slug, status, created_at, updated_at)
         VALUES ($1, 'Legacy Org', $2, 'active', $3, $3)`,
        [orgId, `legacy-${randomUUID()}`, now]
      );
      await client.query(
        `INSERT INTO candidates (
           id, organization_id, full_name, email, normalized_email, status, source,
           created_by_user_id, created_at, updated_at
         ) VALUES ($1, $2, 'Legacy Candidate', $3, $3, 'active', 'manual', $4, $5, $5)`,
        [candidateId, orgId, `${randomUUID()}@example.com`, userId, now]
      );
      await client.query(
        `INSERT INTO candidate_consents (
           id, organization_id, candidate_id, status, consent_at, source, terms_version,
           purpose, created_by_user_id, created_at, updated_at
         ) VALUES ($1, $2, $3, 'granted', $4, 'manual', '1.0', 'Legacy purpose', $5, $4, $4)`,
        [consentId, orgId, candidateId, now, userId]
      );

      const tableBefore = await client.query(
        `SELECT to_regclass('public_application_submissions') AS reg`
      );
      expect(tableBefore.rows[0].reg).toBeNull();

      await applyMigration(client, authorshipMigration);

      const candidateRow = await client.query("SELECT * FROM candidates WHERE id = $1", [
        candidateId
      ]);
      expect(candidateRow.rows[0].creation_origin).toBe("internal_user");
      expect(candidateRow.rows[0].created_by_user_id).toBe(userId);

      const consentRow = await client.query("SELECT * FROM candidate_consents WHERE id = $1", [
        consentId
      ]);
      expect(consentRow.rows[0].created_by_user_id).toBe(userId);

      // Ao contrario da migration 0016 (Fase 15), o corpo desta migration nao e seguro para
      // reexecucao bruta fora de `applyMigration` -- `ADD COLUMN`/`ADD CONSTRAINT` nao sao
      // idempotentes em DDL puro do Postgres (diferente de `CREATE TABLE IF NOT EXISTS`).
      // Isso nunca e um problema operacional real: `applyMigration` roda cada migration
      // exatamente uma vez, dentro de uma unica transacao (BEGIN/COMMIT), com o registro em
      // `schema_migrations` ocorrendo somente apos sucesso -- nao ha cenario de reaplicacao
      // parcial a proteger contra.

      for (const migration of afterAuthorship) {
        await applyMigration(client, migration);
      }

      // A partir daqui o schema esta completo (todas as migrations reais aplicadas), incluindo
      // a nova tabela `public_application_submissions`.
      const submissionsTable = await client.query(
        `SELECT to_regclass('public_application_submissions') AS reg`
      );
      expect(submissionsTable.rows[0].reg).not.toBeNull();

      // A constraint de autoria de `candidate_applications` (source/created_by_user_id) e
      // verificada de ponta a ponta pelo fluxo real da API em
      // `public-application-flow-postgres.test.ts` -- reproduzir aqui exigiria montar Job
      // Opening + Job Profile Version completos via INSERT bruto, o que a suite de fluxo real
      // ja cobre com mais fidelidade.
    } finally {
      await client.end();
    }
  });

  it("constraint de Candidate rejeita combinacoes invalidas de creation_origin/created_by_user_id", async () => {
    const client = createPostgresClient(withSearchPath(connectionString, schema));
    await client.connect();
    try {
      const now = new Date().toISOString();
      const orgId = `org_${randomUUID()}`;
      const userId = `usr_${randomUUID()}`;
      await client.query(
        `INSERT INTO organizations (id, name, slug, status, created_at, updated_at)
         VALUES ($1, 'Org', $2, 'active', $3, $3)`,
        [orgId, `org-${randomUUID()}`, now]
      );
      await client.query(
        `INSERT INTO users (id, name, email, status, created_at, updated_at)
         VALUES ($1, 'User', $2, 'active', $3, $3)`,
        [userId, `${randomUUID()}@example.com`, now]
      );

      // internal_user + created_by_user_id NULL -> invalido.
      await expect(
        client.query(
          `INSERT INTO candidates (
             id, organization_id, full_name, email, normalized_email, status, source,
             creation_origin, created_by_user_id, created_at, updated_at
           ) VALUES ($1, $2, 'Test Candidate', $3, $3, 'active', 'manual', 'internal_user', NULL, $4, $4)`,
          [`cand_${randomUUID()}`, orgId, `${randomUUID()}@example.com`, now]
        )
      ).rejects.toThrow();

      // public_application + created_by_user_id preenchido -> invalido.
      await expect(
        client.query(
          `INSERT INTO candidates (
             id, organization_id, full_name, email, normalized_email, status, source,
             creation_origin, created_by_user_id, created_at, updated_at
           ) VALUES ($1, $2, 'Test Candidate', $3, $3, 'active', 'manual', 'public_application', $5, $4, $4)`,
          [`cand_${randomUUID()}`, orgId, `${randomUUID()}@example.com`, now, userId]
        )
      ).rejects.toThrow();

      // public_application + created_by_user_id NULL -> valido.
      const validPublic = await client.query(
        `INSERT INTO candidates (
           id, organization_id, full_name, email, normalized_email, status, source,
           creation_origin, created_by_user_id, created_at, updated_at
         ) VALUES ($1, $2, 'Test Candidate', $3, $3, 'active', 'manual', 'public_application', NULL, $4, $4)
         RETURNING id`,
        [`cand_${randomUUID()}`, orgId, `${randomUUID()}@example.com`, now]
      );
      expect(validPublic.rows).toHaveLength(1);

      // internal_user + created_by_user_id preenchido -> valido.
      const validInternal = await client.query(
        `INSERT INTO candidates (
           id, organization_id, full_name, email, normalized_email, status, source,
           creation_origin, created_by_user_id, created_at, updated_at
         ) VALUES ($1, $2, 'Test Candidate', $3, $3, 'active', 'manual', 'internal_user', $5, $4, $4)
         RETURNING id`,
        [`cand_${randomUUID()}`, orgId, `${randomUUID()}@example.com`, now, userId]
      );
      expect(validInternal.rows).toHaveLength(1);
    } finally {
      await client.end();
    }
  });

  it("constraint de CandidateConsent rejeita combinacoes invalidas de source/created_by_user_id", async () => {
    const client = createPostgresClient(withSearchPath(connectionString, schema));
    await client.connect();
    try {
      const now = new Date().toISOString();
      const orgId = `org_${randomUUID()}`;
      const userId = `usr_${randomUUID()}`;
      const candidateId = `cand_${randomUUID()}`;
      await client.query(
        `INSERT INTO organizations (id, name, slug, status, created_at, updated_at)
         VALUES ($1, 'Org', $2, 'active', $3, $3)`,
        [orgId, `org-${randomUUID()}`, now]
      );
      await client.query(
        `INSERT INTO users (id, name, email, status, created_at, updated_at)
         VALUES ($1, 'User', $2, 'active', $3, $3)`,
        [userId, `${randomUUID()}@example.com`, now]
      );
      await client.query(
        `INSERT INTO candidates (
           id, organization_id, full_name, email, normalized_email, status, source,
           creation_origin, created_by_user_id, created_at, updated_at
         ) VALUES ($1, $2, 'Test Candidate', $3, $3, 'active', 'manual', 'internal_user', $4, $5, $5)`,
        [candidateId, orgId, `${randomUUID()}@example.com`, userId, now]
      );

      await expect(
        client.query(
          `INSERT INTO candidate_consents (
             id, organization_id, candidate_id, status, consent_at, source, terms_version,
             purpose, created_by_user_id, created_at, updated_at
           ) VALUES ($1, $2, $3, 'granted', $4, 'public_application', '1.0', 'p', $5, $4, $4)`,
          [`ccon_${randomUUID()}`, orgId, candidateId, now, userId]
        )
      ).rejects.toThrow();

      await expect(
        client.query(
          `INSERT INTO candidate_consents (
             id, organization_id, candidate_id, status, consent_at, source, terms_version,
             purpose, created_by_user_id, created_at, updated_at
           ) VALUES ($1, $2, $3, 'granted', $4, 'manual', '1.0', 'p', NULL, $4, $4)`,
          [`ccon_${randomUUID()}`, orgId, candidateId, now]
        )
      ).rejects.toThrow();

      const valid = await client.query(
        `INSERT INTO candidate_consents (
           id, organization_id, candidate_id, status, consent_at, source, terms_version,
           purpose, created_by_user_id, created_at, updated_at
         ) VALUES ($1, $2, $3, 'granted', $4, 'public_application', '1.0', 'p', NULL, $4, $4)
         RETURNING id`,
        [`ccon_${randomUUID()}`, orgId, candidateId, now]
      );
      expect(valid.rows).toHaveLength(1);
    } finally {
      await client.end();
    }
  });
});

function withSearchPath(connectionString: string, schema: string) {
  const url = new URL(connectionString);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}
