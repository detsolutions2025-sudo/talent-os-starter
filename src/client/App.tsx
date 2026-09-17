import { useEffect, useState } from "react";
import { BlueprintPanel } from "./features/blueprint/BlueprintPanel";
import { PreInterviewPanel } from "./PreInterviewPanel";
import { BehavioralInstrumentPanel } from "./BehavioralInstrumentPanel";
import { BehavioralAssessmentPanel } from "./BehavioralAssessmentPanel";
import { PreAnalysisPanel } from "./PreAnalysisPanel";
import { CandidateDossierPanel } from "./CandidateDossierPanel";
import { OnboardingPanel } from "./OnboardingPanel";
import { EmploymentPanel } from "./EmploymentPanel";
import { DevelopmentRetentionPanel } from "./DevelopmentRetentionPanel";
import { OffboardingPanel } from "./OffboardingPanel";
import { AccessGrantPanel } from "./AccessGrantPanel";
import { InvitationPanel } from "./InvitationPanel";
import { ProposalPanel } from "./ProposalPanel";
import { AppShell } from "./components/layout/AppShell";
import { Sidebar } from "./components/navigation/Sidebar";
import { Topbar } from "./components/navigation/Topbar";
import { NAV_GROUPS } from "./components/navigation/nav-config";
import { Home } from "./components/dashboard/Home";
import { Alert } from "./components/ui/Alert";
import { PageHeader } from "./components/ui/PageHeader";
import { JobsPanel } from "./features/jobs/JobsPanel";
import { CandidatesPanel } from "./features/candidates/CandidatesPanel";
import { SelectionPanel } from "./features/selection/SelectionPanel";
import { InterviewsPanel } from "./features/interviews/InterviewsPanel";
import { DnaPanel } from "./features/organizational-dna/DnaPanel";
import { OrganizationStructurePanel } from "./features/organization-structure/OrganizationStructurePanel";
import { CompetenciesPanel } from "./features/competencies/CompetenciesPanel";
import { JobProfilesPanel } from "./features/job-profiles/JobProfilesPanel";
import { QuestionBankPanel } from "./features/question-bank/QuestionBankPanel";
import "./styles/tokens.css";
import "./styles/primitives.css";
import "./styles/shell.css";
import "./styles/dashboard.css";
import "./styles/features.css";
import "./styles.css";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "archived";
};

export type Membership = {
  id: string;
  userId: string;
  role: "owner" | "admin" | "member";
  status: "active" | "inactive";
  user: {
    name: string;
    email: string;
  } | null;
};

export type DnaValue = {
  name: string;
  description: string;
  practicalMeaning: string;
  expectedBehaviors: string[];
  incompatibleBehaviors: string[];
};

export type DnaCompetency = {
  name: string;
  description: string;
  importance: "low" | "medium" | "high" | "critical";
  examples: string[];
};

