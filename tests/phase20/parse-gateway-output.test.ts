import { describe, expect, it } from "vitest";
import { parseGatewayOutput } from "../../src/server/pre-analyses/service";
import { preAnalysisOutputLimits } from "../../src/server/pre-analyses/types";

// Fase 20 (SPEC-023 v1.1) -- revisao destrutiva final, Ponto 2. Testes unitarios PUROS (sem
// banco, sem HTTP, sem AIGateway) contra `parseGatewayOutput`, exatamente porque a revisao
// confirmou que `MinimalJsonSchema` (Fase 11) nao valida `additionalProperties`, nao valida o
// conteudo de arrays/objetos aninhados, nao valida min/max length nem enums -- toda essa defesa
// e responsabilidade exclusiva desta funcao. O objetivo e provar que NENHUMA saida do provider
// consegue fabricar informacao estrutural que a SPEC-023 proibe (score/ranking/recommendation/
// decisao), independentemente das limitacoes do Gateway.

const validFinding = { category: "ponto_forte", text: "t".repeat(20), evidenceRefs: ["ev1"] };
const validOutput = {
  summary: "s".repeat(20),
  limitations: "l".repeat(20),
  findings: [validFinding]
};

describe("parseGatewayOutput -- validacao defensiva do output do provider", () => {
  it("aceita um output valido minimo (baseline)", () => {
    expect(parseGatewayOutput(validOutput)).toEqual(validOutput);
  });

  it("aceita findings vazio (zero achados e legitimo, SPEC-023 Sec 4.6)", () => {
    expect(parseGatewayOutput({ ...validOutput, findings: [] })).toEqual({
      ...validOutput,
      findings: []
    });
  });

  // --------------------------------------------------------------------------------------
  // Root: nao-objeto / null / array
  // --------------------------------------------------------------------------------------
  it.each([null, undefined, "string", 42, true, [], [validOutput], () => {}])(
    "rejeita raiz que nao e um objeto plano: %p",
    (raw) => {
      expect(parseGatewayOutput(raw)).toBeNull();
    }
  );

  // --------------------------------------------------------------------------------------
  // Root: propriedades extras -- inclusive tentativas de score/ranking/recommendation/decisao
  // --------------------------------------------------------------------------------------
  it.each([
    { score: 100 },
    { overall_score: 0.9 },
    { fit_score: 87 },
    { ranking: 1 },
    { rank: "top" },
    { recommendation: "hire" },
    { recommendation_to_hire: true },
    { approve: true },
    { reject: false },
    { hired: true },
    { decision: "aprovado" },
    { compatibility: "alta" },
    { extraField: "qualquer coisa nao prevista" }
  ])("rejeita output com propriedade extra na raiz: %p", (extra) => {
    expect(parseGatewayOutput({ ...validOutput, ...extra })).toBeNull();
  });

  it("rejeita quando falta summary/limitations/findings", () => {
    expect(parseGatewayOutput({ limitations: "l".repeat(20), findings: [] })).toBeNull();
    expect(parseGatewayOutput({ summary: "s".repeat(20), findings: [] })).toBeNull();
    expect(parseGatewayOutput({ summary: "s".repeat(20), limitations: "l".repeat(20) })).toBeNull();
  });

  // --------------------------------------------------------------------------------------
  // summary / limitations: tipos errados, vazio, limites
  // --------------------------------------------------------------------------------------
  it.each([null, 42, true, [], {}, undefined])("rejeita summary de tipo errado: %p", (bad) => {
    expect(parseGatewayOutput({ ...validOutput, summary: bad })).toBeNull();
  });

  it("rejeita summary vazio (abaixo do minimo)", () => {
    expect(parseGatewayOutput({ ...validOutput, summary: "" })).toBeNull();
  });

  it("rejeita summary acima do limite maximo", () => {
    expect(
      parseGatewayOutput({
        ...validOutput,
        summary: "s".repeat(preAnalysisOutputLimits.summaryMax + 1)
      })
    ).toBeNull();
  });

  it("aceita summary exatamente no limite maximo", () => {
    const summary = "s".repeat(preAnalysisOutputLimits.summaryMax);
    expect(parseGatewayOutput({ ...validOutput, summary })).not.toBeNull();
  });

  it("rejeita limitations vazio ou de tipo errado", () => {
    expect(parseGatewayOutput({ ...validOutput, limitations: "" })).toBeNull();
    expect(parseGatewayOutput({ ...validOutput, limitations: null })).toBeNull();
    expect(parseGatewayOutput({ ...validOutput, limitations: 123 })).toBeNull();
  });

  // --------------------------------------------------------------------------------------
  // findings: nao-array, tamanho maximo, itens malformados
  // --------------------------------------------------------------------------------------
  it.each([null, "not-an-array", 42, {}, true])("rejeita findings que nao e array: %p", (bad) => {
    expect(parseGatewayOutput({ ...validOutput, findings: bad })).toBeNull();
  });

  it("rejeita numero de findings acima do limite maximo", () => {
    const findings = Array.from(
      { length: preAnalysisOutputLimits.findingsMax + 1 },
      () => validFinding
    );
    expect(parseGatewayOutput({ ...validOutput, findings })).toBeNull();
  });

  it.each([null, "string", 42, [], true])(
    "rejeita item de finding que nao e objeto plano: %p",
    (bad) => {
      expect(parseGatewayOutput({ ...validOutput, findings: [bad] })).toBeNull();
    }
  );

  it.each([
    { score: 10 },
    { rank: 1 },
    { recommendation: "aprovar" },
    { approved: true },
    { extraField: "x" }
  ])("rejeita finding com propriedade extra: %p", (extra) => {
    expect(
      parseGatewayOutput({ ...validOutput, findings: [{ ...validFinding, ...extra }] })
    ).toBeNull();
  });

  it("rejeita categoria fora da lista canonica (inclusive tentativas de score/veredito)", () => {
    for (const category of ["score", "veredito", "aprovacao", "reprovacao", "ranking", "fit"]) {
      expect(
        parseGatewayOutput({ ...validOutput, findings: [{ ...validFinding, category }] })
      ).toBeNull();
    }
  });

  it("rejeita finding.text vazio, de tipo errado ou acima do limite", () => {
    expect(
      parseGatewayOutput({ ...validOutput, findings: [{ ...validFinding, text: "" }] })
    ).toBeNull();
    expect(
      parseGatewayOutput({ ...validOutput, findings: [{ ...validFinding, text: null }] })
    ).toBeNull();
    expect(
      parseGatewayOutput({
        ...validOutput,
        findings: [
          { ...validFinding, text: "t".repeat(preAnalysisOutputLimits.findingTextMax + 1) }
        ]
      })
    ).toBeNull();
  });

  // --------------------------------------------------------------------------------------
  // evidenceRefs: ausente, malformado, tipo errado, limites (duplicacao/desconhecida sao
  // validadas em `finalizeTx2` -- dependem do mapa de execucao, fora do escopo de uma funcao
  // pura; cobertas por teste de integracao dedicado).
  // --------------------------------------------------------------------------------------
  it("rejeita finding sem evidenceRefs (ausente)", () => {
    const { evidenceRefs, ...withoutRefs } = validFinding;
    void evidenceRefs;
    expect(parseGatewayOutput({ ...validOutput, findings: [withoutRefs] })).toBeNull();
  });

  it("rejeita evidenceRefs vazio (abaixo do minimo de 1 -- todo achado precisa de origem, SPEC-023 Sec 12)", () => {
    expect(
      parseGatewayOutput({ ...validOutput, findings: [{ ...validFinding, evidenceRefs: [] }] })
    ).toBeNull();
  });

  it("rejeita evidenceRefs que nao e array", () => {
    expect(
      parseGatewayOutput({ ...validOutput, findings: [{ ...validFinding, evidenceRefs: "ev1" }] })
    ).toBeNull();
    expect(
      parseGatewayOutput({
        ...validOutput,
        findings: [{ ...validFinding, evidenceRefs: { ref: "ev1" } }]
      })
    ).toBeNull();
  });

  it("rejeita evidenceRefs com elementos de tipo errado (numero, objeto, null)", () => {
    expect(
      parseGatewayOutput({ ...validOutput, findings: [{ ...validFinding, evidenceRefs: [1, 2] }] })
    ).toBeNull();
    expect(
      parseGatewayOutput({
        ...validOutput,
        findings: [{ ...validFinding, evidenceRefs: [{ ref: "ev1" }] }]
      })
    ).toBeNull();
    expect(
      parseGatewayOutput({ ...validOutput, findings: [{ ...validFinding, evidenceRefs: [null] }] })
    ).toBeNull();
  });

  it("rejeita evidenceRefs acima do limite maximo", () => {
    const evidenceRefs = Array.from(
      { length: preAnalysisOutputLimits.evidenceRefsMax + 1 },
      (_, i) => `ev${i}`
    );
    expect(
      parseGatewayOutput({ ...validOutput, findings: [{ ...validFinding, evidenceRefs }] })
    ).toBeNull();
  });

  it("aceita evidenceRefs duplicadas no NIVEL DE FORMATO (a rejeicao de duplicidade real ocorre em finalizeTx2, nao aqui)", () => {
    // Documenta explicitamente a fronteira de responsabilidade: parseGatewayOutput valida
    // apenas FORMATO (array de strings dentro dos limites); duplicidade semantica dentro do
    // mesmo finding e validada em `finalizeTx2` contra o mapa real da execucao (unit test
    // puro nao tem acesso a esse mapa). Ver teste de integracao "evidence_ref desconhecida".
    expect(
      parseGatewayOutput({
        ...validOutput,
        findings: [{ ...validFinding, evidenceRefs: ["ev1", "ev1"] }]
      })
    ).not.toBeNull();
  });

  // --------------------------------------------------------------------------------------
  // Payload parcialmente valido: um finding bom + um finding ruim -> rejeita o output inteiro
  // (nunca persistencia parcial).
  // --------------------------------------------------------------------------------------
  it("rejeita o output inteiro quando ao menos um finding e invalido, mesmo com outros validos", () => {
    const badFinding = { ...validFinding, score: 99 };
    expect(parseGatewayOutput({ ...validOutput, findings: [validFinding, badFinding] })).toBeNull();
  });

  it("rejeita quando findings valido convive com propriedade extra na raiz simulando decisao automatica", () => {
    expect(
      parseGatewayOutput({ ...validOutput, matching_percentage: 92, eliminate_candidate: false })
    ).toBeNull();
  });
});
