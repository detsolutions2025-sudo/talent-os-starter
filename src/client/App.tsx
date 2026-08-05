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
  role: "owner" | "admin" | "member";
  status: "active" | "inactive";
  user: {
    name: string;
    email: string;
  } | null;
};

const devHeaders = {
  "x-dev-user-id": "usr_000001"
};

export function App() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<Membership["role"]>("member");
  const [message, setMessage] = useState("Nenhuma Organization selecionada.");

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
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function reloadSelectedOrganization() {
    if (selectedOrganizationId) {
      selectOrganization(selectedOrganizationId);
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
          <strong>usr_000001</strong>
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
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
            <button type="button" onClick={addMember}>
              Adicionar
            </button>
          </div>
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
                  <div className="member-actions">
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
