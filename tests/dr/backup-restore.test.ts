import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { countDumpRows, dumpSchema } from "../../src/server/backup-restore/dump";
import {
  assertTargetIsEmpty,
  restoreSchema,
  RestoreTargetNotEmptyError
} from "../../src/server/backup-restore/restore";

// Prova, com Postgres real, o ciclo completo pedido pelo bloco de Backup/Restore + DR minimo:
// 1) schema de origem descartavel + fixture sintetica multi-tenant; 2) dump; 3) schema de
// destino descartavel vazio; 4) restore; 5) verificacoes objetivas pos-restore. As duas
// "bases descartaveis" sao schemas isolados criados por createPostgresTestDatabase (o mesmo
// mecanismo ja usado por toda a suite tests/phaseN contra este mesmo Postgres) -- nunca o
// schema "public", nunca dados reais. Nenhum dos dois e reaproveitado entre os dois it().
describe("Backup/Restore + DR minimo - ciclo real backup->restore (Postgres)", () => {
  let source: PostgresTestDatabase;
  let target: PostgresTestDatabase;

  const orgAId = `org_${randomUUID()}`;
  const orgBId = `org_${randomUUID()}`;
  const userAId = `user_${randomUUID()}`;
  const userBId = `user_${randomUUID()}`;
  const membershipAId = `membership_${randomUUID()}`;
  const membershipBId = `membership_${randomUUID()}`;
  const auditAId = `audit_${randomUUID()}`;
  const auditBId = `audit_${randomUUID()}`;
  const unitRootId = `unit_${randomUUID()}`;
  const unitChildId = `unit_${randomUUID()}`;
  const unitGrandchildId = `unit_${randomUUID()}`;

  beforeAll(async () => {
    source = await createPostgresTestDatabase();
    target = await createPostgresTestDatabase();

    // Fixture minima e explicitamente sintetica: duas Organizations, cada uma com seu proprio
    // User/Membership/audit_event -- o suficiente para provar tenant boundary (organization_id)
    // e relacoes (FK), nao so contagem de linhas. Nenhum dado real.
    await source.pool.query(
      `INSERT INTO users (id, name, email, status) VALUES ($1,$2,$3,'active'), ($4,$5,$6,'active')`,
      [
        userAId,
        "Fixture Owner A",
        `${userAId}@example.test`,
        userBId,
        "Fixture Owner B",
        `${userBId}@example.test`
      ]
    );
    await source.pool.query(
      `INSERT INTO organizations (id, name, slug, status) VALUES ($1,$2,$3,'active'), ($4,$5,$6,'active')`,
      [
        orgAId,
        "Fixture Org A",
        `fixture-org-a-${orgAId}`,
        orgBId,
        "Fixture Org B",
        `fixture-org-b-${orgBId}`
      ]
    );
    await source.pool.query(
      `INSERT INTO memberships (id, organization_id, user_id, role, status) VALUES
         ($1,$2,$3,'owner','active'), ($4,$5,$6,'owner','active')`,
      [membershipAId, orgAId, userAId, membershipBId, orgBId, userBId]
    );
    await source.pool.query(
      `INSERT INTO audit_events (id, organization_id, actor_user_id, action, result, metadata) VALUES
         ($1,$2,$3,'dr_fixture_seed','allowed',$4::jsonb),
         ($5,$6,$7,'dr_fixture_seed','allowed',$8::jsonb)`,
      [
        auditAId,
        orgAId,
        userAId,
        JSON.stringify({ tenant: "a" }),
        auditBId,
        orgBId,
        userBId,
        JSON.stringify({ tenant: "b" })
      ]
    );

    // Hierarquia real de organizational_units (raiz -> filha -> neta), toda sob a Org A --
    // FK auto-referenciada composta (organization_id, parent_id) -> (organization_id, id). O
    // INSERT abaixo respeita a ordem pai-antes-do-filho porque a FK e verificada
    // imediatamente (nao DEFERRABLE) -- e exatamente por isso que o dump nao pode confiar na
    // ordem incidental de um SELECT depois: o Postgres nao promete devolver as linhas na ordem
    // em que foram inseridas.
    await source.pool.query(
      `INSERT INTO organizational_units
         (id, organization_id, code, name, type, parent_id, status, created_by_user_id, updated_by_user_id)
       VALUES ($1,$2,'ROOT','Unidade Raiz','department',NULL,'active',$3,$3)`,
      [unitRootId, orgAId, userAId]
    );
    await source.pool.query(
      `INSERT INTO organizational_units
         (id, organization_id, code, name, type, parent_id, status, created_by_user_id, updated_by_user_id)
       VALUES ($1,$2,'CHILD','Unidade Filha','team',$3,'active',$4,$4)`,
      [unitChildId, orgAId, unitRootId, userAId]
    );
    await source.pool.query(
      `INSERT INTO organizational_units
         (id, organization_id, code, name, type, parent_id, status, created_by_user_id, updated_by_user_id)
       VALUES ($1,$2,'GRANDCHILD','Unidade Neta','squad',$3,'active',$4,$4)`,
      [unitGrandchildId, orgAId, unitChildId, userAId]
    );
  }, 60000);

  afterAll(async () => {
    await source.cleanup();
    await target.cleanup();
  });

  // O schema real deste projeto tem ~98 tabelas -- dump + assertTargetIsEmpty fazem um
  // round-trip de rede por tabela contra o Postgres remoto (Supabase), o que passa do timeout
  // padrao de 60s da suite (vitest.config.ts) dependendo da latencia do momento.
  it("dumps the source schema and restores it into an empty schema with data, relations and tenant boundaries preserved", async () => {
    const dump = await dumpSchema(source.pool, source.schema);

    expect(dump.tableOrder).toContain("organizations");
    expect(dump.tableOrder).toContain("memberships");
    expect(dump.tableOrder.indexOf("organizations")).toBeLessThan(
      dump.tableOrder.indexOf("memberships")
    );
    // 2 users + 2 organizations + 2 memberships + 2 audit_events + 3 organizational_units, no
    // minimo (mais qualquer outra tabela vazia do schema real).
    expect(countDumpRows(dump)).toBeGreaterThanOrEqual(11);

    // O DUMP em si (nao so o restore) garante pai-antes-do-filho -- independente da ordem
    // incidental que o SELECT tenha devolvido de fato.
    const unitRows = dump.tables.organizational_units.rows as { id: string }[];
    const unitIndexOf = (id: string) => unitRows.findIndex((row) => row.id === id);
    expect(unitIndexOf(unitRootId)).toBeLessThan(unitIndexOf(unitChildId));
    expect(unitIndexOf(unitChildId)).toBeLessThan(unitIndexOf(unitGrandchildId));
    expect(dump.selfReferenceForeignKeys.organizational_units).toEqual([
      {
        localColumns: ["organization_id", "parent_id"],
        referencedColumns: ["organization_id", "id"]
      }
    ]);

    await assertTargetIsEmpty(target.pool, target.schema, dump);
    await restoreSchema(target.pool, target.schema, dump);

    const orgs = await target.pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM organizations ORDER BY id"
    );
    expect(orgs.rows.map((row) => row.id).sort()).toEqual([orgAId, orgBId].sort());

    const memberships = await target.pool.query<{
      id: string;
      organization_id: string;
      user_id: string;
    }>("SELECT id, organization_id, user_id FROM memberships ORDER BY id");
    expect(memberships.rows).toHaveLength(2);

    const membershipA = memberships.rows.find((row) => row.id === membershipAId);
    const membershipB = memberships.rows.find((row) => row.id === membershipBId);
    // Organizations continuam distintas: Membership A nunca aparece ligado a Org B, e vice-versa.
    expect(membershipA?.organization_id).toBe(orgAId);
    expect(membershipB?.organization_id).toBe(orgBId);
    expect(membershipA?.organization_id).not.toBe(membershipB?.organization_id);

    // FK realmente preservada (join de verdade, nao so o valor da coluna isolado).
    const joined = await target.pool.query<{ org_id: string; user_id: string }>(
      `SELECT o.id AS org_id, u.id AS user_id
       FROM memberships m
       JOIN organizations o ON o.id = m.organization_id
       JOIN users u ON u.id = m.user_id
       WHERE m.id = $1`,
      [membershipAId]
    );
    expect(joined.rows[0]).toEqual({ org_id: orgAId, user_id: userAId });

    // JSONB sobrevive ao ciclo dump->restore como objeto real, nao como string escapada.
    const audit = await target.pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM audit_events WHERE id = $1",
      [auditAId]
    );
    expect(audit.rows[0]?.metadata).toEqual({ tenant: "a" });

    // Hierarquia de organizational_units restaurada sem violar a FK auto-referenciada, com
    // parent_id e organization_id preservados exatamente.
    const units = await target.pool.query<{
      id: string;
      organization_id: string;
      parent_id: string | null;
    }>("SELECT id, organization_id, parent_id FROM organizational_units ORDER BY code");
    expect(units.rows).toHaveLength(3);

    const root = units.rows.find((row) => row.id === unitRootId);
    const child = units.rows.find((row) => row.id === unitChildId);
    const grandchild = units.rows.find((row) => row.id === unitGrandchildId);
    expect(root?.parent_id).toBeNull();
    expect(child?.parent_id).toBe(unitRootId);
    expect(grandchild?.parent_id).toBe(unitChildId);
    // Nenhuma unidade cruzou tenant: as tres continuam sob a mesma Organization A.
    expect(root?.organization_id).toBe(orgAId);
    expect(child?.organization_id).toBe(orgAId);
    expect(grandchild?.organization_id).toBe(orgAId);

    // Constraint continua ativa no destino: um filho apontando para um pai inexistente
    // continua sendo recusado pelo Postgres do schema restaurado, nao so no schema de origem.
    await expect(
      target.pool.query(
        `INSERT INTO organizational_units
           (id, organization_id, code, name, type, parent_id, status, created_by_user_id, updated_by_user_id)
         VALUES ($1,$2,'ORPHAN','Unidade Orfa','team',$3,'active',$4,$4)`,
        [`unit_${randomUUID()}`, orgAId, `unit_${randomUUID()}`, userAId]
      )
    ).rejects.toThrow(/foreign key|violat/i);
  }, 120000);

  it("restores correctly even if the dump file has organizational_units rows in reverse (grandchild-first) order", async () => {
    // Prova a defesa em profundidade de restoreSchema: nao depende de o dump ja vir ordenado
    // (o que dumpSchema ja garante) -- um arquivo de dump embaralhado a mao, ou vindo de
    // outra fonte, ainda e restaurado corretamente.
    const dump = await dumpSchema(source.pool, source.schema);
    dump.tables.organizational_units.rows = [...dump.tables.organizational_units.rows].reverse();

    const shuffledTarget = await createPostgresTestDatabase();
    try {
      await assertTargetIsEmpty(shuffledTarget.pool, shuffledTarget.schema, dump);
      await restoreSchema(shuffledTarget.pool, shuffledTarget.schema, dump);

      const units = await shuffledTarget.pool.query<{ id: string; parent_id: string | null }>(
        "SELECT id, parent_id FROM organizational_units"
      );
      expect(units.rows).toHaveLength(3);
      expect(units.rows.find((row) => row.id === unitChildId)?.parent_id).toBe(unitRootId);
      expect(units.rows.find((row) => row.id === unitGrandchildId)?.parent_id).toBe(unitChildId);
    } finally {
      await shuffledTarget.cleanup();
    }
  }, 120000);

  it("demonstrates the underlying risk this fix addresses: Postgres rejects a child organizational_unit inserted before its parent exists", async () => {
    const demo = await createPostgresTestDatabase();
    const demoUserId = `user_${randomUUID()}`;
    const demoOrgId = `org_${randomUUID()}`;
    const demoRootId = `unit_${randomUUID()}`;
    const demoChildId = `unit_${randomUUID()}`;

    try {
      await demo.pool.query(
        "INSERT INTO users (id, name, email, status) VALUES ($1,'Demo User','demo-fk@example.test','active')",
        [demoUserId]
      );
      await demo.pool.query(
        "INSERT INTO organizations (id, name, slug, status) VALUES ($1,'Demo Org',$2,'active')",
        [demoOrgId, `demo-org-${demoOrgId}`]
      );

      // demoRootId nunca e inserido antes -- exatamente o cenario "filho aparece antes do
      // pai" que um dump/restore sem ordenacao explicita poderia reproduzir por acidente.
      await expect(
        demo.pool.query(
          `INSERT INTO organizational_units
               (id, organization_id, code, name, type, parent_id, status, created_by_user_id, updated_by_user_id)
             VALUES ($1,$2,'CHILD','Unidade Filha','team',$3,'active',$4,$4)`,
          [demoChildId, demoOrgId, demoRootId, demoUserId]
        )
      ).rejects.toThrow(/foreign key|violat/i);
    } finally {
      await demo.cleanup();
    }
  }, 90000);

  // Cria uma terceira schema descartavel (migration completa contra o Postgres remoto) so para
  // este teste -- por isso o timeout explicito abaixo, maior que o global de 60s da suite
  // (vitest.config.ts).
  it("refuses to restore into a target schema that already has data (fail-closed, INV central do restore)", async () => {
    const dump = await dumpSchema(source.pool, source.schema);
    const nonEmptyTarget = await createPostgresTestDatabase();

    try {
      await nonEmptyTarget.pool.query(
        "INSERT INTO users (id, name, email, status) VALUES ($1,'Pre-existing','preexisting@example.test','active')",
        [`user_${randomUUID()}`]
      );

      await expect(
        assertTargetIsEmpty(nonEmptyTarget.pool, nonEmptyTarget.schema, dump)
      ).rejects.toThrow(RestoreTargetNotEmptyError);
    } finally {
      await nonEmptyTarget.cleanup();
    }
  }, 90000);
});
