import { useCallback, useEffect, useMemo, useState } from "react";

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
    <section className="panel employment-panel">
      <span>Pessoas e vinculos</span>
      <p>
        OrganizationPerson identifica a pessoa na empresa. Employment registra o vinculo. Nenhuma
        acao aqui cria User, Membership, portal ou acesso.
      </p>

      {canManage && (
        <div className="employment-layout">
          <div className="job-profile-form">
            <strong>Contratacao de recrutamento</strong>
            <select
              aria-label="Candidatura hired"
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
            </select>
            <input
              aria-label="Data efetiva de inicio"
              type="date"
              value={effectiveStartDate}
              onChange={(event) => setEffectiveStartDate(event.target.value)}
            />
            <textarea
              aria-label="Motivo de origem"
              value={originReason}
              onChange={(event) => setOriginReason(event.target.value)}
            />
            <button type="button" onClick={createRecruitmentEmployment}>
              Criar Employment
            </button>
          </div>

          <div className="job-profile-form">
            <strong>Vinculo administrativo</strong>
            <select
              aria-label="Pessoa existente"
              value={personId}
              onChange={(event) => setPersonId(event.target.value)}
            >
              <option value="">Nova pessoa</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
            {!personId && (
              <>
                <input
                  aria-label="Nome da pessoa"
                  placeholder="Nome"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                <input
                  aria-label="Email principal"
                  placeholder="Email"
                  value={primaryEmail}
                  onChange={(event) => setPrimaryEmail(event.target.value)}
                />
              </>
            )}
            <button type="button" onClick={createAdministrativeEmployment}>
              Criar vinculo administrativo
            </button>
          </div>
        </div>
      )}

      <div className="actions">
        <input
          aria-label="Motivo da transicao"
          placeholder="Motivo para cancelar/encerrar"
          value={transitionReason}
          onChange={(event) => setTransitionReason(event.target.value)}
        />
        <input
          aria-label="Data de encerramento"
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
        <button type="button" onClick={load}>
          Atualizar
        </button>
      </div>

      <ul className="competency-list">
        {employments.map((employment) => {
          const person = people.find((item) => item.id === employment.organizationPersonId);
          return (
            <li key={employment.id}>
              <strong>{person?.displayName ?? employment.organizationPersonId}</strong>
              <small>
                {employment.status} - {employment.originType} - inicio{" "}
                {employment.effectiveStartDate}
              </small>
              <code>{employment.id}</code>
              {canManage && employment.status === "pending" && (
                <div className="actions">
                  <button type="button" onClick={() => transition(employment.id, "activate")}>
                    Ativar
                  </button>
                  <button type="button" onClick={() => transition(employment.id, "cancel")}>
                    Cancelar
                  </button>
                </div>
              )}
              {canManage && employment.status === "active" && (
                <button type="button" onClick={() => transition(employment.id, "end")}>
                  Encerrar
                </button>
              )}
            </li>
          );
        })}
        {employments.length === 0 && <li>Nenhum Employment registrado.</li>}
      </ul>

      <p className="message" role="status">
        {message}
      </p>
    </section>
  );
}
