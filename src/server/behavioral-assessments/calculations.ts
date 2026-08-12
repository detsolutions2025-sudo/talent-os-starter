import type {
  BehavioralAssessmentResponse,
  BehavioralInstrumentItem,
  BehavioralInstrumentVersion
} from "./types";

// Fase 19 (SPEC-022, secoes 11-15). Arquitetura do calculador: codigo puro, versionado com a
// propria aplicacao, registrado por identidade composta (methodologyKey + calculationMethodVersion
// -- Correcao Final do Plano Tecnico, item 9). Nunca eval/Function()/execucao de string vinda
// do banco -- o registro e um Map estatico, populado exclusivamente por import de modulo
// TypeScript compilado, sem nenhum caminho de dado para codigo.
//
// `validateVersionManifest` e OBRIGATORIO em todo calculador (Correcao Final vinculante, regra
// 2) -- nunca metodo opcional. Toda versao so pode ser ativada depois que seu proprio
// calculador validar dimensoes/itens/scoring_metadata (item 13); sem essa validacao, nenhum
// calculador estaria realmente comprovando que sabe interpretar o manifesto que recebera.

export type CalculatorIdentity = {
  methodologyKey: string;
  calculationMethodVersion: string;
};

export type CalculatorDimensionOutput = {
  code: string;
  value: unknown;
  label?: string;
  interpretationText?: string;
};

export type CalculatorOutput = {
  dimensions: CalculatorDimensionOutput[];
  summaryText?: string;
};

// Allow-list estrita do contrato de retorno -- nenhuma chave alem destas e aceita (Correcao
// Final do Plano Tecnico, item 11). `service.ts` valida isso antes de persistir; a lista fica
// aqui, ao lado do tipo, para nunca divergir.
export const CALCULATOR_OUTPUT_ALLOWED_KEYS = ["dimensions", "summaryText"] as const;
export const CALCULATOR_DIMENSION_ALLOWED_KEYS = [
  "code",
  "value",
  "label",
  "interpretationText"
] as const;

export type BehavioralAssessmentCalculator = {
  identity: CalculatorIdentity;
  calculate(
    responses: BehavioralAssessmentResponse[],
    itemsById: Map<string, BehavioralInstrumentItem>,
    version: BehavioralInstrumentVersion
  ): CalculatorOutput;
  // Obrigatorio (Correcao Final vinculante): chamado em `activate()` antes de `draft -> active`
  // (SPEC-022, secao 18/item 13) -- lanca erro quando dimension_mapping/scoring_metadata/
  // options de qualquer item nao forem reconhecidos por esta metodologia especifica.
  validateVersionManifest(
    version: BehavioralInstrumentVersion,
    items: BehavioralInstrumentItem[]
  ): void;
};

function calculatorKey(identity: CalculatorIdentity): string {
  return `${identity.methodologyKey}::${identity.calculationMethodVersion}`;
}

// Registro de PRODUCAO -- comeca vazio nesta fase (Correcao Final do Plano Tecnico, item 19):
// "Nesta fase, internal_application permanece indisponivel em producao enquanto nenhuma
// metodologia concreta autorizada estiver registrada. external_import e o unico caminho
// funcional de resultado comportamental em producao." Isso nao e bug -- e limitacao
// deliberada de produto. Nenhum instrumento fictício, nenhum DISC.
export const CALCULATOR_REGISTRY = new Map<string, BehavioralAssessmentCalculator>();

export function registerCalculator(calculator: BehavioralAssessmentCalculator) {
  CALCULATOR_REGISTRY.set(calculatorKey(calculator.identity), calculator);
}

export function findCalculator(methodologyKey: string, calculationMethodVersion: string) {
  return (
    CALCULATOR_REGISTRY.get(calculatorKey({ methodologyKey, calculationMethodVersion })) ?? null
  );
}

// Valida o retorno do calculador com allow-list estrita antes de qualquer persistencia
// (Correcao Final do Plano Tecnico, item 11) -- nunca overallScore/fitScore/rank/recommendation/
// decision ou qualquer outra chave nao prevista.
export function assertValidCalculatorOutput(output: unknown): asserts output is CalculatorOutput {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("behavioral_assessment_calculator_output_invalid");
  }
  const keys = Object.keys(output as Record<string, unknown>);
  if (keys.some((key) => !CALCULATOR_OUTPUT_ALLOWED_KEYS.includes(key as never))) {
    throw new Error("behavioral_assessment_calculator_output_invalid");
  }
  const { dimensions, summaryText } = output as CalculatorOutput;
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error("behavioral_assessment_calculator_output_invalid");
  }
  for (const dimension of dimensions) {
    if (!dimension || typeof dimension !== "object" || Array.isArray(dimension)) {
      throw new Error("behavioral_assessment_calculator_output_invalid");
    }
    const dimensionKeys = Object.keys(dimension as Record<string, unknown>);
    if (dimensionKeys.some((key) => !CALCULATOR_DIMENSION_ALLOWED_KEYS.includes(key as never))) {
      throw new Error("behavioral_assessment_calculator_output_invalid");
    }
    if (typeof (dimension as CalculatorDimensionOutput).code !== "string") {
      throw new Error("behavioral_assessment_calculator_output_invalid");
    }
  }
  if (summaryText !== undefined && typeof summaryText !== "string") {
    throw new Error("behavioral_assessment_calculator_output_invalid");
  }
}
