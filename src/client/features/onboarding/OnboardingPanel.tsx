import { useMemo, useState } from "react";
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

// Migrado para o Design System v1 na Wave 3 (visual apenas -- toda a logica interna,
// chamadas de API e sequencia de operacoes permanecem identicas ao componente original de
// Fase 26). Onboarding continua vinculado a uma candidatura hired; o vinculo opcional com
// Employment usa o endpoint de listagem ja existente (nenhuma rota nova).

type ApplicationOption = {
  id: string;
  candidateId?: string;
  candidate?: { fullName?: string; full_name?: string } | null;
  applicationStatus?: string;
  application_status?: string;
};

type OnboardingView = {
  id: string;
  candidateApplicationId: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  expectedPersonStartDate: string | null;
  employmentId?: string | null;
  progress: { numerator: number; denominator: number; percent: number };
  tasks: LifecycleTaskView[];
};

// Fase 26 (SPEC-016 v1.1 s45.1): somente `pending`/`active` sao elegiveis para vinculo.
// Somente identificadores minimos -- nunca nome, e-mail ou qualquer dado da OrganizationPerson.
type EmploymentOption = {
  id: string;
  status: "pending" | "active" | "ended" | "cancelled";
};

const statusTone = {
  draft: "neutral",
  in_progress: "info",
  completed: "success",
  cancelled: "danger"
} as const;

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
  const [employmentOptions, setEmploymentOptions] = useState<EmploymentOption[]>([]);
  const [selectedEmploymentId, setSelectedEmploymentId] = useState("");

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

  // Fase 26 (SPEC-016 v1.1 s45.1, s48): reaproveita o endpoint ja existente de listagem de
  // Employments (owner/admin), sem criar rota nova, e filtra client-side apenas os estados
  // elegiveis para vinculo (pending/active). Employment nao sabe se ja esta vinculado a outro
  // Onboarding -- um conflito de cardinalidade, se ocorrer, e recusado no submit.
  function loadEligibleEmployments() {
    fetch(`/api/organizations/${organizationId}/employments`, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel listar Employments.");
        const all = (await response.json()) as EmploymentOption[];
        setEmploymentOptions(
          all.filter(
            (employment) => employment.status === "pending" || employment.status === "active"
          )
        );
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function linkEmployment() {
    if (!onboarding || !selectedEmploymentId) return;
    fetch(`/api/organizations/${organizationId}/onboardings/${onboarding.id}/employment-link`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "Idempotency-Key": `onboarding-employment-link-${onboarding.id}-${Date.now()}`
      },
      body: JSON.stringify({ employmentId: selectedEmploymentId })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel vincular Employment.");
        setOnboarding((await response.json()) as OnboardingView);
        setMessage("Employment vinculado.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  return (
    <div className="ds-feature">
      <SectionHeader
        title="Onboarding"
        description="Progresso operacional de integração de uma pessoa recém-contratada, com tarefas obrigatórias e opcionais."
      />

      {message && <Alert tone="info">{message}</Alert>}

      <Card>
        <CardHeader title="Candidatura" />
        <Select
          label="Candidatura hired"
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
        </Select>

        {canManage && applicationId && !onboarding && (
          <FormSection
            title="Criar Onboarding"
            actions={<Button onClick={createOnboarding}>Criar Onboarding</Button>}
          >
            <Input
              label="Data prevista de início"
              type="date"
              value={expectedStartDate}
              onChange={(event) => setExpectedStartDate(event.target.value)}
            />
          </FormSection>
        )}
      </Card>

      {onboarding && (
        <>
          <Card>
            <CardHeader
              title="Status"
              action={<Badge tone={statusTone[onboarding.status]}>{onboarding.status}</Badge>}
            />
            <ConfigStatus
              label={`${onboarding.progress.numerator} de ${onboarding.progress.denominator} concluídas`}
              tone={statusTone[onboarding.status]}
              meta={`${onboarding.progress.percent}%`}
              description={
                onboarding.employmentId ? `Employment vinculado: ${onboarding.employmentId}` : null
              }
            />

            {canManage && (
              <div className="ds-form-section__actions">
                <Button variant="secondary" onClick={() => postOnboardingAction("start")}>
                  Iniciar
                </Button>
                <Button onClick={() => postOnboardingAction("complete")}>Concluir</Button>
                <Input
                  label="Motivo"
                  placeholder="Motivo operacional de Onboarding"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button variant="danger" onClick={() => postOnboardingAction("cancel")}>
                  Cancelar
                </Button>
              </div>
            )}

            {canManage &&
              !onboarding.employmentId &&
              (onboarding.status === "draft" || onboarding.status === "in_progress") && (
                <FormSection
                  title="Vincular Employment"
                  actions={
                    <>
                      <Button variant="secondary" onClick={loadEligibleEmployments}>
                        Carregar Employments elegíveis
                      </Button>
                      <Button onClick={linkEmployment} disabled={!selectedEmploymentId}>
                        Vincular Employment
                      </Button>
                    </>
                  }
                >
                  <Select
                    label="Employment para vincular"
                    value={selectedEmploymentId}
                    onChange={(event) => setSelectedEmploymentId(event.target.value)}
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
              tasks={onboarding.tasks}
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
