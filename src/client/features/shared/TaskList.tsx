import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { Select } from "../../components/ui/Select";
import type { LifecycleTaskView, MembershipOption } from "./types";

export type TaskListProps = {
  tasks: LifecycleTaskView[];
  canManage: boolean;
  activeMemberships: MembershipOption[];
  onComplete: (taskId: string) => void;
  onCancel: (taskId: string) => void;
  onAssign: (taskId: string, membershipId: string) => void;
  emptyTitle: string;
};

// Compartilhado por Onboarding e Offboarding (Wave 3): os dois dominios tem tarefas com o
// mesmo formato e as mesmas regras de apresentacao. O componente e puramente apresentacional
// -- quem decide se uma tarefa pode ser concluida/cancelada/reatribuida continua sendo o
// painel dono do estado (ele so chama os callbacks recebidos). Concluir tarefa fica visivel
// para qualquer usuario com uma tarefa aberta (nao so canManage) -- mesma regra dos paineis
// originais.
export function TaskList({
  tasks,
  canManage,
  activeMemberships,
  onComplete,
  onCancel,
  onAssign,
  emptyTitle
}: TaskListProps) {
  return (
    <DataList
      items={tasks}
      keyExtractor={(task) => task.id}
      emptyTitle={emptyTitle}
      renderItem={(task) => (
        <DataListItem
          title={task.title}
          status={
            <>
              <Badge
                tone={
                  task.status === "completed"
                    ? "success"
                    : task.status === "cancelled"
                      ? "neutral"
                      : "info"
                }
              >
                {task.status}
              </Badge>
              {task.isRequired && task.status === "open" && (
                <Badge tone="warning">obrigatória</Badge>
              )}
            </>
          }
          meta={
            <>
              {task.description && <span>{task.description}</span>}
              {task.dueAt && <span>Prazo: {task.dueAt}</span>}
              {task.status === "cancelled" && task.cancellationReason && (
                <span>Motivo do cancelamento: {task.cancellationReason}</span>
              )}
            </>
          }
          actions={
            task.status === "open" && (
              <>
                {canManage && (
                  <Select
                    aria-label={`Reatribuir tarefa: ${task.title}`}
                    value={task.assigneeMembershipId ?? ""}
                    onChange={(event) => onAssign(task.id, event.target.value)}
                  >
                    <option value="">Sem responsável</option>
                    {activeMemberships.map((membership) => (
                      <option key={membership.id} value={membership.id}>
                        {membership.user?.name ?? membership.id} - {membership.role}
                      </option>
                    ))}
                  </Select>
                )}
                <Button size="sm" onClick={() => onComplete(task.id)}>
                  Concluir tarefa
                </Button>
                {canManage && (
                  <Button size="sm" variant="danger" onClick={() => onCancel(task.id)}>
                    Cancelar tarefa
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
