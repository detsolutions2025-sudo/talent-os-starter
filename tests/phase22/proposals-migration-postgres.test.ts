import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { createDraft, createProposalFixture, issueDraft } from "./helpers";

describe("Fase 22 - migration de Propostas", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("cria exatamente as cinco tabelas fisicas do modulo", async () => {
    const result = await database.pool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name LIKE 'proposal%'
        ORDER BY table_name
      `
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "proposal_access_grants",
      "proposal_events",
      "proposal_idempotency_keys",
      "proposal_versions",
      "proposals"
    ]);
  });

  it("adiciona proposal_version_id em candidate_application_events somente para hired", async () => {
    const check = await database.pool.query(
      `
        SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conname = 'candidate_application_events_proposal_version_hired_check'
      `
    );
    expect(check.rows[0].def).toContain("event_type = 'hired'");
  });

  it("possui constraints fisicas para lifecycle, grant hash e idempotencia", async () => {
    const constraints = await database.pool.query(
      `
        SELECT conname
        FROM pg_constraint
        WHERE conrelid IN (
          'proposal_versions'::regclass,
          'proposal_access_grants'::regclass,
          'proposal_idempotency_keys'::regclass
        )
        ORDER BY conname
      `
    );
    const names = constraints.rows.map((row) => String(row.conname));
    expect(names).toContain("proposal_versions_status_check");
    expect(names).toContain("proposal_access_grants_token_hash_check");
    expect(names).toContain("proposal_idempotency_keys_status_check");
  });

  it("possui indices parciais e triggers de no-delete/imutabilidade", async () => {
    const indexes = await database.pool.query(
      `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN (
            'idx_proposal_versions_one_active_draft',
            'idx_proposal_versions_one_issued_candidate_application'
          )
        ORDER BY indexname
      `
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "idx_proposal_versions_one_active_draft",
      "idx_proposal_versions_one_issued_candidate_application"
    ]);
    expect(indexes.rows.map((row) => row.indexdef).join("\n")).toContain("WHERE");

    const triggers = await database.pool.query(
      `
        SELECT event_object_table, trigger_name, event_manipulation
        FROM information_schema.triggers
        WHERE trigger_schema = current_schema()
          AND trigger_name IN (
            'trg_proposal_no_delete',
            'trg_proposal_version_no_delete',
            'trg_proposal_access_grant_no_delete',
            'trg_proposal_event_no_update',
            'trg_proposal_event_no_delete',
            'trg_proposal_idempotency_no_delete',
            'trg_proposal_current_version_terminal'
          )
        ORDER BY trigger_name, event_manipulation
      `
    );
    expect(triggers.rows).toHaveLength(7);
  });

  it("bloqueia transicoes fisicas invalidas e exclusao fisica", async () => {
    const fixture = await createProposalFixture(database, "migration-physical");
    const draft = await createDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId
    );
    await issueDraft(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      fixture.applicationId,
      draft.currentVersion.id
    ).expect(201);

    await expect(
      database.pool.query("UPDATE proposal_versions SET status = 'draft' WHERE id = $1", [
        draft.currentVersion.id
      ])
    ).rejects.toThrow(/proposal_version_invalid_transition/);
    await expect(
      database.pool.query("DELETE FROM proposal_versions WHERE id = $1", [draft.currentVersion.id])
    ).rejects.toThrow(/proposal_version_no_physical_delete/);
    await database.pool.query(
      "UPDATE proposal_versions SET status = 'accepted', accepted_at = $2 WHERE id = $1",
      [draft.currentVersion.id, new Date().toISOString()]
    );
    await expect(
      database.pool.query(
        "UPDATE proposals SET current_version_id = NULL WHERE candidate_application_id = $1",
        [fixture.applicationId]
      )
    ).rejects.toThrow(/proposal_current_version_terminal/);
  });
});
