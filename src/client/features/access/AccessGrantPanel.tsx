import { useMemo, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import type { MembershipOption } from "../shared/types";

// Migrado para o Design System v1 na Wave 3 (visual apenas -- toda a logica interna, chamadas
// de API e sequencia de operacoes permanecem identicas ao componente original de Fase 28).
//
// Fase 28 (ADR-0025; SPEC-027 v1.0 s38): painel administrativo minimo. Owner/admin podem
// listar, conceder e revogar. Member nao tem nenhuma superficie neste painel (SPEC-027 s22,
// CA-017: member nao consulta AccessGrant). Nenhum autosservico da pessoa vinculada nesta v1.
//
// Membership continua sendo a UNICA fonte tecnica de autorizacao (RBAC). AccessGrant e um
// registro de negocio sobre esse Membership -- por isso a linguagem aqui nunca trata "conceder"
// / "revogar AccessGrant" como equivalente a criar/remover Membership, e nao existe botao de
// "reativar" um grant revogado (revogacao e final; uma nova concessao cria um AccessGrant novo).
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
    <div className="ds-feature">
      <SectionHeader
        title="Ciclo de Vida de Acesso"
        description="AccessGrant registra a concessão/revogação de acesso sobre um Membership real — Membership continua sendo a única fonte técnica de autorização (RBAC)."
        actions={
          <Button variant="secondary" onClick={loadGrants}>
            Carregar AccessGrants
          </Button>
        }
      />

      {message && <Alert tone="info">{message}</Alert>}

      <div className="ds-feature__layout">
        <div className="ds-feature__main">
          <Card>
            <DataList
              items={grants}
              keyExtractor={(grant) => grant.id}
              emptyTitle="Nenhum AccessGrant carregado"
              emptyDescription="Use “Carregar AccessGrants” para consultar o estado atual."
              renderItem={(grant) => (
                <DataListItem
                  title={
                    activeMemberships.find((membership) => membership.id === grant.membershipId)
                      ?.user?.name ?? grant.membershipId
                  }
                  status={
                    <Badge tone={grant.status === "active" ? "success" : "neutral"}>
                      {grant.status === "active" ? "acesso ativo" : "revogado"}
                    </Badge>
                  }
                  meta={
                    <span>
                      {grant.provenanceType}
                      {grant.employmentId ? ` · ${grant.employmentId}` : ""}
                    </span>
                  }
                  actions={
                    grant.status === "active" && (
                      <Button size="sm" variant="danger" onClick={() => revokeGrant(grant.id)}>
                        Revogar
                      </Button>
                    )
                  }
                />
              )}
            />
          </Card>
        </div>

        <div className="ds-feature__aside">
          <Card>
            <FormSection
              title="Conceder AccessGrant"
              actions={<Button onClick={createGrant}>Conceder AccessGrant</Button>}
            >
              <Input
                label="OrganizationPerson ID"
                placeholder="OrganizationPerson ID"
                value={organizationPersonId}
                onChange={(event) => setOrganizationPersonId(event.target.value)}
              />
              <Select
                label="Membership"
                value={membershipId}
                onChange={(event) => setMembershipId(event.target.value)}
              >
                <option value="">Selecione um Membership</option>
                {activeMemberships.map((membership) => (
                  <option key={membership.id} value={membership.id}>
                    {membership.user?.name ?? membership.id} - {membership.role}
                  </option>
                ))}
              </Select>
              <Select
                label="Proveniência"
                value={provenanceType}
                onChange={(event) =>
                  setProvenanceType(event.target.value as "employment" | "administrative")
                }
              >
                <option value="administrative">administrative</option>
                <option value="employment">employment</option>
              </Select>
              {provenanceType === "employment" ? (
                <Input
                  label="Employment ID"
                  placeholder="Employment ID"
                  value={employmentId}
                  onChange={(event) => setEmploymentId(event.target.value)}
                />
              ) : (
                <Input
                  label="Motivo administrativo"
                  placeholder="Motivo (obrigatório quando administrative)"
                  value={grantReason}
                  onChange={(event) => setGrantReason(event.target.value)}
                />
              )}
            </FormSection>
          </Card>

          <Card>
            <FormSection title="Motivo de revogação">
              <Select
                label="Categoria de revogação"
                value={revocationReasonCategory}
                onChange={(event) => setRevocationReasonCategory(event.target.value)}
              >
                {REVOCATION_REASONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </FormSection>
          </Card>
        </div>
      </div>
    </div>
  );
}
