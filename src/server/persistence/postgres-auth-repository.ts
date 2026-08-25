import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { AuthRepository, BeginInvitationIdempotencyInput } from "../auth/repository";
import type {
  AuthIdentity,
  Invitation,
  InvitationIdempotencyKey,
  PlatformAdmin
} from "../auth/types";

export class PostgresAuthRepository implements AuthRepository {
  constructor(readonly connection: pg.Pool | pg.PoolClient) {}

  nextId(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  now() {
    return new Date().toISOString();
  }

  async findAuthIdentityByExternalId(provider: "supabase", externalId: string) {
    const result = await this.connection.query(
      `SELECT * FROM auth_identities WHERE provider = $1 AND external_id = $2`,
      [provider, externalId]
    );
    return result.rows[0] ? mapAuthIdentity(result.rows[0]) : null;
  }

  async findAuthIdentityByUserId(userId: string) {
    const result = await this.connection.query(`SELECT * FROM auth_identities WHERE user_id = $1`, [
      userId
    ]);
    return result.rows[0] ? mapAuthIdentity(result.rows[0]) : null;
  }

  async createAuthIdentity(identity: AuthIdentity) {
    await this.connection.query(
      `
        INSERT INTO auth_identities (id, user_id, provider, external_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        identity.id,
        identity.userId,
        identity.provider,
        identity.externalId,
        identity.createdAt,
        identity.updatedAt
      ]
    );
  }

  async findPlatformAdmin(userId: string) {
    const result = await this.connection.query(`SELECT * FROM platform_admins WHERE user_id = $1`, [
      userId
    ]);
    return result.rows[0] ? mapPlatformAdmin(result.rows[0]) : null;
  }

  async findInvitationById(invitationId: string) {
    const result = await this.connection.query(`SELECT * FROM invitations WHERE id = $1`, [
      invitationId
    ]);
    return result.rows[0] ? mapInvitation(result.rows[0]) : null;
  }

  // SPEC-028 s27: aceite trava a linha do proprio convite antes de materializar
  // User/AuthIdentity/Membership -- mesmo padrao de `findAccessGrantForUpdate`.
  async findInvitationForUpdate(invitationId: string) {
    const result = await this.connection.query(
      `SELECT * FROM invitations WHERE id = $1 FOR UPDATE`,
      [invitationId]
    );
    return result.rows[0] ? mapInvitation(result.rows[0]) : null;
  }

  // SPEC-028 s15: usado para a checagem de negocio legivel antes do INSERT -- o indice parcial
  // unico correspondente (`idx_invitations_one_pending_per_org_email` /
  // `idx_invitations_one_pending_bootstrap_per_email`) e a defesa fisica final contra corrida
  // real (traduzida em `auth/transaction.ts`).
  async findPendingInvitation(organizationId: string | null, email: string) {
    const result =
      organizationId === null
        ? await this.connection.query(
            `SELECT * FROM invitations WHERE organization_id IS NULL AND email = $1 AND status = 'pending'`,
            [email]
          )
        : await this.connection.query(
            `SELECT * FROM invitations WHERE organization_id = $1 AND email = $2 AND status = 'pending'`,
            [organizationId, email]
          );
    return result.rows[0] ? mapInvitation(result.rows[0]) : null;
  }

  async createInvitation(invitation: Invitation) {
    await this.connection.query(
      `
        INSERT INTO invitations (
          id, organization_id, email, role, status, created_by_user_id, resolved_user_id,
          expires_at, accepted_at, accepted_by_user_id, cancelled_at, cancelled_by_user_id,
          created_at, updated_at, organization_name, organization_slug, bootstrap_organization_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `,
      [
        invitation.id,
        invitation.organizationId,
        invitation.email,
        invitation.role,
        invitation.status,
        invitation.createdByUserId,
        invitation.resolvedUserId,
        invitation.expiresAt,
        invitation.acceptedAt,
        invitation.acceptedByUserId,
        invitation.cancelledAt,
        invitation.cancelledByUserId,
        invitation.createdAt,
        invitation.updatedAt,
        invitation.organizationName,
        invitation.organizationSlug,
        invitation.bootstrapOrganizationId
      ]
    );
  }

  async updateInvitation(invitation: Invitation) {
    await this.connection.query(
      `
        UPDATE invitations
        SET status = $2, resolved_user_id = $3, accepted_at = $4, accepted_by_user_id = $5,
            cancelled_at = $6, cancelled_by_user_id = $7, updated_at = $8,
            bootstrap_organization_id = $9
        WHERE id = $1
      `,
      [
        invitation.id,
        invitation.status,
        invitation.resolvedUserId,
        invitation.acceptedAt,
        invitation.acceptedByUserId,
        invitation.cancelledAt,
        invitation.cancelledByUserId,
        invitation.updatedAt,
        invitation.bootstrapOrganizationId
      ]
    );
  }

  async listInvitationsByOrganization(organizationId: string) {
    const result = await this.connection.query(
      `SELECT * FROM invitations WHERE organization_id = $1 ORDER BY created_at DESC, id`,
      [organizationId]
    );
    return result.rows.map(mapInvitation);
  }

  // SPEC-028 s26: mesma armadilha de NULL do schema (0032) -- `organization_id` nulo (bootstrap)
  // exige um caminho de `ON CONFLICT` distinto do caminho com Organization, porque cada um mira
  // um indice parcial unico diferente (nao existe um unico indice cobrindo os dois regimes).
  async beginIdempotency(input: BeginInvitationIdempotencyInput) {
    const id = this.nextId("invidem");
    const now = this.now();
    const inserted =
      input.organizationId === null
        ? await this.connection.query(
            `
              INSERT INTO invitation_idempotency_keys (
                id, organization_id, operation, key_hash, request_fingerprint, status, created_at
              )
              VALUES ($1, NULL, $2, $3, $4, 'pending', $5)
              ON CONFLICT (operation, key_hash) WHERE organization_id IS NULL DO NOTHING
              RETURNING *
            `,
            [id, input.operation, input.keyHash, input.requestFingerprint, now]
          )
        : await this.connection.query(
            `
              INSERT INTO invitation_idempotency_keys (
                id, organization_id, operation, key_hash, request_fingerprint, status, created_at
              )
              VALUES ($1, $2, $3, $4, $5, 'pending', $6)
              ON CONFLICT (organization_id, operation, key_hash) WHERE organization_id IS NOT NULL DO NOTHING
              RETURNING *
            `,
            [
              id,
              input.organizationId,
              input.operation,
              input.keyHash,
              input.requestFingerprint,
              now
            ]
          );

    if (inserted.rows[0]) {
      return { created: true, idempotency: mapIdempotency(inserted.rows[0]) };
    }

    const existing =
      input.organizationId === null
        ? await this.connection.query(
            `SELECT * FROM invitation_idempotency_keys
             WHERE organization_id IS NULL AND operation = $1 AND key_hash = $2`,
            [input.operation, input.keyHash]
          )
        : await this.connection.query(
            `SELECT * FROM invitation_idempotency_keys
             WHERE organization_id = $1 AND operation = $2 AND key_hash = $3`,
            [input.organizationId, input.operation, input.keyHash]
          );

    return { created: false, idempotency: mapIdempotency(existing.rows[0]) };
  }

  async markIdempotencyCompleted(id: string, resultResourceId: string) {
    await this.connection.query(
      `
        UPDATE invitation_idempotency_keys
        SET status = 'completed', result_resource_id = $2, completed_at = $3
        WHERE id = $1
      `,
      [id, resultResourceId, this.now()]
    );
  }

  async markIdempotencyFailed(id: string, failureCategory: string) {
    await this.connection.query(
      `
        UPDATE invitation_idempotency_keys
        SET status = 'failed', failure_category = $2, failed_at = $3
        WHERE id = $1
      `,
      [id, failureCategory.slice(0, 100), this.now()]
    );
  }
}

function mapAuthIdentity(row: Record<string, unknown>): AuthIdentity {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: row.provider as AuthIdentity["provider"],
    externalId: String(row.external_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapPlatformAdmin(row: Record<string, unknown>): PlatformAdmin {
  return {
    userId: String(row.user_id),
    status: row.status as PlatformAdmin["status"],
    grantedByUserId: nullableString(row.granted_by_user_id),
    grantedAt: toIso(row.granted_at),
    revokedAt: nullableIso(row.revoked_at),
    revokedByUserId: nullableString(row.revoked_by_user_id)
  };
}

function mapInvitation(row: Record<string, unknown>): Invitation {
  return {
    id: String(row.id),
    organizationId: nullableString(row.organization_id),
    email: String(row.email),
    role: row.role as Invitation["role"],
    status: row.status as Invitation["status"],
    createdByUserId: String(row.created_by_user_id),
    resolvedUserId: nullableString(row.resolved_user_id),
    expiresAt: toIso(row.expires_at),
    acceptedAt: nullableIso(row.accepted_at),
    acceptedByUserId: nullableString(row.accepted_by_user_id),
    cancelledAt: nullableIso(row.cancelled_at),
    cancelledByUserId: nullableString(row.cancelled_by_user_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    organizationName: nullableString(row.organization_name),
    organizationSlug: nullableString(row.organization_slug),
    bootstrapOrganizationId: nullableString(row.bootstrap_organization_id)
  };
}

function mapIdempotency(row: Record<string, unknown>): InvitationIdempotencyKey {
  return {
    id: String(row.id),
    organizationId: nullableString(row.organization_id),
    operation: row.operation as InvitationIdempotencyKey["operation"],
    keyHash: String(row.key_hash),
    requestFingerprint: String(row.request_fingerprint),
    status: row.status as InvitationIdempotencyKey["status"],
    resultResourceId: nullableString(row.result_resource_id),
    failureCategory: nullableString(row.failure_category),
    createdAt: toIso(row.created_at),
    completedAt: nullableIso(row.completed_at),
    failedAt: nullableIso(row.failed_at)
  };
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: unknown) {
  return value === null || value === undefined ? null : toIso(value);
}
