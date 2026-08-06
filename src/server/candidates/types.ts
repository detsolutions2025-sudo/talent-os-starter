import type { Actor, MembershipRole, Organization } from "../core/types";

export type CandidateStatus = "active" | "inactive";
export type CandidateSource =
  | "career_page"
  | "referral"
  | "recruiter"
  | "agency"
  | "linkedin"
  | "job_board"
  | "event"
  | "import"
  | "manual"
  | "other";
export type ConsentStatus = "granted" | "revoked" | "expired" | "pending";

export type CandidateLocation = {
  country: string;
  state: string;
  city: string;
  neighborhood: string;
  postalCode: string;
  address: string;
};

export type CandidateExperience = {
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;
  current: boolean;
  description: string;
  location: string;
};

export type CandidateEducation = {
  institution: string;
  course: string;
  level:
    | "elementary"
    | "high_school"
    | "technical"
    | "undergraduate"
    | "postgraduate"
    | "masters"
    | "doctorate"
    | "other";
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  description: string;
};

export type CandidateCertification = {
  name: string;
  issuer: string;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialCode: string;
  verificationUrl: string;
};

export type CandidateLanguage = {
  language: string;
  level: "basic" | "intermediate" | "advanced" | "fluent" | "native";
};

export type CandidateProfessionalLink = {
  type: "linkedin" | "github" | "portfolio" | "website" | "other";
  url: string;
  description: string;
};

export type CandidateAvailability = {
  immediate: boolean;
  availableAt: string | null;
  noticePeriodDays: number | null;
  relocation: boolean;
  travel: boolean;
  preferredWorkModel: "onsite" | "hybrid" | "remote" | "flexible" | null;
};

export type CandidateWorkAuthorization = {
  country: string;
  authorized: boolean;
  sponsorshipRequired: boolean;
  note: string;
};

export type CandidateSalaryExpectation = {
  min: number | null;
  max: number | null;
  currency: string;
  periodicity: "monthly" | "hourly" | "annual";
};

export type Candidate = {
  id: string;
  organizationId: string;
  fullName: string;
  preferredName: string | null;
  email: string;
  normalizedEmail: string;
  phone: string | null;
  secondaryPhone: string | null;
  status: CandidateStatus;
  source: CandidateSource;
  sourceDetails: string | null;
  professionalSummary: string | null;
  location: CandidateLocation;
  experiences: CandidateExperience[];
  education: CandidateEducation[];
  certifications: CandidateCertification[];
  languages: CandidateLanguage[];
  professionalLinks: CandidateProfessionalLink[];
  declaredCompetencies: string[];
  availability: CandidateAvailability;
  workAuthorization: CandidateWorkAuthorization;
  salaryExpectation: CandidateSalaryExpectation | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  inactivatedAt: string | null;
};

export type CandidateConsent = {
  id: string;
  organizationId: string;
  candidateId: string;
  status: ConsentStatus;
  consentAt: string;
  source: string;
  termsVersion: string;
  purpose: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type CandidateInternalNote = {
  id: string;
  organizationId: string;
  candidateId: string;
  content: string;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CandidateInput = {
  id?: unknown;
  organizationId?: string;
  organization_id?: unknown;
  status?: unknown;
  fullName?: unknown;
  full_name?: unknown;
  preferredName?: unknown;
  preferred_name?: unknown;
  email?: unknown;
  phone?: unknown;
  secondaryPhone?: unknown;
  secondary_phone?: unknown;
  source?: unknown;
  sourceDetails?: unknown;
  source_details?: unknown;
  professionalSummary?: unknown;
  professional_summary?: unknown;
  location?: unknown;
  experiences?: unknown;
  education?: unknown;
  certifications?: unknown;
  languages?: unknown;
  professionalLinks?: unknown;
  professional_links?: unknown;
  declaredCompetencies?: unknown;
  declared_competencies?: unknown;
  availability?: unknown;
  workAuthorization?: unknown;
  work_authorization?: unknown;
  salaryExpectation?: unknown;
  salary_expectation?: unknown;
  consent?: unknown;
  internalNote?: unknown;
  internal_note?: unknown;
  createdByUserId?: unknown;
  created_by_user_id?: unknown;
  updatedByUserId?: unknown;
  updated_by_user_id?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
  inactivatedAt?: unknown;
  inactivated_at?: unknown;
};

export type CandidatePatchInput = Omit<CandidateInput, "email" | "consent">;

export type CandidateConsentInput = {
  status?: unknown;
  consentAt?: unknown;
  consent_at?: unknown;
  source?: unknown;
  termsVersion?: unknown;
  terms_version?: unknown;
  purpose?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
};

export type CandidateAdminReadInput = {
  reason?: string;
};

export type CandidateContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};
