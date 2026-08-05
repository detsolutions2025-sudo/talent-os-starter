import type { JobProfile, JobProfileVersion, JobProfileVersionCompetency } from "./types";

export interface JobProfileRepository {
  nextId(prefix: string): string;
  now(): string;
  lockJobProfiles(organizationId: string): Promise<void>;
  lockVersions(jobProfileId: string): Promise<void>;
  createJobProfile(profile: JobProfile): Promise<void>;
  updateJobProfile(profile: JobProfile): Promise<void>;
  findJobProfileById(jobProfileId: string): Promise<JobProfile | null>;
  findJobProfileByNormalizedCode(
    organizationId: string,
    normalizedCode: string
  ): Promise<JobProfile | null>;
  listJobProfiles(organizationId: string): Promise<JobProfile[]>;
  listJobProfilesByStatus(
    organizationId: string,
    status: JobProfile["status"]
  ): Promise<JobProfile[]>;
  createVersion(version: JobProfileVersion): Promise<void>;
  updateVersion(version: JobProfileVersion): Promise<void>;
  findVersionById(versionId: string): Promise<JobProfileVersion | null>;
  findActiveDraft(jobProfileId: string): Promise<JobProfileVersion | null>;
  findPublished(jobProfileId: string): Promise<JobProfileVersion | null>;
  listVersions(jobProfileId: string): Promise<JobProfileVersion[]>;
  maxVersionNumber(jobProfileId: string): Promise<number>;
  replaceCompetencies(
    versionId: string,
    competencies: JobProfileVersionCompetency[]
  ): Promise<void>;
  listCompetencies(versionId: string): Promise<JobProfileVersionCompetency[]>;
}
