import type { CandidateApplication, Interview, InterviewDraft, InterviewType } from "../../App";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Textarea } from "../../components/ui/Textarea";
import { applicationCandidateName, applicationStatusOf } from "../selection/application-helpers";
import {
  interviewApplicationId,
  interviewScheduledEnd,
  interviewScheduledStart
} from "./interview-helpers";

export type InterviewsPanelProps = {
  canManage: boolean;
  interviews: Interview[];
  applications: CandidateApplication[];
  draft: InterviewDraft;
  onDraftChange: (patch: Partial<InterviewDraft>) => void;
  onCreate: () => void;
  onSchedule: (interview: Interview) => void;
  onChangeStatus: (interview: Interview, action: "start" | "cancel" | "no-show") => void;
};

const statusTone: Record<Interview["status"], BadgeTone> = {
  draft: "neutral",
  scheduled: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "danger",
  no_show: "danger"
};

const statusLabel: Record<Interview["status"], string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
  no_show: "No-show"
};

const INTERVIEW_TYPES: InterviewType[] = [
  "screening",
  "behavioral",
  "technical",
  "cultural",
  "leadership",
  "management",
  "panel",
  "final",
  "other"
];

export function InterviewsPanel({
  canManage,
  interviews,
  applications,
  draft,
  onDraftChange,
  onCreate,
  onSchedule,
  onChangeStatus
}: InterviewsPanelProps) {
  const activeApplications = applications.filter(
    (application) => applicationStatusOf(application) === "active"
  );

  return (
    <div className="ds-feature">
      <SectionHeader
        title="Entrevistas"
        description="Entrevistas vinculadas às candidaturas ativas, com agenda e status."
      />

      <div className={`ds-feature__layout${canManage ? "" : " ds-feature__layout--single"}`}>
        <div className="ds-feature__main">
          <DataList
            items={interviews}
            keyExtractor={(interview) => interview.id}
            emptyTitle="Nenhuma entrevista cadastrada"
            renderItem={(interview) => {
              const application = applications.find(
                (candidate) => candidate.id === interviewApplicationId(interview)
              );
              const start = interviewScheduledStart(interview);
              const end = interviewScheduledEnd(interview);
              return (
                <DataListItem
                  title={interview.title}
                  status={
                    <Badge tone={statusTone[interview.status]}>
                      {statusLabel[interview.status]}
                    </Badge>
                  }
                  meta={
                    <>
                      <span>
                        {application ? applicationCandidateName(application) : interview.id} ·{" "}
                        {interview.type}
                      </span>
                      <span>
                        {start
                          ? `${new Date(start).toLocaleString()} até ${new Date(end).toLocaleString()}`
                          : "sem agenda"}
                      </span>
                    </>
                  }
                  actions={
                    canManage && (
                      <>
                        {interview.status === "draft" && (
                          <Button size="sm" variant="primary" onClick={() => onSchedule(interview)}>
                            Agendar
                          </Button>
                        )}
                        {interview.status === "scheduled" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onChangeStatus(interview, "start")}
                          >
                            Iniciar
                          </Button>
                        )}
                        {["draft", "scheduled", "in_progress"].includes(interview.status) && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => onChangeStatus(interview, "cancel")}
                          >
                            Cancelar
                          </Button>
                        )}
                        {interview.status === "scheduled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onChangeStatus(interview, "no-show")}
                          >
                            No-show
                          </Button>
                        )}
                      </>
                    )
                  }
                />
              );
            }}
          />
        </div>

        {canManage && (
          <div className="ds-feature__aside">
            <Card>
              <FormSection
                title="Nova entrevista"
                actions={<Button onClick={onCreate}>Criar entrevista</Button>}
              >
                <Select
                  label="Candidatura"
                  value={draft.candidateApplicationId}
                  onChange={(event) =>
                    onDraftChange({ candidateApplicationId: event.target.value })
                  }
                >
                  <option value="">Candidatura ativa</option>
                  {activeApplications.map((application) => (
                    <option key={application.id} value={application.id}>
                      {applicationCandidateName(application)}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Título"
                  placeholder="Título"
                  value={draft.title}
                  onChange={(event) => onDraftChange({ title: event.target.value })}
                />
                <Select
                  label="Tipo"
                  value={draft.type}
                  onChange={(event) => onDraftChange({ type: event.target.value as InterviewType })}
                >
                  {INTERVIEW_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </FormSection>
            </Card>

            <Card>
              <FormSection
                title="Agenda"
                description="Usada por “Agendar” e pelo motivo de cancelamento/no-show na lista ao lado."
              >
                <Input
                  label="Início"
                  type="datetime-local"
                  value={draft.scheduledStartAt}
                  onChange={(event) => onDraftChange({ scheduledStartAt: event.target.value })}
                />
                <Input
                  label="Fim"
                  type="datetime-local"
                  value={draft.scheduledEndAt}
                  onChange={(event) => onDraftChange({ scheduledEndAt: event.target.value })}
                />
                <Input
                  label="Fuso horário"
                  placeholder="Timezone"
                  value={draft.timezone}
                  onChange={(event) => onDraftChange({ timezone: event.target.value })}
                />
                <Select
                  label="Local"
                  value={draft.locationType}
                  onChange={(event) =>
                    onDraftChange({
                      locationType: event.target.value as InterviewDraft["locationType"]
                    })
                  }
                >
                  {["onsite", "video", "phone", "other"].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Detalhes do local"
                  placeholder="Detalhes do local"
                  value={draft.locationDetails}
                  onChange={(event) => onDraftChange({ locationDetails: event.target.value })}
                />
                <Textarea
                  label="Motivo"
                  placeholder="Motivo para cancelamento ou no-show"
                  value={draft.reason}
                  onChange={(event) => onDraftChange({ reason: event.target.value })}
                />
              </FormSection>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
