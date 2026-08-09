import type {
  BlueprintReadinessContributor,
  ReadinessCheck,
  ReadinessInputs,
  ReadinessResult,
  ResolvedComponents
} from "./types";
import { readinessContributors } from "./readiness-contributors";

// Readiness e uma funcao pura e deterministica (SPEC-018 secao 9): mesma entrada, mesma saida.
// Nunca usa IA (RN-024), nunca e persistida como fonte de verdade corrente (Plano Tecnico
// Revisado, item 11) e nunca decide ativacao sozinha -- apenas informa se o draft atende aos
// criterios minimos.
type CheckDefinition = {
  key: string;
  label: string;
  kind: "required" | "optional" | "blocking";
  satisfied: boolean;
};

// Criterios minimos obrigatorios (SPEC-018 secao 8/10). "Cargo publicado" e "Estrutura
// Organizacional" aparecem como recomendacao/opcional nesta readiness basica -- nunca
// bloqueante -- porque:
//  - a obrigatoriedade real de Cargo publicado ja e imposta no ponto de uso (SPEC-010: toda
//    Job Opening exige uma versao publicada de Job Profile), entao nao precisa ser duplicada
//    aqui (Plano Tecnico Revisado, item 22; nenhuma coluna `intends_to_recruit` e criada);
//  - Estrutura Organizacional "quando necessaria" (SPEC-018 secao 8) nao possui, ainda, uma
//    condicao canonica que defina quando e necessaria -- fica como recomendacao ate que uma
//    Feature futura declare seu proprio requisito via Feature Readiness (secao 9).
function baseChecks(inputs: ReadinessInputs): CheckDefinition[] {
  return [
    {
      key: "organization_active",
      label: "Organization ativa",
      kind: "required",
      satisfied: inputs.organizationActive
    },
    {
      key: "owner_active",
      label: "Owner ativo",
      kind: "required",
      satisfied: inputs.ownerActive
    },
    {
      key: "dna_published",
      label: "DNA Organizacional publicado",
      kind: "required",
      satisfied: inputs.dnaPublished
    },
    {
      key: "no_cross_organization_reference",
      label: "Nenhuma referencia cross-Organization detectada",
      kind: "blocking",
      satisfied: !inputs.crossOrganizationReferenceDetected
    },
    {
      key: "job_profile_published",
      label: "Ao menos um Cargo publicado (recomendado para iniciar recrutamento)",
      kind: "optional",
      satisfied: inputs.hasPublishedJobProfile
    },
    {
      key: "organizational_structure",
      label: "Estrutura Organizacional configurada (recomendado)",
      kind: "optional",
      satisfied: inputs.hasUsableStructure
    }
  ];
}

export function toReadinessInputs(resolved: ResolvedComponents): ReadinessInputs {
  return {
    organizationActive: resolved.organization.status === "active",
    ownerActive: resolved.ownerActive,
    dnaPublished: resolved.dna !== null,
    hasPublishedJobProfile: resolved.jobProfiles.length > 0,
    hasUsableStructure: resolved.structure.length > 0,
    // Toda leitura usada em `resolveComponents` ja e filtrada por organizationId no servidor
    // (mesmo padrao de isolamento de todo o projeto); esta flag existe para que o principio
    // fique explicito e testavel, nao porque exista hoje um caminho de codigo que produza uma
    // referencia cruzada.
    crossOrganizationReferenceDetected: false
  };
}

export function calculateReadiness(
  resolved: ResolvedComponents,
  contributors: BlueprintReadinessContributor[] = readinessContributors
): ReadinessResult {
  const inputs = toReadinessInputs(resolved);
  const checks = baseChecks(inputs);

  const contributorChecks: ReadinessCheck[] = contributors
    .filter((contributor) => contributor.applies(resolved))
    .flatMap((contributor) => contributor.evaluate(resolved));

  const allChecks: ReadinessCheck[] = [...checks.map(toReadinessCheck), ...contributorChecks];

  const blockingReasons = checks
    .filter((check) => check.kind === "blocking" && !check.satisfied)
    .map((check) => check.key);
  const pendingRequired = checks
    .filter((check) => check.kind === "required" && !check.satisfied)
    .map((check) => check.key);
  const pendingOptional = [
    ...checks
      .filter((check) => check.kind === "optional" && !check.satisfied)
      .map((check) => check.key),
    ...contributorChecks
      .filter((check) => check.status === "pending_optional")
      .map((check) => check.key)
  ];
  const contributorBlocking = contributorChecks
    .filter((check) => check.status === "blocking")
    .map((check) => check.key);
  const contributorRequired = contributorChecks
    .filter((check) => check.status === "pending_required")
    .map((check) => check.key);

  const status: ReadinessResult["status"] =
    blockingReasons.length > 0 || contributorBlocking.length > 0
      ? "blocked"
      : pendingRequired.length > 0 || contributorRequired.length > 0
        ? "incomplete"
        : "ready";

  return {
    status,
    checks: allChecks,
    pendingRequired: [...pendingRequired, ...contributorRequired],
    pendingOptional,
    blockingReasons: [...blockingReasons, ...contributorBlocking]
  };
}

function toReadinessCheck(check: CheckDefinition): ReadinessCheck {
  const status: ReadinessCheck["status"] = check.satisfied
    ? "satisfied"
    : check.kind === "blocking"
      ? "blocking"
      : check.kind === "optional"
        ? "pending_optional"
        : "pending_required";

  return { key: check.key, label: check.label, status };
}
