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

// Revisao final da Fase 15, item 3: reproduz um cenario REAL de upgrade, aplicando as
// migrations reais do repositorio (nao um SQL copiado a mao) sobre um schema controlado --
// migrations 0001 a 0015 primeiro (estado equivalente a "antes da 0016"), depois insercao de
// uma Organization legada diretamente no banco, e so entao a migration 0016 real (que cria as
// tabelas do Blueprint E roda o backfill na mesma transacao).
const BLUEPRINT_MIGRATION_ID = "0016_phase_15_blueprint_organizacional";

describe("Fase 15 - Blueprint Organizacional - backfill real via migrations reais", () => {
  const connectionString = requirePostgresDatabaseUrl();
  const schema = `test_phase_15_backfill_${randomUUID().replaceAll("-", "_")}`;
  let migrations: Migration[];
  let beforeBlueprint: Migration[];
  let blueprintMigration: Migration;
  let afterBlueprint: Migration[];

  beforeAll(async () => {
    migrations = readMigrations();
    const blueprintIndex = migrations.findIndex(
      (migration) => migration.id === BLUEPRINT_MIGRATION_ID
    );
    expect(blueprintIndex).toBeGreaterThan(-1);
    beforeBlueprint = migrations.slice(0, blueprintIndex);
    blueprintMigration = migrations[blueprintIndex];
    afterBlueprint = migrations.slice(blueprintIndex + 1);

    const setupClient = createPostgresClient(connectionString);
    await setupClient.connect();
    try {
      await setupClient.query(`CREATE SCHEMA ${schema}`);
      await setupClient.query(`SET search_path TO ${schema}`);
      await ensureMigrationTable(setupClient);

      for (const migration of beforeBlueprint) {
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

  it("Organization criada antes da 0016 recebe exatamente um Blueprint Version draft ao aplicar a migration real", async () => {
    const client = createPostgresClient(withSearchPath(connectionString, schema));
    await client.connect();

    try {
      // Estado "pre-Fase-15": Organization legada, criada sem nenhum conceito de Blueprint,
      // exatamente como as Organizations reais que existiam antes desta fase.
      const ownerId = `usr_${randomUUID()}`;
      const orgId = `org_${randomUUID()}`;
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO users (id, name, email, status, created_at, updated_at)
         VALUES ($1, 'Legacy Owner', $2, 'active', $3, $3)`,
        [ownerId, `${randomUUID()}@example.com`, now]
      );
      await client.query(
        `INSERT INTO organizations (id, name, slug, status, created_at, updated_at)
         VALUES ($1, 'Legacy Org', $2, 'active', $3, $3)`,
        [orgId, `legacy-${randomUUID()}`, now]
      );
      await client.query(
        `INSERT INTO memberships (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'owner', 'active', $4, $4, $4)`,
        [`mem_${randomUUID()}`, orgId, ownerId, now]
      );

      // Confirma que, antes da 0016, a tabela de Blueprint nem existe ainda.
      const tableBefore = await client.query(
        `SELECT to_regclass('organization_blueprint_versions') AS reg`
      );
      expect(tableBefore.rows[0].reg).toBeNull();

      // Aplica a migration REAL 0016 -- cria as tabelas e roda o backfill na mesma transacao.
      await applyMigration(client, blueprintMigration);

      const versions = await client.query(
        "SELECT * FROM organization_blueprint_versions WHERE organization_id = $1",
        [orgId]
      );

      expect(versions.rows).toHaveLength(1);
      expect(versions.rows[0].status).toBe("draft");
      expect(versions.rows[0].version_number).toBe(1);
      expect(versions.rows[0].created_by_user_id).toBeNull();
      expect(versions.rows[0].created_source).toBe("migration_backfill");

      const activeVersions = await client.query(
        "SELECT COUNT(*)::int AS count FROM organization_blueprint_versions WHERE organization_id = $1 AND status = 'active'",
        [orgId]
      );
      expect(activeVersions.rows[0].count).toBe(0);

      // Reexecuta o CORPO INTEIRO da migration 0016 (sem passar por applyMigration, que
      // registraria de novo em schema_migrations e violaria a PK) -- prova que o arquivo real
      // e idempotente de ponta a ponta, nao apenas a instrucao de backfill isolada.
      await client.query(blueprintMigration.sql);

      const versionsAfterReplay = await client.query(
        "SELECT COUNT(*)::int AS count FROM organization_blueprint_versions WHERE organization_id = $1",
        [orgId]
      );
      expect(versionsAfterReplay.rows[0].count).toBe(1);

      // Aplica o restante das migrations reais (0017+) para deixar o schema completo,
      // consistente com o estado real de producao.
      for (const migration of afterBlueprint) {
        await applyMigration(client, migration);
      }

      const finalCheck = await client.query(
        "SELECT status, created_source FROM organization_blueprint_versions WHERE organization_id = $1",
        [orgId]
      );
      expect(finalCheck.rows).toHaveLength(1);
      expect(finalCheck.rows[0].status).toBe("draft");
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
