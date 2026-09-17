import { useCallback, useEffect, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Textarea } from "../../components/ui/Textarea";

// Migrado para o Design System v1 na Wave 3 (visual apenas -- toda a logica interna, chamadas
// de API e sequencia de operacoes permanecem identicas ao componente original de Fase 25).
//
// Fase 25 (SPEC-017 v1.0). Employment e o aggregate root obrigatorio: o painel so opera depois
// que um Employment active for selecionado. Nunca mostra score, ranking, risco percentual ou
// rating -- essa informacao nao existe fisicamente (SPEC-017 s21 "Retention semantics"). Nao
// ha uso de AI Gateway neste modulo -- por isso nenhum AiBadge e aplicado.
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

const planStatusTone: Record<PlanView["status"], BadgeTone> = {
  draft: "neutral",
  active: "info",
  completed: "success",
  cancelled: "danger",
  closed_due_to_employment_end: "neutral"
};

const openItemTone: Record<string, BadgeTone> = {
  open: "warning",
  completed: "success",
  resolved: "success",
  cancelled: "neutral"
};

// Goals, retention concerns e retention actions tem o mesmo formato de apresentacao (titulo/
// descricao + status + duas transicoes possiveis) mas vocabularios de transicao diferentes
// (complete/cancel vs resolve/cancel) -- por isso viram uma funcao local em vez de um
// componente compartilhado entre arquivos (contratos proximos demais para duplicar, distantes
// demais para forcar em outros dominios como Onboarding/Offboarding).
function StatusItemList<T extends { id: string; status: string }>({
  items,
  emptyTitle,
  renderTitle,
  renderMeta,
  primaryAction,
  secondaryAction
}: {
  items: T[];
  emptyTitle: string;
  renderTitle: (item: T) => string;
  renderMeta?: (item: T) => string | undefined;
  primaryAction?: { label: string; onClick: (item: T) => void };
  secondaryAction?: { label: string; onClick: (item: T) => void };
}) {
  return (
    <DataList
      items={items}
      keyExtractor={(item) => item.id}
      emptyTitle={emptyTitle}
      renderItem={(item) => (
        <DataListItem
          title={renderTitle(item)}
          status={<Badge tone={openItemTone[item.status] ?? "neutral"}>{item.status}</Badge>}
          meta={renderMeta?.(item)}
          actions={
            item.status === "open" && (
              <>
                {primaryAction && (
                  <Button size="sm" onClick={() => primaryAction.onClick(item)}>
                    {primaryAction.label}
                  </Button>
                )}
                {secondaryAction && (
                  <Button size="sm" variant="danger" onClick={() => secondaryAction.onClick(item)}>
                    {secondaryAction.label}
                  </Button>
                )}
              </>
            )
          }
        />
      )}
    />
  );
}

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
    <div className="ds-feature">
      <SectionHeader
        title="Desenvolvimento e Retenção"
        description="Plano de desenvolvimento, objetivos, check-ins e questões/ações de retenção ficam vinculados a um Employment active. Nenhum score, ranking ou risco percentual é calculado aqui — tudo é registro humano explícito."
      />

      {message && <Alert tone="info">{message}</Alert>}

      <Card>
        <Select
          label="Employment"
          value={employmentId}
          onChange={(event) => setEmploymentId(event.target.value)}
        >
          <option value="">Selecione um Employment active</option>
          {employments.map((employment) => (
            <option key={employment.id} value={employment.id}>
              {employment.id}
            </option>
          ))}
        </Select>

        {employmentId && !plan && (
          <FormSection
            title="Novo plano de desenvolvimento"
            actions={<Button onClick={createPlan}>Criar plano</Button>}
          >
            <Input
              label="Título do plano"
              placeholder="Título"
              value={planTitle}
              onChange={(event) => setPlanTitle(event.target.value)}
            />
            <Textarea
              label="Finalidade (opcional)"
              placeholder="Finalidade"
              value={planPurpose}
              onChange={(event) => setPlanPurpose(event.target.value)}
            />
          </FormSection>
        )}
      </Card>

      {plan && (
        <>
          <Card>
            <CardHeader
              title={plan.title}
              action={<Badge tone={planStatusTone[plan.status]}>{plan.status}</Badge>}
            />
            {plan.status === "draft" && (
              <div className="ds-form-section__actions">
                <Button onClick={() => planTransition("activate")}>Ativar plano</Button>
                <Button variant="danger" onClick={() => planTransition("cancel")}>
                  Cancelar plano
                </Button>
              </div>
            )}
            {plan.status === "active" && (
              <div className="ds-form-section__actions">
                <Button onClick={() => planTransition("complete")}>Completar plano</Button>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Goals" />
            {(plan.status === "draft" || plan.status === "active") && (
              <FormSection
                title="Novo goal"
                actions={<Button onClick={createGoal}>Adicionar goal</Button>}
              >
                <Input
                  label="Título do goal"
                  placeholder="Novo goal"
                  value={goalTitle}
                  onChange={(event) => setGoalTitle(event.target.value)}
                />
              </FormSection>
            )}
            <StatusItemList
              items={plan.goals}
              emptyTitle="Nenhum goal registrado"
              renderTitle={(goal) => goal.title}
              primaryAction={{
                label: "Completar",
                onClick: (goal) => goalTransition(goal.id, "complete")
              }}
              secondaryAction={{
                label: "Cancelar",
                onClick: (goal) => goalTransition(goal.id, "cancel")
              }}
            />
          </Card>

          <Card>
            <CardHeader title="Check-ins" />
            {plan.status === "active" && (
              <FormSection
                title="Novo check-in"
                actions={<Button onClick={createCheckIn}>Registrar check-in</Button>}
              >
                <Input
                  label="Resumo do acompanhamento"
                  placeholder="Resumo do acompanhamento"
                  value={checkInSummary}
                  onChange={(event) => setCheckInSummary(event.target.value)}
                />
              </FormSection>
            )}
            <DataList
              items={plan.checkIns}
              keyExtractor={(checkIn) => checkIn.id}
              emptyTitle="Nenhum check-in registrado"
              renderItem={(checkIn) => <DataListItem title={checkIn.summary} />}
            />
          </Card>
        </>
      )}

      {employmentId && (
        <>
          <Card>
            <CardHeader title="Retention concerns" />
            <FormSection
              title="Registrar concern"
              actions={<Button onClick={createConcern}>Registrar</Button>}
            >
              <Input
                label="Questão de retenção observada"
                placeholder="Questão de retenção observada"
                value={concernDescription}
                onChange={(event) => setConcernDescription(event.target.value)}
              />
            </FormSection>
            <StatusItemList
              items={concerns}
              emptyTitle="Nenhuma retention concern registrada"
              renderTitle={(concern) => concern.description}
              primaryAction={{
                label: "Resolver",
                onClick: (concern) => concernTransition(concern.id, "resolve")
              }}
              secondaryAction={{
                label: "Cancelar",
                onClick: (concern) => concernTransition(concern.id, "cancel")
              }}
            />
          </Card>

          <Card>
            <CardHeader title="Retention actions" />
            <FormSection
              title="Registrar ação"
              actions={<Button onClick={createAction}>Registrar</Button>}
            >
              <Input
                label="Ação humana de retenção"
                placeholder="Ação humana de retenção"
                value={actionDescription}
                onChange={(event) => setActionDescription(event.target.value)}
              />
            </FormSection>
            <StatusItemList
              items={actions}
              emptyTitle="Nenhuma retention action registrada"
              renderTitle={(action) => action.description}
              primaryAction={{
                label: "Completar",
                onClick: (action) => actionTransition(action.id, "complete")
              }}
              secondaryAction={{
                label: "Cancelar",
                onClick: (action) => actionTransition(action.id, "cancel")
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
