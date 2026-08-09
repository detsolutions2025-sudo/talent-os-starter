import { describe, expect, it } from "vitest";
import { fingerprint } from "../../src/server/blueprints/manifest";

// Teste puro (sem Postgres): confirma que a canonicalizacao usada antes do SHA-256 e
// realmente deterministica em relacao a ordem de insercao de propriedades -- nao apenas
// confiar que um `JSON.stringify` simples bastaria (revisao final da Fase 15, item 5).
describe("Fase 15 - Blueprint Organizacional - fingerprint (canonicalizacao)", () => {
  it("mesmo objeto com ordem de propriedades diferente produz o mesmo fingerprint", () => {
    const a = { code: "ENG", name: "Engenharia", status: "active", type: "department" };
    const b = { type: "department", status: "active", name: "Engenharia", code: "ENG" };

    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("objetos aninhados com ordem diferente tambem produzem o mesmo fingerprint", () => {
    const a = {
      questionCatalogItemId: "q1",
      code: "Q-1",
      title: "Pergunta",
      nested: { b: 2, a: 1 }
    };
    const b = {
      nested: { a: 1, b: 2 },
      title: "Pergunta",
      code: "Q-1",
      questionCatalogItemId: "q1"
    };

    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("conteudo semanticamente diferente produz fingerprints diferentes", () => {
    const a = { code: "ENG", name: "Engenharia" };
    const b = { code: "ENG", name: "Engenharia Alterada" };

    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("mesmo objeto literal chamado duas vezes e determinístico (idempotente)", () => {
    const snapshot = { competencyCatalogItemId: "c1", code: "CMP", category: "technical" };
    expect(fingerprint(snapshot)).toBe(fingerprint({ ...snapshot }));
  });

  it("ordem de itens em arrays permanece significativa (nao e reordenada)", () => {
    const a = { items: ["x", "y"] };
    const b = { items: ["y", "x"] };

    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("produz sempre uma string hexadecimal SHA-256 de 64 caracteres", () => {
    const value = fingerprint({ any: "value" });
    expect(value).toMatch(/^[a-f0-9]{64}$/);
  });
});
