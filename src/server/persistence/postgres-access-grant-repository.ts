import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Membership } from "../core/types";
import type {
  BeginAccessGrantIdempotencyInput,
  AccessGrantRepository
} from "../access-grants/repository";
import type {
  AccessGrant,
  AccessGrantEmploymentEligibility,
  AccessGrantIdempotencyKey,
  AccessGrantOrganizationPersonEligibility
} from "../access-grants/types";

export class PostgresAccessGrantRepository implements AccessGrantRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async beginIdempotency(input: BeginAccessGrantIdempotencyInput) {
    const id = this.nextId("agrantidem");
    const now = this.now();
    const inserted = await this.connection.query(
      `
        INSERT INTO access_grant_idempotency_keys (
          id, organization_id, operation, scope_id, key_hash, request_fingerprint, status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
        ON CONFLICT (organization_id, operation, scope_id, key_hash) DO NOTHING
        RETURNING *
      `,
      [
        id,
        input.organizationId,
        input.operation,
        input.scopeId,
        input.keyHash,
        input.requestFingerprint,
        now
      ]
    );
    if (inserted.rows[0]) {
      return { created: true, idempotency: mapIdempotency(inserted.rows[0]) };
    }
    const existing = await this.connection.query(
      `
        SELECT *
        FROM access_grant_idempotency_keys
        WHERE organization_id = $1
          AND operation = $2
          AND scope_id IS NOT DISTINCT FROM $3
          AND key_hash = $4
        FOR UPDATE
      `,
      [input.organizationId, input.operation, input.scopeId, input.keyHash]
    );
    return { created: false, idempotency: mapIdempotency(existing.rows[0]) };
  }

  async markIdempotencyCompleted(id: string, resultResourceId: string) {
    await this.connection.query(
      `
        UPDATE access_grant_idempotency_keys
        SET status = 'completed', result_resource_id = $2, completed_at = $3
        WHERE id = $1
      `,
      [id, resultResourceId, this.now()]
    );
  }

  async markIdempotencyFailed(id: string, failureCategory: string) {
    await this.connection.query(
      `
        UPDATE access_grant_idempotency_keys
        SET status = 'failed', failure_category = $2, failed_at = $3
        WHERE id = $1
      `,
      [id, failureCategory.slice(0, 100), this.now()]
    );
  }

  // SPEC-027 s8/s9: FOR SHARE, nunca FOR UPDATE -- AccessGrant nunca escreve em `employments`,
  // apenas trava a linha para impedir que o estado mude por baixo da operacao em curso (mesmo
  // padrao de `findEmploymentForEligibility`, offboardings).
  async findEmploymentForEligibility(
    employmentId: string
  ): Promise<AccessGrantEmploymentEligibility | null> {
    const result = await this.connection.query(
      `
        SELECT id, organization_id, organization_person_id, status
        FROM employments
        WHERE id = $1
        FOR SHARE
      `,
      [employmentId]
    );
    return result.rows[0] ? mapEmploymentEligibility(result.rows[0]) : null;
  }

  async findOrganizationPersonForEligibility(
    organizationPersonId: string
  ): Promise<AccessGrantOrganizationPersonEligibility | null> {
    // SEM lock (nem FOR SHARE, nem FOR UPDATE) -- deliberado. SPEC-025 s5.2/s8:
    // `OrganizationPerson` "nao recebe lifecycle artificial" e "nao possui estado proprio
    // relevante" para elegibilidade de AccessGrant (SPEC-027 s8), entao nao ha nada a proteger
    // de mutacao concorrente aqui. Achado de concorrencia real (Fase 28, gate de concorrencia):
    // um `FOR SHARE` aqui, combinado com a ordem de lock de `employments/service.ts` (Employment
    // FOR UPDATE -> OrganizationPerson FOR UPDATE), produzia um DEADLOCK real e reproduzivel
    // entre `grant` e `Employment.end()` (40P01) sempre que a corrida real vencia numa certa
    // ordem -- exatamente o `grant x Employment.end()` que SPEC-027 s26 promete nunca gerar
    // conflito por si so. Removido para fechar essa janela; nenhuma outra mudanca de
    // comportamento.
    const result = await this.connection.query(
      "SELECT id, organization_id FROM organization_people WHERE id = $1",
      [organizationPersonId]
    );
    return result.rows[0]
      ? { id: String(result.rows[0].id), organizationId: String(result.rows[0].organization_id) }
      : null;
  }

  // AccessGrant nunca escreve em `Membership` por conta propria (SPEC-027 s13) -- mesmo padrao
  // de `OffboardingRepository.findMembershipForUpdate`. O `FOR UPDATE` aqui e o que permite
  // revalidar `Membership.status` sob lock ANTES de decidir se `CoreService.updateMembership`
  // deve ser chamado (secao "Membership ja inactive").
  async findMembershipForUpdate(membershipId: string) {
    const result = await this.connection.query(
      "SELECT * FROM memberships WHERE id = $1 FOR UPDATE",
      [membershipId]
    );
    return result.rows[0] ? mapMembership(result.rows[0]) : null;
  }

  async findActiveGrantForMembership(organizationId: string, membershipId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM access_grants
        WHERE organization_id = $1 AND membership_id = $2 AND status = 'active'
      `,
      [organizationId, membershipId]
    );
    return result.rows[0] ? mapAccessGrant(result.rows[0]) : null;
  }

  async findAccessGrantById(accessGrantId: string) {
    const result = await this.connection.query("SELECT * FROM access_grants WHERE id = $1", [
      accessGrantId
    ]);
    return result.rows[0] ? mapAccessGrant(result.rows[0]) : null;
  }

  async findAccessGrantForUpdate(accessGrantId: string) {
    const result = await this.connection.query(
      "SELECT * FROM access_grants WHERE id = $1 FOR UPDATE",
      [accessGrantId]
    );
    return result.rows[0] ? mapAccessGrant(result.rows[0]) : null;
  }

  async createAccessGrant(accessGrant: AccessGrant) {
    await this.connection.query(
      `
        INSERT INTO access_grants (
          id, organization_id, organization_person_id, membership_id, employment_id,
          provenance_type, grant_reason, status, created_by_user_id, created_at, updated_at,
          revoked_at, revoked_by_user_id, revocation_reason_category
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      accessGrantParams(accessGrant)
    );
  }

  async updateAccessGrant(accessGrant: AccessGrant) {
    // $5 (employment_id), $6 (provenance_type) e $7 (grant_reason) nao sao escritos por este
    // UPDATE -- proveniencia e imutavel apos a criacao (SPEC-027 s34). Sao incluidos na clausula
    // WHERE (IS NOT DISTINCT FROM, por serem nullable) por dois motivos: (1) sem nenhum uso na
    // query, o driver `pg` nao consegue inferir o tipo do parametro e rejeita com
    // "could not determine data type of parameter"; (2) reforcam, em tempo de aplicacao, a
    // mesma invariante ja garantida fisicamente por `enforce_access_grant_update_rules`.
    await this.connection.query(
      `
        UPDATE access_grants
        SET status = $8,
            updated_at = $11,
            revoked_at = $12,
            revoked_by_user_id = $13,
            revocation_reason_category = $14
        WHERE id = $1
          AND organization_id = $2
          AND organization_person_id = $3
          AND membership_id = $4
          AND employment_id IS NOT DISTINCT FROM $5
          AND provenance_type = $6
          AND grant_reason IS NOT DISTINCT FROM $7
          AND created_by_user_id = $9
          AND created_at = $10
      `,
      accessGrantParams(accessGrant)
    );
  }

  async listAccessGrantsByOrganization(organizationId: string) {
    const result = await this.connection.query(
      "SELECT * FROM access_grants WHERE organization_id = $1 ORDER BY created_at DESC, id DESC",
      [organizationId]
    );
    return result.rows.map(mapAccessGrant);
  }

  async listAccessGrantsByPerson(organizationId: string, organizationPersonId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM access_grants
        WHERE organization_id = $1 AND organization_person_id = $2
        ORDER BY created_at DESC, id DESC
      `,
      [organizationId, organizationPersonId]
    );
    return result.rows.map(mapAccessGrant);
  }

  async listAccessGrantsByMembership(organizationId: string, membershipId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM access_grants
        WHERE organization_id = $1 AND membership_id = $2
        ORDER BY created_at DESC, id DESC
      `,
      [organizationId, membershipId]
    );
    return result.rows.map(mapAccessGrant);
  }

  async listAccessGrantsByEmployment(organizationId: string, employmentId: string) {
    const result = await this.connection.query(
      `
        SELECT *
        FROM access_grants
        WHERE organization_id = $1 AND employment_id = $2
        ORDER BY created_at DESC, id DESC
      `,
      [organizationId, employmentId]
    );
    return result.rows.map(mapAccessGrant);
  }
}

