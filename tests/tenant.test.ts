import { describe, expect, it } from "vitest";
import {
  createTenantContext,
  MissingTenantError,
  requireTenantContext
} from "../src/shared/tenant";

describe("tenant context", () => {
  it("rejects access without a tenant", () => {
    expect(() => requireTenantContext(undefined)).toThrow(MissingTenantError);
  });

  it("creates a validated tenant context", () => {
    const context = createTenantContext("company_test_a");

    expect(requireTenantContext(context)).toEqual({ tenantId: "company_test_a" });
  });

  it("rejects blank tenant identifiers from the browser", () => {
    expect(() => createTenantContext("   ")).toThrow(MissingTenantError);
  });
});
