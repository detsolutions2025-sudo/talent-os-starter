import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { Divider } from "../../components/ui/Divider";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Textarea } from "../../components/ui/Textarea";

// Migrado para o Design System v1 na Wave 3 (visual apenas -- toda a logica interna, chamadas
// de API e sequencia de operacoes permanecem identicas ao componente original de Fase 24).
//
// OrganizationPerson e Employment sao agregados distintos, mas o endpoint de listagem de
// OrganizationPerson so e chamado aqui (nenhuma rota nova foi criada para separa-los). Por
// isso o painel renderiza dois blocos visuais claramente distintos -- "Pessoas" (identidade)
// e "Vínculos" (Employment) -- em vez de um so painel misturado: cada bloco tem seu proprio
// SectionHeader, seu proprio id de ancora (#panel-people / #panel-employment) e nenhuma acao de
// um bloco decide algo sobre o outro. Nenhuma acao aqui cria User, Membership, portal ou acesso.
type ApplicationOption = {
  id: string;
  candidateId?: string;
  candidate?: {
    fullName?: string;
    full_name?: string;
    preferredName?: string | null;
    preferred_name?: string | null;
  } | null;
  applicationStatus?: string;
  application_status?: string;
};

type OrganizationPersonView = {
  id: string;
  displayName: string;
  preferredName: string | null;
  primaryEmail: string | null;
  originCandidateId: string | null;
};

type EmploymentView = {
  id: string;
  organizationPersonId: string;
  status: "pending" | "active" | "ended" | "cancelled";
  originType: "recruitment" | "administrative";
  originCandidateApplicationId: string | null;
  effectiveStartDate: string;
  startedAt: string | null;
  endDate: string | null;
  originReason: string;
};

const employmentStatusTone = {
  pending: "warning",
  active: "success",
  ended: "neutral",
  cancelled: "danger"
} as const;

