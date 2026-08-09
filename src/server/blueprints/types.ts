import type { Actor, MembershipRole, Organization } from "../core/types";

export type BlueprintVersionStatus = "draft" | "active" | "archived";
export type BlueprintCreatedSource = "user" | "migration_backfill";

export type ComponentType =
  | "dna"
  | "job_profile"
  | "organizational_unit"
  | "competency_catalog_item"
  | "question_catalog_item"
  | "ai_feature_settings"
  | "ai_provider_settings";

// SPEC-018 secao 24 ("Banco conceitual"): campos minimos de uma Blueprint Version. Nunca
// armazena o conteudo dos modulos que agrega -- apenas o proprio checkpoint (ADR-0022,
// "Versao do Blueprint": manifesto agregado e imutavel, nunca copia dos dados).
export type BlueprintVersion = {
  id: string;
  organizationId: string;
  versionNumber: number;
  status: BlueprintVersionStatus;
  createdByUserId: string | null;
  createdSource: BlueprintCreatedSource;
  activatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  archivedAt: string | null;
  // Snapshot historico da readiness que justificou a ativacao (secao 13 do Plano Tecnico
  // Revisado). Gravado uma unica vez, no momento da ativacao; nunca mais alterado (protegido
  // pela mesma trigger de imutabilidade da propria linha) e nunca usado para decidir nenhuma
  // operacao futura -- apenas para auditoria/rastreabilidade historica.
  activationReadinessSnapshot: ReadinessResult | null;
};

// SPEC-018 secao 5 ("Manifest"): referencia historica e snapshot minimo, nunca copia completa
// dos modulos (RN-048/RN-049).
export type ManifestItem = {
  id: string;
  blueprintVersionId: string;
  componentType: ComponentType;
  componentRefId: string | null;
  componentVersionId: string | null;
  snapshotMetadata: Record<string, unknown>;
  contentFingerprint: string | null;
  createdAt: string;
};

export type ReadinessCheckStatus =
  "satisfied" | "pending_required" | "pending_optional" | "blocking";

export type ReadinessCheck = {
  key: string;
  label: string;
  status: ReadinessCheckStatus;
};

// Readiness e sempre calculada sob demanda, nunca persistida como fonte de verdade corrente
// (SPEC-018 secao 9; Plano Tecnico Revisado, item 11). `blocked` e reservado para
// inconsistencia critica ou referencia cross-Organization; na pratica normal, o resultado e
// `incomplete` ou `ready`.
export type ReadinessResult = {
  status: "incomplete" | "ready" | "blocked";
  checks: ReadinessCheck[];
  pendingRequired: string[];
  pendingOptional: string[];
  blockingReasons: string[];
};

// Entradas puras para o calculo de readiness (blueprints/readiness.ts). Resolvidas uma unica
// vez por `resolveComponents` e reutilizadas tanto para readiness quanto para o Manifest
// (SPEC-018 secao 8, "Manifest definitivo"; nunca reconsultadas separadamente).
export type ReadinessInputs = {
  organizationActive: boolean;
  ownerActive: boolean;
  dnaPublished: boolean;
  hasPublishedJobProfile: boolean;
  hasUsableStructure: boolean;
  crossOrganizationReferenceDetected: boolean;
};

// Feature Readiness (SPEC-018 secao 7/9): contrato simples de composicao, sem plugin runtime,
// discovery dinamica nem registry complexo. Nesta fase o array de contributors registrados
// (blueprints/readiness-contributors.ts) fica vazio -- a primeira Feature futura que precisar
// adiciona seu proprio contributor explicitamente.
export type BlueprintReadinessContributor = {
  key: string;
  applies(context: ResolvedComponents): boolean;
  evaluate(context: ResolvedComponents): ReadinessCheck[];
};

export type ResolvedDnaComponent = {
  organizationDnaVersionId: string;
  versionNumber: number | null;
  status: string;
};

export type ResolvedJobProfileComponent = {
  jobProfileId: string;
  jobProfileVersionId: string;
  code: string;
  name: string;
};

export type ResolvedStructureComponent = {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  type: string;
  status: string;
};

export type ResolvedCompetencyComponent = {
  competencyCatalogItemId: string;
  code: string;
  name: string;
  category: string;
  origin: string;
};

export type ResolvedQuestionComponent = {
  questionCatalogItemId: string;
  code: string;
  title: string;
  type: string;
  category: string;
  questionText: string;
};

export type ResolvedAiFeatureComponent = {
  featureKey: string;
  organizationFeatureEnabled: boolean;
};

export type ResolvedAiProviderComponent = {
  provider: string;
  credentialMode: string;
  status: string;
};

// Todos os componentes resolvidos uma unica vez dentro da transacao de ativacao (ou de uma
// consulta de readiness/manifest sob demanda), reutilizados tanto por `calculateReadiness`
// quanto por `buildManifestItems` -- nunca reconsultados entre um e outro (SPEC-018 secao 8;
// Plano Tecnico Revisado, item 7 -- "resolver uma vez, reutilizar o mesmo objeto em memoria").
export type ResolvedComponents = {
  organization: Organization;
  ownerActive: boolean;
  dna: ResolvedDnaComponent | null;
  structure: ResolvedStructureComponent[];
  jobProfiles: ResolvedJobProfileComponent[];
  competencies: ResolvedCompetencyComponent[];
  questions: ResolvedQuestionComponent[];
  aiFeatureSettings: ResolvedAiFeatureComponent[];
  aiProviderSettings: ResolvedAiProviderComponent[];
};

export type BlueprintActorContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};

export type BlueprintAdminReadInput = {
  reason?: string;
};

// Progresso e puramente informativo/visual (SPEC-018 secao 10 e 31): nunca decide ativacao.
export type BlueprintProgress = {
  applicableSteps: number;
  completedSteps: number;
};

export type BlueprintStatusView = {
  draft: BlueprintVersionWithManifest | null;
  active: BlueprintVersionWithManifest | null;
  progress: BlueprintProgress;
};

export type BlueprintVersionWithManifest = BlueprintVersion & {
  manifest: ManifestItem[];
};