function accessGrantParams(accessGrant: AccessGrant) {
  return [
    accessGrant.id,
    accessGrant.organizationId,
    accessGrant.organizationPersonId,
    accessGrant.membershipId,
    accessGrant.employmentId,
    accessGrant.provenanceType,
    accessGrant.grantReason,
    accessGrant.status,
    accessGrant.createdByUserId,
    accessGrant.createdAt,
    accessGrant.updatedAt,
    accessGrant.revokedAt,
    accessGrant.revokedByUserId,
    accessGrant.revocationReasonCategory
  ];
}

function mapAccessGrant(row: Record<string, unknown>): AccessGrant {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    organizationPersonId: String(row.organization_person_id),
    membershipId: String(row.membership_id),
    employmentId: nullableString(row.employment_id),
    provenanceType: row.provenance_type as AccessGrant["provenanceType"],
    grantReason: nullableString(row.grant_reason),
    status: row.status as AccessGrant["status"],
    createdByUserId: String(row.created_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    revokedAt: nullableIso(row.revoked_at),
    revokedByUserId: nullableString(row.revoked_by_user_id),
    revocationReasonCategory:
      row.revocation_reason_category as AccessGrant["revocationReasonCategory"]
  };
}

function mapIdempotency(row: Record<string, unknown>): AccessGrantIdempotencyKey {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    operation: row.operation as AccessGrantIdempotencyKey["operation"],
    scopeId: nullableString(row.scope_id),
    keyHash: String(row.key_hash),
    requestFingerprint: String(row.request_fingerprint),
    status: row.status as AccessGrantIdempotencyKey["status"],
    resultResourceId: nullableString(row.result_resource_id),
    failureCategory: nullableString(row.failure_category),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    failedAt: nullableIso(row.failed_at)
  };
}

function mapEmploymentEligibility(row: Record<string, unknown>): AccessGrantEmploymentEligibility {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    organizationPersonId: String(row.organization_person_id),
    status: row.status as AccessGrantEmploymentEligibility["status"]
  };
}

function mapMembership(row: Record<string, unknown>): Membership {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    role: row.role as Membership["role"],
    status: row.status as Membership["status"],
    joinedAt: toIso(row.joined_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function nullableIso(value: unknown) {
  return value === null || value === undefined ? null : toIso(value);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
