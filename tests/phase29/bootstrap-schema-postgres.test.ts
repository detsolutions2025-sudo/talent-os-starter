// @vitest-environment node
// Fase 29 (correcao fisica complementar; SPEC-028 s16). Prova fisica da migration 0033 --
// aditiva sobre a 0032 (imutavel, ja aplicada e verificada em DEV nesta tarefa; NAO editada
// aqui). `createPostgresTestDatabase()` ja aplica 0001..0033 do zero em schema efemero para
// TODO teste deste projeto (secao 16 do prompt desta tarefa: fresh install) -- este arquivo
// apenas formaliza as asserções físicas específicas da 0033.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

describe("migration 0033 -- fresh install (bootstrap invitation, aditiva sobre 0032)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("registers 0033 in schema_migrations after a from-scratch 0001..0033 run", async () => {
    const result = await database.pool.query(
      "SELECT id, name FROM schema_migrations WHERE id = '0033_phase_29_bootstrap_invitation'"
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].name).toBe("0033_phase_29_bootstrap_invitation.sql");
  });

  it("adds exactly the three new columns to invitations, zero ALTER on any other table", async () => {
    const columns = await database.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'invitations'
       ORDER BY ordinal_position`
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual([
      "id",
      "organization_id",
      "email",
      "role",
      "status",
      "created_by_user_id",
      "resolved_user_id",
      "expires_at",
      "accepted_at",
      "accepted_by_user_id",
      "cancelled_at",
      "cancelled_by_user_id",
      "created_at",
      "updated_at",
      "organization_name",
      "organization_slug",
      "bootstrap_organization_id"
    ]);

    // Zero coluna nova em invitation_idempotency_keys -- 'bootstrap' ja era um valor valido do
    // CHECK de `operation` desde a 0032.
    const idempotencyColumns = await database.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'invitation_idempotency_keys'
       ORDER BY ordinal_position`
    );
    expect(idempotencyColumns.rows.map((r) => r.column_name)).toEqual([
      "id",
      "organization_id",
      "operation",
      "key_hash",
      "request_fingerprint",
      "status",
      "result_resource_id",
      "failure_category",
      "created_at",
      "completed_at",
      "failed_at"
    ]);

    // Zero alteracao de schema em auth_identities/platform_admins/users/memberships/
    // organizations/access_grants.
    const authIdentities = await database.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'auth_identities'
       ORDER BY ordinal_position`
    );
    expect(authIdentities.rows.map((r) => r.column_name)).toEqual([
      "id",
      "user_id",
      "provider",
      "external_id",
      "created_at",
      "updated_at"
    ]);
  });

  it("rejects a bootstrap invitation row without pending organization data (payload CHECK)", async () => {
    await database.pool.query("BEGIN");
    try {
      await database.pool.query(
        `INSERT INTO users (id, name, email, status) VALUES ('usr_boot_schema', 'X', 'boot-schema@example.com', 'active')`
      );
      await expect(
        database.pool.query(
          `INSERT INTO invitations (id, organization_id, email, role, status, created_by_user_id, expires_at)
           VALUES ('inv_boot_schema', NULL, 'boot-schema@example.com', 'owner', 'pending', 'usr_boot_schema', NOW() + interval '7 days')`
        )
      ).rejects.toThrow(/invitations_bootstrap_pending_org_payload_check/);
    } finally {
      await database.pool.query("ROLLBACK");
    }
  });

  it("rejects a normal invitation row that also carries pending organization data (no hybrid payload)", async () => {
    await database.pool.query("BEGIN");
    try {
      await database.pool.query(
        `INSERT INTO organizations (id, name, slug, status) VALUES ('org_boot_schema', 'X', 'org-boot-schema', 'active')`
      );
      await database.pool.query(
        `INSERT INTO users (id, name, email, status) VALUES ('usr_boot_schema2', 'X', 'boot-schema2@example.com', 'active')`
      );
      await expect(
        database.pool.query(
          `INSERT INTO invitations (
             id, organization_id, email, role, status, created_by_user_id, expires_at,
             organization_name, organization_slug
           )
           VALUES ('inv_boot_schema2', 'org_boot_schema', 'boot-schema2@example.com', 'member', 'pending',
                   'usr_boot_schema2', NOW() + interval '7 days', 'Hybrid', 'hybrid-slug')`
        )
      ).rejects.toThrow(/invitations_bootstrap_pending_org_payload_check/);
    } finally {
      await database.pool.query("ROLLBACK");
    }
  });

  it("rejects bootstrap_organization_id set on a pending (not-yet-accepted) invitation", async () => {
    await database.pool.query("BEGIN");
    try {
      await database.pool.query(
        `INSERT INTO organizations (id, name, slug, status) VALUES ('org_boot_schema3', 'X', 'org-boot-schema3', 'active')`
      );
      await database.pool.query(
        `INSERT INTO users (id, name, email, status) VALUES ('usr_boot_schema3', 'X', 'boot-schema3@example.com', 'active')`
      );
      await expect(
        database.pool.query(
          `INSERT INTO invitations (
             id, organization_id, email, role, status, created_by_user_id, expires_at,
             organization_name, organization_slug, bootstrap_organization_id
           )
           VALUES ('inv_boot_schema3', NULL, 'boot-schema3@example.com', 'owner', 'pending',
                   'usr_boot_schema3', NOW() + interval '7 days', 'X', 'x-slug', 'org_boot_schema3')`
        )
      ).rejects.toThrow(/invitations_bootstrap_organization_requires_accepted_check/);
    } finally {
      await database.pool.query("ROLLBACK");
    }
  });

  it("rejects bootstrap_organization_id set on a normal (organization_id NOT NULL) invitation", async () => {
    await database.pool.query("BEGIN");
    try {
      await database.pool.query(
        `INSERT INTO organizations (id, name, slug, status) VALUES ('org_boot_schema4', 'X', 'org-boot-schema4', 'active')`
      );
      await database.pool.query(
        `INSERT INTO organizations (id, name, slug, status) VALUES ('org_boot_schema4b', 'Y', 'org-boot-schema4b', 'active')`
      );
      await database.pool.query(
        `INSERT INTO users (id, name, email, status) VALUES ('usr_boot_schema4', 'X', 'boot-schema4@example.com', 'active')`
      );
      await expect(
        database.pool.query(
          `INSERT INTO invitations (
             id, organization_id, email, role, status, created_by_user_id, accepted_at,
             accepted_by_user_id, expires_at, bootstrap_organization_id
           )
           VALUES ('inv_boot_schema4', 'org_boot_schema4', 'boot-schema4@example.com', 'member', 'accepted',
                   'usr_boot_schema4', NOW(), 'usr_boot_schema4', NOW() + interval '7 days', 'org_boot_schema4b')`
        )
      ).rejects.toThrow(/invitations_bootstrap_organization_id_scope_check/);
    } finally {
      await database.pool.query("ROLLBACK");
    }
  });

  it("blocks changing organization_name/organization_slug after creation (provenance immutable)", async () => {
    await database.pool.query("BEGIN");
    try {
      await database.pool.query(
        `INSERT INTO users (id, name, email, status) VALUES ('usr_boot_schema5', 'X', 'boot-schema5@example.com', 'active')`
      );
      await database.pool.query(
        `INSERT INTO invitations (
           id, organization_id, email, role, status, created_by_user_id, expires_at,
           organization_name, organization_slug
         )
         VALUES ('inv_boot_schema5', NULL, 'boot-schema5@example.com', 'owner', 'pending',
                 'usr_boot_schema5', NOW() + interval '7 days', 'Original Name', 'original-slug')`
      );
      await expect(
        database.pool.query(
          `UPDATE invitations SET organization_slug = 'changed-slug' WHERE id = 'inv_boot_schema5'`
        )
      ).rejects.toThrow(/invitation_provenance_immutable/);
    } finally {
      await database.pool.query("ROLLBACK");
    }
  });

  it("blocks changing bootstrap_organization_id once already set (immutable after first value)", async () => {
    await database.pool.query("BEGIN");
    try {
      await database.pool.query(
        `INSERT INTO organizations (id, name, slug, status) VALUES ('org_boot_schema6', 'X', 'org-boot-schema6', 'active')`
      );
      await database.pool.query(
        `INSERT INTO organizations (id, name, slug, status) VALUES ('org_boot_schema6b', 'Y', 'org-boot-schema6b', 'active')`
      );
      await database.pool.query(
        `INSERT INTO users (id, name, email, status) VALUES ('usr_boot_schema6', 'X', 'boot-schema6@example.com', 'active')`
      );
      await database.pool.query(
        `INSERT INTO invitations (
           id, organization_id, email, role, status, created_by_user_id, expires_at,
           organization_name, organization_slug
         )
         VALUES ('inv_boot_schema6', NULL, 'boot-schema6@example.com', 'owner', 'pending',
                 'usr_boot_schema6', NOW() + interval '7 days', 'X', 'x-slug6')`
      );
      await database.pool.query(
        `UPDATE invitations
         SET status = 'accepted', accepted_at = NOW(), accepted_by_user_id = 'usr_boot_schema6',
             bootstrap_organization_id = 'org_boot_schema6'
         WHERE id = 'inv_boot_schema6'`
      );
      await expect(
        database.pool.query(
          `UPDATE invitations SET bootstrap_organization_id = 'org_boot_schema6b' WHERE id = 'inv_boot_schema6'`
        )
      ).rejects.toThrow(/invitation_bootstrap_organization_immutable/);
    } finally {
      await database.pool.query("ROLLBACK");
    }
  });

  it("enforces at most one invitation per created Organization (unique partial index)", async () => {
    const indexes = await database.pool.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = current_schema() AND tablename = 'invitations'
         AND indexname = 'idx_invitations_bootstrap_organization_unique'`
    );
    expect(indexes.rowCount).toBe(1);
    expect(indexes.rows[0].indexdef).toMatch(/UNIQUE/i);
    expect(indexes.rows[0].indexdef).toMatch(/bootstrap_organization_id IS NOT NULL/);
  });
});