export function EmploymentPanel({
  organizationId,
  role,
  headers,
  applications
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
  applications: ApplicationOption[];
}) {
  const canManage = role === "owner" || role === "admin";
  const hiredApplications = useMemo(
    () =>
      applications.filter(
        (application) =>
          (application.applicationStatus ?? application.application_status) === "hired"
      ),
    [applications]
  );
  const [people, setPeople] = useState<OrganizationPersonView[]>([]);
  const [employments, setEmployments] = useState<EmploymentView[]>([]);
  const [applicationId, setApplicationId] = useState("");
  const [personId, setPersonId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [effectiveStartDate, setEffectiveStartDate] = useState("");
  const [originReason, setOriginReason] = useState("Registro manual explicito pela empresa.");
  const [transitionReason, setTransitionReason] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");

  // SPEC-025 s20: leitura de OrganizationPerson/Employment (completa ou em lista) e Sim apenas
  // para owner/admin; member e "Nao" / "Nao por padrao". Sem essa guarda, o painel chamaria os
  // endpoints para qualquer role e o backend devolveria 403 -- correto, mas desnecessario.
  const load = useCallback(() => {
    if (!canManage) {
      setPeople([]);
      setEmployments([]);
      return;
    }
    fetch(`/api/organizations/${organizationId}/organization-people`, { headers })
      .then(async (response) => {
        setPeople(response.ok ? ((await response.json()) as OrganizationPersonView[]) : []);
      })
      .catch(() => setPeople([]));
    fetch(`/api/organizations/${organizationId}/employments`, { headers })
      .then(async (response) => {
        setEmployments(response.ok ? ((await response.json()) as EmploymentView[]) : []);
      })
      .catch(() => setEmployments([]));
  }, [canManage, headers, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManage) {
    return null;
  }

  function createRecruitmentEmployment() {
    if (!applicationId || !effectiveStartDate) {
      setMessage("Selecione uma candidatura hired e informe a data de inicio.");
      return;
    }
    createEmployment({
      originType: "recruitment",
      candidateApplicationId: applicationId,
      effectiveStartDate,
      originReason
    });
  }

  function createAdministrativeEmployment() {
    if (!effectiveStartDate || (!personId && !displayName)) {
      setMessage("Informe uma pessoa existente ou um nome para criar o vinculo administrativo.");
      return;
    }
    createEmployment({
      originType: "administrative",
      organizationPersonId: personId || null,
      displayName: personId ? null : displayName,
      primaryEmail: personId ? null : primaryEmail || null,
      effectiveStartDate,
      originReason
    });
  }

  function createEmployment(body: Record<string, unknown>) {
    fetch(`/api/organizations/${organizationId}/employments`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `employment-create-${Date.now()}`
      },
      body: JSON.stringify(body)
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel criar Employment.");
        setMessage("Employment criado em pending.");
        setApplicationId("");
        setPersonId("");
        setDisplayName("");
        setPrimaryEmail("");
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function transition(employmentId: string, action: "activate" | "cancel" | "end") {
    const body =
      action === "end"
        ? { endDate, reason: transitionReason }
        : action === "cancel"
          ? { reason: transitionReason }
          : {};
    fetch(`/api/organizations/${organizationId}/employments/${employmentId}/${action}`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `employment-${action}-${employmentId}-${Date.now()}`
      },
      body: JSON.stringify(body)
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Transicao de Employment nao concluida.");
        setMessage("Employment atualizado.");
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  return (
    <>
      <div id="panel-people" className="ds-feature">
        <SectionHeader
          title="Pessoas"
          description="Identidade de cada OrganizationPerson na organização — não é User (login) nem Membership (autorização técnica); é apenas quem a pessoa é para a empresa."
        />
        <Card>
          <DataList
            items={people}
            keyExtractor={(person) => person.id}
            emptyTitle="Nenhuma pessoa registrada"
            renderItem={(person) => (
              <DataListItem
                title={person.displayName}
                status={
                  <Badge tone={person.originCandidateId ? "info" : "neutral"}>
                    {person.originCandidateId ? "origem: recrutamento" : "origem: administrativa"}
                  </Badge>
                }
                meta={
                  <>
                    {person.preferredName && <span>{person.preferredName}</span>}
                    {person.primaryEmail && <span>{person.primaryEmail}</span>}
                  </>
                }
              />
            )}
          />
        </Card>
      </div>

      <Divider />

      <div id="panel-employment" className="ds-feature">
        <SectionHeader
          title="Vínculos (Employment)"
          description="Vínculo de trabalho entre a pessoa e a organização. Nenhuma ação aqui cria User, Membership, portal ou acesso."
        />

        {message && <Alert tone="info">{message}</Alert>}

        <div className="ds-feature__layout">
          <div className="ds-feature__main">
            <Card>
              <DataList
                items={employments}
                keyExtractor={(employment) => employment.id}
                emptyTitle="Nenhum Employment registrado"
                renderItem={(employment) => {
                  const person = people.find((item) => item.id === employment.organizationPersonId);
                  return (
                    <DataListItem
                      title={person?.displayName ?? employment.organizationPersonId}
                      status={
                        <Badge tone={employmentStatusTone[employment.status]}>
                          {employment.status}
                        </Badge>
                      }
                      meta={
                        <>
                          <span>
                            {employment.originType} · início {employment.effectiveStartDate}
                          </span>
                          <code>{employment.id}</code>
                        </>
                      }
                      actions={
                        <>
                          {employment.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => transition(employment.id, "activate")}
                              >
                                Ativar
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => transition(employment.id, "cancel")}
                              >
                                Cancelar
                              </Button>
                            </>
                          )}
                          {employment.status === "active" && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => transition(employment.id, "end")}
                            >
                              Encerrar
                            </Button>
                          )}
                        </>
                      }
                    />
                  );
                }}
              />
            </Card>
          </div>

          <div className="ds-feature__aside">
            <Card>
              <FormSection
                title="Contratação de recrutamento"
                actions={<Button onClick={createRecruitmentEmployment}>Criar Employment</Button>}
              >
                <Select
                  label="Candidatura hired"
                  value={applicationId}
                  onChange={(event) => setApplicationId(event.target.value)}
                >
                  <option value="">Candidatura hired</option>
                  {hiredApplications.map((application) => (
                    <option key={application.id} value={application.id}>
                      {application.candidate?.fullName ??
                        application.candidate?.full_name ??
                        application.candidateId ??
                        application.id}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Data efetiva de início"
                  type="date"
                  value={effectiveStartDate}
                  onChange={(event) => setEffectiveStartDate(event.target.value)}
                />
                <Textarea
                  label="Motivo de origem"
                  value={originReason}
                  onChange={(event) => setOriginReason(event.target.value)}
                />
              </FormSection>
            </Card>

            <Card>
              <FormSection
                title="Vínculo administrativo"
                actions={
                  <Button onClick={createAdministrativeEmployment}>
                    Criar vínculo administrativo
                  </Button>
                }
              >
                <Select
                  label="Pessoa existente"
                  value={personId}
                  onChange={(event) => setPersonId(event.target.value)}
                >
                  <option value="">Nova pessoa</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </Select>
                {!personId && (
                  <>
                    <Input
                      label="Nome da pessoa"
                      placeholder="Nome"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                    <Input
                      label="E-mail principal"
                      placeholder="Email"
                      value={primaryEmail}
                      onChange={(event) => setPrimaryEmail(event.target.value)}
                    />
                  </>
                )}
              </FormSection>
            </Card>

            <Card>
              <FormSection
                title="Transição"
                actions={
                  <Button variant="secondary" onClick={load}>
                    Atualizar
                  </Button>
                }
              >
                <Input
                  label="Motivo da transição"
                  placeholder="Motivo para cancelar/encerrar"
                  value={transitionReason}
                  onChange={(event) => setTransitionReason(event.target.value)}
                />
                <Input
                  label="Data de encerramento"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </FormSection>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
