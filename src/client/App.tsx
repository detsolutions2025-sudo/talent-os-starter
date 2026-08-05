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
  const [message, setMessage] = useState("Nenhuma Organization selecionada.");
  const currentMembership = memberships.find(
    (membership) => membership.userId === currentDevUserId && membership.status === "active"
  );
  const canManageMemberships =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canManageOwners = currentMembership?.role === "owner";
  const canManageDna = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const canPublishDna = currentMembership?.role === "owner";

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

  return (
    <main className="app-shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Fase 1</p>
        <h1 id="page-title">Talent OS</h1>
        <p className="lead">
          Nucleo multiempresa com Organizations, Users, Memberships, roles e autorizacao no
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
      </section>
    </main>
  );
}
