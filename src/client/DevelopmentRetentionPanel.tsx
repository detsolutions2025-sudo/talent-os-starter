import { useCallback, useEffect, useState } from "react";

type EmploymentOption = {
  id: string;
  status: "pending" | "active" | "ended" | "cancelled";
  organizationPersonId: string;
};

type PlanView = {
  id: string;
  employmentId: string;
  title: string;
  purpose: string | null;
  status: "draft" | "active" | "completed" | "cancelled" | "closed_due_to_employment_end";
  goals: GoalView[];
  checkIns: CheckInView[];
};

type GoalView = {
  id: string;
  title: string;
  status: "open" | "completed" | "cancelled";
};

type CheckInView = {
  id: string;
  summary: string;
  submittedAt: string;
};

type ConcernView = {
  id: string;
  category: string;
  description: string;
  status: "open" | "resolved" | "cancelled";
};

type ActionView = {
  id: string;
  actionType: string;
  description: string;
  status: "open" | "completed" | "cancelled";
};

// Fase 25 (SPEC-017 v1.0). Employment e o aggregate root obrigatorio: o painel so opera depois
// que um Employment active for selecionado. Nunca mostra score, ranking, risco percentual ou
// rating -- essa informacao nao existe fisicamente (SPEC-017 s21 "Retention semantics").
export function DevelopmentRetentionPanel({
  organizationId,
  role,
  headers
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
}) {
  const canManage = role === "owner" || role === "admin";
  const [employments, setEmployments] = useState<EmploymentOption[]>([]);
  const [employmentId, setEmploymentId] = useState("");
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [concerns, setConcerns] = useState<ConcernView[]>([]);
  const [actions, setActions] = useState<ActionView[]>([]);
  const [planTitle, setPlanTitle] = useState("");
  const [planPurpose, setPlanPurpose] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [checkInSummary, setCheckInSummary] = useState("");
  const [concernDescription, setConcernDescription] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [message, setMessage] = useState("");

  const loadEmployments = useCallback(() => {
    if (!canManage) {
      setEmployments([]);
      return;
    }
    fetch(`/api/organizations/${organizationId}/employments`, { headers })
      .then(async (response) => {
        const all = response.ok ? ((await response.json()) as EmploymentOption[]) : [];
        setEmployments(all.filter((employment) => employment.status === "active"));
      })
      .catch(() => setEmployments([]));
  }, [canManage, headers, organizationId]);

  const loadPlan = useCallback(() => {
    if (!canManage || !employmentId) {
      setPlan(null);
      return;
    }
    fetch(`/api/organizations/${organizationId}/employments/${employmentId}/development-plans`, {
      headers
    })
      .then(async (response) => {
        const plans = response.ok
          ? ((await response.json()) as { id: string; status: string }[])
          : [];
        const nonFinal = plans.find(
          (candidate) => candidate.status === "draft" || candidate.status === "active"
        );
        if (!nonFinal) {
          setPlan(null);
          return;
        }
        const detail = await fetch(
          `/api/organizations/${organizationId}/development-plans/${nonFinal.id}`,
          { headers }
        );
        setPlan(detail.ok ? ((await detail.json()) as PlanView) : null);
      })
      .catch(() => setPlan(null));
  }, [canManage, employmentId, headers, organizationId]);

  const loadRetention = useCallback(() => {
    if (!canManage || !employmentId) {
      setConcerns([]);
      setActions([]);
      return;
    }
    fetch(`/api/organizations/${organizationId}/employments/${employmentId}/retention-concerns`, {
      headers
    })
      .then(async (response) => setConcerns(response.ok ? await response.json() : []))
      .catch(() => setConcerns([]));
    fetch(`/api/organizations/${organizationId}/employments/${employmentId}/retention-actions`, {
      headers
    })
      .then(async (response) => setActions(response.ok ? await response.json() : []))
      .catch(() => setActions([]));
  }, [canManage, employmentId, headers, organizationId]);

  useEffect(() => {
    loadEmployments();
  }, [loadEmployments]);

  useEffect(() => {
    loadPlan();
    loadRetention();
  }, [loadPlan, loadRetention]);

  if (!canManage) {
    return null;
  }

  function post(path: string, body: Record<string, unknown>, keyPrefix: string) {
    return fetch(path, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `${keyPrefix}-${Date.now()}`
      },
      body: JSON.stringify(body)
    }).then(async (response) => {
      if (!response.ok) throw new Error("Operacao nao concluida.");
      return response.json();
    });
  }

  function createPlan() {
    if (!employmentId || !planTitle) {
      setMessage("Selecione um Employment e informe o titulo do plano.");
      return;
    }
    post(
      `/api/organizations/${organizationId}/employments/${employmentId}/development-plans`,
      { title: planTitle, purpose: planPurpose || undefined },
      "plan-create"
    )
      .then(() => {
        setPlanTitle("");
        setPlanPurpose("");
        setMessage("Plano criado em draft.");
        loadPlan();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function planTransition(action: "activate" | "complete" | "cancel") {
    if (!plan) return;
    const body = action === "cancel" ? { reason: "Cancelado pelo painel interno." } : {};
    post(
      `/api/organizations/${organizationId}/development-plans/${plan.id}/${action}`,
      body,
      `plan-${action}`
    )
      .then(() => {
        setMessage("Plano atualizado.");
        loadPlan();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createGoal() {
    if (!plan || !goalTitle) return;
    post(
      `/api/organizations/${organizationId}/development-plans/${plan.id}/goals`,
      { title: goalTitle },
      "goal-create"
    )
      .then(() => {
        setGoalTitle("");
        setMessage("Goal criado.");
        loadPlan();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function goalTransition(goalId: string, action: "complete" | "cancel") {
    const body = action === "cancel" ? { reason: "Cancelado pelo painel interno." } : {};
    post(
      `/api/organizations/${organizationId}/development-goals/${goalId}/${action}`,
      body,
      `goal-${action}`
    )
      .then(() => {
        setMessage("Goal atualizado.");
        loadPlan();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createCheckIn() {
    if (!plan || !checkInSummary) return;
    post(
      `/api/organizations/${organizationId}/development-plans/${plan.id}/check-ins`,
      { summary: checkInSummary, visibility: "owner_admin_only" },
      "checkin-create"
    )
      .then(() => {
        setCheckInSummary("");
        setMessage("Check-in registrado.");
        loadPlan();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createConcern() {
    if (!employmentId || !concernDescription) return;
    post(
      `/api/organizations/${organizationId}/employments/${employmentId}/retention-concerns`,
      {
        source: "human_observation",
        category: "other_minimized",
        description: concernDescription,
        visibility: "owner_admin_only"
      },
      "concern-create"
    )
      .then(() => {
        setConcernDescription("");
        setMessage("Retention concern registrada.");
        loadRetention();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function concernTransition(concernId: string, action: "resolve" | "cancel") {
    const body =
      action === "resolve"
        ? { resolutionSummary: "Resolvido pelo painel interno." }
        : { reason: "Cancelado pelo painel interno." };
    post(
      `/api/organizations/${organizationId}/retention-concerns/${concernId}/${action}`,
      body,
      `concern-${action}`
    )
      .then(() => {
        setMessage("Retention concern atualizada.");
        loadRetention();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createAction() {
    if (!employmentId || !actionDescription) return;
    post(
      `/api/organizations/${organizationId}/employments/${employmentId}/retention-actions`,
      { actionType: "conversation", description: actionDescription },
      "action-create"
    )
      .then(() => {
        setActionDescription("");
        setMessage("Retention action registrada.");
        loadRetention();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function actionTransition(actionId: string, action: "complete" | "cancel") {
    const body = action === "cancel" ? { reason: "Cancelado pelo painel interno." } : {};
    post(
      `/api/organizations/${organizationId}/retention-actions/${actionId}/${action}`,
      body,
      `action-${action}`
    )
      .then(() => {
        setMessage("Retention action atualizada.");
        loadRetention();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  return (
    <section className="panel development-retention-panel">
      <span>Desenvolvimento e Retencao</span>
      <p>
        Plano de desenvolvimento, objetivos, check-ins e questoes/acoes de retencao ficam vinculados
        a um Employment active. Nenhum score, ranking ou risco percentual e calculado aqui -- tudo e
        registro humano explicito.
      </p>

      <select
        aria-label="Employment"
        value={employmentId}
        onChange={(event) => setEmploymentId(event.target.value)}
      >
        <option value="">Selecione um Employment active</option>
        {employments.map((employment) => (
          <option key={employment.id} value={employment.id}>
            {employment.id}
          </option>
        ))}
      </select>

      {employmentId && !plan && (
        <div className="job-profile-form">
          <strong>Novo plano de desenvolvimento</strong>
          <input
            aria-label="Titulo do plano"
            placeholder="Titulo"
            value={planTitle}
            onChange={(event) => setPlanTitle(event.target.value)}
          />
          <textarea
            aria-label="Finalidade do plano"
            placeholder="Finalidade (opcional)"
            value={planPurpose}
            onChange={(event) => setPlanPurpose(event.target.value)}
          />
          <button type="button" onClick={createPlan}>
            Criar plano
          </button>
        </div>
      )}

      {plan && (
        <div className="job-profile-form">
          <strong>{plan.title}</strong>
          <small>{plan.status}</small>
          {plan.status === "draft" && (
            <div className="actions">
              <button type="button" onClick={() => planTransition("activate")}>
                Ativar plano
              </button>
              <button type="button" onClick={() => planTransition("cancel")}>
                Cancelar plano
              </button>
            </div>
          )}
          {plan.status === "active" && (
            <button type="button" onClick={() => planTransition("complete")}>
              Completar plano
            </button>
          )}

          <strong>Goals</strong>
          {(plan.status === "draft" || plan.status === "active") && (
            <div className="actions">
              <input
                aria-label="Titulo do goal"
                placeholder="Novo goal"
                value={goalTitle}
                onChange={(event) => setGoalTitle(event.target.value)}
              />
              <button type="button" onClick={createGoal}>
                Adicionar goal
              </button>
            </div>
          )}
          <ul className="competency-list">
            {plan.goals.map((goal) => (
              <li key={goal.id}>
                {goal.title} - {goal.status}
                {goal.status === "open" && (
                  <div className="actions">
                    <button type="button" onClick={() => goalTransition(goal.id, "complete")}>
                      Completar
                    </button>
                    <button type="button" onClick={() => goalTransition(goal.id, "cancel")}>
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <strong>Check-ins</strong>
          {plan.status === "active" && (
            <div className="actions">
              <input
                aria-label="Resumo do check-in"
                placeholder="Resumo do acompanhamento"
                value={checkInSummary}
                onChange={(event) => setCheckInSummary(event.target.value)}
              />
              <button type="button" onClick={createCheckIn}>
                Registrar check-in
              </button>
            </div>
          )}
          <ul className="competency-list">
            {plan.checkIns.map((checkIn) => (
              <li key={checkIn.id}>{checkIn.summary}</li>
            ))}
            {plan.checkIns.length === 0 && <li>Nenhum check-in registrado.</li>}
          </ul>
        </div>
      )}

      {employmentId && (
        <div className="job-profile-form">
          <strong>Retention concerns</strong>
          <div className="actions">
            <input
              aria-label="Descricao da concern"
              placeholder="Questao de retencao observada"
              value={concernDescription}
              onChange={(event) => setConcernDescription(event.target.value)}
            />
            <button type="button" onClick={createConcern}>
              Registrar
            </button>
          </div>
          <ul className="competency-list">
            {concerns.map((concern) => (
              <li key={concern.id}>
                {concern.description} - {concern.status}
                {concern.status === "open" && (
                  <div className="actions">
                    <button type="button" onClick={() => concernTransition(concern.id, "resolve")}>
                      Resolver
                    </button>
                    <button type="button" onClick={() => concernTransition(concern.id, "cancel")}>
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            ))}
            {concerns.length === 0 && <li>Nenhuma retention concern registrada.</li>}
          </ul>

          <strong>Retention actions</strong>
          <div className="actions">
            <input
              aria-label="Descricao da acao"
              placeholder="Acao humana de retencao"
              value={actionDescription}
              onChange={(event) => setActionDescription(event.target.value)}
            />
            <button type="button" onClick={createAction}>
              Registrar
            </button>
          </div>
          <ul className="competency-list">
            {actions.map((action) => (
              <li key={action.id}>
                {action.description} - {action.status}
                {action.status === "open" && (
                  <div className="actions">
                    <button type="button" onClick={() => actionTransition(action.id, "complete")}>
                      Completar
                    </button>
                    <button type="button" onClick={() => actionTransition(action.id, "cancel")}>
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            ))}
            {actions.length === 0 && <li>Nenhuma retention action registrada.</li>}
          </ul>
        </div>
      )}

      <p className="message" role="status">
        {message}
      </p>
    </section>
  );
}
