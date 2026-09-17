import type { JobOpening, JobOpeningDraft } from "../../App";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Checkbox } from "../../components/ui/Checkbox";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { SectionHeader } from "../../components/ui/SectionHeader";

export type JobsPanelProps = {
  canManage: boolean;
  canPublishOpenings: boolean;
  jobOpenings: JobOpening[];
  draft: JobOpeningDraft;
  onDraftChange: (patch: Partial<JobOpeningDraft>) => void;
  publishedJobVersionAvailable: boolean;
  onCreate: () => void;
  onPublishAndOpen: (opening: JobOpening) => void;
  onPublishPublicly: (opening: JobOpening) => void;
};

const statusTone: Record<JobOpening["status"], BadgeTone> = {
  draft: "neutral",
  open: "success",
  paused: "warning",
  closed: "neutral",
  cancelled: "danger"
};

const statusLabel: Record<JobOpening["status"], string> = {
  draft: "Rascunho",
  open: "Aberta",
  paused: "Pausada",
  closed: "Encerrada",
  cancelled: "Cancelada"
};

export function JobsPanel({
  canManage,
  canPublishOpenings,
  jobOpenings,
  draft,
  onDraftChange,
  publishedJobVersionAvailable,
  onCreate,
  onPublishAndOpen,
  onPublishPublicly
}: JobsPanelProps) {
  return (
    <div className="ds-feature">
      <SectionHeader
        title="Vagas"
        description="Publique cargos já aprovados como vagas abertas e divulgue publicamente quando estiverem prontas."
      />

      <div className={`ds-feature__layout${canManage ? "" : " ds-feature__layout--single"}`}>
        <div className="ds-feature__main">
          <DataList
            items={jobOpenings}
            keyExtractor={(opening) => opening.id}
            emptyTitle="Nenhuma vaga cadastrada"
            emptyDescription="Crie a primeira vaga a partir de um cargo com versão publicada."
            renderItem={(opening) => (
              <DataListItem
                title={opening.title}
                status={
                  <Badge tone={statusTone[opening.status]}>{statusLabel[opening.status]}</Badge>
                }
                meta={
                  <>
                    <span>
                      {opening.code} · {opening.isPubliclyAvailable ? "pública" : "restrita"}
                    </span>
                    {opening.publishedVersion && (
                      <span>
                        {opening.publishedVersion.publicTitle} ·{" "}
                        {opening.publishedVersion.positionsCount} posição(ões)
                      </span>
                    )}
                  </>
                }
                actions={
                  <>
                    {canPublishOpenings && opening.status === "draft" && (
                      <Button size="sm" variant="primary" onClick={() => onPublishAndOpen(opening)}>
                        Publicar e abrir
                      </Button>
                    )}
                    {canManage && opening.status === "open" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onPublishPublicly(opening)}
                      >
                        Divulgar
                      </Button>
                    )}
                  </>
                }
              />
            )}
          />
        </div>

        {canManage && (
          <div className="ds-feature__aside">
            <Card>
              <FormSection
                title="Nova vaga"
                actions={
                  <Button onClick={onCreate} disabled={!publishedJobVersionAvailable}>
                    Criar vaga
                  </Button>
                }
              >
                <Input
                  label="Código"
                  placeholder="Código"
                  value={draft.code}
                  onChange={(event) => onDraftChange({ code: event.target.value })}
                />
                <Input
                  label="Título interno"
                  placeholder="Título interno"
                  value={draft.title}
                  onChange={(event) => onDraftChange({ title: event.target.value })}
                />
                <Input
                  label="Título público"
                  placeholder="Título público"
                  value={draft.publicTitle}
                  onChange={(event) => onDraftChange({ publicTitle: event.target.value })}
                />
                <Input
                  label="Quantidade de posições"
                  type="number"
                  min="1"
                  max="1000"
                  value={draft.positionsCount}
                  onChange={(event) =>
                    onDraftChange({ positionsCount: Number(event.target.value) })
                  }
                />
              </FormSection>
            </Card>

            <Card>
              <FormSection
                title="Divulgação pública"
                description="Preencha e use o botão “Divulgar” na vaga desejada, na lista ao lado."
              >
                <Input
                  label="Slug público"
                  placeholder="slug-publico"
                  value={draft.publicSlug}
                  onChange={(event) => onDraftChange({ publicSlug: event.target.value })}
                />
                <Input
                  label="Prazo de candidatura"
                  type="datetime-local"
                  value={draft.applicationDeadline}
                  onChange={(event) => onDraftChange({ applicationDeadline: event.target.value })}
                />
                <Checkbox
                  label="Exibir faixa salarial publicamente"
                  checked={draft.showSalary}
                  onChange={(event) => onDraftChange({ showSalary: event.target.checked })}
                />
              </FormSection>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
