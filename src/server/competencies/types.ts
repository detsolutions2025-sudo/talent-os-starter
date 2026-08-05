import type { Actor, MembershipRole, Organization } from "../core/types";

export const competencyCategories = [
  "technical",
  "behavioral",
  "leadership",
  "management",
  "tools",
  "languages",
  "compliance",
  "safety",
  "other"
] as const;

export const proficiencyCodes = [
  "basic",
  "intermediate",
  "proficient",
  "advanced",
  "reference"
] as const;

export type CompetencyCategory = (typeof competencyCategories)[number];
export type GlobalCompetencyStatus = "active" | "inactive" | "deprecated";
export type OrganizationCompetencyStatus = "active" | "inactive";
export type AdoptedCompetencyStatus = "active" | "inactive";
export type CompetencyCatalogItemStatus = "active" | "inactive";
export type CompetencyCatalogItemOrigin = "global" | "organization";

export type CompetencyEvidence = {
  text: string;
  displayOrder: number;
};

export type CompetencyExample = {
  text: string;
  displayOrder: number;
};

export type ProficiencyLevel = {
  number: number;
  code: (typeof proficiencyCodes)[number];
  displayName: string;
  description: string;
  observableEvidences: string[];
};

export type CompetencyContentInput = {
  organizationId?: string;
  code?: string;
  name?: string;
  category?: string;
  definition?: string;
  positiveEvidences?: unknown;
  negativeEvidences?: unknown;
  practicalExamples?: unknown;
  proficiencyLevels?: unknown;
  status?: string;
};

export type NormalizedCompetencyContent = {
  code: string;
  normalizedCode: string;
  name: string;
  category: CompetencyCategory;
  definition: string;
  positiveEvidences: CompetencyEvidence[];
  negativeEvidences: CompetencyEvidence[];
  practicalExamples: CompetencyExample[];
  proficiencyLevels: ProficiencyLevel[];
};

export type CompetencyContentPatch = Partial<NormalizedCompetencyContent>;

export type GlobalCompetency = NormalizedCompetencyContent & {
  id: string;
  status: GlobalCompetencyStatus;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationCompetency = NormalizedCompetencyContent & {
  id: string;
  organizationId: string;
  status: OrganizationCompetencyStatus;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationAdoptedCompetency = {
  id: string;
  organizationId: string;
  globalCompetencyId: string;
  status: AdoptedCompetencyStatus;
  adoptedByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompetencyCatalogItem = {
  id: string;
  organizationId: string;
  origin: CompetencyCatalogItemOrigin;
  globalCompetencyId: string | null;
  organizationCompetencyId: string | null;
  status: CompetencyCatalogItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type UnifiedCatalogItem = {
  competencyCatalogItemId: string;
  origin: CompetencyCatalogItemOrigin;
  code: string;
  name: string;
  category: CompetencyCategory;
  status: CompetencyCatalogItemStatus;
  sourceStatus: GlobalCompetencyStatus | OrganizationCompetencyStatus;
  globalStatus: GlobalCompetencyStatus | null;
  editable: boolean;
  deprecated: boolean;
};

export type CompetencyDetails =
  | (UnifiedCatalogItem & { globalCompetency: GlobalCompetency; organizationCompetency: null })
  | (UnifiedCatalogItem & {
      globalCompetency: null;
      organizationCompetency: OrganizationCompetency;
    });

export type AdoptGlobalInput = {
  globalCompetencyId?: string;
};

export type CompetencyAdminReadInput = {
  reason?: string;
};

export type CompetencyActorContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};
