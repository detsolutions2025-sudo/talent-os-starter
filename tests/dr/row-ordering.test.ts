import { describe, expect, it } from "vitest";
import {
  RowCycleError,
  sortRowsBySelfReference
} from "../../src/server/backup-restore/row-ordering";
import type { SelfReferenceForeignKey } from "../../src/server/backup-restore/schema-introspection";

// FK real de organizational_units: FOREIGN KEY (organization_id, parent_id) REFERENCES
// organizational_units (organization_id, id) -- composta, com parent_id apontando para id.
const organizationalUnitsForeignKey: SelfReferenceForeignKey = {
  localColumns: ["organization_id", "parent_id"],
  referencedColumns: ["organization_id", "id"]
};

describe("sortRowsBySelfReference (auto-referencia intra-tabela para dump/restore)", () => {
  it("orders a grandchild-first, root-last input into root -> child -> grandchild", () => {
    const grandchild = { id: "unit-3", organization_id: "org-1", parent_id: "unit-2" };
    const root = { id: "unit-1", organization_id: "org-1", parent_id: null };
    const child = { id: "unit-2", organization_id: "org-1", parent_id: "unit-1" };

    const ordered = sortRowsBySelfReference(
      "organizational_units",
      [grandchild, root, child],
      [organizationalUnitsForeignKey]
    );

    expect(ordered.map((row) => row.id)).toEqual(["unit-1", "unit-2", "unit-3"]);
  });

  it("never depends on which column comes first in the composite key (organization_id vs parent_id)", () => {
    // Duas Organizations diferentes, cada uma com sua propria raiz -- garante que o pareamento
    // usa (organization_id, parent_id) -> (organization_id, id) e nao so parent_id -> id
    // (o que poderia casar erroneamente entre tenants se os dois usassem o mesmo id local).
    const rootB = { id: "unit-1", organization_id: "org-B", parent_id: null };
    const childB = { id: "unit-2", organization_id: "org-B", parent_id: "unit-1" };
    const rootA = { id: "unit-1", organization_id: "org-A", parent_id: null };
    const childA = { id: "unit-2", organization_id: "org-A", parent_id: "unit-1" };

    const ordered = sortRowsBySelfReference(
      "organizational_units",
      [childA, childB, rootA, rootB],
      [organizationalUnitsForeignKey]
    );

    const indexOf = (organizationId: string, id: string) =>
      ordered.findIndex((row) => row.organization_id === organizationId && row.id === id);

    expect(indexOf("org-A", "unit-1")).toBeLessThan(indexOf("org-A", "unit-2"));
    expect(indexOf("org-B", "unit-1")).toBeLessThan(indexOf("org-B", "unit-2"));
  });

  it("leaves rows untouched when there is no self-reference foreign key", () => {
    const rows = [{ id: "a" }, { id: "b" }];

    expect(sortRowsBySelfReference("users", rows, [])).toEqual(rows);
  });

  it("treats a NULL local column as a root (Postgres never enforces the FK when it is NULL)", () => {
    const root = { id: "unit-1", organization_id: "org-1", parent_id: null };

    expect(() =>
      sortRowsBySelfReference("organizational_units", [root], [organizationalUnitsForeignKey])
    ).not.toThrow();
  });

  it("fails closed with RowCycleError instead of guessing an order or restoring partially", () => {
    // So alcancavel via UPDATE apos o INSERT original (nunca via INSERT direto, que sempre
    // respeita a FK) -- ver comentario em dump.ts -- mas o restore precisa recusar mesmo assim.
    const a = { id: "unit-a", organization_id: "org-1", parent_id: "unit-b" };
    const b = { id: "unit-b", organization_id: "org-1", parent_id: "unit-a" };

    expect(() =>
      sortRowsBySelfReference("organizational_units", [a, b], [organizationalUnitsForeignKey])
    ).toThrow(RowCycleError);
  });

  it("throws a clear error when a row points to a parent missing from the dump (inconsistent input)", () => {
    const orphan = { id: "unit-2", organization_id: "org-1", parent_id: "unit-missing" };

    expect(() =>
      sortRowsBySelfReference("organizational_units", [orphan], [organizationalUnitsForeignKey])
    ).toThrow(/does not exist in this dump/);
  });
});
