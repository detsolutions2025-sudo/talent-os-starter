import { randomUUID } from "node:crypto";

// Port (SPEC-014 "Criptografia" / "Secret Management"). No implementation of this interface
// may ever be backed by the main PostgreSQL database, and no implementation may implement its
// own cryptography. Phase 11 ships exactly one implementation of this port --
// InMemorySecretManager, development/test only. A production-grade implementation (backed by
// a real KMS/Secret Manager/Vault) is an explicit, external dependency of a future phase; see
// `assertSecretManagerAllowedInEnvironment` below for the boot-time guard against accidentally
// running the fake in production.
export interface SecretManager {
  store(
    organizationId: string,
    provider: string,
    secret: string
  ): Promise<{ secretReference: string; maskedIdentifier: string }>;
  resolve(secretReference: string, organizationId: string): Promise<string>;
  revoke(secretReference: string, organizationId: string): Promise<void>;
}

// Centralized, single masking rule for every provider (SPEC-014 "Mascaramento de
// Credenciais"). Always reveals a fixed-length mask plus at most the last 4 characters, and
// never more than length-1 characters, so a very short secret is never fully exposed. The
// prefix length never varies with the secret's real length, so the mask itself never leaks
// how long the original secret was.
const MASK_PREFIX = "*".repeat(12);

export function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  const visibleCount = Math.min(4, Math.max(0, trimmed.length - 1));
  const visible = visibleCount > 0 ? trimmed.slice(-visibleCount) : "";
  return `${MASK_PREFIX}${visible}`;
}

export function assertSecretManagerAllowedInEnvironment(
  appEnv = process.env.APP_ENV ?? "development"
) {
  if (appEnv === "production") {
    throw new Error(
      "InMemorySecretManager cannot be used when APP_ENV=production. A production Secret " +
        "Manager/KMS/Vault integration must be configured before enabling customer_managed or " +
        "platform_managed credentials in production."
    );
  }
}

// Used only when APP_ENV=production and no real Secret Manager/KMS/Vault integration has been
// wired yet (see src/server/index.ts). Unlike InMemorySecretManager, this never throws at
// construction time -- the server still boots, and every AI endpoint that does not need a real
// secret (Feature Catalog, Provider Catalog, Model Registry, Prompt Registry, routing, policy
// toggles) keeps working, consistent with ADR-0016 ("O Talent OS deve operar integralmente sem
// IA"). Any attempt to actually store or resolve a secret fails safely and immediately instead:
// no real credential is ever resolved, and no in-memory fake is silently substituted for a real
// Secret Manager.
export class UnavailableSecretManager implements SecretManager {
  async store(): Promise<{ secretReference: string; maskedIdentifier: string }> {
    throw new Error("ai_secret_manager_unavailable");
  }

  async resolve(): Promise<string> {
    throw new Error("ai_secret_manager_unavailable");
  }

  async revoke(): Promise<void> {
    // Nothing was ever actually stored by this implementation -- revocation is a safe no-op.
  }
}

type StoredSecret = {
  organizationId: string;
  secret: string;
};

// Development/test only. Stores secrets in process memory, never on disk, never in
// PostgreSQL. References are opaque (no organizationId embedded in the string); isolation is
// enforced by comparing the caller-supplied organizationId against the value recorded at
// store() time, not by parsing the reference.
export class InMemorySecretManager implements SecretManager {
  private readonly secrets = new Map<string, StoredSecret>();

  constructor(appEnv = process.env.APP_ENV ?? "development") {
    assertSecretManagerAllowedInEnvironment(appEnv);
  }

  async store(organizationId: string, provider: string, secret: string) {
    const secretReference = `mem-secret-${provider}-${randomUUID()}`;
    this.secrets.set(secretReference, { organizationId, secret });
    return { secretReference, maskedIdentifier: maskSecret(secret) };
  }

  async resolve(secretReference: string, organizationId: string) {
    const entry = this.secrets.get(secretReference);
    if (!entry || entry.organizationId !== organizationId) {
      throw new Error("secret_reference_not_found");
    }
    return entry.secret;
  }

  async revoke(secretReference: string, organizationId: string) {
    const entry = this.secrets.get(secretReference);
    if (!entry || entry.organizationId !== organizationId) {
      return;
    }
    this.secrets.delete(secretReference);
  }
}
