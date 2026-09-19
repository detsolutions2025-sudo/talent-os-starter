// Migration 0032 (comentario da tabela `platform_admins`): "Primeiro Platform Admin e inserido
// por processo operacional manual, fora do fluxo HTTP desta Fase." Cobre `grantPlatformAdmin()`
// (src/server/platform-admin-bootstrap.ts), a funcao que o CLI `create-platform-admin.ts`
// consome -- nunca exposta por rota HTTP.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { grantPlatformAdmin } from "../../src/server/platform-admin-bootstrap";

describe("grantPlatformAdmin (bootstrap manual do primeiro Platform Admin)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria User + AuthIdentity + PlatformAdmin do zero", async () => {
    const result = await grantPlatformAdmin(database.pool, {
      email: "admin@admin.com.br",
      name: "Admin",
      externalId: "supabase-uid-admin-1"
    });

    expect(result.userCreated).toBe(true);
    expect(result.identityCreated).toBe(true);
    expect(result.grantedNow).toBe(true);

    const user = await database.pool.query("SELECT email, status FROM users WHERE id = $1", [
      result.userId
    ]);
    expect(user.rows[0]).toMatchObject({ email: "admin@admin.com.br", status: "active" });

    const identity = await database.pool.query(
      "SELECT provider, external_id FROM auth_identities WHERE user_id = $1",
      [result.userId]
    );
    expect(identity.rows[0]).toMatchObject({
      provider: "supabase",
      external_id: "supabase-uid-admin-1"
    });

    const admin = await database.pool.query(
      "SELECT status, granted_by_user_id FROM platform_admins WHERE user_id = $1",
      [result.userId]
    );
    expect(admin.rows[0]).toMatchObject({ status: "active", granted_by_user_id: null });
  });

  it("e idempotente: rodar de novo com os mesmos dados nao duplica nada", async () => {
    const first = await grantPlatformAdmin(database.pool, {
      email: "repeat@admin.com.br",
      name: "Repeat",
      externalId: "supabase-uid-repeat"
    });

    const second = await grantPlatformAdmin(database.pool, {
      email: "repeat@admin.com.br",
      name: "Repeat",
      externalId: "supabase-uid-repeat"
    });

    expect(second.userId).toBe(first.userId);
    expect(second.userCreated).toBe(false);
    expect(second.identityCreated).toBe(false);
    expect(second.grantedNow).toBe(false);

    const identities = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM auth_identities WHERE user_id = $1",
      [first.userId]
    );
    expect(identities.rows[0].count).toBe(1);
  });

  it("reativa um Platform Admin previamente revogado, sem criar um novo User", async () => {
    const granted = await grantPlatformAdmin(database.pool, {
      email: "revoked@admin.com.br",
      name: "Revoked",
      externalId: "supabase-uid-revoked"
    });

    await database.pool.query(
      `UPDATE platform_admins SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = $1 WHERE user_id = $1`,
      [granted.userId]
    );

    const reactivated = await grantPlatformAdmin(database.pool, {
      email: "revoked@admin.com.br",
      name: "Revoked",
      externalId: "supabase-uid-revoked"
    });

    expect(reactivated.userId).toBe(granted.userId);
    expect(reactivated.userCreated).toBe(false);
    expect(reactivated.grantedNow).toBe(true);

    const admin = await database.pool.query(
      "SELECT status FROM platform_admins WHERE user_id = $1",
      [granted.userId]
    );
    expect(admin.rows[0].status).toBe("active");
  });

  it("recusa um external-id ja vinculado a outro User", async () => {
    await grantPlatformAdmin(database.pool, {
      email: "owner@admin.com.br",
      name: "Owner",
      externalId: "supabase-uid-shared"
    });

    await expect(
      grantPlatformAdmin(database.pool, {
        email: "other@admin.com.br",
        name: "Other",
        externalId: "supabase-uid-shared"
      })
    ).rejects.toThrow(/already linked to a different User/);
  });

  it("recusa um User existente e inativo", async () => {
    await database.pool.query(
      `INSERT INTO users (id, name, email, status) VALUES ('usr_inactive_admin', 'Inactive', 'inactive@admin.com.br', 'inactive')`
    );

    await expect(
      grantPlatformAdmin(database.pool, {
        email: "inactive@admin.com.br",
        name: "Inactive",
        externalId: "supabase-uid-inactive"
      })
    ).rejects.toThrow(/exists but is inactive/);
  });
});
