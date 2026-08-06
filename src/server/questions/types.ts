import type { Actor, MembershipRole, Organization } from "../core/types";

export const questionTypes = [
  "open_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "yes_no",
  "numeric",
  "scale",
  "date",
  "situational",
  "behavioral",
  "technical"
] as const;

export const questionCategories = [
  "general",
  "technical",
  "behavioral",
  "situational",
  "culture",
  "leadership",
  "management",
  "compliance",
  "safety",
  "screening",
  "other"
] as const;

export type QuestionType = (typeof questionTypes)[number];
export type QuestionCategory = (typeof questionCategories)[number];
export type GlobalQuestionStatus = "active" | "inactive" | "deprecated";
export type OrganizationQuestionStatus = "active" | "inactive";
export type AdoptedQuestionStatus = "active" | "inactive";
export type QuestionCatalogItemStatus = "active" | "inactive";
export type QuestionCatalogItemOrigin = "global" | "organization";

export type QuestionOption = {
  id: string;
  text: string;
  displayOrder: number;
  status: "active";
};

export type ScaleSettings = {
  min: number;
  max: number;
  step: number;
  minLabel: string | null;
  maxLabel: string | null;
};

export type NumericSettings = {
  min: number | null;
  max: number | null;
  decimals: number | null;
  unit: string | null;
};

export type QuestionSettings = ScaleSettings | NumericSettings | Record<string, never>;

export type QuestionContentInput = {
  organizationId?: string;
  code?: string;
  title?: string;
  questionText?: string;
  question_text?: string;
  description?: string;
  type?: string;
  category?: string;
  instructions?: string;
  options?: unknown;
  settings?: unknown;
  competencyCatalogItemId?: string | null;
  competency_catalog_item_id?: string | null;
  status?: string;
  weight?: unknown;
  score?: unknown;
  scoring?: unknown;
  required?: unknown;
  isRequired?: unknown;
  correctAnswer?: unknown;
  correct_answer?: unknown;
  evaluationCriteria?: unknown;
  evaluation_criteria?: unknown;
  approvalCriteria?: unknown;
  approval_criteria?: unknown;
};

export type NormalizedQuestionContent = {
  code: string;
  normalizedCode: string;
  title: string;
  questionText: string;
  description: string;
  type: QuestionType;
  category: QuestionCategory;
  instructions: string;
  options: QuestionOption[];
  settings: QuestionSettings;
  competencyCatalogItemId: string | null;
};

export type QuestionContentPatch = Partial<NormalizedQuestionContent>;

export type GlobalQuestion = Omit<NormalizedQuestionContent, "competencyCatalogItemId"> & {
  id: string;
  status: GlobalQuestionStatus;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationQuestion = NormalizedQuestionContent & {
  id: string;
  organizationId: string;
  status: OrganizationQuestionStatus;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationAdoptedQuestion = {
  id: string;
  organizationId: string;
  globalQuestionId: string;
  status: AdoptedQuestionStatus;
  adoptedByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuestionCatalogItem = {
  id: string;
  organizationId: string;
  origin: QuestionCatalogItemOrigin;
  globalQuestionId: string | null;
  organizationQuestionId: string | null;
  status: QuestionCatalogItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type UnifiedQuestionCatalogItem = {
  questionCatalogItemId: string;
  origin: QuestionCatalogItemOrigin;
  code: string;
  title: string;
  questionText: string;
  type: QuestionType;
  category: QuestionCategory;
  status: QuestionCatalogItemStatus;
  sourceStatus: GlobalQuestionStatus | OrganizationQuestionStatus;
  globalStatus: GlobalQuestionStatus | null;
  editable: boolean;
  deprecated: boolean;
  competencyCatalogItemId: string | null;
};

export type QuestionDetails =
  | (UnifiedQuestionCatalogItem & { globalQuestion: GlobalQuestion; organizationQuestion: null })
  | (UnifiedQuestionCatalogItem & {
      globalQuestion: null;
      organizationQuestion: OrganizationQuestion;
    });

export type AdoptQuestionInput = {
  globalQuestionId?: string;
};

export type QuestionAdminReadInput = {
  reason?: string;
};

export type QuestionActorContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};
