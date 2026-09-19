import type pg from "pg";
import { createCoreService } from "./core/service";
import { normalizeEmail } from "./core/normalization";
import type { Actor } from "./core/types";
import { PostgresCoreRepository } from "./persistence/postgres-core-repository";
import { PostgresAuthRepository } from "./persistence/postgres-auth-repository";

// Migration 0032 (comentario da tabela `platform_admins`): "Primeiro Platform Admin e inserido
// por processo operacional manual, fora do fluxo HTTP desta Fase." `grantPlatformAdmin()` e essa
// via -- consumida pelo CLI `create-platform-admin.ts`, nunca por nenhuma rota HTTP. Nunca toca
// o Supabase Auth (nenhuma service-role key, nenhuma senha) -- a pessoa ja precisa existir la; a
// funcao apenas liga o `externalId` (UID do Supabase Auth) ja existente ao User/AuthIdentity/
// PlatformAdmin locais.
//
// Idempotente: chamar de novo com os mesmos dados reaproveita o User/AuthIdentity por e-mail e
// reativa um Platform Admin previamente revogado, sem duplicar nada.
const SYSTEM_ACTOR: Actor = { kind: "platform", userId: null };

export type GrantPlatformAdminInput = {
  email: string;
  name: string;
  externalId: string;
};

export type GrantPlatformAdminResult = {
  userId: string;
  userCreated: boolean;
  identityCreated: boolean;
  grantedNow: boolean;
};

export async function grantPlatformAdmin(
  pool: pg.Pool,
  input: GrantPlatformAdminInput
): Promise<GrantPlatformAdminResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const externalId = input.externalId.trim();

  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required.");
  }
  if (!name) {
    throw new Error("A name is required.");
  }
  if (!externalId) {
    throw new Error("A Supabase Auth external id (UID) is required.");
  }

  const coreRepository = new PostgresCoreRepository(pool);
  const authRepository = new PostgresAuthRepository(pool);
  const core = createCoreService(coreRepository);

  let user = await coreRepository.findUserByEmail(email);
  let userCreated = false;
  if (!user) {
    user = await core.createUser(SYSTEM_ACTOR, { name, email, status: "active" });
    userCreated = true;
  } else if (user.status !== "active") {
    throw new Error(`User ${user.id} (${email}) exists but is inactive -- reactivate it first.`);
  }

  const existingIdentity = await authRepository.findAuthIdentityByExternalId(
    "supabase",
    externalId
  );
  if (existingIdentity && existingIdentity.userId !== user.id) {
    throw new Error(
      `External id "${externalId}" is already linked to a different User (${existingIdentity.userId}).`
    );
  }

  const identityForUser = await authRepository.findAuthIdentityByUserId(user.id);
  if (identityForUser && identityForUser.externalId !== externalId) {
    throw new Error(
      `User ${user.id} already has an AuthIdentity linked to a different external id (immutable -- never overwritten by this function).`
    );
  }

  let identityCreated = false;
  if (!identityForUser) {
    const now = authRepository.now();
    await authRepository.createAuthIdentity({
      id: authRepository.nextId("authid"),
      userId: user.id,
      provider: "supabase",
      externalId,
      createdAt: now,
      updatedAt: now
    });
    identityCreated = true;
  }

  const platformAdmin = await authRepository.findPlatformAdmin(user.id);
  let grantedNow = false;
  if (!platformAdmin) {
    await pool.query(
      `INSERT INTO platform_admins (user_id, status, granted_by_user_id) VALUES ($1, 'active', NULL)`,
      [user.id]
    );
    grantedNow = true;
  } else if (platformAdmin.status !== "active") {
    await pool.query(
      `UPDATE platform_admins SET status = 'active', revoked_at = NULL, revoked_by_user_id = NULL WHERE user_id = $1`,
      [user.id]
    );
    grantedNow = true;
  }

  return { userId: user.id, userCreated, identityCreated, grantedNow };
}
