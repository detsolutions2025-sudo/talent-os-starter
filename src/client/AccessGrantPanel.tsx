import { useMemo, useState } from "react";

// Fase 28 (ADR-0025; SPEC-027 v1.0 s38): painel administrativo minimo. Owner/admin podem
// listar, conceder e revogar. Member nao tem nenhuma superficie neste painel (SPEC-027 s22,
// CA-017: member nao consulta AccessGrant). Nenhum autosservico da pessoa vinculada nesta v1.
type MembershipOption = {
  id: string;
  role: "owner" | "admin" | "member";
  status: "active" | "inactive";
  user?: { name: string; email: string } | null;
};

type AccessGrantView = {
  id: string;
  organizationPersonId: string;
  membershipId: string;
  employmentId: string | null;
  provenanceType: "employment" | "administrative";
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
};

const REVOCATION_REASONS = [
  "employment_ended",
  "role_change",
  "security_concern",
  "administrative_correction",
  "other_minimized"
] as const;

export function AccessGrantPanel({
  organizationId,
  role,
  headers,
  memberships
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
  memberships: MembershipOption[];
}) {
  const canManage = role === "owner" || role === "admin";
  const activeMemberships = useMemo(
    () => memberships.filter((membership) => membership.status === "active"),
    [memberships]
  );

  const [grants, setGrants] = useState<AccessGrantView[]>([]);
  const [organizationPersonId, setOrganizationPersonId] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [provenanceType, setProvenanceType] = useState<"employment" | "administrative">(
    "administrative"
  );
  const [employmentId, setEmploymentId] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [revocationReasonCategory, setRevocationReasonCategory] = useState<string>(
    REVOCATION_REASONS[3]
  );
  const [message, setMessage] = useState("");

  function loadGrants() {
    if (!canManage) return;
    fetch(`/api/organizations/${organizationId}/access-grants`, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel listar AccessGrant.");
        setGrants((await response.json()) as AccessGrantView[]);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createGrant() {
    if (!organizationPersonId || !membershipId) {
      setMessage("Informe OrganizationPerson e Membership.");
      return;
    }
    fetch(`/api/organizations/${organizationId}/access-grants`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `access-grant-create-${membershipId}-${Date.now()}`
      },
      body: JSON.stringify({
        organizationPersonId,
        membershipId,
        provenanceType,
        employmentId: provenanceType === "employment" ? employmentId || null : null,
        grantReason: provenanceType === "administrative" ? grantReason || null : null
      })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel conceder AccessGrant.");
        setMessage("AccessGrant concedido.");
        setOrganizationPersonId("");
        setMembershipId("");
        setEmploymentId("");
        setGrantReason("");
        loadGrants();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function revokeGrant(accessGrantId: string) {
    fetch(`/api/organizations/${organizationId}/access-grants/${accessGrantId}/revoke`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `access-grant-revoke-${accessGrantId}-${Date.now()}`
      },
      body: JSON.stringify({ revocationReasonCategory })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel revogar AccessGrant.");
        setMessage("AccessGrant revogado.");
        loadGrants();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  if (!canManage) {
    return null;
  }

  return (
    <section className="panel access-grant-panel">
      <span>Ciclo de Vida de Acesso (AccessGrant)</span>

      <div className="form-grid">
        <button type="button" onClick={loadGrants}>
          Carregar AccessGrants
        </button>
      </div>

      <div className="form-grid">
        <input
          aria-label="OrganizationPerson ID"
          placeholder="OrganizationPerson ID"
          value={organizationPersonId}
          onChange={(event) => setOrganizationPersonId(event.target.value)}
        />
        <select
          aria-label="Membership para AccessGrant"
          value={membershipId}
          onChange={(event) => setMembershipId(event.target.value)}
        >
          <option value="">Selecione um Membership</option>
          {activeMemberships.map((membership) => (
            <option key={membership.id} value={membership.id}>
              {membership.user?.name ?? membership.id} - {membership.role}
            </option>
          ))}
        </select>
        <select
          aria-label="Proveniencia do AccessGrant"
          value={provenanceType}
          onChange={(event) =>
            setProvenanceType(event.target.value as "employment" | "administrative")
          }
        >
          <option value="administrative">administrative</option>
          <option value="employment">employment</option>
        </select>
        {provenanceType === "employment" ? (
          <input
            aria-label="Employment ID"
            placeholder="Employment ID"
            value={employmentId}
            onChange={(event) => setEmploymentId(event.target.value)}
          />
        ) : (
          <input
            aria-label="Motivo administrativo"
            placeholder="Motivo (obrigatorio quando administrative)"
            value={grantReason}
            onChange={(event) => setGrantReason(event.target.value)}
          />
        )}
        <button type="button" onClick={createGrant}>
          Conceder AccessGrant
        </button>
      </div>

      <div className="form-grid">
        <select
          aria-label="Categoria de revogacao"
          value={revocationReasonCategory}
          onChange={(event) => setRevocationReasonCategory(event.target.value)}
        >
          {REVOCATION_REASONS.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <ul className="competency-list">
        {grants.map((grant) => (
          <li key={grant.id}>
            <strong>{grant.membershipId}</strong>
            <small>
              {grant.status} - {grant.provenanceType}
              {grant.employmentId ? ` - ${grant.employmentId}` : ""}
            </small>
            {grant.status === "active" && (
              <div className="actions">
                <button type="button" onClick={() => revokeGrant(grant.id)}>
                  Revogar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="message" role="status">
        {message}
      </p>
    </section>
  );
}
