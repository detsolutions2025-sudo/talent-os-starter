import type {
  CompetencyCatalogItem,
  GlobalCompetency,
  OrganizationAdoptedCompetency,
  OrganizationCompetency,
  UnifiedCatalogItem
} from "./types";

export interface CompetencyRepository {
  nextId(prefix: string): string;
  now(): string;
  lockOrganizationCompetencies(organizationId: string): Promise<void>;
  lockGlobalCompetency(globalCompetencyId: string): Promise<void>;
  createGlobalCompetency(competency: GlobalCompetency): Promise<void>;
  updateGlobalCompetency(competency: GlobalCompetency): Promise<void>;
  findGlobalCompetencyById(globalCompetencyId: string): Promise<GlobalCompetency | null>;
  findGlobalCompetencyByNormalizedCode(normalizedCode: string): Promise<GlobalCompetency | null>;
  listGlobalCompetencies(): Promise<GlobalCompetency[]>;
  listAvailableGlobalsForOrganization(organizationId: string): Promise<GlobalCompetency[]>;
  createOrganizationCompetency(competency: OrganizationCompetency): Promise<void>;
  updateOrganizationCompetency(competency: OrganizationCompetency): Promise<void>;
  findOrganizationCompetencyById(competencyId: string): Promise<OrganizationCompetency | null>;
  findOrganizationCompetencyByNormalizedCode(
    organizationId: string,
    normalizedCode: string
  ): Promise<OrganizationCompetency | null>;
  listOrganizationCompetencies(organizationId: string): Promise<OrganizationCompetency[]>;
  createAdoption(adoption: OrganizationAdoptedCompetency): Promise<void>;
  updateAdoption(adoption: OrganizationAdoptedCompetency): Promise<void>;
  findAdoptionById(adoptionId: string): Promise<OrganizationAdoptedCompetency | null>;
  findAdoptionByOrganizationAndGlobal(
    organizationId: string,
    globalCompetencyId: string
  ): Promise<OrganizationAdoptedCompetency | null>;
  listAdoptions(organizationId: string): Promise<OrganizationAdoptedCompetency[]>;
  createCatalogItem(item: CompetencyCatalogItem): Promise<void>;
  updateCatalogItem(item: CompetencyCatalogItem): Promise<void>;
  findCatalogItemById(itemId: string): Promise<CompetencyCatalogItem | null>;
  findCatalogItemForGlobal(
    organizationId: string,
    globalCompetencyId: string
  ): Promise<CompetencyCatalogItem | null>;
  findCatalogItemForOrganizationCompetency(
    organizationId: string,
    organizationCompetencyId: string
  ): Promise<CompetencyCatalogItem | null>;
  listUnifiedCatalog(organizationId: string): Promise<UnifiedCatalogItem[]>;
}
