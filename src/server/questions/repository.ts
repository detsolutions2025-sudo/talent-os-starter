import type {
  GlobalQuestion,
  OrganizationAdoptedQuestion,
  OrganizationQuestion,
  QuestionCatalogItem,
  UnifiedQuestionCatalogItem
} from "./types";

export interface QuestionRepository {
  nextId(prefix: string): string;
  now(): string;
  lockOrganizationQuestions(organizationId: string): Promise<void>;
  lockGlobalQuestion(globalQuestionId: string): Promise<void>;
  createGlobalQuestion(question: GlobalQuestion): Promise<void>;
  updateGlobalQuestion(question: GlobalQuestion): Promise<void>;
  findGlobalQuestionById(globalQuestionId: string): Promise<GlobalQuestion | null>;
  findGlobalQuestionByNormalizedCode(normalizedCode: string): Promise<GlobalQuestion | null>;
  listGlobalQuestions(): Promise<GlobalQuestion[]>;
  listAvailableGlobalsForOrganization(organizationId: string): Promise<GlobalQuestion[]>;
  createOrganizationQuestion(question: OrganizationQuestion): Promise<void>;
  updateOrganizationQuestion(question: OrganizationQuestion): Promise<void>;
  findOrganizationQuestionById(questionId: string): Promise<OrganizationQuestion | null>;
  findOrganizationQuestionByNormalizedCode(
    organizationId: string,
    normalizedCode: string
  ): Promise<OrganizationQuestion | null>;
  listOrganizationQuestions(organizationId: string): Promise<OrganizationQuestion[]>;
  createAdoption(adoption: OrganizationAdoptedQuestion): Promise<void>;
  updateAdoption(adoption: OrganizationAdoptedQuestion): Promise<void>;
  findAdoptionById(adoptionId: string): Promise<OrganizationAdoptedQuestion | null>;
  findAdoptionByOrganizationAndGlobal(
    organizationId: string,
    globalQuestionId: string
  ): Promise<OrganizationAdoptedQuestion | null>;
  listAdoptions(organizationId: string): Promise<OrganizationAdoptedQuestion[]>;
  createCatalogItem(item: QuestionCatalogItem): Promise<void>;
  updateCatalogItem(item: QuestionCatalogItem): Promise<void>;
  findCatalogItemById(itemId: string): Promise<QuestionCatalogItem | null>;
  findCatalogItemForGlobal(
    organizationId: string,
    globalQuestionId: string
  ): Promise<QuestionCatalogItem | null>;
  findCatalogItemForOrganizationQuestion(
    organizationId: string,
    organizationQuestionId: string
  ): Promise<QuestionCatalogItem | null>;
  listUnifiedCatalog(organizationId: string): Promise<UnifiedQuestionCatalogItem[]>;
}
