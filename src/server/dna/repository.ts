import type { DnaVersion } from "./types";

export interface DnaRepository {
  transaction<T>(callback: (repository: DnaRepository) => Promise<T>): Promise<T>;
  nextId(prefix: string): string;
  now(): string;
  lockOrganizationVersions(organizationId: string): Promise<void>;
  findActiveDraft(organizationId: string): Promise<DnaVersion | null>;
  findPublished(organizationId: string): Promise<DnaVersion | null>;
  findVersionById(versionId: string): Promise<DnaVersion | null>;
  listVersions(organizationId: string): Promise<DnaVersion[]>;
  maxVersionNumber(organizationId: string): Promise<number>;
  createVersion(version: DnaVersion): Promise<void>;
  updateVersion(version: DnaVersion): Promise<void>;
}
