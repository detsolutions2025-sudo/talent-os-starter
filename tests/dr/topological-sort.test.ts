import { describe, expect, it } from "vitest";
import { topologicalSort } from "../../src/server/backup-restore/schema-introspection";

describe("topologicalSort (backup/restore table ordering)", () => {
  it("orders a referenced table before the table that references it", () => {
    const deps = new Map([["memberships", new Set(["organizations", "users"])]]);

    const order = topologicalSort(["memberships", "organizations", "users"], deps);

    expect(order.indexOf("organizations")).toBeLessThan(order.indexOf("memberships"));
    expect(order.indexOf("users")).toBeLessThan(order.indexOf("memberships"));
  });

  it("handles a chain of dependencies (A -> B -> C) in a single consistent order", () => {
    const deps = new Map([
      ["onboardings", new Set(["employments"])],
      ["employments", new Set(["organization_people"])]
    ]);

    const order = topologicalSort(["onboardings", "employments", "organization_people"], deps);

    expect(order).toEqual(["organization_people", "employments", "onboardings"]);
  });

  it("never loops forever on a self-reference and still places the table once", () => {
    const deps = new Map([["organizational_units", new Set(["organizational_units"])]]);

    const order = topologicalSort(["organizational_units"], deps);

    expect(order).toEqual(["organizational_units"]);
  });

  it("keeps tables with no dependency between them in their original relative order", () => {
    const order = topologicalSort(["users", "organizations"], new Map());

    expect(order).toEqual(["users", "organizations"]);
  });
});
