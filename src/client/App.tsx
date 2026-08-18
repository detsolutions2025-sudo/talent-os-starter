import { useEffect, useState } from "react";
import { BlueprintPanel } from "./BlueprintPanel";
import { PreInterviewPanel } from "./PreInterviewPanel";
import { BehavioralInstrumentPanel } from "./BehavioralInstrumentPanel";
import { BehavioralAssessmentPanel } from "./BehavioralAssessmentPanel";
import { PreAnalysisPanel } from "./PreAnalysisPanel";
import { CandidateDossierPanel } from "./CandidateDossierPanel";
import { OnboardingPanel } from "./OnboardingPanel";
import { EmploymentPanel } from "./EmploymentPanel";
import { DevelopmentRetentionPanel } from "./DevelopmentRetentionPanel";
import { ProposalPanel } from "./ProposalPanel";
import "./styles.css";

type Organization = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
};

type Membership = {
  id: string;
  userId: string;
  role: "owner" | "admin" | "member";
  status: "active" | "inactive";
  user: {
    name: string;
    email: string;
  } | null;
};

type DnaValue = {
  name: string;
  description: string;
  practicalMeaning: string;
  expectedBehaviors: string[];
  incompatibleBehaviors: string[];
};

type DnaCompetency = {
  name: string;
  description: string;
  importance: "low" | "medium" | "high" | "critical";
  examples: string[];
};

type DnaVersion = {
  id: string;
  versionNumber: number | null;
  status: "draft" | "published" | "archived";
  mission: string;
  vision: string;
  purpose: string;
  values: DnaValue[];
  competencies: DnaCompetency[];
  culture: string;
  leadershipStyle: string;
  workEnvironment: string;
  discardedAt: string | null;
};

type OrganizationalUnit = {
  id: string;
  code: string;
  name: string;
  type:
    | "board"
    | "directorate"
    | "department"
    | "division"
    | "branch"
    | "office"
    | "team"
    | "squad"
    | "unit"
    | "other";
  parentId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  description: string | null;
  displayOrder: number;
  status: "active" | "inactive";
  children?: OrganizationalUnit[];
};

type OrganizationalUnitDraft = {
  code: string;
  name: string;
  type: OrganizationalUnit["type"];
  parentId: string;
  managerName: string;
  managerEmail: string;
  description: string;
  displayOrder: number;
};

type CompetencyCategory =
  | "technical"
  | "behavioral"
  | "leadership"
  | "management"
  | "tools"
  | "languages"
  | "compliance"
  | "safety"
  | "other";

type GlobalCompetency = {
  id: string;
  code: string;
  name: string;
  category: CompetencyCategory;
  definition: string;
  status: "active" | "inactive" | "deprecated";
};

type OrganizationCompetency = {
  id: string;
  code: string;
  name: string;
  category: CompetencyCategory;
  definition: string;
  status: "active" | "inactive";
};

type UnifiedCatalogItem = {
  competencyCatalogItemId: string;
  origin: "global" | "organization";
  code: string;
  name: string;
  category: CompetencyCategory;
  status: "active" | "inactive";
  sourceStatus: string;
  globalStatus: "active" | "inactive" | "deprecated" | null;
  editable: boolean;
  deprecated: boolean;
};

type QuestionCategory =
  | "general"
  | "technical"
  | "behavioral"
  | "situational"
  | "culture"
  | "leadership"
  | "management"
  | "compliance"
  | "safety"
  | "screening"
  | "other";

type QuestionType =
  | "open_text"
  | "long_text"
  | "single_choice"
  | "multiple_choice"
  | "yes_no"
  | "numeric"
  | "scale"
  | "date"
  | "situational"
  | "behavioral"
  | "technical";

type GlobalQuestion = {
  id: string;
  code: string;
  title: string;
  questionText: string;
  type: QuestionType;
  category: QuestionCategory;
  status: "active" | "inactive" | "deprecated";
};

type OrganizationQuestion = {
  id: string;
  code: string;
  title: string;
  questionText: string;
  type: QuestionType;
  category: QuestionCategory;
  competencyCatalogItemId: string | null;
  status: "active" | "inactive";
};

type UnifiedQuestionCatalogItem = {
  questionCatalogItemId: string;
  origin: "global" | "organization";
  code: string;
  title: string;
  type: QuestionType;
  category: QuestionCategory;
  status: "active" | "inactive";
  sourceStatus: string;
  globalStatus: "active" | "inactive" | "deprecated" | null;
  editable: boolean;
  deprecated: boolean;
  competencyCatalogItemId: string | null;
};

type QuestionDraft = {
  code: string;
  title: string;
  questionText: string;
  type: QuestionType;
  category: QuestionCategory;
  competencyCatalogItemId: string;
};

type CompetencyDraft = {
  code: string;
  name: string;
  category: CompetencyCategory;
  definition: string;
};

type JobProfile = {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
};

type JobProfileDraft = {
  code: string;
  name: string;
};

type JobProfileVersion = {
  id: string;
  versionNumber: number | null;
  status: "draft" | "published" | "archived";
  title: string;
  mission: string;
  summary: string;
  responsibilities: { text: string; displayOrder: number }[];
  requirements: { text: string; type: string; required: boolean; displayOrder: number }[];
  workModel: "onsite" | "hybrid" | "remote" | "flexible";
  workSchedule: { weeklyHours: number; description: string; shift: string };
  travelRequirement: "none" | "occasional" | "frequent";
  salaryRange: { min: number; max: number; currency: string; periodicity: string } | null;
  competencies: {
    competencyCatalogItemId: string;
    expectedLevel: number;
    required: boolean;
    displayOrder: number;
  }[];
  discardedAt: string | null;
};

type JobOpening = {
  id: string;
  code: string;
  title: string;
  status: "draft" | "open" | "paused" | "closed" | "cancelled";
  isPublic: boolean;
  publicSlug: string | null;
  applicationDeadline: string | null;
  isPubliclyAvailable: boolean;
  publishedVersion: {
    id: string;
    publicTitle: string;
    positionsCount: number;
    salaryRange: { min: number; max: number; currency: string; periodicity: string } | null;
    internalInstructions: string;
  } | null;
};

type JobOpeningDraft = {
  code: string;
  title: string;
  publicTitle: string;
  positionsCount: number;
  publicSlug: string;
  applicationDeadline: string;
  showSalary: boolean;
};

type Candidate = {
  id: string;
  fullName: string;
  preferredName: string | null;
  email?: string;
  phone?: string | null;
  secondaryPhone?: string | null;
  status: "active" | "inactive";
  source: string;
  professionalSummary: string | null;
  city?: string;
  state?: string;
  location?: { city: string; state: string; address?: string };
  experiences: { company: string; title: string; startDate: string; current: boolean }[];
  education: { institution: string; course: string; level: string }[];
  certifications: { name: string; issuer: string }[];
  languages: { language: string; level: string }[];
  declaredCompetencies: string[];
  professionalLinks: { type: string; url: string }[];
};

type CandidateDraft = {
  fullName: string;
  preferredName: string;
  email: string;
  source: string;
  city: string;
  state: string;
  professionalSummary: string;
};

type CandidateApplicationStatus = "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
type CandidateApplicationStage =
  "applied" | "screening" | "interview" | "assessment" | "offer" | "completed";

type CandidateApplication = {
  id: string;
  candidateId?: string;
  jobOpeningId?: string;
  jobOpeningVersionId?: string;
  applicationStatus?: CandidateApplicationStatus;
  application_status?: CandidateApplicationStatus;
  currentStage?: CandidateApplicationStage;
  current_stage?: CandidateApplicationStage;
  source?: string;
  appliedAt?: string;
  applied_at?: string;
  finalizedAt?: string | null;
  finalizationReason?: string | null;
  candidate?: {
    id: string;
    fullName?: string;
    full_name?: string;
    preferredName?: string | null;
    preferred_name?: string | null;
  } | null;
  job_opening?: { id: string; title: string } | null;
  job_opening_version?: { id: string; public_title: string; version_number: number | null } | null;
  notes?: CandidateApplicationNote[];
};

type CandidateApplicationNote = {
  id: string;
  content: string;
  createdByUserId: string;
  createdAt: string;
};

type CandidateApplicationDraft = {
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  source: string;
  note: string;
  finalizationReason: string;
};

type InterviewStatus =
  "draft" | "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
type InterviewType =
  | "screening"
  | "behavioral"
  | "technical"
  | "cultural"
  | "leadership"
  | "management"
  | "panel"
  | "final"
  | "other";
type InterviewLocationType = "onsite" | "video" | "phone" | "other";

type Interview = {
  id: string;
  candidateApplicationId?: string;
  candidate_application_id?: string;
  title: string;
  type: InterviewType;
  status: InterviewStatus;
  scheduledStartAt?: string | null;
  scheduled_start_at?: string | null;
  scheduledEndAt?: string | null;
  scheduled_end_at?: string | null;
  timezone: string;
  locationType?: InterviewLocationType;
  location_type?: InterviewLocationType;
};

type InterviewDraft = {
  candidateApplicationId: string;
  title: string;
  type: InterviewType;
  scheduledStartAt: string;
  scheduledEndAt: string;
  timezone: string;
  locationType: InterviewLocationType;
  locationDetails: string;
  reason: string;
};

const emptyUnitDraft: OrganizationalUnitDraft = {
  code: "",
  name: "",
  type: "department",
  parentId: "",
  managerName: "",
  managerEmail: "",
  description: "",
  displayOrder: 0
};

const emptyCompetencyDraft: CompetencyDraft = {
  code: "",
  name: "",
  category: "technical",
  definition: ""
};

const emptyQuestionDraft: QuestionDraft = {
  code: "",
  title: "",
  questionText: "",
  type: "open_text",
  category: "general",
  competencyCatalogItemId: ""
};

const emptyJobProfileDraft: JobProfileDraft = {
  code: "",
  name: ""
};

const emptyJobOpeningDraft: JobOpeningDraft = {
  code: "",
  title: "",
  publicTitle: "",
  positionsCount: 1,
  publicSlug: "",
  applicationDeadline: "",
  showSalary: false
};

const emptyCandidateDraft: CandidateDraft = {
  fullName: "",
  preferredName: "",
  email: "",
  source: "manual",
  city: "",
  state: "",
  professionalSummary: ""
};

const emptyCandidateApplicationDraft: CandidateApplicationDraft = {
  candidateId: "",
  jobOpeningId: "",
  jobOpeningVersionId: "",
  source: "manual",
  note: "",
  finalizationReason: ""
};

const emptyInterviewDraft: InterviewDraft = {
  candidateApplicationId: "",
  title: "",
  type: "technical",
  scheduledStartAt: "",
  scheduledEndAt: "",
  timezone: "America/Sao_Paulo",
  locationType: "onsite",
  locationDetails: "",
  reason: ""
};

const applicationStages: CandidateApplicationStage[] = [
  "applied",
  "screening",
  "interview",
  "assessment",
  "offer",
  "completed"
];

function applicationStatusOf(application: CandidateApplication) {
  return application.applicationStatus ?? application.application_status ?? "active";
}

function applicationStageOf(application: CandidateApplication) {
  return application.currentStage ?? application.current_stage ?? "applied";
}

function applicationAppliedAtOf(application: CandidateApplication) {
  return application.appliedAt ?? application.applied_at ?? "";
}

function applicationCandidateName(application: CandidateApplication) {
  return (
    application.candidate?.fullName ??
    application.candidate?.full_name ??
    application.candidateId ??
    application.id
  );
}

function interviewApplicationId(interview: Interview) {
  return interview.candidateApplicationId ?? interview.candidate_application_id ?? "";
}

function interviewScheduledStart(interview: Interview) {
  return interview.scheduledStartAt ?? interview.scheduled_start_at ?? "";
}

function interviewScheduledEnd(interview: Interview) {
  return interview.scheduledEndAt ?? interview.scheduled_end_at ?? "";
}

const competencyCategories: CompetencyCategory[] = [
  "technical",
  "behavioral",
  "leadership",
  "management",
  "tools",
  "languages",
  "compliance",
  "safety",
  "other"
];

const questionCategories: QuestionCategory[] = [
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
];

const questionTypes: QuestionType[] = [
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
];

const platformHeaders = {
  "x-dev-platform-admin": "true"
};

