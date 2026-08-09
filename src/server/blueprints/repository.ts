import type { BlueprintVersion, ManifestItem } from "./types";

export interface BlueprintRepository {
  nextId(prefix: string): string;
  now(): string;
  lockBlueprintVersions(organizationId: string): Promise<void>;
  createVersion(version: BlueprintVersion): Promise<void>;
  updateVersion(version: BlueprintVersion): Promise<void>;
  findVersionById(versionId: string): Promise<BlueprintVersion | null>;
  findActive(organizationId: string): Promise<BlueprintVersion | null>;
  findActiveDraft(organizationId: string): Promise<BlueprintVersion | null>;
  listVersions(organizationId: string): Promise<BlueprintVersion[]>;
  maxVersionNumber(organizationId: string): Promise<number>;
  replaceManifestItems(blueprintVersionId: string, items: ManifestItem[]): Promise<void>;
  listManifestItems(blueprintVersionId: string): Promise<ManifestItem[]>;
}
