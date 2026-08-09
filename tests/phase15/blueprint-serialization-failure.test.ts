import { describe, expect, it } from "vitest";
import { isSerializationFailure } from "../../src/server/blueprints/service";

// Teste puro (sem Postgres): revisao final da Fase 15, item 14 -- prova explicitamente que
// `isSerializationFailure` reconhece o codigo 40001 (serialization failure do PostgreSQL) e
// somente ele, sem depender apenas de uma ativacao concorrente real como prova indireta.
describe("Fase 15 - Blueprint Organizacional - deteccao de serialization failure (40001)", () => {
  it("reconhece um erro com code 40001", () => {
    expect(isSerializationFailure({ code: "40001" })).toBe(true);
  });

  it("nao reconhece um erro de violacao de unicidade (23505)", () => {
    expect(isSerializationFailure({ code: "23505" })).toBe(false);
  });

  it("nao reconhece um Error comum sem propriedade code", () => {
    expect(isSerializationFailure(new Error("random failure"))).toBe(false);
  });

  it("nao reconhece null/undefined/valores primitivos", () => {
    expect(isSerializationFailure(null)).toBe(false);
    expect(isSerializationFailure(undefined)).toBe(false);
    expect(isSerializationFailure("40001")).toBe(false);
  });

  it("nao reconhece um objeto com code em formato inesperado", () => {
    expect(isSerializationFailure({ code: 40001 })).toBe(false);
    expect(isSerializationFailure({ code: "40001", extra: true })).toBe(true);
  });
});
