import type { Actor, MembershipRole, Organization } from "../core/types";

export type JobOpeningStatus = "draft" | "open" | "paused" | "closed" | "cancelled";
export type JobOpeningVersionStatus = "draft" | "published" | "archived";
export type WorkModel = "onsite" | "hybrid" | "remote" | "flexible";

export type OrderedText = {
  text: string;
  displayOrder: number;
};

export type LocationInfo = {
  country: string;
  region: string;
  city: string;
  publicAddress: string;
  note: string;
};

export type WorkSchedule = {
  weeklyHours: number;
  description: string;
  shift: string;
};

export type SalaryRange = {
  min: number;
  max: number;
  currency: string;
  periodicity: "monthly" | "hourly" | "annual";
};

export type JobOpening = {
  id: string;
  organizationId: string;
  code: string;
  normalizedCode: string;
  title: string;
  status: JobOpeningStatus;
  organizationalUnitId: string | null;
  isPublic: boolean;
  publicShowSalary: boolean;
  publicSlug: string | null;
  publicPublishedAt: string | null;
  publicUnpublishedAt: string | null;
  applicationDeadline: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobOpeningVersion = {
  id: string;
  jobOpeningId: string;
  organizationId: string;
  versionNumber: number | null;
  status: JobOpeningVersionStatus;
  jobProfileVersionId: string;
  publicTitle: string;
  description: string;
  responsibilities: OrderedText[];
  requirements: OrderedText[];
  benefits: OrderedText[];
  location: LocationInfo;
  workModel: WorkModel;
  workSchedule: WorkSchedule;
  salaryRange: SalaryRange | null;
  positionsCount: number;
  expectedStartDate: string | null;
  internalInstructions: string;
  publicInstructions: string;
  createdByUserId: string;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  discardedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  discardedAt: string | null;
};

export type JobOpeningVersionCompetency = {
  id: string;
  organizationId: string;
  jobOpeningVersionId: string;
  competencyCatalogItemId: string;
  expectedLevel: number;
  required: boolean;
  weight: number;
  displayOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobOpeningVersionQuestion = {
  id: string;
  organizationId: string;
  jobOpeningVersionId: string;
  questionCatalogItemId: string;
  required: boolean;
  displayOrder: number;
  weight: number | null;
  contextSettings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type JobOpeningInput = {
  organizationId?: string;
  code?: string;
  title?: string;
  organizationalUnitId?: string | null;
  jobProfileVersionId?: string;
  publicTitle?: string;
  positionsCount?: unknown;
};

export type JobOpeningDraftInput = {
  organizationId?: string;
  jobProfileVersionId?: string;
  publicTitle?: string;
  description?: string;
  responsibilities?: unknown;
  requirements?: unknown;
  benefits?: unknown;
  location?: unknown;
  workModel?: string;
  workSchedule?: unknown;
  salaryRange?: unknown;
  positionsCount?: unknown;
  expectedStartDate?: unknown;
  internalInstructions?: string;
  publicInstructions?: string;
  competencies?: unknown;
  questions?: unknown;
};

export type JobOpeningPublicationInput = {
  isPublic?: unknown;
  publicSlug?: unknown;
  applicationDeadline?: unknown;
  showSalary?: unknown;
};

export type NormalizedJobOpeningContent = Omit<
  JobOpeningVersion,
  | "id"
  | "jobOpeningId"
  | "organizationId"
  | "versionNumber"
  | "status"
  | "createdByUserId"
  | "updatedByUserId"
  | "publishedByUserId"
  | "discardedByUserId"
  | "createdAt"
  | "updatedAt"
  | "publishedAt"
  | "discardedAt"
>;

export type JobOpeningCompetencyInput = Omit<
  JobOpeningVersionCompetency,
  "id" | "organizationId" | "jobOpeningVersionId" | "createdAt" | "updatedAt"
>;

export type JobOpeningQuestionInput = Omit<
  JobOpeningVersionQuestion,
  "id" | "organizationId" | "jobOpeningVersionId" | "createdAt" | "updatedAt"
>;

export type JobOpeningVersionWithLinks = JobOpeningVersion & {
  competencies: JobOpeningVersionCompetency[];
  questions: JobOpeningVersionQuestion[];
};

export type JobOpeningWithPublished = JobOpening & {
  publishedVersion: JobOpeningVersionWithLinks | null;
  isPubliclyAvailable: boolean;
};

export type PublicJobOpeningDto = {
  slug: string;
  title: string;
  description: string;
  responsibilities: OrderedText[];
  requirements: OrderedText[];
  benefits: OrderedText[];
  location: LocationInfo;
  workModel: WorkModel;
  workSchedule: WorkSchedule;
  salaryRange: SalaryRange | null;
  positionsCount: number;
  expectedStartDate: string | null;
  publicInstructions: string;
  applicationDeadline: string | null;
  isPubliclyAvailable: boolean;
};

export type JobOpeningAdminReadInput = {
  reason?: string;
};

export type JobOpeningActorContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};
