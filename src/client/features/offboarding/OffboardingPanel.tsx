import { useCallback, useMemo, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Checkbox } from "../../components/ui/Checkbox";
import { ConfigStatus } from "../../components/ui/ConfigStatus";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Textarea } from "../../components/ui/Textarea";
import { TaskList } from "../shared/TaskList";
import type { LifecycleTaskView, MembershipOption } from "../shared/types";

// Migrado para o Design System v1 na Wave 3 (visual apenas -- toda a logica interna, chamadas
// de API e sequencia de operacoes permanecem identicas ao componente original de Fase 27).
// SPEC-026 s17/s20: nao ha operacao desta tela que chame User/Membership -- as unicas acoes
// sao create/start/tasks/complete/cancel do processo. Nenhum botao de "revogar acesso": a
// revogacao de acesso e responsabilidade exclusiva de AccessGrant/Membership.

// Fase 27 (SPEC-026 v1.0 s8): somente `active`/`ended` sao elegiveis para criar Offboarding --
// nunca `pending` nem `cancelled`. Reaproveita o endpoint ja existente de listagem de
// Employments (owner/admin), sem criar rota nova.
type EmploymentOption = {
  id: string;
  status: "pending" | "active" | "ended" | "cancelled";
};

type OffboardingView = {
  id: string;
  employmentId: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  exitCategory: string | null;
  expectedLastDay: string | null;
  progress: { numerator: number; denominator: number; percent: number };
  tasks: LifecycleTaskView[];
};

const EXIT_CATEGORIES = [
  "voluntary_resignation",
  "involuntary_termination",
  "end_of_contract",
  "mutual_agreement",
  "other_minimized"
] as const;

const statusTone = {
  draft: "neutral",
  in_progress: "info",
  completed: "success",
  cancelled: "danger"
} as const;

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
    <div className="ds-feature">
      <SectionHeader
        title="Offboarding"
        description="Processo de desligamento e suas tarefas operacionais. Concluir o Offboarding não revoga acesso automaticamente — a revogação de Membership acontece em Ciclo de Vida de Acesso."
      />

      {message && <Alert tone="info">{message}</Alert>}

      <Card>
        <CardHeader title="Employment" />
        {canManage && (
          <FormSection
            title="Selecionar Employment"
            actions={
              <Button variant="secondary" onClick={loadEligibleEmployments}>
                Carregar Employments elegíveis
              </Button>
            }
          >
            <Select
              label="Employment para offboarding"
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
            </Select>
          </FormSection>
        )}

        {canManage && employmentId && !offboarding && (
          <FormSection
            title="Criar Offboarding"
            actions={<Button onClick={createOffboarding}>Criar Offboarding</Button>}
          >
            <Select
              label="Categoria operacional de saída"
              value={exitCategory}
              onChange={(event) => setExitCategory(event.target.value)}
            >
              <option value="">Sem categoria</option>
              {EXIT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <Input
              label="Último dia esperado"
              type="date"
              value={expectedLastDay}
              onChange={(event) => setExpectedLastDay(event.target.value)}
            />
          </FormSection>
        )}
      </Card>

      {offboarding && (
        <>
          <Card>
            <CardHeader
              title="Status"
              action={<Badge tone={statusTone[offboarding.status]}>{offboarding.status}</Badge>}
            />
            <ConfigStatus
              label={`${offboarding.progress.numerator} de ${offboarding.progress.denominator} concluídas`}
              tone={statusTone[offboarding.status]}
              meta={`${offboarding.progress.percent}%`}
            />

            {canManage && (
              <div className="ds-form-section__actions">
                <Button variant="secondary" onClick={() => postOffboardingAction("start")}>
                  Iniciar
                </Button>
                <Button onClick={() => postOffboardingAction("complete")}>Concluir</Button>
                <Input
                  label="Motivo"
                  placeholder="Motivo operacional de Offboarding"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button variant="danger" onClick={() => postOffboardingAction("cancel")}>
                  Cancelar
                </Button>
              </div>
            )}
          </Card>

          {canManage && (
            <Card>
              <FormSection
                title="Nova tarefa"
                actions={<Button onClick={addTask}>Adicionar tarefa</Button>}
              >
                <Input
                  label="Título"
                  placeholder="Título"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                />
                <Textarea
                  label="Descrição"
                  placeholder="Descrição"
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                />
                <Checkbox
                  label="Obrigatória"
                  checked={taskRequired}
                  onChange={(event) => setTaskRequired(event.target.checked)}
                />
                <Select
                  label="Responsável"
                  value={taskAssignee}
                  onChange={(event) => setTaskAssignee(event.target.value)}
                >
                  <option value="">Sem responsável</option>
                  {activeMemberships.map((membership) => (
                    <option key={membership.id} value={membership.id}>
                      {membership.user?.name ?? membership.id} - {membership.role}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Prazo"
                  type="datetime-local"
                  value={taskDueAt}
                  onChange={(event) => setTaskDueAt(event.target.value)}
                />
                <Input
                  label="Motivo"
                  placeholder="Motivo para tarefa ad hoc em andamento"
                  value={taskReason}
                  onChange={(event) => setTaskReason(event.target.value)}
                />
              </FormSection>
            </Card>
          )}

          <Card>
            <CardHeader title="Tarefas" />
            <TaskList
              tasks={offboarding.tasks}
              canManage={canManage}
              activeMemberships={activeMemberships}
              onComplete={(taskId) => taskAction(taskId, "complete")}
              onCancel={(taskId) => taskAction(taskId, "cancel")}
              onAssign={assignTask}
              emptyTitle="Nenhuma tarefa registrada"
            />
          </Card>
        </>
      )}
    </div>
  );
}
