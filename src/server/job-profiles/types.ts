import type { Actor, MembershipRole, Organization } from "../core/types";

export type JobProfileStatus = "active" | "inactive";
export type JobProfileVersionStatus = "draft" | "published" | "archived";
export type WorkModel = "onsite" | "hybrid" | "remote" | "flexible";
export type TravelRequirement = "none" | "occasional" | "frequent";

export type OrderedText = {
  text: string;
  displayOrder: number;
};

export type JobRequirement = OrderedText & {
  type:
    | "education"
    | "experience"
    | "certification"
    | "license"
    | "availability"
    | "travel"
    | "location"
    | "language"
    | "tool"
    | "other";
  required: boolean;
};

export type JobEducation = {
  level:
    | "elementary"
    | "high_school"
    | "technical"
    | "undergraduate"
    | "postgraduate"
    | "masters"
    | "doctorate"
    | "not_required";
  area: string;
  required: boolean;
  note: string;
};

export type JobCertification = {
  name: string;
  required: boolean;
  validityRequired: boolean;
  note: string;
};

export type JobLanguage = {
  language: string;
  expectedLevel: "basic" | "intermediate" | "advanced" | "fluent" | "native";
  required: boolean;
};

export type JobTool = {
  name: string;
  expectedLevel: "basic" | "intermediate" | "advanced" | "expert";
  required: boolean;
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

export type JobProfile = {
  id: string;
  organizationId: string;
  code: string;
  normalizedCode: string;
  name: string;
  status: JobProfileStatus;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  inactivatedAt: string | null;
};

export type JobProfileVersion = {
  id: string;
  jobProfileId: string;
  organizationId: string;
  versionNumber: number | null;
  status: JobProfileVersionStatus;
  title: string;
  mission: string;
  summary: string;
  responsibilities: OrderedText[];
  requirements: JobRequirement[];
  education: JobEducation;
  certifications: JobCertification[];
  languages: JobLanguage[];
  tools: JobTool[];
  workModel: WorkModel;
  workSchedule: WorkSchedule;
  travelRequirement: TravelRequirement;
  salaryRange: SalaryRange | null;
  notes: string;
  createdByUserId: string;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  discardedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  discardedAt: string | null;
};

export type JobProfileVersionCompetency = {
  id: string;
  organizationId: string;
  jobProfileVersionId: string;
  competencyCatalogItemId: string;
  expectedLevel: number;
  required: boolean;
  displayOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobProfileInput = {
  organizationId?: string;
  code?: string;
  name?: string;
};

export type JobProfileDraftInput = {
  organizationId?: string;
  jobProfileId?: string;
  title?: string;
  mission?: string;
  summary?: string;
  responsibilities?: unknown;
  requirements?: unknown;
  education?: unknown;
  certifications?: unknown;
  languages?: unknown;
  tools?: unknown;
  workModel?: string;
  workSchedule?: unknown;
  travelRequirement?: string;
  salaryRange?: unknown;
  notes?: string;
  competencies?: unknown;
  weight?: unknown;
};

export type NormalizedJobProfileContent = Omit<
  JobProfileVersion,
  | "id"
  | "jobProfileId"
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

export type JobProfileCompetencyInput = {
  competencyCatalogItemId: string;
  expectedLevel: number;
  required: boolean;
  displayOrder: number;
  note: string | null;
};

export type JobProfileVersionWithCompetencies = JobProfileVersion & {
  competencies: JobProfileVersionCompetency[];
};

export type JobProfileAdminReadInput = {
  reason?: string;
};

export type JobProfileActorContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};
