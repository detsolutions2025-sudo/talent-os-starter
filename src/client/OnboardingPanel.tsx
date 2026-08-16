import { useMemo, useState } from "react";

type ApplicationOption = {
  id: string;
  candidateId?: string;
  candidate?: { fullName?: string; full_name?: string } | null;
  applicationStatus?: string;
  application_status?: string;
};

type MembershipOption = {
  id: string;
  role: "owner" | "admin" | "member";
  status: "active" | "inactive";
  user?: { name: string; email: string } | null;
};

type OnboardingView = {
  id: string;
  candidateApplicationId: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  expectedPersonStartDate: string | null;
  progress: { numerator: number; denominator: number; percent: number };
  tasks: OnboardingTaskView[];
};

type OnboardingTaskView = {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  status: "open" | "completed" | "cancelled";
  assigneeMembershipId: string | null;
  dueAt: string | null;
  cancellationReason: string | null;
};

export function OnboardingPanel({
  organizationId,
  role,
  headers,
  applications,
  memberships
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
  applications: ApplicationOption[];
  memberships: MembershipOption[];
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
  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  const [applicationId, setApplicationId] = useState("");
  const [onboarding, setOnboarding] = useState<OnboardingView | null>(null);
  const [expectedStartDate, setExpectedStartDate] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskRequired, setTaskRequired] = useState(true);
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskReason, setTaskReason] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  function load(nextApplicationId = applicationId) {
    if (!nextApplicationId) return;
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${nextApplicationId}/onboarding`,
      {
        headers
      }
    )
      .then(async (response) => {
        setOnboarding(response.ok ? ((await response.json()) as OnboardingView) : null);
      })
      .catch(() => setOnboarding(null));
  }

  function createOnboarding() {
    if (!applicationId) {
      setMessage("Selecione uma candidatura hired.");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId}/onboarding`,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "Idempotency-Key": `onboarding-create-${applicationId}-${Date.now()}`
        },
        body: JSON.stringify({
          expectedPersonStartDate: expectedStartDate || null,
          initialTasks: []
        })
      }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel criar Onboarding.");
        setOnboarding((await response.json()) as OnboardingView);
        setMessage("Onboarding criado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function postOnboardingAction(action: "start" | "complete" | "cancel") {
    if (!onboarding) return;
    fetch(`/api/organizations/${organizationId}/onboardings/${onboarding.id}/${action}`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `onboarding-${action}-${onboarding.id}-${Date.now()}`
      },
      body: JSON.stringify(action === "cancel" ? { reason } : {})
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Operacao de Onboarding nao concluida.");
        setOnboarding((await response.json()) as OnboardingView);
        setMessage("Operacao concluida.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function addTask() {
    if (!onboarding) return;
    fetch(`/api/organizations/${organizationId}/onboardings/${onboarding.id}/tasks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        title: taskTitle,
        description: taskDescription || null,
        isRequired: taskRequired,
        assigneeMembershipId: taskAssignee || null,
        dueAt: taskDueAt || null,
        creationReason: taskReason || null
      })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel criar tarefa.");
        setTaskTitle("");
        setTaskDescription("");
        setTaskReason("");
        setMessage("Tarefa criada.");
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function taskAction(taskId: string, action: "complete" | "cancel") {
    fetch(`/api/organizations/${organizationId}/onboarding-tasks/${taskId}/${action}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(action === "cancel" ? { reason } : {})
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Operacao de tarefa nao concluida.");
        setMessage("Tarefa atualizada.");
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function assignTask(taskId: string, assigneeMembershipId: string) {
    fetch(`/api/organizations/${organizationId}/onboarding-tasks/${taskId}/assignment`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ assigneeMembershipId })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel atribuir tarefa.");
        setMessage("Responsavel atualizado.");
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  return (
    <section className="panel onboarding-panel">
      <span>Onboarding</span>
      <label>
        Candidatura hired
        <select
          value={applicationId}
          onChange={(event) => {
            setApplicationId(event.target.value);
            setOnboarding(null);
            if (event.target.value) load(event.target.value);
          }}
        >
          <option value="">Selecione</option>
          {hiredApplications.map((application) => (
            <option key={application.id} value={application.id}>
              {application.candidate?.fullName ??
                application.candidate?.full_name ??
                application.candidateId ??
                application.id}
            </option>
          ))}
        </select>
      </label>

      {canManage && applicationId && !onboarding && (
        <div className="form-grid">
          <input
            aria-label="Data prevista de inicio"
            type="date"
            value={expectedStartDate}
            onChange={(event) => setExpectedStartDate(event.target.value)}
          />
          <button type="button" onClick={createOnboarding}>
            Criar Onboarding
          </button>
        </div>
      )}

      {onboarding && (
        <>
          <p>
            {onboarding.status} - {onboarding.progress.percent}% ({onboarding.progress.numerator}/
            {onboarding.progress.denominator})
          </p>

          {canManage && (
            <div className="actions">
              <button type="button" onClick={() => postOnboardingAction("start")}>
                Iniciar
              </button>
              <button type="button" onClick={() => postOnboardingAction("complete")}>
                Concluir
              </button>
              <input
                aria-label="Motivo operacional de Onboarding"
                placeholder="Motivo"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <button type="button" onClick={() => postOnboardingAction("cancel")}>
                Cancelar
              </button>
            </div>
          )}

          {canManage && (
            <div className="form-grid">
              <input
                aria-label="Titulo da tarefa"
                placeholder="Titulo"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
              />
              <textarea
                aria-label="Descricao da tarefa"
                placeholder="Descricao"
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={taskRequired}
                  onChange={(event) => setTaskRequired(event.target.checked)}
                />
                Obrigatoria
              </label>
              <select
                aria-label="Responsavel da tarefa"
                value={taskAssignee}
                onChange={(event) => setTaskAssignee(event.target.value)}
              >
                <option value="">Sem responsavel</option>
                {activeMemberships.map((membership) => (
                  <option key={membership.id} value={membership.id}>
                    {membership.user?.name ?? membership.id} - {membership.role}
                  </option>
                ))}
              </select>
              <input
                aria-label="Prazo da tarefa"
                type="datetime-local"
                value={taskDueAt}
                onChange={(event) => setTaskDueAt(event.target.value)}
              />
              <input
                aria-label="Motivo da tarefa"
                placeholder="Motivo para ad hoc em andamento"
                value={taskReason}
                onChange={(event) => setTaskReason(event.target.value)}
              />
              <button type="button" onClick={addTask}>
                Adicionar tarefa
              </button>
            </div>
          )}

          <ul className="competency-list">
            {onboarding.tasks.map((task) => (
              <li key={task.id}>
                <strong>{task.title}</strong>
                <small>
                  {task.status} - {task.isRequired ? "required" : "optional"}
                </small>
                {task.description && <p>{task.description}</p>}
                {canManage && task.status === "open" && (
                  <select
                    aria-label="Reatribuir tarefa"
                    value={task.assigneeMembershipId ?? ""}
                    onChange={(event) => assignTask(task.id, event.target.value)}
                  >
                    <option value="">Sem responsavel</option>
                    {activeMemberships.map((membership) => (
                      <option key={membership.id} value={membership.id}>
                        {membership.user?.name ?? membership.id} - {membership.role}
                      </option>
                    ))}
                  </select>
                )}
                {task.status === "open" && (
                  <div className="actions">
                    <button type="button" onClick={() => taskAction(task.id, "complete")}>
                      Concluir tarefa
                    </button>
                    {canManage && (
                      <button type="button" onClick={() => taskAction(task.id, "cancel")}>
                        Cancelar tarefa
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="message" role="status">
        {message}
      </p>
    </section>
  );
}