const currentDevUserId = import.meta.env.VITE_DEV_USER_ID ?? "usr_000001";
const devHeaders = {
  "x-dev-user-id": currentDevUserId
};

export function App() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<Membership["role"]>("member");
  const [publishedDna, setPublishedDna] = useState<DnaVersion | null>(null);
  const [draftDna, setDraftDna] = useState<DnaVersion | null>(null);
  const [dnaHistory, setDnaHistory] = useState<DnaVersion[]>([]);
  const [unitTree, setUnitTree] = useState<OrganizationalUnit[]>([]);
  const [activeUnits, setActiveUnits] = useState<OrganizationalUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [unitDraft, setUnitDraft] = useState<OrganizationalUnitDraft>(emptyUnitDraft);
  const [showInactiveUnits, setShowInactiveUnits] = useState(false);
  const [competencyTab, setCompetencyTab] = useState<"global" | "organization" | "catalog">(
    "catalog"
  );
  const [globalCompetencies, setGlobalCompetencies] = useState<GlobalCompetency[]>([]);
  const [availableGlobalCompetencies, setAvailableGlobalCompetencies] = useState<
    GlobalCompetency[]
  >([]);
  const [organizationCompetencies, setOrganizationCompetencies] = useState<
    OrganizationCompetency[]
  >([]);
  const [catalogItems, setCatalogItems] = useState<UnifiedCatalogItem[]>([]);
  const [questionTab, setQuestionTab] = useState<"catalog" | "organization" | "global">("catalog");
  const [globalQuestions, setGlobalQuestions] = useState<GlobalQuestion[]>([]);
  const [availableGlobalQuestions, setAvailableGlobalQuestions] = useState<GlobalQuestion[]>([]);
  const [organizationQuestions, setOrganizationQuestions] = useState<OrganizationQuestion[]>([]);
  const [questionCatalogItems, setQuestionCatalogItems] = useState<UnifiedQuestionCatalogItem[]>(
    []
  );
  const [jobProfiles, setJobProfiles] = useState<JobProfile[]>([]);
  const [inactiveJobProfiles, setInactiveJobProfiles] = useState<JobProfile[]>([]);
  const [selectedJobProfileId, setSelectedJobProfileId] = useState("");
  const [jobProfileDraft, setJobProfileDraft] = useState<JobProfileDraft>(emptyJobProfileDraft);
  const [jobDraftVersion, setJobDraftVersion] = useState<JobProfileVersion | null>(null);
  const [publishedJobVersion, setPublishedJobVersion] = useState<JobProfileVersion | null>(null);
  const [jobProfileHistory, setJobProfileHistory] = useState<JobProfileVersion[]>([]);
  const [jobOpenings, setJobOpenings] = useState<JobOpening[]>([]);
  const [jobOpeningDraft, setJobOpeningDraft] = useState<JobOpeningDraft>(emptyJobOpeningDraft);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [inactiveCandidates, setInactiveCandidates] = useState<Candidate[]>([]);
  const [candidateDraft, setCandidateDraft] = useState<CandidateDraft>(emptyCandidateDraft);
  const [candidateApplications, setCandidateApplications] = useState<CandidateApplication[]>([]);
  const [candidateApplicationDraft, setCandidateApplicationDraft] =
    useState<CandidateApplicationDraft>(emptyCandidateApplicationDraft);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [interviewDraft, setInterviewDraft] = useState<InterviewDraft>(emptyInterviewDraft);
  const [globalCompetencyDraft, setGlobalCompetencyDraft] =
    useState<CompetencyDraft>(emptyCompetencyDraft);
  const [organizationCompetencyDraft, setOrganizationCompetencyDraft] =
    useState<CompetencyDraft>(emptyCompetencyDraft);
  const [organizationQuestionDraft, setOrganizationQuestionDraft] =
    useState<QuestionDraft>(emptyQuestionDraft);
  const [message, setMessage] = useState("Nenhuma Organization selecionada.");
  const currentMembership = memberships.find(
    (membership) => membership.userId === currentDevUserId && membership.status === "active"
  );
  const canManageMemberships =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canManageOwners = currentMembership?.role === "owner";
  const canManageDna = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canPublishDna = currentMembership?.role === "owner";
  const canManageUnits = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canChangeUnitCode = currentMembership?.role === "owner";
  const canManageCompetencies =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canManageQuestions =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canManageJobs = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canPublishJobs = currentMembership?.role === "owner";
  const canManageJobOpenings =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canPublishJobOpenings = currentMembership?.role === "owner";
  const canManageCandidates =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canManageApplications =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canHireApplications = currentMembership?.role === "owner";
  const canManageInterviews =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";

  useEffect(() => {
    fetch("/api/organizations", { headers: devHeaders })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou usuario de desenvolvimento nao configurado.");
        }

        return response.json() as Promise<Organization[]>;
      })
      .then((data) => {
        setOrganizations(data);
        setMessage(
          data.length ? "Selecione uma Organization ativa." : "Sem Organizations acessiveis."
        );
      })
      .catch((error: Error) => setMessage(error.message));
    loadPlatformGlobals();
    loadPlatformQuestions();
  }, []);

  function loadPlatformGlobals() {
    fetch("/api/platform/competencies/global", { headers: platformHeaders })
      .then(async (response) => {
        setGlobalCompetencies(response.ok ? ((await response.json()) as GlobalCompetency[]) : []);
      })
      .catch(() => setGlobalCompetencies([]));
  }

  function loadPlatformQuestions() {
    fetch("/api/platform/questions/global", { headers: platformHeaders })
      .then(async (response) => {
        setGlobalQuestions(response.ok ? ((await response.json()) as GlobalQuestion[]) : []);
      })
      .catch(() => setGlobalQuestions([]));
  }

  function selectOrganization(organizationId: string) {
    setSelectedOrganizationId(organizationId);
    setSelectedOrganization(null);
    setMemberships([]);
    setPublishedDna(null);
    setDraftDna(null);
    setDnaHistory([]);
    setUnitTree([]);
    setActiveUnits([]);
    setSelectedUnitId("");
    setUnitDraft(emptyUnitDraft);
    setOrganizationCompetencies([]);
    setAvailableGlobalCompetencies([]);
    setCatalogItems([]);
    setOrganizationQuestions([]);
    setAvailableGlobalQuestions([]);
    setQuestionCatalogItems([]);
    setQuestionTab("catalog");
    setJobProfiles([]);
    setInactiveJobProfiles([]);
    setSelectedJobProfileId("");
    setJobProfileDraft(emptyJobProfileDraft);
    setJobDraftVersion(null);
    setPublishedJobVersion(null);
    setJobProfileHistory([]);
    setJobOpenings([]);
    setJobOpeningDraft(emptyJobOpeningDraft);
    setCandidates([]);
    setInactiveCandidates([]);
    setCandidateDraft(emptyCandidateDraft);
    setCandidateApplications([]);
    setCandidateApplicationDraft(emptyCandidateApplicationDraft);
    setInterviews([]);
    setInterviewDraft(emptyInterviewDraft);

    if (!organizationId) {
      setMessage("Nenhuma Organization selecionada.");
      return;
    }

    Promise.all([
      fetch(`/api/organizations/${organizationId}`, { headers: devHeaders }),
      fetch(`/api/organizations/${organizationId}/memberships`, { headers: devHeaders })
    ])
      .then(async ([organizationResponse, membershipsResponse]) => {
        if (!organizationResponse.ok || !membershipsResponse.ok) {
          throw new Error("Acesso negado para a Organization selecionada.");
        }

        const organization = (await organizationResponse.json()) as Organization;
        const organizationMemberships = (await membershipsResponse.json()) as Membership[];
        setSelectedOrganization(organization);
        setMemberships(organizationMemberships);
        setMessage("Organization selecionada com contexto validado no servidor.");
        void loadDna(organizationId, organizationMemberships);
        void loadUnits(organizationId);
        void loadCompetencies(organizationId, organizationMemberships);
        void loadQuestions(organizationId, organizationMemberships);
        void loadJobProfiles(organizationId, organizationMemberships);
        void loadJobOpenings(organizationId);
        void loadCandidates(organizationId, organizationMemberships);
        void loadCandidateApplications(organizationId);
        void loadInterviews(organizationId);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function loadDna(organizationId: string, organizationMemberships = memberships) {
    const membership = organizationMemberships.find(
      (candidate) => candidate.userId === currentDevUserId && candidate.status === "active"
    );
    const canReadDraft = membership?.role === "owner" || membership?.role === "admin";

    fetch(`/api/organizations/${organizationId}/dna`, { headers: devHeaders })
      .then(async (response) => {
        setPublishedDna(response.ok ? ((await response.json()) as DnaVersion) : null);
      })
      .catch(() => setPublishedDna(null));

    if (!canReadDraft) {
      setDraftDna(null);
      setDnaHistory([]);
      return;
    }

    fetch(`/api/organizations/${organizationId}/dna/draft`, { headers: devHeaders })
      .then(async (response) => {
        setDraftDna(response.ok ? ((await response.json()) as DnaVersion) : null);
      })
      .catch(() => setDraftDna(null));
    fetch(`/api/organizations/${organizationId}/dna/versions`, { headers: devHeaders })
      .then(async (response) => {
        setDnaHistory(response.ok ? ((await response.json()) as DnaVersion[]) : []);
      })
      .catch(() => setDnaHistory([]));
  }

  function loadUnits(organizationId: string) {
    fetch(`/api/organizations/${organizationId}/organizational-units/tree`, { headers: devHeaders })
      .then(async (response) => {
        setUnitTree(response.ok ? ((await response.json()) as OrganizationalUnit[]) : []);
      })
      .catch(() => setUnitTree([]));
    fetch(`/api/organizations/${organizationId}/organizational-units`, { headers: devHeaders })
      .then(async (response) => {
        setActiveUnits(response.ok ? ((await response.json()) as OrganizationalUnit[]) : []);
      })
      .catch(() => setActiveUnits([]));
  }

  function loadCompetencies(organizationId: string, organizationMemberships = memberships) {
    const membership = organizationMemberships.find(
      (candidate) => candidate.userId === currentDevUserId && candidate.status === "active"
    );
    const canManage = membership?.role === "owner" || membership?.role === "admin";

    fetch(`/api/organizations/${organizationId}/competencies/catalog`, { headers: devHeaders })
      .then(async (response) => {
        setCatalogItems(response.ok ? ((await response.json()) as UnifiedCatalogItem[]) : []);
      })
      .catch(() => setCatalogItems([]));

    if (!canManage) {
      setOrganizationCompetencies([]);
      setAvailableGlobalCompetencies([]);
      return;
    }

    fetch(`/api/organizations/${organizationId}/competencies`, { headers: devHeaders })
      .then(async (response) => {
        setOrganizationCompetencies(
          response.ok ? ((await response.json()) as OrganizationCompetency[]) : []
        );
      })
      .catch(() => setOrganizationCompetencies([]));
    fetch(`/api/organizations/${organizationId}/competencies/available-globals`, {
      headers: devHeaders
    })
      .then(async (response) => {
        setAvailableGlobalCompetencies(
          response.ok ? ((await response.json()) as GlobalCompetency[]) : []
        );
      })
      .catch(() => setAvailableGlobalCompetencies([]));
  }

  function loadQuestions(organizationId: string, organizationMemberships = memberships) {
    const membership = organizationMemberships.find(
      (candidate) => candidate.userId === currentDevUserId && candidate.status === "active"
    );
    const canManage = membership?.role === "owner" || membership?.role === "admin";

    fetch(`/api/organizations/${organizationId}/questions/catalog`, { headers: devHeaders })
      .then(async (response) => {
        setQuestionCatalogItems(
          response.ok ? ((await response.json()) as UnifiedQuestionCatalogItem[]) : []
        );
      })
      .catch(() => setQuestionCatalogItems([]));

    if (!canManage) {
      setOrganizationQuestions([]);
      setAvailableGlobalQuestions([]);
      return;
    }

    fetch(`/api/organizations/${organizationId}/questions`, { headers: devHeaders })
      .then(async (response) => {
        setOrganizationQuestions(
          response.ok ? ((await response.json()) as OrganizationQuestion[]) : []
        );
      })
      .catch(() => setOrganizationQuestions([]));
    fetch(`/api/organizations/${organizationId}/questions/available-globals`, {
      headers: devHeaders
    })
      .then(async (response) => {
        setAvailableGlobalQuestions(
          response.ok ? ((await response.json()) as GlobalQuestion[]) : []
        );
      })
      .catch(() => setAvailableGlobalQuestions([]));
  }

  function loadJobProfiles(organizationId: string, organizationMemberships = memberships) {
    const membership = organizationMemberships.find(
      (candidate) => candidate.userId === currentDevUserId && candidate.status === "active"
    );
    const canManage = membership?.role === "owner" || membership?.role === "admin";

    fetch(`/api/organizations/${organizationId}/job-profiles`, { headers: devHeaders })
      .then(async (response) => {
        setJobProfiles(response.ok ? ((await response.json()) as JobProfile[]) : []);
      })
      .catch(() => setJobProfiles([]));

    if (!canManage) {
      setInactiveJobProfiles([]);
      return;
    }

    fetch(`/api/organizations/${organizationId}/job-profiles/inactive`, { headers: devHeaders })
      .then(async (response) => {
        setInactiveJobProfiles(response.ok ? ((await response.json()) as JobProfile[]) : []);
      })
      .catch(() => setInactiveJobProfiles([]));
  }

  function loadJobOpenings(organizationId: string) {
    fetch(`/api/organizations/${organizationId}/job-openings`, { headers: devHeaders })
      .then(async (response) => {
        setJobOpenings(response.ok ? ((await response.json()) as JobOpening[]) : []);
      })
      .catch(() => setJobOpenings([]));
  }

  function loadCandidates(organizationId: string, organizationMemberships = memberships) {
    const membership = organizationMemberships.find(
      (candidate) => candidate.userId === currentDevUserId && candidate.status === "active"
    );
    const canManage = membership?.role === "owner" || membership?.role === "admin";

    fetch(`/api/organizations/${organizationId}/candidates`, { headers: devHeaders })
      .then(async (response) => {
        setCandidates(response.ok ? ((await response.json()) as Candidate[]) : []);
      })
      .catch(() => setCandidates([]));

    if (!canManage) {
      setInactiveCandidates([]);
      return;
    }

    fetch(`/api/organizations/${organizationId}/candidates/inactive`, { headers: devHeaders })
      .then(async (response) => {
        setInactiveCandidates(response.ok ? ((await response.json()) as Candidate[]) : []);
      })
      .catch(() => setInactiveCandidates([]));
  }

  function loadCandidateApplications(organizationId: string) {
    fetch(`/api/organizations/${organizationId}/candidate-applications`, { headers: devHeaders })
      .then(async (response) => {
        setCandidateApplications(
          response.ok ? ((await response.json()) as CandidateApplication[]) : []
        );
      })
      .catch(() => setCandidateApplications([]));
  }

  function loadInterviews(organizationId: string) {
    fetch(`/api/organizations/${organizationId}/interviews`, { headers: devHeaders })
      .then(async (response) => {
        setInterviews(response.ok ? ((await response.json()) as Interview[]) : []);
      })
      .catch(() => setInterviews([]));
  }

  function reloadSelectedOrganization() {
    if (selectedOrganizationId) {
      selectOrganization(selectedOrganizationId);
    }
  }

  function reloadDna() {
    if (selectedOrganizationId) {
      loadDna(selectedOrganizationId);
    }
  }

  function reloadUnits() {
    if (selectedOrganizationId) {
      loadUnits(selectedOrganizationId);
    }
  }

  function reloadCompetencies() {
    if (selectedOrganizationId) {
      loadCompetencies(selectedOrganizationId);
    }
  }

  function reloadQuestions() {
    if (selectedOrganizationId) {
      loadQuestions(selectedOrganizationId);
    }
  }

  function reloadJobProfiles() {
    if (selectedOrganizationId) {
      loadJobProfiles(selectedOrganizationId);
      if (selectedJobProfileId) {
        loadSelectedJobProfile(selectedJobProfileId);
      }
    }
  }

  function reloadJobOpenings() {
    if (selectedOrganizationId) {
      loadJobOpenings(selectedOrganizationId);
    }
  }

  function reloadCandidateApplications() {
    if (selectedOrganizationId) {
      loadCandidateApplications(selectedOrganizationId);
    }
  }

  function reloadInterviews() {
    if (selectedOrganizationId) {
      loadInterviews(selectedOrganizationId);
    }
  }

  function addMember() {
    if (!selectedOrganizationId || !newMemberUserId.trim()) {
      setMessage("Informe a Organization e o User ID.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/memberships`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userId: newMemberUserId.trim(),
        role: newMemberRole
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou dados invalidos para adicionar membro.");
        }

        setNewMemberUserId("");
        setNewMemberRole("member");
        reloadSelectedOrganization();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function updateMembership(
    membershipId: string,
    body: Partial<Pick<Membership, "role" | "status">>
  ) {
    fetch(`/api/memberships/${membershipId}`, {
      method: "PATCH",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado para alterar Membership.");
        }

        reloadSelectedOrganization();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function competencyPayload(draft: CompetencyDraft) {
    return {
      ...draft,
      status: "active",
      positiveEvidences: [{ text: "Evidencia observavel", displayOrder: 0 }],
      negativeEvidences: [{ text: "Ausencia de evidencia observavel", displayOrder: 0 }],
      practicalExamples: [{ text: "Aplicacao pratica", displayOrder: 0 }],
      proficiencyLevels: [
        {
          number: 1,
          code: "basic",
          displayName: "Basico",
          description: "Reconhece conceitos essenciais.",
          observableEvidences: []
        },
        {
          number: 2,
          code: "intermediate",
          displayName: "Intermediario",
          description: "Aplica com apoio em cenarios conhecidos.",
          observableEvidences: []
        },
        {
          number: 3,
          code: "proficient",
          displayName: "Proficiente",
          description: "Aplica com autonomia em cenarios recorrentes.",
          observableEvidences: []
        },
        {
          number: 4,
          code: "advanced",
          displayName: "Avancado",
          description: "Resolve casos complexos e orienta outras pessoas.",
          observableEvidences: []
        },
        {
          number: 5,
          code: "reference",
          displayName: "Referencia",
          description: "Define praticas e referencia tecnica para a Organization.",
          observableEvidences: []
        }
      ]
    };
  }

  function createGlobalCompetency() {
    fetch("/api/platform/competencies/global", {
      method: "POST",
      headers: {
        ...platformHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify(competencyPayload(globalCompetencyDraft))
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou dados invalidos para criar global.");
        }

        setGlobalCompetencyDraft(emptyCompetencyDraft);
        loadPlatformGlobals();
        if (selectedOrganizationId) {
          reloadCompetencies();
        }
        setMessage("Competencia global criada.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createOrganizationCompetency() {
    if (!selectedOrganizationId) {
      setMessage("Selecione uma Organization.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/competencies`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify(competencyPayload(organizationCompetencyDraft))
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou dados invalidos para criar competencia.");
        }

        setOrganizationCompetencyDraft(emptyCompetencyDraft);
        reloadCompetencies();
        setMessage("Competencia propria criada e adicionada ao catalogo.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function adoptGlobalCompetency(globalCompetencyId: string) {
    if (!selectedOrganizationId) {
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/competencies/adoptions`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({ globalCompetencyId })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou global indisponivel para adocao.");
        }

        reloadCompetencies();
        setMessage("Competencia global adotada.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function changeOrganizationCompetencyStatus(
    competencyId: string,
    action: "activate" | "inactivate"
  ) {
    if (!selectedOrganizationId) {
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/competencies/${competencyId}/${action}`, {
      method: "POST",
      headers: devHeaders
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Alteracao de status negada para competencia.");
        }

        reloadCompetencies();
        setMessage(action === "activate" ? "Competencia ativada." : "Competencia inativada.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function questionPayload(draft: QuestionDraft, allowCompetency: boolean) {
    const base = {
      code: draft.code,
      title: draft.title,
      questionText: draft.questionText,
      type: draft.type,
      category: draft.category,
      status: "active",
      description: "",
      instructions: ""
    };

    const options =
      draft.type === "single_choice" || draft.type === "multiple_choice"
        ? [
            { id: "opt_yes", text: "Sim", displayOrder: 0, status: "active" },
            { id: "opt_no", text: "Nao", displayOrder: 1, status: "active" }
          ]
        : [];
    const settings =
      draft.type === "scale"
        ? { min: 1, max: 5, step: 1, minLabel: "Baixo", maxLabel: "Alto" }
        : draft.type === "numeric"
          ? { min: null, max: null, decimals: 0, unit: null }
          : {};

    return {
      ...base,
      options,
      settings,
      competencyCatalogItemId:
        allowCompetency && draft.competencyCatalogItemId ? draft.competencyCatalogItemId : undefined
    };
  }

  function createOrganizationQuestion() {
    if (!selectedOrganizationId) {
      setMessage("Selecione uma Organization.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/questions`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify(questionPayload(organizationQuestionDraft, true))
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou dados invalidos para criar pergunta.");
        }

        setOrganizationQuestionDraft(emptyQuestionDraft);
        reloadQuestions();
        setMessage("Pergunta propria criada e adicionada ao catalogo.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function adoptGlobalQuestion(globalQuestionId: string) {
    if (!selectedOrganizationId) {
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/questions/adoptions`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({ globalQuestionId })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou pergunta global indisponivel para adocao.");
        }

        reloadQuestions();
        setMessage("Pergunta global adotada.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function changeOrganizationQuestionStatus(questionId: string, action: "activate" | "inactivate") {
    if (!selectedOrganizationId) {
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/questions/${questionId}/${action}`, {
      method: "POST",
      headers: devHeaders
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Alteracao de status negada para pergunta.");
        }

        reloadQuestions();
        setMessage(action === "activate" ? "Pergunta ativada." : "Pergunta inativada.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createJobProfile() {
    if (!selectedOrganizationId) {
      setMessage("Selecione uma Organization.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/job-profiles`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify(jobProfileDraft)
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou dados invalidos para criar cargo.");
        }

        const profile = (await response.json()) as JobProfile;
        setJobProfileDraft(emptyJobProfileDraft);
        setSelectedJobProfileId(profile.id);
        reloadJobProfiles();
        loadSelectedJobProfile(profile.id);
        setMessage("Cargo criado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function loadSelectedJobProfile(jobProfileId: string) {
    if (!selectedOrganizationId || !jobProfileId) {
      setJobDraftVersion(null);
      setPublishedJobVersion(null);
      setJobProfileHistory([]);
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/job-profiles/${jobProfileId}/published`, {
      headers: devHeaders
    })
      .then(async (response) => {
        setPublishedJobVersion(response.ok ? ((await response.json()) as JobProfileVersion) : null);
      })
      .catch(() => setPublishedJobVersion(null));

    if (!canManageJobs) {
      setJobDraftVersion(null);
      setJobProfileHistory([]);
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/job-profiles/${jobProfileId}/draft`, {
      headers: devHeaders
    })
      .then(async (response) => {
        setJobDraftVersion(response.ok ? ((await response.json()) as JobProfileVersion) : null);
      })
      .catch(() => setJobDraftVersion(null));
    fetch(`/api/organizations/${selectedOrganizationId}/job-profiles/${jobProfileId}/versions`, {
      headers: devHeaders
    })
      .then(async (response) => {
        setJobProfileHistory(response.ok ? ((await response.json()) as JobProfileVersion[]) : []);
      })
      .catch(() => setJobProfileHistory([]));
  }

  function createJobDraft() {
    if (!selectedOrganizationId || !selectedJobProfileId) {
      setMessage("Selecione um cargo.");
      return;
    }

    fetch(
      `/api/organizations/${selectedOrganizationId}/job-profiles/${selectedJobProfileId}/drafts`,
      {
        method: "POST",
        headers: {
          ...devHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou rascunho ativo ja existente.");
        }

        setJobDraftVersion((await response.json()) as JobProfileVersion);
        loadSelectedJobProfile(selectedJobProfileId);
        setMessage("Rascunho de cargo criado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function saveJobDraft() {
    if (!selectedOrganizationId || !selectedJobProfileId || !jobDraftVersion) {
      return;
    }

    fetch(
      `/api/organizations/${selectedOrganizationId}/job-profiles/${selectedJobProfileId}/drafts/${jobDraftVersion.id}`,
      {
        method: "PATCH",
        headers: {
          ...devHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify(jobDraftPayload(jobDraftVersion))
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou dados invalidos para salvar cargo.");
        }

        setJobDraftVersion((await response.json()) as JobProfileVersion);
        loadSelectedJobProfile(selectedJobProfileId);
        setMessage("Rascunho de cargo salvo.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function publishJobDraft() {
    if (!selectedOrganizationId || !selectedJobProfileId || !jobDraftVersion) {
      return;
    }

    fetch(
      `/api/organizations/${selectedOrganizationId}/job-profiles/${selectedJobProfileId}/drafts/${jobDraftVersion.id}/publish`,
      { method: "POST", headers: devHeaders }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Publicacao negada ou rascunho incompleto.");
        }

        setPublishedJobVersion((await response.json()) as JobProfileVersion);
        setJobDraftVersion(null);
        reloadJobProfiles();
        setMessage("Cargo publicado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function discardJobDraft() {
    if (!selectedOrganizationId || !selectedJobProfileId || !jobDraftVersion) {
      return;
    }

    fetch(
      `/api/organizations/${selectedOrganizationId}/job-profiles/${selectedJobProfileId}/drafts/${jobDraftVersion.id}/discard`,
      { method: "POST", headers: devHeaders }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado para descartar rascunho.");
        }

        setJobDraftVersion(null);
        loadSelectedJobProfile(selectedJobProfileId);
        setMessage("Rascunho de cargo descartado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function updateJobDraftField<K extends keyof JobProfileVersion>(
    field: K,
    value: JobProfileVersion[K]
  ) {
    if (jobDraftVersion) {
      setJobDraftVersion({ ...jobDraftVersion, [field]: value });
    }
  }

  function jobDraftPayload(version: JobProfileVersion) {
    const selectedCatalogItem = catalogItems.find((item) => item.status === "active");

    return {
      title: version.title,
      mission: version.mission,
      summary: version.summary,
      responsibilities: version.responsibilities.length
        ? version.responsibilities
        : [{ text: "Responsabilidade principal", displayOrder: 0 }],
      requirements: version.requirements,
      education: { level: "not_required", area: "", required: false, note: "" },
      certifications: [],
      languages: [],
      tools: [],
      workModel: version.workModel,
      workSchedule: version.workSchedule,
      travelRequirement: version.travelRequirement,
      salaryRange: version.salaryRange,
      notes: "",
      competencies: selectedCatalogItem
        ? [
            {
              competencyCatalogItemId: selectedCatalogItem.competencyCatalogItemId,
              expectedLevel: 3,
              required: true,
              displayOrder: 0
            }
          ]
        : []
    };
  }

  function createJobOpening() {
    if (!selectedOrganizationId || !publishedJobVersion) {
      setMessage("Selecione um cargo com versao publicada.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/job-openings`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        code: jobOpeningDraft.code,
        title: jobOpeningDraft.title,
        publicTitle: jobOpeningDraft.publicTitle || jobOpeningDraft.title,
        positionsCount: jobOpeningDraft.positionsCount,
        jobProfileVersionId: publishedJobVersion.id
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou dados invalidos para criar vaga.");
        }

        setJobOpeningDraft(emptyJobOpeningDraft);
        reloadJobOpenings();
        setMessage("Vaga criada com primeiro rascunho.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createCandidate() {
    if (!selectedOrganizationId) {
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/candidates`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        fullName: candidateDraft.fullName,
        preferredName: candidateDraft.preferredName || null,
        email: candidateDraft.email,
        source: candidateDraft.source,
        professionalSummary: candidateDraft.professionalSummary,
        location: { city: candidateDraft.city, state: candidateDraft.state },
        consent: {
          status: "granted",
          source: "manual",
          termsVersion: "v1",
          purpose: "Cadastro de candidato"
        }
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel criar candidato.");
        }
        setCandidateDraft(emptyCandidateDraft);
        setMessage("Candidato criado.");
        loadCandidates(selectedOrganizationId);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function changeCandidateStatus(candidate: Candidate, action: "inactivate" | "reactivate") {
    if (!selectedOrganizationId) {
      return;
    }
    fetch(`/api/organizations/${selectedOrganizationId}/candidates/${candidate.id}/${action}`, {
      method: "POST",
      headers: devHeaders
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel alterar candidato.");
        }
        setMessage(action === "inactivate" ? "Candidato inativado." : "Candidato reativado.");
        loadCandidates(selectedOrganizationId);
        reloadCandidateApplications();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createCandidateApplication() {
    if (!selectedOrganizationId) {
      return;
    }
    if (
      !candidateApplicationDraft.candidateId ||
      !candidateApplicationDraft.jobOpeningId ||
      !candidateApplicationDraft.jobOpeningVersionId
    ) {
      setMessage("Selecione candidato, vaga aberta e versao publicada.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/candidate-applications`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        candidateId: candidateApplicationDraft.candidateId,
        jobOpeningId: candidateApplicationDraft.jobOpeningId,
        jobOpeningVersionId: candidateApplicationDraft.jobOpeningVersionId,
        source: candidateApplicationDraft.source
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel criar candidatura.");
        }
        setCandidateApplicationDraft(emptyCandidateApplicationDraft);
        setMessage("Candidatura criada.");
        reloadCandidateApplications();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function moveCandidateApplication(
    application: CandidateApplication,
    currentStage: CandidateApplicationStage
  ) {
    if (!selectedOrganizationId) {
      return;
    }
    fetch(
      `/api/organizations/${selectedOrganizationId}/candidate-applications/${application.id}/stage`,
      {
        method: "POST",
        headers: {
          ...devHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify({ currentStage, reason: "Movimentacao via interface minima." })
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel mover candidatura.");
        }
        setMessage("Etapa atualizada.");
        reloadCandidateApplications();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function finalizeCandidateApplication(
    application: CandidateApplication,
    action: "withdraw" | "reject" | "hire" | "cancel"
  ) {
    if (!selectedOrganizationId || !candidateApplicationDraft.finalizationReason.trim()) {
      setMessage("Informe o motivo da finalizacao.");
      return;
    }
    fetch(
      `/api/organizations/${selectedOrganizationId}/candidate-applications/${application.id}/${action}`,
      {
        method: "POST",
        headers: {
          ...devHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify({ reason: candidateApplicationDraft.finalizationReason })
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel finalizar candidatura.");
        }
        setCandidateApplicationDraft({
          ...candidateApplicationDraft,
          finalizationReason: ""
        });
        setMessage("Candidatura finalizada.");
        reloadCandidateApplications();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function addCandidateApplicationNote(application: CandidateApplication) {
    if (!selectedOrganizationId || !candidateApplicationDraft.note.trim()) {
      return;
    }
    fetch(
      `/api/organizations/${selectedOrganizationId}/candidate-applications/${application.id}/notes`,
      {
        method: "POST",
        headers: {
          ...devHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify({ content: candidateApplicationDraft.note })
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel adicionar nota.");
        }
        setCandidateApplicationDraft({ ...candidateApplicationDraft, note: "" });
        setMessage("Nota registrada.");
        reloadCandidateApplications();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createInterview() {
    if (
      !selectedOrganizationId ||
      !interviewDraft.candidateApplicationId ||
      !interviewDraft.title.trim()
    ) {
      setMessage("Selecione candidatura e titulo da entrevista.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/interviews`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        candidateApplicationId: interviewDraft.candidateApplicationId,
        title: interviewDraft.title,
        type: interviewDraft.type,
        timezone: interviewDraft.timezone,
        locationType: interviewDraft.locationType,
        locationDetails: interviewDraft.locationDetails || null
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel criar entrevista.");
        }
        setInterviewDraft({ ...emptyInterviewDraft, timezone: interviewDraft.timezone });
        setMessage("Entrevista criada em rascunho.");
        reloadInterviews();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function scheduleInterview(interview: Interview) {
    if (
      !selectedOrganizationId ||
      !interviewDraft.scheduledStartAt ||
      !interviewDraft.scheduledEndAt
    ) {
      setMessage("Informe inicio e fim para agendar.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/interviews/${interview.id}/schedule`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        scheduledStartAt: new Date(interviewDraft.scheduledStartAt).toISOString(),
        scheduledEndAt: new Date(interviewDraft.scheduledEndAt).toISOString(),
        timezone: interviewDraft.timezone,
        locationType: interviewDraft.locationType,
        locationDetails: interviewDraft.locationDetails || null
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel agendar entrevista.");
        }
        setMessage("Entrevista agendada.");
        reloadInterviews();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function changeInterviewStatus(interview: Interview, action: "start" | "cancel" | "no-show") {
    if (!selectedOrganizationId) {
      return;
    }
    if ((action === "cancel" || action === "no-show") && !interviewDraft.reason.trim()) {
      setMessage("Informe o motivo da acao.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/interviews/${interview.id}/${action}`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({ reason: interviewDraft.reason })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel alterar entrevista.");
        }
        setInterviewDraft({ ...interviewDraft, reason: "" });
        setMessage("Entrevista atualizada.");
        reloadInterviews();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function publishAndOpenJobOpening(opening: JobOpening) {
    if (!selectedOrganizationId) {
      return;
    }

    const draftUrl = `/api/organizations/${selectedOrganizationId}/job-openings/${opening.id}/draft`;
    fetch(draftUrl, { headers: devHeaders })
      .then(async (draftResponse) => {
        if (!draftResponse.ok) {
          throw new Error("Rascunho da vaga nao encontrado.");
        }
        const draft = (await draftResponse.json()) as { id: string };
        const publishResponse = await fetch(
          `/api/organizations/${selectedOrganizationId}/job-openings/${opening.id}/drafts/${draft.id}/publish`,
          { method: "POST", headers: devHeaders }
        );
        if (!publishResponse.ok) {
          throw new Error("Publicacao interna da vaga negada.");
        }
        const openResponse = await fetch(
          `/api/organizations/${selectedOrganizationId}/job-openings/${opening.id}/open`,
          { method: "POST", headers: devHeaders }
        );
        if (!openResponse.ok) {
          throw new Error("Abertura da vaga negada.");
        }
        reloadJobOpenings();
        setMessage("Vaga publicada internamente e aberta.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function publishJobOpeningPublicly(opening: JobOpening) {
    if (!selectedOrganizationId || !jobOpeningDraft.publicSlug.trim()) {
      setMessage("Informe um slug publico.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/job-openings/${opening.id}/publication`, {
      method: "PATCH",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        isPublic: true,
        publicSlug: jobOpeningDraft.publicSlug,
        applicationDeadline: jobOpeningDraft.applicationDeadline || null,
        showSalary: jobOpeningDraft.showSalary
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Divulgacao publica negada.");
        }
        reloadJobOpenings();
        setMessage("Divulgacao publica configurada.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createDnaDraft() {
    if (!selectedOrganizationId) {
      setMessage("Selecione uma Organization.");
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/dna/drafts`, {
      method: "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou rascunho ativo ja existente.");
        }

        setDraftDna((await response.json()) as DnaVersion);
        reloadDna();
        setMessage("Rascunho de DNA criado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function saveDnaDraft() {
    if (!selectedOrganizationId || !draftDna) {
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/dna/drafts/${draftDna.id}`, {
      method: "PATCH",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify(draftDna)
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou dados invalidos para salvar DNA.");
        }

        setDraftDna((await response.json()) as DnaVersion);
        reloadDna();
        setMessage("Rascunho de DNA salvo.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function publishDnaDraft() {
    if (!selectedOrganizationId || !draftDna) {
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/dna/drafts/${draftDna.id}/publish`, {
      method: "POST",
      headers: devHeaders
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou DNA incompleto para publicacao.");
        }

        setPublishedDna((await response.json()) as DnaVersion);
        setDraftDna(null);
        reloadDna();
        setMessage("DNA publicado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function discardDnaDraft() {
    if (!selectedOrganizationId || !draftDna) {
      return;
    }

    fetch(`/api/organizations/${selectedOrganizationId}/dna/drafts/${draftDna.id}/discard`, {
      method: "POST",
      headers: devHeaders
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado para descartar rascunho.");
        }

        setDraftDna(null);
        reloadDna();
        setMessage("Rascunho de DNA descartado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function updateDraftField(field: keyof DnaVersion, value: string) {
    if (draftDna) {
      setDraftDna({ ...draftDna, [field]: value });
    }
  }

  function updateFirstValue(field: keyof DnaValue, value: string) {
    if (!draftDna) {
      return;
    }

    const current = draftDna.values[0] ?? {
      name: "",
      description: "",
      practicalMeaning: "",
      expectedBehaviors: [],
      incompatibleBehaviors: []
    };
    setDraftDna({ ...draftDna, values: [{ ...current, [field]: value }] });
  }

  function updateFirstCompetency(field: keyof DnaCompetency, value: string) {
    if (!draftDna) {
      return;
    }

    const current = draftDna.competencies[0] ?? {
      name: "",
      description: "",
      importance: "medium",
      examples: []
    };
    setDraftDna({
      ...draftDna,
      competencies: [{ ...current, [field]: value } as DnaCompetency]
    });
  }

  function resetUnitDraft(parentId = "") {
    setSelectedUnitId("");
    setUnitDraft({ ...emptyUnitDraft, parentId });
  }

  function selectUnit(unit: OrganizationalUnit) {
    setSelectedUnitId(unit.id);
    setUnitDraft({
      code: unit.code,
      name: unit.name,
      type: unit.type,
      parentId: unit.parentId ?? "",
      managerName: unit.managerName ?? "",
      managerEmail: unit.managerEmail ?? "",
      description: unit.description ?? "",
      displayOrder: unit.displayOrder
    });
  }

  function saveUnit() {
    if (!selectedOrganizationId) {
      setMessage("Selecione uma Organization.");
      return;
    }

    const body = {
      ...unitDraft,
      parentId: unitDraft.parentId || null
    };
    const url = selectedUnitId
      ? `/api/organizations/${selectedOrganizationId}/organizational-units/${selectedUnitId}`
      : `/api/organizations/${selectedOrganizationId}/organizational-units`;

    fetch(url, {
      method: selectedUnitId ? "PATCH" : "POST",
      headers: {
        ...devHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Acesso negado ou dados invalidos para salvar unidade.");
        }

        const saved = (await response.json()) as OrganizationalUnit;
        setSelectedUnitId(saved.id);
        reloadUnits();
        setMessage("Unidade organizacional salva.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function moveUnit() {
    if (!selectedOrganizationId || !selectedUnitId) {
      return;
    }

    fetch(
      `/api/organizations/${selectedOrganizationId}/organizational-units/${selectedUnitId}/move`,
      {
        method: "POST",
        headers: {
          ...devHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          parentId: unitDraft.parentId || null,
          displayOrder: unitDraft.displayOrder
        })
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Movimentacao negada ou hierarquia invalida.");
        }

        reloadUnits();
        setMessage("Unidade movimentada.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function changeUnitStatus(action: "inactivate" | "reactivate") {
    if (!selectedOrganizationId || !selectedUnitId) {
      return;
    }

    fetch(
      `/api/organizations/${selectedOrganizationId}/organizational-units/${selectedUnitId}/${action}`,
      {
        method: "POST",
        headers: devHeaders
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Alteracao de status negada para a unidade.");
        }

        const updated = (await response.json()) as OrganizationalUnit;
        selectUnit(updated);
        reloadUnits();
        setMessage(action === "inactivate" ? "Unidade inativada." : "Unidade reativada.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function renderUnitNodes(units: OrganizationalUnit[]) {
    if (!units.length) {
      return <p>Nenhuma unidade carregada.</p>;
    }

    return (
      <ul className="unit-tree">
        {units
          .filter((unit) => showInactiveUnits || unit.status === "active")
          .map((unit) => (
            <li key={unit.id}>
              <button type="button" className="unit-row" onClick={() => selectUnit(unit)}>
                <strong>{unit.name}</strong>
                <small>
                  {unit.code} - {unit.type} - {unit.status}
                </small>
              </button>
              {unit.children && unit.children.length > 0 && renderUnitNodes(unit.children)}
            </li>
          ))}
      </ul>
    );
  }

  return (
    <main className="app-shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Fase 3</p>
        <h1 id="page-title">DoF — Gente & Seleção</h1>
        <p className="lead">
          Nucleo multiempresa, DNA Organizacional e Estrutura Organizacional com autorizacao no
          servidor.
        </p>
        <p className="eyebrow">por DocFounder</p>
      </section>

      <section className="workspace" aria-label="Nucleo multiempresa">
        <div className="panel">
          <span>Usuario temporario</span>
          <strong>{currentDevUserId}</strong>
          <p>Identificacao exclusiva para desenvolvimento e testes.</p>
        </div>

        <label className="field">
          <span>Organization atual</span>
          <select
            value={selectedOrganizationId}
            onChange={(event) => selectOrganization(event.target.value)}
          >
            <option value="">Selecione</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>

        <div className="message" role="status">
          {message}
        </div>

        {selectedOrganization && (
          <div className="panel">
            <span>Organization</span>
            <strong>{selectedOrganization.name}</strong>
            <p>
              {selectedOrganization.slug} - {selectedOrganization.status}
            </p>
          </div>
        )}

        {selectedOrganization && (
          <BlueprintPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
          />
        )}

        {selectedOrganization && (
          <PreInterviewPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
          />
        )}

        {selectedOrganization && (
          <BehavioralInstrumentPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
          />
        )}

        {selectedOrganization && (
          <BehavioralAssessmentPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
          />
        )}

        {selectedOrganization && (
          <PreAnalysisPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
          />
        )}

        {selectedOrganization && (
          <CandidateDossierPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
          />
        )}

        {selectedOrganization && (
          <ProposalPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
            applications={candidateApplications}
          />
        )}

        {selectedOrganization && (
          <OnboardingPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
            applications={candidateApplications}
            memberships={memberships}
          />
        )}

        {selectedOrganization && (
          <EmploymentPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
            applications={candidateApplications}
          />
        )}

        {selectedOrganization && (
          <DevelopmentRetentionPanel
            organizationId={selectedOrganization.id}
            role={currentMembership?.role}
            headers={devHeaders}
          />
        )}

        <div className="panel members">
          <span>Memberships</span>
          {canManageMemberships && (
            <div className="member-form">
              <input
                aria-label="User ID"
                placeholder="User ID"
                value={newMemberUserId}
                onChange={(event) => setNewMemberUserId(event.target.value)}
              />
              <select
                aria-label="Role"
                value={newMemberRole}
                onChange={(event) => setNewMemberRole(event.target.value as Membership["role"])}
              >
                <option value="member">member</option>
                {canManageOwners && <option value="admin">admin</option>}
                {canManageOwners && <option value="owner">owner</option>}
              </select>
              <button type="button" onClick={addMember}>
                Adicionar
              </button>
            </div>
          )}
          {memberships.length === 0 ? (
            <p>Nenhum membro carregado.</p>
          ) : (
            <ul>
              {memberships.map((membership) => (
                <li key={membership.id}>
                  <strong>{membership.user?.name ?? "Usuario"}</strong>
                  <small>
                    {membership.role} - {membership.status}
                  </small>
                  {(canManageOwners ||
                    (currentMembership?.role === "admin" && membership.role === "member")) && (
                    <div className="member-actions">
                      {canManageOwners && (
                        <>
                          <button
                            type="button"
                            onClick={() => updateMembership(membership.id, { role: "member" })}
                          >
                            member
                          </button>
                          <button
                            type="button"
                            onClick={() => updateMembership(membership.id, { role: "admin" })}
                          >
                            admin
                          </button>
                          <button
                            type="button"
                            onClick={() => updateMembership(membership.id, { role: "owner" })}
                          >
                            owner
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          updateMembership(membership.id, {
                            status: membership.status === "active" ? "inactive" : "active"
                          })
                        }
                      >
                        {membership.status === "active" ? "desativar" : "ativar"}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedOrganization && (
          <div className="panel dna-panel">
            <span>DNA Organizacional</span>
            {publishedDna ? (
              <div className="dna-summary">
                <strong>
                  Publicado v{publishedDna.versionNumber} - {publishedDna.status}
                </strong>
                <p>{publishedDna.mission || "Sem missao informada."}</p>
              </div>
            ) : (
              <p>Nenhuma versao publicada.</p>
            )}

            {canManageDna && !draftDna && (
              <button type="button" onClick={createDnaDraft}>
                Criar rascunho
              </button>
            )}

            {canManageDna && draftDna && (
              <div className="dna-editor">
                <strong>Rascunho</strong>
                <input
                  aria-label="Missao"
                  placeholder="Missao"
                  value={draftDna.mission}
                  onChange={(event) => updateDraftField("mission", event.target.value)}
                />
                <input
                  aria-label="Visao"
                  placeholder="Visao"
                  value={draftDna.vision}
                  onChange={(event) => updateDraftField("vision", event.target.value)}
                />
                <input
                  aria-label="Proposito"
                  placeholder="Proposito"
                  value={draftDna.purpose}
                  onChange={(event) => updateDraftField("purpose", event.target.value)}
                />
                <input
                  aria-label="Valor"
                  placeholder="Valor"
                  value={draftDna.values[0]?.name ?? ""}
                  onChange={(event) => updateFirstValue("name", event.target.value)}
                />
                <input
                  aria-label="Descricao do valor"
                  placeholder="Descricao do valor"
                  value={draftDna.values[0]?.description ?? ""}
                  onChange={(event) => updateFirstValue("description", event.target.value)}
                />
                <input
                  aria-label="Competencia"
                  placeholder="Competencia"
                  value={draftDna.competencies[0]?.name ?? ""}
                  onChange={(event) => updateFirstCompetency("name", event.target.value)}
                />
                <input
                  aria-label="Descricao da competencia"
                  placeholder="Descricao da competencia"
                  value={draftDna.competencies[0]?.description ?? ""}
                  onChange={(event) => updateFirstCompetency("description", event.target.value)}
                />
                <select
                  aria-label="Importancia"
                  value={draftDna.competencies[0]?.importance ?? "medium"}
                  onChange={(event) => updateFirstCompetency("importance", event.target.value)}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
                <input
                  aria-label="Cultura"
                  placeholder="Cultura"
                  value={draftDna.culture}
                  onChange={(event) => updateDraftField("culture", event.target.value)}
                />
                <input
                  aria-label="Lideranca"
                  placeholder="Lideranca"
                  value={draftDna.leadershipStyle}
                  onChange={(event) => updateDraftField("leadershipStyle", event.target.value)}
                />
                <input
                  aria-label="Ambiente"
                  placeholder="Ambiente"
                  value={draftDna.workEnvironment}
                  onChange={(event) => updateDraftField("workEnvironment", event.target.value)}
                />
                <div className="member-actions">
                  <button type="button" onClick={saveDnaDraft}>
                    Salvar
                  </button>
                  {canPublishDna && (
                    <button type="button" onClick={publishDnaDraft}>
                      Publicar
                    </button>
                  )}
                  <button type="button" onClick={discardDnaDraft}>
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {canManageDna && dnaHistory.length > 0 && (
              <ul>
                {dnaHistory.map((version) => (
                  <li key={version.id}>
                    <strong>{version.status}</strong>
                    <small>
                      v{version.versionNumber ?? "-"} {version.discardedAt ? "- descartado" : ""}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {selectedOrganization && (
          <div className="panel org-units-panel">
            <span>Estrutura Organizacional</span>
            <div className="unit-toolbar">
              {canManageUnits && (
                <>
                  <button type="button" onClick={() => resetUnitDraft("")}>
                    Nova raiz
                  </button>
                  <button
                    type="button"
                    onClick={() => resetUnitDraft(selectedUnitId)}
                    disabled={!selectedUnitId}
                  >
                    Nova filha
                  </button>
                </>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={showInactiveUnits}
                  onChange={(event) => setShowInactiveUnits(event.target.checked)}
                />
                Inativas
              </label>
            </div>

            <div className="org-units-layout">
              <div>{renderUnitNodes(unitTree)}</div>

              {canManageUnits ? (
                <div className="unit-editor">
                  <strong>{selectedUnitId ? "Editar unidade" : "Criar unidade"}</strong>
                  <input
                    aria-label="Codigo da unidade"
                    placeholder="Codigo"
                    value={unitDraft.code}
                    disabled={Boolean(selectedUnitId) && !canChangeUnitCode}
                    onChange={(event) => setUnitDraft({ ...unitDraft, code: event.target.value })}
                  />
                  <input
                    aria-label="Nome da unidade"
                    placeholder="Nome"
                    value={unitDraft.name}
                    onChange={(event) => setUnitDraft({ ...unitDraft, name: event.target.value })}
                  />
                  <select
                    aria-label="Tipo da unidade"
                    value={unitDraft.type}
                    onChange={(event) =>
                      setUnitDraft({
                        ...unitDraft,
                        type: event.target.value as OrganizationalUnit["type"]
                      })
                    }
                  >
                    <option value="board">board</option>
                    <option value="directorate">directorate</option>
                    <option value="department">department</option>
                    <option value="division">division</option>
                    <option value="branch">branch</option>
                    <option value="office">office</option>
                    <option value="team">team</option>
                    <option value="squad">squad</option>
                    <option value="unit">unit</option>
                    <option value="other">other</option>
                  </select>
                  <select
                    aria-label="Unidade pai"
                    value={unitDraft.parentId}
                    onChange={(event) =>
                      setUnitDraft({ ...unitDraft, parentId: event.target.value })
                    }
                  >
                    <option value="">Raiz</option>
                    {activeUnits
                      .filter((unit) => unit.id !== selectedUnitId)
                      .map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.code} - {unit.name}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label="Gestor"
                    placeholder="Gestor"
                    value={unitDraft.managerName}
                    onChange={(event) =>
                      setUnitDraft({ ...unitDraft, managerName: event.target.value })
                    }
                  />
                  <input
                    aria-label="Email do gestor"
                    placeholder="Email do gestor"
                    value={unitDraft.managerEmail}
                    onChange={(event) =>
                      setUnitDraft({ ...unitDraft, managerEmail: event.target.value })
                    }
                  />
                  <input
                    aria-label="Descricao da unidade"
                    placeholder="Descricao"
                    value={unitDraft.description}
                    onChange={(event) =>
                      setUnitDraft({ ...unitDraft, description: event.target.value })
                    }
                  />
                  <input
                    aria-label="Ordem"
                    type="number"
                    min="0"
                    value={unitDraft.displayOrder}
                    onChange={(event) =>
                      setUnitDraft({ ...unitDraft, displayOrder: Number(event.target.value) })
                    }
                  />
                  <div className="member-actions">
                    <button type="button" onClick={saveUnit}>
                      Salvar
                    </button>
                    <button type="button" onClick={moveUnit} disabled={!selectedUnitId}>
                      Mover
                    </button>
                    <button
                      type="button"
                      onClick={() => changeUnitStatus("inactivate")}
                      disabled={!selectedUnitId}
                    >
                      Inativar
                    </button>
                    <button
                      type="button"
                      onClick={() => changeUnitStatus("reactivate")}
                      disabled={!selectedUnitId}
                    >
                      Reativar
                    </button>
                  </div>
                </div>
              ) : (
                <p>Visualizacao limitada a unidades ativas.</p>
              )}
            </div>
          </div>
        )}

        {selectedOrganization && (
          <div className="panel job-profiles-panel">
            <span>Cargos</span>
            <div className="job-profile-layout">
              <div>
                {canManageJobs && (
                  <div className="job-profile-form">
                    <input
                      aria-label="Codigo do cargo"
                      placeholder="Codigo"
                      value={jobProfileDraft.code}
                      onChange={(event) =>
                        setJobProfileDraft({ ...jobProfileDraft, code: event.target.value })
                      }
                    />
                    <input
                      aria-label="Nome do cargo"
                      placeholder="Nome"
                      value={jobProfileDraft.name}
                      onChange={(event) =>
                        setJobProfileDraft({ ...jobProfileDraft, name: event.target.value })
                      }
                    />
                    <button type="button" onClick={createJobProfile}>
                      Criar cargo
                    </button>
                  </div>
                )}

                <ul className="competency-list">
                  {[...jobProfiles, ...inactiveJobProfiles].map((profile) => (
                    <li key={profile.id}>
                      <button
                        type="button"
                        className="unit-row"
                        onClick={() => {
                          setSelectedJobProfileId(profile.id);
                          loadSelectedJobProfile(profile.id);
                        }}
                      >
                        <strong>{profile.name}</strong>
                        <small>
                          {profile.code} - {profile.status}
                        </small>
                      </button>
                    </li>
                  ))}
                  {jobProfiles.length + inactiveJobProfiles.length === 0 && (
                    <li>Nenhum cargo cadastrado.</li>
                  )}
                </ul>
              </div>

              <div className="job-profile-editor">
                {publishedJobVersion ? (
                  <div className="dna-summary">
                    <strong>
                      Publicado v{publishedJobVersion.versionNumber ?? "-"} -{" "}
                      {publishedJobVersion.status}
                    </strong>
                    <p>{publishedJobVersion.summary || "Sem resumo informado."}</p>
                    {publishedJobVersion.salaryRange && (
                      <small>
                        {publishedJobVersion.salaryRange.currency}{" "}
                        {publishedJobVersion.salaryRange.min} -{" "}
                        {publishedJobVersion.salaryRange.max}
                      </small>
                    )}
                  </div>
                ) : (
                  <p>Nenhuma versao publicada.</p>
                )}

                {canManageJobs && selectedJobProfileId && !jobDraftVersion && (
                  <button type="button" onClick={createJobDraft}>
                    Criar rascunho
                  </button>
                )}

                {canManageJobs && jobDraftVersion && (
                  <div className="job-profile-form">
                    <strong>Rascunho</strong>
                    <input
                      aria-label="Titulo do cargo"
                      placeholder="Titulo"
                      value={jobDraftVersion.title}
                      onChange={(event) => updateJobDraftField("title", event.target.value)}
                    />
                    <textarea
                      aria-label="Missao do cargo"
                      placeholder="Missao"
                      value={jobDraftVersion.mission}
                      onChange={(event) => updateJobDraftField("mission", event.target.value)}
                    />
                    <textarea
                      aria-label="Resumo do cargo"
                      placeholder="Resumo"
                      value={jobDraftVersion.summary}
                      onChange={(event) => updateJobDraftField("summary", event.target.value)}
                    />
                    <input
                      aria-label="Responsabilidade principal"
                      placeholder="Responsabilidade principal"
                      value={jobDraftVersion.responsibilities[0]?.text ?? ""}
                      onChange={(event) =>
                        updateJobDraftField("responsibilities", [
                          { text: event.target.value, displayOrder: 0 }
                        ])
                      }
                    />
                    <select
                      aria-label="Modelo de trabalho"
                      value={jobDraftVersion.workModel}
                      onChange={(event) =>
                        updateJobDraftField(
                          "workModel",
                          event.target.value as JobProfileVersion["workModel"]
                        )
                      }
                    >
                      <option value="onsite">onsite</option>
                      <option value="hybrid">hybrid</option>
                      <option value="remote">remote</option>
                      <option value="flexible">flexible</option>
                    </select>
                    <div className="member-form">
                      <input
                        aria-label="Salario minimo"
                        type="number"
                        min="0"
                        placeholder="Min"
                        value={jobDraftVersion.salaryRange?.min ?? 0}
                        onChange={(event) =>
                          updateJobDraftField("salaryRange", {
                            min: Number(event.target.value),
                            max: jobDraftVersion.salaryRange?.max ?? 0,
                            currency: jobDraftVersion.salaryRange?.currency ?? "BRL",
                            periodicity: jobDraftVersion.salaryRange?.periodicity ?? "monthly"
                          })
                        }
                      />
                      <input
                        aria-label="Salario maximo"
                        type="number"
                        min="0"
                        placeholder="Max"
                        value={jobDraftVersion.salaryRange?.max ?? 0}
                        onChange={(event) =>
                          updateJobDraftField("salaryRange", {
                            min: jobDraftVersion.salaryRange?.min ?? 0,
                            max: Number(event.target.value),
                            currency: jobDraftVersion.salaryRange?.currency ?? "BRL",
                            periodicity: jobDraftVersion.salaryRange?.periodicity ?? "monthly"
                          })
                        }
                      />
                    </div>
                    <div className="member-actions">
                      <button type="button" onClick={saveJobDraft}>
                        Salvar
                      </button>
                      {canPublishJobs && (
                        <button type="button" onClick={publishJobDraft}>
                          Publicar
                        </button>
                      )}
                      <button type="button" onClick={discardJobDraft}>
                        Descartar
                      </button>
                    </div>
                  </div>
                )}

                {canManageJobs && jobProfileHistory.length > 0 && (
                  <ul className="competency-list">
                    {jobProfileHistory.map((version) => (
                      <li key={version.id}>
                        <strong>{version.status}</strong>
                        <small>
                          v{version.versionNumber ?? "-"}{" "}
                          {version.discardedAt ? "- descartado" : ""}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedOrganization && (
          <div className="panel job-profiles-panel">
            <span>Vagas</span>
            <div className="job-profile-layout">
              <div>
                {canManageJobOpenings && (
                  <div className="job-profile-form">
                    <input
                      aria-label="Codigo da vaga"
                      placeholder="Codigo"
                      value={jobOpeningDraft.code}
                      onChange={(event) =>
                        setJobOpeningDraft({ ...jobOpeningDraft, code: event.target.value })
                      }
                    />
                    <input
                      aria-label="Titulo interno da vaga"
                      placeholder="Titulo interno"
                      value={jobOpeningDraft.title}
                      onChange={(event) =>
                        setJobOpeningDraft({ ...jobOpeningDraft, title: event.target.value })
                      }
                    />
                    <input
                      aria-label="Titulo publico da vaga"
                      placeholder="Titulo publico"
                      value={jobOpeningDraft.publicTitle}
                      onChange={(event) =>
                        setJobOpeningDraft({ ...jobOpeningDraft, publicTitle: event.target.value })
                      }
                    />
                    <input
                      aria-label="Quantidade de posicoes"
                      type="number"
                      min="1"
                      max="1000"
                      value={jobOpeningDraft.positionsCount}
                      onChange={(event) =>
                        setJobOpeningDraft({
                          ...jobOpeningDraft,
                          positionsCount: Number(event.target.value)
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={createJobOpening}
                      disabled={!publishedJobVersion}
                    >
                      Criar vaga
                    </button>
                  </div>
                )}

                <ul className="competency-list">
                  {jobOpenings.map((opening) => (
                    <li key={opening.id}>
                      <strong>{opening.title}</strong>
                      <small>
                        {opening.code} - {opening.status} -{" "}
                        {opening.isPubliclyAvailable ? "publica" : "restrita"}
                      </small>
                      {opening.publishedVersion && (
                        <small>
                          {opening.publishedVersion.publicTitle} -{" "}
                          {opening.publishedVersion.positionsCount} posicao(oes)
                        </small>
                      )}
                      <div className="member-actions">
                        {canPublishJobOpenings && opening.status === "draft" && (
                          <button type="button" onClick={() => publishAndOpenJobOpening(opening)}>
                            Publicar e abrir
                          </button>
                        )}
                        {canManageJobOpenings && opening.status === "open" && (
                          <button type="button" onClick={() => publishJobOpeningPublicly(opening)}>
                            Divulgar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                  {jobOpenings.length === 0 && <li>Nenhuma vaga cadastrada.</li>}
                </ul>
              </div>

              <div className="job-profile-form">
                <strong>Divulgacao publica</strong>
                <input
                  aria-label="Slug publico"
                  placeholder="slug-publico"
                  value={jobOpeningDraft.publicSlug}
                  onChange={(event) =>
                    setJobOpeningDraft({ ...jobOpeningDraft, publicSlug: event.target.value })
                  }
                />
                <input
                  aria-label="Prazo de candidatura"
                  type="datetime-local"
                  value={jobOpeningDraft.applicationDeadline}
                  onChange={(event) =>
                    setJobOpeningDraft({
                      ...jobOpeningDraft,
                      applicationDeadline: event.target.value
                    })
                  }
                />
                <label>
                  <input
                    type="checkbox"
                    checked={jobOpeningDraft.showSalary}
                    onChange={(event) =>
                      setJobOpeningDraft({
                        ...jobOpeningDraft,
                        showSalary: event.target.checked
                      })
                    }
                  />
                  Exibir faixa salarial publicamente
                </label>
              </div>
            </div>
          </div>
        )}

        {selectedOrganization && (
          <div className="panel job-profiles-panel">
            <span>Candidatos</span>
            <div className="job-profile-layout">
              <div>
                {canManageCandidates && (
                  <div className="job-profile-form">
                    <input
                      aria-label="Nome do candidato"
                      placeholder="Nome completo"
                      value={candidateDraft.fullName}
                      onChange={(event) =>
                        setCandidateDraft({ ...candidateDraft, fullName: event.target.value })
                      }
                    />
                    <input
                      aria-label="Nome preferido do candidato"
                      placeholder="Nome preferido"
                      value={candidateDraft.preferredName}
                      onChange={(event) =>
                        setCandidateDraft({ ...candidateDraft, preferredName: event.target.value })
                      }
                    />
                    <input
                      aria-label="Email do candidato"
                      placeholder="email@exemplo.com"
                      value={candidateDraft.email}
                      onChange={(event) =>
                        setCandidateDraft({ ...candidateDraft, email: event.target.value })
                      }
                    />
                    <select
                      aria-label="Origem do candidato"
                      value={candidateDraft.source}
                      onChange={(event) =>
                        setCandidateDraft({ ...candidateDraft, source: event.target.value })
                      }
                    >
                      {[
                        "career_page",
                        "referral",
                        "recruiter",
                        "agency",
                        "linkedin",
                        "job_board",
                        "event",
                        "import",
                        "manual",
                        "other"
                      ].map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Cidade do candidato"
                      placeholder="Cidade"
                      value={candidateDraft.city}
                      onChange={(event) =>
                        setCandidateDraft({ ...candidateDraft, city: event.target.value })
                      }
                    />
                    <input
                      aria-label="Estado do candidato"
                      placeholder="Estado"
                      value={candidateDraft.state}
                      onChange={(event) =>
                        setCandidateDraft({ ...candidateDraft, state: event.target.value })
                      }
                    />
                    <textarea
                      aria-label="Resumo profissional do candidato"
                      placeholder="Resumo profissional"
                      value={candidateDraft.professionalSummary}
                      onChange={(event) =>
                        setCandidateDraft({
                          ...candidateDraft,
                          professionalSummary: event.target.value
                        })
                      }
                    />
                    <button type="button" onClick={createCandidate}>
                      Criar candidato
                    </button>
                  </div>
                )}

                <ul className="competency-list">
                  {candidates.map((candidate) => (
                    <li key={candidate.id}>
                      <strong>{candidate.fullName}</strong>
                      <small>
                        {candidate.preferredName ? `${candidate.preferredName} - ` : ""}
                        {candidate.status} - {candidate.source}
                      </small>
                      <small>
                        {candidate.location?.city ?? candidate.city}{" "}
                        {candidate.location?.state ?? candidate.state}
                      </small>
                      {candidate.professionalSummary && <p>{candidate.professionalSummary}</p>}
                      <small>
                        {candidate.experiences.length} experiencia(s), {candidate.education.length}{" "}
                        escolaridade(s), {candidate.languages.length} idioma(s)
                      </small>
                      {canManageCandidates && candidate.status === "active" && (
                        <button
                          type="button"
                          onClick={() => changeCandidateStatus(candidate, "inactivate")}
                        >
                          Inativar
                        </button>
                      )}
                    </li>
                  ))}
                  {candidates.length === 0 && <li>Nenhum candidato ativo.</li>}
                </ul>
              </div>

              {canManageCandidates && (
                <div>
                  <strong>Inativos</strong>
                  <ul className="competency-list">
                    {inactiveCandidates.map((candidate) => (
                      <li key={candidate.id}>
                        <strong>{candidate.fullName}</strong>
                        <small>{candidate.source}</small>
                        <button
                          type="button"
                          onClick={() => changeCandidateStatus(candidate, "reactivate")}
                        >
                          Reativar
                        </button>
                      </li>
                    ))}
                    {inactiveCandidates.length === 0 && <li>Nenhum candidato inativo.</li>}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedOrganization && (
          <div className="panel job-profiles-panel">
            <span>Processo Seletivo</span>
            <div className="job-profile-layout">
              <div>
                {canManageApplications && (
                  <div className="job-profile-form">
                    <select
                      aria-label="Candidato da candidatura"
                      value={candidateApplicationDraft.candidateId}
                      onChange={(event) =>
                        setCandidateApplicationDraft({
                          ...candidateApplicationDraft,
                          candidateId: event.target.value
                        })
                      }
                    >
                      <option value="">Candidato ativo</option>
                      {candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.fullName}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Vaga da candidatura"
                      value={candidateApplicationDraft.jobOpeningId}
                      onChange={(event) => {
                        const opening = jobOpenings.find(
                          (candidate) => candidate.id === event.target.value
                        );
                        setCandidateApplicationDraft({
                          ...candidateApplicationDraft,
                          jobOpeningId: event.target.value,
                          jobOpeningVersionId: opening?.publishedVersion?.id ?? ""
                        });
                      }}
                    >
                      <option value="">Vaga aberta</option>
                      {jobOpenings
                        .filter((opening) => opening.status === "open" && opening.publishedVersion)
                        .map((opening) => (
                          <option key={opening.id} value={opening.id}>
                            {opening.title}
                          </option>
                        ))}
                    </select>
                    <select
                      aria-label="Origem da candidatura"
                      value={candidateApplicationDraft.source}
                      onChange={(event) =>
                        setCandidateApplicationDraft({
                          ...candidateApplicationDraft,
                          source: event.target.value
                        })
                      }
                    >
                      {["career_page", "referral", "recruiter", "import", "manual", "other"].map(
                        (source) => (
                          <option key={source} value={source}>
                            {source}
                          </option>
                        )
                      )}
                    </select>
                    <button type="button" onClick={createCandidateApplication}>
                      Criar candidatura
                    </button>
                  </div>
                )}

                <ul className="competency-list">
                  {candidateApplications.map((application) => {
                    const status = applicationStatusOf(application);
                    const currentStage = applicationStageOf(application);
                    const opening = jobOpenings.find(
                      (entry) => entry.id === application.jobOpeningId
                    );
                    const stageIndex = applicationStages.indexOf(currentStage);
                    return (
                      <li key={application.id}>
                        <strong>{applicationCandidateName(application)}</strong>
                        <small>
                          {opening?.title ??
                            application.job_opening?.title ??
                            application.jobOpeningId ??
                            "vaga"}{" "}
                          - {status} - {currentStage}
                        </small>
                        <small>
                          {application.source ?? "origem restrita"} -{" "}
                          {applicationAppliedAtOf(application)
                            ? new Date(applicationAppliedAtOf(application)).toLocaleString()
                            : "data restrita"}
                        </small>
                        {canManageApplications && status === "active" && (
                          <div className="member-actions">
                            {stageIndex > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  moveCandidateApplication(
                                    application,
                                    applicationStages[stageIndex - 1]
                                  )
                                }
                              >
                                Voltar etapa
                              </button>
                            )}
                            {stageIndex < applicationStages.length - 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  moveCandidateApplication(
                                    application,
                                    applicationStages[stageIndex + 1]
                                  )
                                }
                              >
                                Avancar etapa
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => addCandidateApplicationNote(application)}
                            >
                              Adicionar nota
                            </button>
                          </div>
                        )}
                        {canManageApplications && status === "active" && (
                          <div className="member-actions">
                            <button
                              type="button"
                              onClick={() => finalizeCandidateApplication(application, "withdraw")}
                            >
                              Retirar
                            </button>
                            <button
                              type="button"
                              onClick={() => finalizeCandidateApplication(application, "reject")}
                            >
                              Rejeitar
                            </button>
                            <button
                              type="button"
                              onClick={() => finalizeCandidateApplication(application, "cancel")}
                            >
                              Cancelar
                            </button>
                            {canHireApplications && (
                              <button
                                type="button"
                                onClick={() => finalizeCandidateApplication(application, "hire")}
                              >
                                Contratar
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {candidateApplications.length === 0 && <li>Nenhuma candidatura cadastrada.</li>}
                </ul>
              </div>

              {canManageApplications && (
                <div className="job-profile-form">
                  <strong>Operacoes</strong>
                  <textarea
                    aria-label="Nota da candidatura"
                    placeholder="Nota interna da candidatura"
                    value={candidateApplicationDraft.note}
                    onChange={(event) =>
                      setCandidateApplicationDraft({
                        ...candidateApplicationDraft,
                        note: event.target.value
                      })
                    }
                  />
                  <textarea
                    aria-label="Motivo de finalizacao"
                    placeholder="Motivo de finalizacao"
                    value={candidateApplicationDraft.finalizationReason}
                    onChange={(event) =>
                      setCandidateApplicationDraft({
                        ...candidateApplicationDraft,
                        finalizationReason: event.target.value
                      })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {selectedOrganization && (
          <div className="panel job-profiles-panel">
            <span>Entrevistas</span>
            <div className="job-profile-layout">
              <div>
                {canManageInterviews && (
                  <div className="job-profile-form">
                    <select
                      aria-label="Candidatura da entrevista"
                      value={interviewDraft.candidateApplicationId}
                      onChange={(event) =>
                        setInterviewDraft({
                          ...interviewDraft,
                          candidateApplicationId: event.target.value
                        })
                      }
                    >
                      <option value="">Candidatura ativa</option>
                      {candidateApplications
                        .filter((application) => applicationStatusOf(application) === "active")
                        .map((application) => (
                          <option key={application.id} value={application.id}>
                            {applicationCandidateName(application)}
                          </option>
                        ))}
                    </select>
                    <input
                      aria-label="Titulo da entrevista"
                      placeholder="Titulo"
                      value={interviewDraft.title}
                      onChange={(event) =>
                        setInterviewDraft({ ...interviewDraft, title: event.target.value })
                      }
                    />
                    <select
                      aria-label="Tipo da entrevista"
                      value={interviewDraft.type}
                      onChange={(event) =>
                        setInterviewDraft({
                          ...interviewDraft,
                          type: event.target.value as InterviewType
                        })
                      }
                    >
                      {[
                        "screening",
                        "behavioral",
                        "technical",
                        "cultural",
                        "leadership",
                        "management",
                        "panel",
                        "final",
                        "other"
                      ].map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={createInterview}>
                      Criar entrevista
                    </button>
                  </div>
                )}

                <ul className="competency-list">
                  {interviews.map((interview) => {
                    const application = candidateApplications.find(
                      (candidate) => candidate.id === interviewApplicationId(interview)
                    );
                    return (
                      <li key={interview.id}>
                        <strong>{interview.title}</strong>
                        <small>
                          {application ? applicationCandidateName(application) : interview.id} -{" "}
                          {interview.type} - {interview.status}
                        </small>
                        <small>
                          {interviewScheduledStart(interview)
                            ? `${new Date(interviewScheduledStart(interview)).toLocaleString()} ate ${new Date(
                                interviewScheduledEnd(interview)
                              ).toLocaleString()}`
                            : "sem agenda"}
                        </small>
                        {canManageInterviews && (
                          <div className="member-actions">
                            {interview.status === "draft" && (
                              <button type="button" onClick={() => scheduleInterview(interview)}>
                                Agendar
                              </button>
                            )}
                            {interview.status === "scheduled" && (
                              <button
                                type="button"
                                onClick={() => changeInterviewStatus(interview, "start")}
                              >
                                Iniciar
                              </button>
                            )}
                            {["draft", "scheduled", "in_progress"].includes(interview.status) && (
                              <button
                                type="button"
                                onClick={() => changeInterviewStatus(interview, "cancel")}
                              >
                                Cancelar
                              </button>
                            )}
                            {interview.status === "scheduled" && (
                              <button
                                type="button"
                                onClick={() => changeInterviewStatus(interview, "no-show")}
                              >
                                No-show
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {interviews.length === 0 && <li>Nenhuma entrevista cadastrada.</li>}
                </ul>
              </div>

              {canManageInterviews && (
                <div className="job-profile-form">
                  <strong>Agenda</strong>
                  <input
                    aria-label="Inicio da entrevista"
                    type="datetime-local"
                    value={interviewDraft.scheduledStartAt}
                    onChange={(event) =>
                      setInterviewDraft({
                        ...interviewDraft,
                        scheduledStartAt: event.target.value
                      })
                    }
                  />
                  <input
                    aria-label="Fim da entrevista"
                    type="datetime-local"
                    value={interviewDraft.scheduledEndAt}
                    onChange={(event) =>
                      setInterviewDraft({
                        ...interviewDraft,
                        scheduledEndAt: event.target.value
                      })
                    }
                  />
                  <input
                    aria-label="Fuso da entrevista"
                    placeholder="Timezone"
                    value={interviewDraft.timezone}
                    onChange={(event) =>
                      setInterviewDraft({ ...interviewDraft, timezone: event.target.value })
                    }
                  />
                  <select
                    aria-label="Local da entrevista"
                    value={interviewDraft.locationType}
                    onChange={(event) =>
                      setInterviewDraft({
                        ...interviewDraft,
                        locationType: event.target.value as InterviewLocationType
                      })
                    }
                  >
                    {["onsite", "video", "phone", "other"].map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Detalhes do local"
                    placeholder="Detalhes do local"
                    value={interviewDraft.locationDetails}
                    onChange={(event) =>
                      setInterviewDraft({
                        ...interviewDraft,
                        locationDetails: event.target.value
                      })
                    }
                  />
                  <textarea
                    aria-label="Motivo da entrevista"
                    placeholder="Motivo para cancelamento ou no-show"
                    value={interviewDraft.reason}
                    onChange={(event) =>
                      setInterviewDraft({ ...interviewDraft, reason: event.target.value })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {selectedOrganization && (
          <div className="panel competencies-panel">
            <span>Catalogo de Competencias</span>
            <div className="unit-toolbar">
              <button type="button" onClick={() => setCompetencyTab("catalog")}>
                Catalogo Utilizado
              </button>
              <button type="button" onClick={() => setCompetencyTab("organization")}>
                Competencias da Empresa
              </button>
              <button type="button" onClick={() => setCompetencyTab("global")}>
                Biblioteca Global
              </button>
            </div>

            {competencyTab === "catalog" && (
              <ul className="competency-list">
                {catalogItems.map((item) => (
                  <li key={item.competencyCatalogItemId}>
                    <strong>{item.name}</strong>
                    <small>
                      {item.code} - {item.category} - {item.origin}
                      {item.deprecated ? " - deprecated" : ""}
                    </small>
                    <code>{item.competencyCatalogItemId}</code>
                  </li>
                ))}
                {catalogItems.length === 0 && <li>Nenhuma competencia disponivel.</li>}
              </ul>
            )}

            {competencyTab === "organization" && (
              <div className="competency-layout">
                {canManageCompetencies ? (
                  <div className="competency-form">
                    <input
                      aria-label="Codigo da competencia"
                      placeholder="Codigo"
                      value={organizationCompetencyDraft.code}
                      onChange={(event) =>
                        setOrganizationCompetencyDraft({
                          ...organizationCompetencyDraft,
                          code: event.target.value
                        })
                      }
                    />
                    <input
                      aria-label="Nome da competencia"
                      placeholder="Nome"
                      value={organizationCompetencyDraft.name}
                      onChange={(event) =>
                        setOrganizationCompetencyDraft({
                          ...organizationCompetencyDraft,
                          name: event.target.value
                        })
                      }
                    />
                    <select
                      aria-label="Categoria da competencia"
                      value={organizationCompetencyDraft.category}
                      onChange={(event) =>
                        setOrganizationCompetencyDraft({
                          ...organizationCompetencyDraft,
                          category: event.target.value as CompetencyCategory
                        })
                      }
                    >
                      {competencyCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <textarea
                      aria-label="Definicao da competencia"
                      placeholder="Definicao"
                      value={organizationCompetencyDraft.definition}
                      onChange={(event) =>
                        setOrganizationCompetencyDraft({
                          ...organizationCompetencyDraft,
                          definition: event.target.value
                        })
                      }
                    />
                    <button type="button" onClick={createOrganizationCompetency}>
                      Criar competencia
                    </button>
                  </div>
                ) : (
                  <p>Visualizacao limitada ao catalogo utilizado.</p>
                )}

                <ul className="competency-list">
                  {organizationCompetencies.map((competency) => (
                    <li key={competency.id}>
                      <strong>{competency.name}</strong>
                      <small>
                        {competency.code} - {competency.category} - {competency.status}
                      </small>
                      {canManageCompetencies && (
                        <button
                          type="button"
                          onClick={() =>
                            changeOrganizationCompetencyStatus(
                              competency.id,
                              competency.status === "active" ? "inactivate" : "activate"
                            )
                          }
                        >
                          {competency.status === "active" ? "Inativar" : "Ativar"}
                        </button>
                      )}
                    </li>
                  ))}
                  {organizationCompetencies.length === 0 && <li>Nenhuma competencia propria.</li>}
                </ul>
              </div>
            )}

            {competencyTab === "global" && (
              <div className="competency-layout">
                <div className="competency-form">
                  <input
                    aria-label="Codigo global"
                    placeholder="Codigo global"
                    value={globalCompetencyDraft.code}
                    onChange={(event) =>
                      setGlobalCompetencyDraft({
                        ...globalCompetencyDraft,
                        code: event.target.value
                      })
                    }
                  />
                  <input
                    aria-label="Nome global"
                    placeholder="Nome global"
                    value={globalCompetencyDraft.name}
                    onChange={(event) =>
                      setGlobalCompetencyDraft({
                        ...globalCompetencyDraft,
                        name: event.target.value
                      })
                    }
                  />
                  <select
                    aria-label="Categoria global"
                    value={globalCompetencyDraft.category}
                    onChange={(event) =>
                      setGlobalCompetencyDraft({
                        ...globalCompetencyDraft,
                        category: event.target.value as CompetencyCategory
                      })
                    }
                  >
                    {competencyCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <textarea
                    aria-label="Definicao global"
                    placeholder="Definicao"
                    value={globalCompetencyDraft.definition}
                    onChange={(event) =>
                      setGlobalCompetencyDraft({
                        ...globalCompetencyDraft,
                        definition: event.target.value
                      })
                    }
                  />
                  <button type="button" onClick={createGlobalCompetency}>
                    Criar global
                  </button>
                </div>

                <ul className="competency-list">
                  {globalCompetencies.map((competency) => (
                    <li key={competency.id}>
                      <strong>{competency.name}</strong>
                      <small>
                        {competency.code} - {competency.category} - {competency.status}
                      </small>
                    </li>
                  ))}
                  {globalCompetencies.length === 0 && <li>Nenhuma global carregada.</li>}
                </ul>

                {canManageCompetencies && (
                  <ul className="competency-list">
                    {availableGlobalCompetencies.map((competency) => (
                      <li key={competency.id}>
                        <strong>{competency.name}</strong>
                        <small>
                          {competency.code} - {competency.category}
                        </small>
                        <button type="button" onClick={() => adoptGlobalCompetency(competency.id)}>
                          Adotar
                        </button>
                      </li>
                    ))}
                    {availableGlobalCompetencies.length === 0 && (
                      <li>Nenhuma global disponivel para adocao.</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {selectedOrganization && (
          <div className="panel competencies-panel">
            <span>Banco de Perguntas</span>
            <div className="unit-toolbar">
              <button type="button" onClick={() => setQuestionTab("catalog")}>
                Catalogo Utilizado
              </button>
              {canManageQuestions && (
                <>
                  <button type="button" onClick={() => setQuestionTab("organization")}>
                    Perguntas da Empresa
                  </button>
                  <button type="button" onClick={() => setQuestionTab("global")}>
                    Biblioteca Global
                  </button>
                </>
              )}
            </div>

            {questionTab === "catalog" && (
              <ul className="competency-list">
                {questionCatalogItems.map((item) => (
                  <li key={item.questionCatalogItemId}>
                    <strong>{item.title}</strong>
                    <small>
                      {item.code} - {item.type} - {item.category} - {item.origin}
                      {item.deprecated ? " - deprecated" : ""}
                    </small>
                    <code>{item.questionCatalogItemId}</code>
                  </li>
                ))}
                {questionCatalogItems.length === 0 && <li>Nenhuma pergunta disponivel.</li>}
              </ul>
            )}

            {questionTab === "organization" && (
              <div className="competency-layout">
                {canManageQuestions ? (
                  <div className="competency-form">
                    <input
                      aria-label="Codigo da pergunta"
                      placeholder="Codigo"
                      value={organizationQuestionDraft.code}
                      onChange={(event) =>
                        setOrganizationQuestionDraft({
                          ...organizationQuestionDraft,
                          code: event.target.value
                        })
                      }
                    />
                    <input
                      aria-label="Titulo da pergunta"
                      placeholder="Titulo"
                      value={organizationQuestionDraft.title}
                      onChange={(event) =>
                        setOrganizationQuestionDraft({
                          ...organizationQuestionDraft,
                          title: event.target.value
                        })
                      }
                    />
                    <textarea
                      aria-label="Texto da pergunta"
                      placeholder="Texto da pergunta"
                      value={organizationQuestionDraft.questionText}
                      onChange={(event) =>
                        setOrganizationQuestionDraft({
                          ...organizationQuestionDraft,
                          questionText: event.target.value
                        })
                      }
                    />
                    <select
                      aria-label="Tipo da pergunta"
                      value={organizationQuestionDraft.type}
                      onChange={(event) =>
                        setOrganizationQuestionDraft({
                          ...organizationQuestionDraft,
                          type: event.target.value as QuestionType
                        })
                      }
                    >
                      {questionTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Categoria da pergunta"
                      value={organizationQuestionDraft.category}
                      onChange={(event) =>
                        setOrganizationQuestionDraft({
                          ...organizationQuestionDraft,
                          category: event.target.value as QuestionCategory
                        })
                      }
                    >
                      {questionCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Competencia associada"
                      value={organizationQuestionDraft.competencyCatalogItemId}
                      onChange={(event) =>
                        setOrganizationQuestionDraft({
                          ...organizationQuestionDraft,
                          competencyCatalogItemId: event.target.value
                        })
                      }
                    >
                      <option value="">Sem competencia</option>
                      {catalogItems.map((item) => (
                        <option
                          key={item.competencyCatalogItemId}
                          value={item.competencyCatalogItemId}
                        >
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={createOrganizationQuestion}>
                      Criar pergunta
                    </button>
                  </div>
                ) : (
                  <p>Visualizacao limitada ao catalogo utilizado.</p>
                )}

                <ul className="competency-list">
                  {organizationQuestions.map((question) => (
                    <li key={question.id}>
                      <strong>{question.title}</strong>
                      <small>
                        {question.code} - {question.type} - {question.category} - {question.status}
                      </small>
                      {canManageQuestions && (
                        <button
                          type="button"
                          onClick={() =>
                            changeOrganizationQuestionStatus(
                              question.id,
                              question.status === "active" ? "inactivate" : "activate"
                            )
                          }
                        >
                          {question.status === "active" ? "Inativar" : "Ativar"}
                        </button>
                      )}
                    </li>
                  ))}
                  {organizationQuestions.length === 0 && <li>Nenhuma pergunta propria.</li>}
                </ul>
              </div>
            )}

            {questionTab === "global" && (
              <div className="competency-layout">
                <ul className="competency-list">
                  {globalQuestions.map((question) => (
                    <li key={question.id}>
                      <strong>{question.title}</strong>
                      <small>
                        {question.code} - {question.type} - {question.category} - {question.status}
                      </small>
                    </li>
                  ))}
                  {globalQuestions.length === 0 && <li>Nenhuma pergunta global carregada.</li>}
                </ul>

                {canManageQuestions && (
                  <ul className="competency-list">
                    {availableGlobalQuestions.map((question) => (
                      <li key={question.id}>
                        <strong>{question.title}</strong>
                        <small>
                          {question.code} - {question.type} - {question.category}
                        </small>
                        <button type="button" onClick={() => adoptGlobalQuestion(question.id)}>
                          Adotar
                        </button>
                      </li>
                    ))}
                    {availableGlobalQuestions.length === 0 && (
                      <li>Nenhuma pergunta global disponivel para adocao.</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
