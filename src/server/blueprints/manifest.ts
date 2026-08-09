import { createHash } from "node:crypto";
import type { ComponentType, ManifestItem, ResolvedComponents } from "./types";

// Manifest e uma composicao de referencias + snapshot minimo allow-listed, nunca uma copia
// integral dos modulos (SPEC-018 secao 4/5/6; ADR-0022, "Principio: manifesto de contexto").
// Construido apenas durante a ativacao (secao 8), a partir do MESMO objeto `resolved` ja usado
// por `calculateReadiness` -- nunca reconsulta os modulos aqui.

export function fingerprint(snapshot: Record<string, unknown>) {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

type BuiltManifestItem = {
  componentType: ComponentType;
  componentRefId: string | null;
  componentVersionId: string | null;
  snapshotMetadata: Record<string, unknown>;
};

export function buildManifestEntries(resolved: ResolvedComponents): BuiltManifestItem[] {
  const entries: BuiltManifestItem[] = [];

  if (resolved.dna) {
    entries.push({
      componentType: "dna",
      componentRefId: null,
      componentVersionId: resolved.dna.organizationDnaVersionId,
      snapshotMetadata: {
        organizationDnaVersionId: resolved.dna.organizationDnaVersionId,
        versionNumber: resolved.dna.versionNumber,
        status: resolved.dna.status
      }
    });
  }

  for (const jobProfile of resolved.jobProfiles) {
    entries.push({
      componentType: "job_profile",
      componentRefId: jobProfile.jobProfileId,
      componentVersionId: jobProfile.jobProfileVersionId,
      snapshotMetadata: {
        jobProfileId: jobProfile.jobProfileId,
        jobProfileVersionId: jobProfile.jobProfileVersionId,
        code: jobProfile.code,
        name: jobProfile.name
      }
    });
  }

  // Estrutura Organizacional nao possui versionamento formal (SPEC-006). O snapshot mínimo
  // allow-listed abaixo e exatamente o necessario para reconstruir a arvore hierarquica como
  // ela era (id, pai, codigo, nome, tipo, status) -- nunca managerName/managerEmail/
  // description, que sao dado operacional, dispensavel para interpretacao historica e reduz
  // superficie de PII desnecessaria no snapshot (Plano Tecnico Revisado, item 4).
  for (const unit of resolved.structure) {
    entries.push({
      componentType: "organizational_unit",
      componentRefId: unit.id,
      componentVersionId: null,
      snapshotMetadata: {
        id: unit.id,
        parentId: unit.parentId,
        code: unit.code,
        name: unit.name,
        type: unit.type,
        status: unit.status
      }
    });
  }

  // Catalogo de Competencias tambem nao possui versionamento formal (SPEC-007). Peso nunca
  // aparece aqui -- pertence exclusivamente ao contexto de uso (ADR-0009), nunca ao item
  // reutilizavel do Blueprint.
  for (const competency of resolved.competencies) {
    entries.push({
      componentType: "competency_catalog_item",
      componentRefId: competency.competencyCatalogItemId,
      componentVersionId: null,
      snapshotMetadata: {
        competencyCatalogItemId: competency.competencyCatalogItemId,
        code: competency.code,
        name: competency.name,
        category: competency.category,
        origin: competency.origin
      }
    });
  }

  // Banco de Perguntas tambem nao possui versionamento formal (SPEC-009). `questionText` e
  // incluido no snapshot minimo por decisao explicita desta implementacao: diferente do
  // Manifest de outros modulos, o Blueprint historico precisa continuar interpretavel mesmo
  // depois que uma pergunta for editada -- e como o texto pode mudar sem gerar nova versao,
  // apenas `title`/`code` nao bastam para reconstituir o que foi efetivamente usado. Nunca
  // inclui resposta de candidato, avaliacao ou qualquer dado de CandidateApplication.
  for (const question of resolved.questions) {
    entries.push({
      componentType: "question_catalog_item",
      componentRefId: question.questionCatalogItemId,
      componentVersionId: null,
      snapshotMetadata: {
        questionCatalogItemId: question.questionCatalogItemId,
        code: question.code,
        title: question.title,
        type: question.type,
        category: question.category,
        questionText: question.questionText
      }
    });
  }

  // AI Feature/Provider Settings: nunca inclui segredo, token, credencial ou
  // `secret_reference` -- apenas o estado nao sensivel necessario para interpretar o contexto
  // (ADR-0018; Plano Tecnico Revisado, item 4).
  for (const feature of resolved.aiFeatureSettings) {
    entries.push({
      componentType: "ai_feature_settings",
      componentRefId: feature.featureKey,
      componentVersionId: null,
      snapshotMetadata: {
        featureKey: feature.featureKey,
        organizationFeatureEnabled: feature.organizationFeatureEnabled
      }
    });
  }

  for (const provider of resolved.aiProviderSettings) {
    entries.push({
      componentType: "ai_provider_settings",
      componentRefId: provider.provider,
      componentVersionId: null,
      snapshotMetadata: {
        provider: provider.provider,
        credentialMode: provider.credentialMode,
        status: provider.status
      }
    });
  }

  return entries;
}

export function buildManifestItems(
  blueprintVersionId: string,
  nextId: (prefix: string) => string,
  now: string,
  resolved: ResolvedComponents
): ManifestItem[] {
  return buildManifestEntries(resolved).map((entry) => ({
    id: nextId("bpi"),
    blueprintVersionId,
    componentType: entry.componentType,
    componentRefId: entry.componentRefId,
    componentVersionId: entry.componentVersionId,
    snapshotMetadata: entry.snapshotMetadata,
    contentFingerprint: fingerprint(entry.snapshotMetadata),
    createdAt: now
  }));
}