export type DnaVersion = {
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

export type OrganizationalUnit = {
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

export type OrganizationalUnitDraft = {
  code: string;
  name: string;
  type: OrganizationalUnit["type"];
  parentId: string;
  managerName: string;
  managerEmail: string;
  description: string;
  displayOrder: number;
};

export type CompetencyCategory =
  | "technical"
  | "behavioral"
  | "leadership"
  | "management"
  | "tools"
  | "languages"
  | "compliance"
  | "safety"
  | "other";

export type GlobalCompetency = {
  id: string;
  code: string;
  name: string;
  category: CompetencyCategory;
  definition: string;
  status: "active" | "inactive" | "deprecated";
};

export type OrganizationCompetency = {
  id: string;
  code: string;
  name: string;
  category: CompetencyCategory;
  definition: string;
  status: "active" | "inactive";
};

export type UnifiedCatalogItem = {
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

export type QuestionCategory =
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

export type QuestionType =
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

export type GlobalQuestion = {
  id: string;
  code: string;
  title: string;
  questionText: string;
  type: QuestionType;
  category: QuestionCategory;
  status: "active" | "inactive" | "deprecated";
};

export type OrganizationQuestion = {
  id: string;
  code: string;
  title: string;
  questionText: string;
  type: QuestionType;
  category: QuestionCategory;
  competencyCatalogItemId: string | null;
  status: "active" | "inactive";
};

export type UnifiedQuestionCatalogItem = {
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

export type QuestionDraft = {
  code: string;
  title: string;
  questionText: string;
  type: QuestionType;
  category: QuestionCategory;
  competencyCatalogItemId: string;
};

export type CompetencyDraft = {
  code: string;
  name: string;
  category: CompetencyCategory;
  definition: string;
};

export type JobProfile = {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
};

export type JobProfileDraft = {
  code: string;
  name: string;
};

export type JobProfileVersion = {
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

export type JobOpening = {
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

export type JobOpeningDraft = {
  code: string;
  title: string;
  publicTitle: string;
  positionsCount: number;
  publicSlug: string;
  applicationDeadline: string;
  showSalary: boolean;
};

export type Candidate = {
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

export type CandidateDraft = {
  fullName: string;
  preferredName: string;
  email: string;
  source: string;
  city: string;
  state: string;
  professionalSummary: string;
};

export type CandidateApplicationStatus =
  "active" | "withdrawn" | "rejected" | "hired" | "cancelled";
export type CandidateApplicationStage =
  "applied" | "screening" | "interview" | "assessment" | "offer" | "completed";

export type CandidateApplication = {
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

export type CandidateApplicationNote = {
  id: string;
  content: string;
  createdByUserId: string;
  createdAt: string;
};

export type CandidateApplicationDraft = {
  candidateId: string;
  jobOpeningId: string;
  jobOpeningVersionId: string;
  source: string;
  note: string;
  finalizationReason: string;
};

export type InterviewStatus =
  "draft" | "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
export type InterviewType =
  | "screening"
  | "behavioral"
  | "technical"
  | "cultural"
  | "leadership"
  | "management"
  | "panel"
  | "final"
  | "other";
export type InterviewLocationType = "onsite" | "video" | "phone" | "other";

export type Interview = {
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

export type InterviewDraft = {
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

// applicationStatusOf/applicationStageOf/applicationCandidateName/interviewScheduledStart etc.
// foram extraidos para src/client/features/{selection,interviews}/*-helpers.ts (Wave 1 da
// migracao visual) -- usados apenas pelos paineis de Processo Seletivo e Entrevistas.
//
// competencyCategories/questionCategories/questionTypes foram extraidos para
// src/client/features/{competencies,question-bank}/*Panel.tsx (Wave 2) -- usados apenas la.

// Fase 29 (ADR-0026 "Dev/test auth"; SPEC-028 s22/CA-029/CA-030). Fora de `import.meta.env.DEV`
// (build de producao), estes dois objetos ficam vazios -- nenhuma das ~150 chamadas `fetch()`
// que os referenciam precisa mudar: elas simplesmente deixam de enviar qualquer header de
// desenvolvimento, e a sessao real passa a vir do cookie HttpOnly (enviado automaticamente via
// `credentials: "include"`, instalado globalmente em `apiClient.ts`). Isso e apenas defesa em
// profundidade do lado do cliente -- a garantia real e no servidor, que nunca le esses headers
// fora de `development`/`test` (`dev-auth.ts`, inalterado).
const platformHeaders: Record<string, string> = import.meta.env.DEV
  ? { "x-dev-platform-admin": "true" }
  : {};

const currentDevUserId = import.meta.env.VITE_DEV_USER_ID ?? "usr_000001";
const devHeaders: Record<string, string> = import.meta.env.DEV
  ? { "x-dev-user-id": currentDevUserId }
  : {};

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
  const [activeSection, setActiveSection] = useState<"overview" | "workspace">("overview");
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);

  function navigateToAnchor(anchorId: string) {
    setActiveSection("workspace");
    setActiveAnchorId(anchorId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element = document.getElementById(anchorId);
        if (element && typeof element.scrollIntoView === "function") {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

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

  // renderUnitNodes foi substituido pelo componente recursivo
  // src/client/features/organization-structure/UnitTree.tsx (Wave 2).

  return (
    <AppShell
      sidebar={
        <Sidebar
          groups={NAV_GROUPS}
          activeSection={activeSection}
          activeAnchorId={activeAnchorId}
          onSelectOverview={() => setActiveSection("overview")}
          onSelectAnchor={navigateToAnchor}
        />
      }
      topbar={
        <Topbar
          title={activeSection === "overview" ? "Visão Geral" : "Espaço de Trabalho"}
          organizations={organizations}
          selectedOrganizationId={selectedOrganizationId}
          onSelectOrganization={selectOrganization}
          currentUserId={currentDevUserId}
          currentRole={currentMembership?.role}
        />
      }
    >
      <Alert tone="info">{message}</Alert>

      {activeSection === "overview" ? (
        <Home
          organization={selectedOrganization}
          organizationsCount={organizations.length}
          stats={{
            membershipsCount: memberships.length,
            jobOpeningsCount: jobOpenings.length,
            candidatesCount: candidates.length,
            applicationsCount: candidateApplications.length,
            interviewsCount: interviews.length
          }}
          dnaStatus={{
            published: Boolean(publishedDna),
            versionNumber: publishedDna?.versionNumber ?? undefined
          }}
          currentRole={currentMembership?.role}
          groups={NAV_GROUPS}
          onNavigate={navigateToAnchor}
        />
      ) : (
        <section className="workspace" aria-label="Espaço de trabalho">
          <PageHeader
            title="Espaço de Trabalho"
            description="Telas legadas dos módulos existentes -- ainda com visual anterior ao Design System v1."
          />

          <div className="panel">
            <span>Usuario temporario</span>
            <strong>{currentDevUserId}</strong>
            <p>Identificacao exclusiva para desenvolvimento e testes.</p>
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
            <div id="panel-blueprint">
              <BlueprintPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-preinterview">
              <PreInterviewPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-behavioral-instrument">
              <BehavioralInstrumentPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-behavioral-assessment">
              <BehavioralAssessmentPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-pre-analysis">
              <PreAnalysisPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-candidate-dossier">
              <CandidateDossierPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-proposal">
              <ProposalPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
                applications={candidateApplications}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-onboarding">
              <OnboardingPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
                applications={candidateApplications}
                memberships={memberships}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-employment">
              <EmploymentPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
                applications={candidateApplications}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-development-retention">
              <DevelopmentRetentionPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-offboarding">
              <OffboardingPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
                memberships={memberships}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-access-grant">
              <AccessGrantPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
                memberships={memberships}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-invitation">
              <InvitationPanel
                organizationId={selectedOrganization.id}
                role={currentMembership?.role}
                headers={devHeaders}
              />
            </div>
          )}

          <div className="panel members" id="panel-memberships">
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
            <div id="panel-dna">
              <DnaPanel
                canManage={canManageDna}
                canPublish={canPublishDna}
                publishedDna={publishedDna}
                draftDna={draftDna}
                history={dnaHistory}
                onCreateDraft={createDnaDraft}
                onUpdateField={updateDraftField}
                onUpdateFirstValue={updateFirstValue}
                onUpdateFirstCompetency={updateFirstCompetency}
                onSave={saveDnaDraft}
                onPublish={publishDnaDraft}
                onDiscard={discardDnaDraft}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-org-units">
              <OrganizationStructurePanel
                canManage={canManageUnits}
                canChangeCode={canChangeUnitCode}
                unitTree={unitTree}
                activeUnits={activeUnits}
                selectedUnitId={selectedUnitId}
                unitDraft={unitDraft}
                showInactive={showInactiveUnits}
                onToggleShowInactive={setShowInactiveUnits}
                onSelectUnit={selectUnit}
                onNewUnit={resetUnitDraft}
                onDraftChange={(patch) => setUnitDraft({ ...unitDraft, ...patch })}
                onSave={saveUnit}
                onMove={moveUnit}
                onChangeStatus={changeUnitStatus}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-job-profiles">
              <JobProfilesPanel
                canManage={canManageJobs}
                canPublish={canPublishJobs}
                jobProfiles={jobProfiles}
                inactiveJobProfiles={inactiveJobProfiles}
                selectedJobProfileId={selectedJobProfileId}
                onSelectJobProfile={(id) => {
                  setSelectedJobProfileId(id);
                  loadSelectedJobProfile(id);
                }}
                draft={jobProfileDraft}
                onDraftChange={(patch) => setJobProfileDraft({ ...jobProfileDraft, ...patch })}
                onCreate={createJobProfile}
                publishedJobVersion={publishedJobVersion}
                jobDraftVersion={jobDraftVersion}
                jobProfileHistory={jobProfileHistory}
                onCreateDraft={createJobDraft}
                onUpdateDraftField={updateJobDraftField}
                onSaveDraft={saveJobDraft}
                onPublishDraft={publishJobDraft}
                onDiscardDraft={discardJobDraft}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-job-openings">
              <JobsPanel
                canManage={canManageJobOpenings}
                canPublishOpenings={canPublishJobOpenings}
                jobOpenings={jobOpenings}
                draft={jobOpeningDraft}
                onDraftChange={(patch) => setJobOpeningDraft({ ...jobOpeningDraft, ...patch })}
                publishedJobVersionAvailable={Boolean(publishedJobVersion)}
                onCreate={createJobOpening}
                onPublishAndOpen={publishAndOpenJobOpening}
                onPublishPublicly={publishJobOpeningPublicly}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-candidates">
              <CandidatesPanel
                canManage={canManageCandidates}
                candidates={candidates}
                inactiveCandidates={inactiveCandidates}
                draft={candidateDraft}
                onDraftChange={(patch) => setCandidateDraft({ ...candidateDraft, ...patch })}
                onCreate={createCandidate}
                onChangeStatus={changeCandidateStatus}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-applications">
              <SelectionPanel
                canManage={canManageApplications}
                canHire={canHireApplications}
                applications={candidateApplications}
                candidates={candidates}
                jobOpenings={jobOpenings}
                draft={candidateApplicationDraft}
                onDraftChange={(patch) =>
                  setCandidateApplicationDraft({ ...candidateApplicationDraft, ...patch })
                }
                onCreate={createCandidateApplication}
                onMoveStage={moveCandidateApplication}
                onFinalize={finalizeCandidateApplication}
                onAddNote={addCandidateApplicationNote}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-interviews">
              <InterviewsPanel
                canManage={canManageInterviews}
                interviews={interviews}
                applications={candidateApplications}
                draft={interviewDraft}
                onDraftChange={(patch) => setInterviewDraft({ ...interviewDraft, ...patch })}
                onCreate={createInterview}
                onSchedule={scheduleInterview}
                onChangeStatus={changeInterviewStatus}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-competencies">
              <CompetenciesPanel
                canManage={canManageCompetencies}
                activeTab={competencyTab}
                onTabChange={setCompetencyTab}
                catalogItems={catalogItems}
                organizationCompetencies={organizationCompetencies}
                organizationDraft={organizationCompetencyDraft}
                onOrganizationDraftChange={(patch) =>
                  setOrganizationCompetencyDraft({ ...organizationCompetencyDraft, ...patch })
                }
                onCreateOrganization={createOrganizationCompetency}
                onChangeOrganizationStatus={changeOrganizationCompetencyStatus}
                globalCompetencies={globalCompetencies}
                availableGlobalCompetencies={availableGlobalCompetencies}
                globalDraft={globalCompetencyDraft}
                onGlobalDraftChange={(patch) =>
                  setGlobalCompetencyDraft({ ...globalCompetencyDraft, ...patch })
                }
                onCreateGlobal={createGlobalCompetency}
                onAdoptGlobal={adoptGlobalCompetency}
              />
            </div>
          )}

          {selectedOrganization && (
            <div id="panel-questions">
              <QuestionBankPanel
                canManage={canManageQuestions}
                activeTab={questionTab}
                onTabChange={setQuestionTab}
                questionCatalogItems={questionCatalogItems}
                competencyCatalogItems={catalogItems}
                organizationQuestions={organizationQuestions}
                organizationDraft={organizationQuestionDraft}
                onOrganizationDraftChange={(patch) =>
                  setOrganizationQuestionDraft({ ...organizationQuestionDraft, ...patch })
                }
                onCreateOrganization={createOrganizationQuestion}
                onChangeOrganizationStatus={changeOrganizationQuestionStatus}
                globalQuestions={globalQuestions}
                availableGlobalQuestions={availableGlobalQuestions}
                onAdoptGlobal={adoptGlobalQuestion}
              />
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
