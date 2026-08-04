export type TenantId = string & { readonly __brand: "TenantId" };

export type TenantContext = {
  readonly tenantId: TenantId;
};

export class MissingTenantError extends Error {
  constructor() {
    super("Tenant context is required for business data access.");
    this.name = "MissingTenantError";
  }
}

export function toTenantId(value: string): TenantId {
  const normalized = value.trim();

  if (!normalized) {
    throw new MissingTenantError();
  }

  return normalized as TenantId;
}

export function createTenantContext(tenantId: string): TenantContext {
  return {
    tenantId: toTenantId(tenantId)
  };
}

export function requireTenantContext(context: TenantContext | null | undefined): TenantContext {
  if (!context?.tenantId) {
    throw new MissingTenantError();
  }

  return context;
}
