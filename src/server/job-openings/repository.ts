import type {
  JobOpening,
  JobOpeningStatus,
  JobOpeningVersion,
  JobOpeningVersionCompetency,
  JobOpeningVersionQuestion
} from "./types";

export interface JobOpeningRepository {
  nextId(prefix: string): string;
  now(): string;
  lockJobOpenings(organizationId: string): Promise<void>;
  lockVersions(jobOpeningId: string): Promise<void>;
  createJobOpening(opening: JobOpening): Promise<void>;
  updateJobOpening(opening: JobOpening): Promise<void>;
  findJobOpeningById(jobOpeningId: string): Promise<JobOpening | null>;
  findJobOpeningByNormalizedCode(
    organizationId: string,
    normalizedCode: string
  ): Promise<JobOpening | null>;
  findJobOpeningByPublicSlug(slug: string): Promise<JobOpening | null>;
  listJobOpenings(organizationId: string): Promise<JobOpening[]>;
  listJobOpeningsByStatus(
    organizationId: string,
    statuses: JobOpeningStatus[]
  ): Promise<JobOpening[]>;
  createVersion(version: JobOpeningVersion): Promise<void>;
  updateVersion(version: JobOpeningVersion): Promise<void>;
  findVersionById(versionId: string): Promise<JobOpeningVersion | null>;
  findActiveDraft(jobOpeningId: string): Promise<JobOpeningVersion | null>;
  findPublished(jobOpeningId: string): Promise<JobOpeningVersion | null>;
  listVersions(jobOpeningId: string): Promise<JobOpeningVersion[]>;
  maxVersionNumber(jobOpeningId: string): Promise<number>;
  replaceCompetencies(
    versionId: string,
    competencies: JobOpeningVersionCompetency[]
  ): Promise<void>;
  listCompetencies(versionId: string): Promise<JobOpeningVersionCompetency[]>;
  replaceQuestions(versionId: string, questions: JobOpeningVersionQuestion[]): Promise<void>;
  listQuestions(versionId: string): Promise<JobOpeningVersionQuestion[]>;
}
