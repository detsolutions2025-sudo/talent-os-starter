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
  }, []);

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
      </section>
    </main>
  );
}
