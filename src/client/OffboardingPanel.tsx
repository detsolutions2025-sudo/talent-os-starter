import { useCallback, useMemo, useState } from "react";

// Fase 27 (SPEC-026 v1.0 s8): somente `active`/`ended` sao elegiveis para criar
// Offboarding -- nunca `pending` nem `cancelled`. Reaproveita o endpoint ja
// existente de listagem de Employments (owner/admin), sem criar rota nova.
type EmploymentOption = {
  id: string;
  status: "pending" | "active" | "ended" | "cancelled";
};

type MembershipOption = {
  id: string;
  role: "owner" | "admin" | "member";
  status: "active" | "inactive";
  user?: { name: string; email: string } | null;
};

type OffboardingTaskView = {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  status: "open" | "completed" | "cancelled";
  assigneeMembershipId: string | null;
  dueAt: string | null;
  cancellationReason: string | null;
};

type OffboardingView = {
  id: string;
  employmentId: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  exitCategory: string | null;
  expectedLastDay: string | null;
  progress: { numerator: number; denominator: number; percent: number };
  tasks: OffboardingTaskView[];
};

const EXIT_CATEGORIES = [
  "voluntary_resignation",
  "involuntary_termination",
  "end_of_contract",
  "mutual_agreement",
  "other_minimized"
] as const;

export function OffboardingPanel({
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

  const [employmentOptions, setEmploymentOptions] = useState<EmploymentOption[]>([]);
  const [employmentId, setEmploymentId] = useState("");
  const [offboarding, setOffboarding] = useState<OffboardingView | null>(null);
  const [exitCategory, setExitCategory] = useState("");
  const [expectedLastDay, setExpectedLastDay] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskRequired, setTaskRequired] = useState(true);
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskReason, setTaskReason] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  // SPEC-026 s17/s20: nao ha operacao desta tela que chame User/Membership -- as unicas acoes
  // sao create/start/tasks/complete/cancel do processo. Nenhum botao de "revogar acesso".
  const loadEligibleEmployments = useCallback(() => {
    if (!canManage) return;
    fetch(`/api/organizations/${organizationId}/employments`, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel listar Employments.");
        const all = (await response.json()) as EmploymentOption[];
        setEmploymentOptions(
          all.filter(
            (employment) => employment.status === "active" || employment.status === "ended"
          )
        );
      })
      .catch((error: Error) => setMessage(error.message));
  }, [canManage, headers, organizationId]);

  function loadOffboarding(nextEmploymentId = employmentId) {
    if (!nextEmploymentId) return;
    fetch(`/api/organizations/${organizationId}/employments/${nextEmploymentId}/offboardings`, {
      headers
    })
      .then(async (response) => {
        if (!response.ok) {
          setOffboarding(null);
          return;
        }
        const list = (await response.json()) as OffboardingView[];
        // SPEC-026 s14.1: no maximo um Offboarding nao-final por Employment -- exibe o mais
        // recente nao-final, ou o mais recente historico se nao houver nenhum em curso.
        const nonFinal = list.find(
          (item) => item.status === "draft" || item.status === "in_progress"
        );
        setOffboarding(nonFinal ?? list[0] ?? null);
      })
      .catch(() => setOffboarding(null));
  }

  function createOffboarding() {
    if (!employmentId) {
      setMessage("Selecione um Employment elegivel (active ou ended).");
      return;
    }
    fetch(`/api/organizations/${organizationId}/employments/${employmentId}/offboardings`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `offboarding-create-${employmentId}-${Date.now()}`
      },
      body: JSON.stringify({
        exitCategory: exitCategory || null,
        expectedLastDay: expectedLastDay || null
      })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel criar Offboarding.");
        setOffboarding((await response.json()) as OffboardingView);
        setMessage("Offboarding criado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function postOffboardingAction(action: "start" | "complete" | "cancel") {
    if (!offboarding) return;
    fetch(`/api/organizations/${organizationId}/offboardings/${offboarding.id}/${action}`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `offboarding-${action}-${offboarding.id}-${Date.now()}`
      },
      body: JSON.stringify(action === "cancel" ? { reason } : {})
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Operacao de Offboarding nao concluida.");
        setOffboarding((await response.json()) as OffboardingView);
        setMessage("Operacao concluida.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function addTask() {
    if (!offboarding) return;
    fetch(`/api/organizations/${organizationId}/offboardings/${offboarding.id}/tasks`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `offboarding-task-add-${offboarding.id}-${Date.now()}`
      },
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
        loadOffboarding();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function taskAction(taskId: string, action: "complete" | "cancel") {
    fetch(`/api/organizations/${organizationId}/offboarding-tasks/${taskId}/${action}`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `offboarding-task-${action}-${taskId}-${Date.now()}`
      },
      body: JSON.stringify(action === "cancel" ? { reason } : {})
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Operacao de tarefa nao concluida.");
        setMessage("Tarefa atualizada.");
        loadOffboarding();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function assignTask(taskId: string, assigneeMembershipId: string) {
    fetch(`/api/organizations/${organizationId}/offboarding-tasks/${taskId}/assign`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `offboarding-task-assign-${taskId}-${Date.now()}`
      },
      body: JSON.stringify({ assigneeMembershipId })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel atribuir tarefa.");
        setMessage("Responsavel atualizado.");
        loadOffboarding();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  return (
    <section className="panel offboarding-panel">
      <span>Offboarding</span>

      {canManage && (
        <div className="form-grid">
          <button type="button" onClick={loadEligibleEmployments}>
            Carregar Employments elegiveis
          </button>
          <select
            aria-label="Employment para offboarding"
            value={employmentId}
            onChange={(event) => {
              setEmploymentId(event.target.value);
              setOffboarding(null);
              if (event.target.value) loadOffboarding(event.target.value);
            }}
          >
            <option value="">Selecione um Employment</option>
            {employmentOptions.map((employment) => (
              <option key={employment.id} value={employment.id}>
                {employment.id} - {employment.status}
              </option>
            ))}
          </select>
        </div>
      )}

      {canManage && employmentId && !offboarding && (
        <div className="form-grid">
          <select
            aria-label="Categoria operacional de saida"
            value={exitCategory}
            onChange={(event) => setExitCategory(event.target.value)}
          >
            <option value="">Sem categoria</option>
            {EXIT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            aria-label="Ultimo dia esperado"
            type="date"
            value={expectedLastDay}
            onChange={(event) => setExpectedLastDay(event.target.value)}
          />
          <button type="button" onClick={createOffboarding}>
            Criar Offboarding
          </button>
        </div>
      )}

      {offboarding && (
        <>
          <p>
            {offboarding.status} - {offboarding.progress.percent}% ({offboarding.progress.numerator}
            /{offboarding.progress.denominator})
          </p>

          {canManage && (
            <div className="actions">
              <button type="button" onClick={() => postOffboardingAction("start")}>
                Iniciar
              </button>
              <button type="button" onClick={() => postOffboardingAction("complete")}>
                Concluir
              </button>
              <input
                aria-label="Motivo operacional de Offboarding"
                placeholder="Motivo"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <button type="button" onClick={() => postOffboardingAction("cancel")}>
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
            {offboarding.tasks.map((task) => (
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
