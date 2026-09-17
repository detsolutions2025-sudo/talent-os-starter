import type {
  Candidate,
  CandidateApplication,
  CandidateApplicationDraft,
  CandidateApplicationStage,
  JobOpening
} from "../../App";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { EmptyState } from "../../components/ui/EmptyState";
import { FormSection } from "../../components/ui/FormSection";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Textarea } from "../../components/ui/Textarea";
import {
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABEL,
  applicationAppliedAtOf,
  applicationCandidateName,
  applicationStageOf,
  applicationStatusOf
} from "./application-helpers";

export type SelectionPanelProps = {
  canManage: boolean;
  canHire: boolean;
  applications: CandidateApplication[];
  candidates: Candidate[];
  jobOpenings: JobOpening[];
  draft: CandidateApplicationDraft;
  onDraftChange: (patch: Partial<CandidateApplicationDraft>) => void;
  onCreate: () => void;
  onMoveStage: (application: CandidateApplication, stage: CandidateApplicationStage) => void;
  onFinalize: (
    application: CandidateApplication,
    action: "withdraw" | "reject" | "hire" | "cancel"
  ) => void;
  onAddNote: (application: CandidateApplication) => void;
};

const statusTone: Record<string, BadgeTone> = {
  active: "info",
  withdrawn: "neutral",
  rejected: "danger",
  hired: "success",
  cancelled: "neutral"
};

const statusLabel: Record<string, string> = {
  active: "Ativa",
  withdrawn: "Retirada",
  rejected: "Rejeitada",
  hired: "Contratado(a)",
  cancelled: "Cancelada"
};

