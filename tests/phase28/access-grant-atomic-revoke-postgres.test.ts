import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessGrantService } from "../../src/server/access-grants/service";
import {
  createAccessGrantTransactionRunner,
  type AccessGrantTransactionRunner
} from "../../src/server/access-grants/transaction";
import type { Actor } from "../../src/server/core/types";
import { PostgresAccessGrantRepository } from "../../src/server/persistence/postgres-access-grant-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import { addMembership, createActiveEmploymentFixture, grantAccess } from "./helpers";

// Fase 28 (SPEC-027 v1.0 s13/s28/s29; ADR-0025 "Revogacao"). Gate de atomicidade: prova
// FISICAMENTE -- nao apenas por inspecao de codigo -- que `revoke` mantem `AccessGrant` e
// `Membership` na MESMA transacao real. Um `AccessGrantRepository.updateAccessGrant` que falha
// DEPOIS de `CoreService.updateMembership` ja ter escrito com sucesso deve reverter as duas
// mutacoes juntas via ROLLBACK -- nunca deixar `Membership` desativada com `AccessGrant`
// permanecendo `active` (nem o inverso).
class PoisonedAfterMembershipUpdateRepository extends PostgresAccessGrantRepository {
  async updateAccessGrant(): Promise<void> {
    throw new Error("forced_failure_after_membership_update");
  }
}

function createPoisonedRunner(pool: PostgresTestDatabase["pool"]): AccessGrantTransactionRunner {
  return async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        accessGrants: new PoisonedAfterMembershipUpdateRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}

describe("Fase 28 - AccessGrant (gate de atomicidade da revogacao)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  it("falha apos Membership.update e antes do commit reverte AMBAS as mutacoes (rollback real)", async () => {
    const fixture = await createActiveEmploymentFixture(database, "atomic-1");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "atomic-1"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    const before = await database.pool.query("SELECT status FROM memberships WHERE id = $1", [
      membershipId
    ]);
    expect(before.rows[0].status).toBe("active");

    const poisonedService = new AccessGrantService(
      new PostgresCoreRepository(database.pool),
      new PostgresAccessGrantRepository(database.pool),
      createPoisonedRunner(database.pool)
    );
    const actor: Actor = { kind: "user", userId: fixture.ownerId };

    await expect(
      poisonedService.revoke(
        actor,
        fixture.organizationId,
        grant.body.id,
        { revocationReasonCategory: "administrative_correction" },
        crypto.randomUUID()
      )
    ).rejects.toThrow(/forced_failure_after_membership_update/);

    // Prova fisica direta (bypass do service, leitura crua): a mutacao de Membership feita por
    // `CoreService.updateMembership` DENTRO da mesma transacao foi revertida junto com a falha
    // do `AccessGrant` -- nunca commitada isoladamente.
    const afterMembership = await database.pool.query(
      "SELECT status FROM memberships WHERE id = $1",
      [membershipId]
    );
    expect(afterMembership.rows[0].status).toBe("active");

    const afterGrant = await database.pool.query("SELECT status FROM access_grants WHERE id = $1", [
      grant.body.id
    ]);
    expect(afterGrant.rows[0].status).toBe("active");
  });

  it("ultimo owner: negacao do CoreService nao deixa nenhum estado parcial (prova fisica)", async () => {
    const fixture = await createActiveEmploymentFixture(database, "atomic-2");
    const memberships = await database.pool.query(
      "SELECT id, status FROM memberships WHERE organization_id = $1 AND role = 'owner'",
      [fixture.organizationId]
    );
    const ownerMembershipId = String(memberships.rows[0].id);

    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId: ownerMembershipId,
      provenanceType: "administrative",
      grantReason: "AccessGrant sobre o unico owner, para prova fisica de rollback."
    }).expect(201);

    const service = new AccessGrantService(
      new PostgresCoreRepository(database.pool),
      new PostgresAccessGrantRepository(database.pool),
      createAccessGrantTransactionRunner(database.pool)
    );
    const actor: Actor = { kind: "user", userId: fixture.ownerId };

    await expect(
      service.revoke(
        actor,
        fixture.organizationId,
        grant.body.id,
        { revocationReasonCategory: "administrative_correction" },
        crypto.randomUUID()
      )
    ).rejects.toMatchObject({ code: "last_owner_required" });

    const membershipAfter = await database.pool.query(
      "SELECT status FROM memberships WHERE id = $1",
      [ownerMembershipId]
    );
    expect(membershipAfter.rows[0].status).toBe("active");

    const grantAfter = await database.pool.query("SELECT status FROM access_grants WHERE id = $1", [
      grant.body.id
    ]);
    expect(grantAfter.rows[0].status).toBe("active");
  });
});
