import { useEffect, useState } from "react";
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

const emptyJobProfileDraft: JobProfileDraft = {
  code: "",
  name: ""
};

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
  const [jobProfiles, setJobProfiles] = useState<JobProfile[]>([]);
  const [inactiveJobProfiles, setInactiveJobProfiles] = useState<JobProfile[]>([]);
  const [selectedJobProfileId, setSelectedJobProfileId] = useState("");
  const [jobProfileDraft, setJobProfileDraft] = useState<JobProfileDraft>(emptyJobProfileDraft);
  const [jobDraftVersion, setJobDraftVersion] = useState<JobProfileVersion | null>(null);
  const [publishedJobVersion, setPublishedJobVersion] = useState<JobProfileVersion | null>(null);
  const [jobProfileHistory, setJobProfileHistory] = useState<JobProfileVersion[]>([]);
  const [globalCompetencyDraft, setGlobalCompetencyDraft] =
    useState<CompetencyDraft>(emptyCompetencyDraft);
  const [organizationCompetencyDraft, setOrganizationCompetencyDraft] =
    useState<CompetencyDraft>(emptyCompetencyDraft);
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
  const canManageJobs = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canPublishJobs = currentMembership?.role === "owner";

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
  }, []);

  function loadPlatformGlobals() {
    fetch("/api/platform/competencies/global", { headers: platformHeaders })
      .then(async (response) => {
        setGlobalCompetencies(response.ok ? ((await response.json()) as GlobalCompetency[]) : []);
      })
      .catch(() => setGlobalCompetencies([]));
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
    setJobProfiles([]);
    setInactiveJobProfiles([]);
    setSelectedJobProfileId("");
    setJobProfileDraft(emptyJobProfileDraft);
    setJobDraftVersion(null);
    setPublishedJobVersion(null);
    setJobProfileHistory([]);

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
        void loadJobProfiles(organizationId, organizationMemberships);
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

  function reloadJobProfiles() {
    if (selectedOrganizationId) {
      loadJobProfiles(selectedOrganizationId);
      if (selectedJobProfileId) {
        loadSelectedJobProfile(selectedJobProfileId);
      }
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
        <h1 id="page-title">Talent OS</h1>
        <p className="lead">
          Nucleo multiempresa, DNA Organizacional e Estrutura Organizacional com autorizacao no
          servidor.
        </p>
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
      </section>
    </main>
  );
}