export function SelectionPanel({
  canManage,
  canHire,
  applications,
  candidates,
  jobOpenings,
  draft,
  onDraftChange,
  onCreate,
  onMoveStage,
  onFinalize,
  onAddNote
}: SelectionPanelProps) {
  const activeApplications = applications.filter(
    (application) => applicationStatusOf(application) === "active"
  );
  const finalizedApplications = applications.filter(
    (application) => applicationStatusOf(application) !== "active"
  );
  const openJobOpenings = jobOpenings.filter(
    (opening) => opening.status === "open" && opening.publishedVersion
  );

  return (
    <div className="ds-feature">
      <SectionHeader
        title="Processo Seletivo"
        description="Acompanhe a progressão das candidaturas ativas pelas etapas do processo seletivo."
      />

      <div className={`ds-feature__layout${canManage ? "" : " ds-feature__layout--single"}`}>
        <div className="ds-feature__main">
          {activeApplications.length === 0 ? (
            <EmptyState
              title="Nenhuma candidatura ativa"
              description="Crie uma candidatura vinculando um candidato a uma vaga aberta."
            />
          ) : (
            <div className="ds-pipeline">
              {APPLICATION_STAGES.map((stage) => {
                const stageApplications = activeApplications.filter(
                  (application) => applicationStageOf(application) === stage
                );
                const stageIndex = APPLICATION_STAGES.indexOf(stage);
                return (
                  <div className="ds-pipeline__column" key={stage}>
                    <div className="ds-pipeline__column-header">
                      <span className="ds-pipeline__column-title">
                        {APPLICATION_STAGE_LABEL[stage]}
                      </span>
                      <Badge tone="neutral">{stageApplications.length}</Badge>
                    </div>

                    {stageApplications.length === 0 && <p className="ds-pipeline__empty">Vazio</p>}

                    {stageApplications.map((application) => {
                      const opening = jobOpenings.find(
                        (entry) => entry.id === application.jobOpeningId
                      );
                      return (
                        <div className="ds-pipeline__card" key={application.id}>
                          <strong className="ds-pipeline__card-title">
                            {applicationCandidateName(application)}
                          </strong>
                          <div className="ds-pipeline__card-meta">
                            <span>
                              {opening?.title ??
                                application.job_opening?.title ??
                                application.jobOpeningId ??
                                "vaga"}
                            </span>
                            <span>
                              {application.source ?? "origem restrita"} ·{" "}
                              {applicationAppliedAtOf(application)
                                ? new Date(applicationAppliedAtOf(application)).toLocaleDateString()
                                : "data restrita"}
                            </span>
                          </div>

                          {canManage && (
                            <>
                              <div className="ds-pipeline__card-actions">
                                {stageIndex > 0 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      onMoveStage(application, APPLICATION_STAGES[stageIndex - 1])
                                    }
                                  >
                                    ← Voltar
                                  </Button>
                                )}
                                {stageIndex < APPLICATION_STAGES.length - 1 && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      onMoveStage(application, APPLICATION_STAGES[stageIndex + 1])
                                    }
                                  >
                                    Avançar →
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onAddNote(application)}
                                >
                                  Nota
                                </Button>
                              </div>
                              <div className="ds-pipeline__card-actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onFinalize(application, "withdraw")}
                                >
                                  Retirar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => onFinalize(application, "reject")}
                                >
                                  Rejeitar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => onFinalize(application, "cancel")}
                                >
                                  Cancelar
                                </Button>
                                {canHire && (
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => onFinalize(application, "hire")}
                                  >
                                    Contratar
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          <Card>
            <FormSection title="Finalizadas">
              <DataList
                items={finalizedApplications}
                keyExtractor={(application) => application.id}
                emptyTitle="Nenhuma candidatura finalizada"
                renderItem={(application) => {
                  const status = applicationStatusOf(application);
                  const opening = jobOpenings.find(
                    (entry) => entry.id === application.jobOpeningId
                  );
                  return (
                    <DataListItem
                      title={applicationCandidateName(application)}
                      status={<Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>}
                      meta={
                        <span>
                          {opening?.title ?? application.job_opening?.title ?? "vaga"}
                          {application.finalizationReason
                            ? ` · ${application.finalizationReason}`
                            : ""}
                        </span>
                      }
                    />
                  );
                }}
              />
            </FormSection>
          </Card>
        </div>

        {canManage && (
          <div className="ds-feature__aside">
            <Card>
              <FormSection
                title="Nova candidatura"
                actions={<Button onClick={onCreate}>Criar candidatura</Button>}
              >
                <Select
                  label="Candidato"
                  value={draft.candidateId}
                  onChange={(event) => onDraftChange({ candidateId: event.target.value })}
                >
                  <option value="">Candidato ativo</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.fullName}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Vaga"
                  value={draft.jobOpeningId}
                  onChange={(event) => {
                    const opening = openJobOpenings.find(
                      (entry) => entry.id === event.target.value
                    );
                    onDraftChange({
                      jobOpeningId: event.target.value,
                      jobOpeningVersionId: opening?.publishedVersion?.id ?? ""
                    });
                  }}
                >
                  <option value="">Vaga aberta</option>
                  {openJobOpenings.map((opening) => (
                    <option key={opening.id} value={opening.id}>
                      {opening.title}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Origem"
                  value={draft.source}
                  onChange={(event) => onDraftChange({ source: event.target.value })}
                >
                  {["career_page", "referral", "recruiter", "import", "manual", "other"].map(
                    (source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    )
                  )}
                </Select>
              </FormSection>
            </Card>

            <Card>
              <FormSection
                title="Operações"
                description="Preenchidos aqui, valem para as ações de nota e finalização em qualquer candidatura na lista."
              >
                <Textarea
                  label="Nota interna"
                  placeholder="Nota interna da candidatura"
                  value={draft.note}
                  onChange={(event) => onDraftChange({ note: event.target.value })}
                />
                <Textarea
                  label="Motivo de finalização"
                  placeholder="Motivo de finalização"
                  value={draft.finalizationReason}
                  onChange={(event) => onDraftChange({ finalizationReason: event.target.value })}
                />
              </FormSection>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
