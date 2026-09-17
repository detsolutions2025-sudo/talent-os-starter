import type { JobProfile, JobProfileDraft, JobProfileVersion } from "../../App";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConfigStatus } from "../../components/ui/ConfigStatus";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { EmptyState } from "../../components/ui/EmptyState";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Textarea } from "../../components/ui/Textarea";

export type JobProfilesPanelProps = {
  canManage: boolean;
  canPublish: boolean;
  jobProfiles: JobProfile[];
  inactiveJobProfiles: JobProfile[];
  selectedJobProfileId: string;
  onSelectJobProfile: (jobProfileId: string) => void;
  draft: JobProfileDraft;
  onDraftChange: (patch: Partial<JobProfileDraft>) => void;
  onCreate: () => void;
  publishedJobVersion: JobProfileVersion | null;
  jobDraftVersion: JobProfileVersion | null;
  jobProfileHistory: JobProfileVersion[];
  onCreateDraft: () => void;
  onUpdateDraftField: <K extends keyof JobProfileVersion>(
    field: K,
    value: JobProfileVersion[K]
  ) => void;
  onSaveDraft: () => void;
  onPublishDraft: () => void;
  onDiscardDraft: () => void;
};

export function JobProfilesPanel({
  canManage,
  canPublish,
  jobProfiles,
  inactiveJobProfiles,
  selectedJobProfileId,
  onSelectJobProfile,
  draft,
  onDraftChange,
  onCreate,
  publishedJobVersion,
  jobDraftVersion,
  jobProfileHistory,
  onCreateDraft,
  onUpdateDraftField,
  onSaveDraft,
  onPublishDraft,
  onDiscardDraft
}: JobProfilesPanelProps) {
  const allProfiles = [...jobProfiles, ...inactiveJobProfiles];

  return (
    <div className="ds-feature">
      <SectionHeader
        title="Cargos"
        description="Cargos e suas versões publicadas — base para abrir vagas em Recrutamento."
      />

      <div className="ds-feature__layout">
        <div className="ds-feature__main">
          <DataList
            items={allProfiles}
            keyExtractor={(profile) => profile.id}
            emptyTitle="Nenhum cargo cadastrado"
            renderItem={(profile) => (
              <DataListItem
                title={profile.name}
                selected={profile.id === selectedJobProfileId}
                onSelect={() => onSelectJobProfile(profile.id)}
                meta={
                  <span>
                    {profile.code} · {profile.status}
                  </span>
                }
              />
            )}
          />

          {canManage && (
            <Card>
              <FormSection
                title="Novo cargo"
                actions={<Button onClick={onCreate}>Criar cargo</Button>}
              >
                <Input
                  label="Código"
                  placeholder="Código"
                  value={draft.code}
                  onChange={(event) => onDraftChange({ code: event.target.value })}
                />
                <Input
                  label="Nome"
                  placeholder="Nome"
                  value={draft.name}
                  onChange={(event) => onDraftChange({ name: event.target.value })}
                />
              </FormSection>
            </Card>
          )}
        </div>

        <div className="ds-feature__aside">
          <Card>
            {publishedJobVersion ? (
              <ConfigStatus
                label={`Publicado v${publishedJobVersion.versionNumber ?? "-"}`}
                tone="success"
                description={publishedJobVersion.summary || "Sem resumo informado."}
                meta={
                  publishedJobVersion.salaryRange
                    ? `${publishedJobVersion.salaryRange.currency} ${publishedJobVersion.salaryRange.min} - ${publishedJobVersion.salaryRange.max}`
                    : undefined
                }
              />
            ) : (
              <EmptyState
                title="Nenhuma versão publicada"
                description="Selecione um cargo na lista para ver ou criar uma versão."
              />
            )}
            {canManage && selectedJobProfileId && !jobDraftVersion && (
              <div className="ds-form-section__actions">
                <Button onClick={onCreateDraft}>Criar rascunho</Button>
              </div>
            )}
          </Card>

          {canManage && jobDraftVersion && (
            <Card>
              <FormSection
                title="Rascunho do cargo"
                actions={
                  <>
                    <Button variant="secondary" onClick={onSaveDraft}>
                      Salvar
                    </Button>
                    {canPublish && <Button onClick={onPublishDraft}>Publicar</Button>}
                    <Button variant="danger" onClick={onDiscardDraft}>
                      Descartar
                    </Button>
                  </>
                }
              >
                <Input
                  label="Título"
                  placeholder="Título"
                  value={jobDraftVersion.title}
                  onChange={(event) => onUpdateDraftField("title", event.target.value)}
                />
                <Textarea
                  label="Missão"
                  placeholder="Missão"
                  value={jobDraftVersion.mission}
                  onChange={(event) => onUpdateDraftField("mission", event.target.value)}
                />
                <Textarea
                  label="Resumo"
                  placeholder="Resumo"
                  value={jobDraftVersion.summary}
                  onChange={(event) => onUpdateDraftField("summary", event.target.value)}
                />
                <Input
                  label="Responsabilidade principal"
                  placeholder="Responsabilidade principal"
                  value={jobDraftVersion.responsibilities[0]?.text ?? ""}
                  onChange={(event) =>
                    onUpdateDraftField("responsibilities", [
                      { text: event.target.value, displayOrder: 0 }
                    ])
                  }
                />
                <Select
                  label="Modelo de trabalho"
                  value={jobDraftVersion.workModel}
                  onChange={(event) =>
                    onUpdateDraftField(
                      "workModel",
                      event.target.value as JobProfileVersion["workModel"]
                    )
                  }
                >
                  <option value="onsite">onsite</option>
                  <option value="hybrid">hybrid</option>
                  <option value="remote">remote</option>
                  <option value="flexible">flexible</option>
                </Select>
                <Input
                  label="Salário mínimo"
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={jobDraftVersion.salaryRange?.min ?? 0}
                  onChange={(event) =>
                    onUpdateDraftField("salaryRange", {
                      min: Number(event.target.value),
                      max: jobDraftVersion.salaryRange?.max ?? 0,
                      currency: jobDraftVersion.salaryRange?.currency ?? "BRL",
                      periodicity: jobDraftVersion.salaryRange?.periodicity ?? "monthly"
                    })
                  }
                />
                <Input
                  label="Salário máximo"
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={jobDraftVersion.salaryRange?.max ?? 0}
                  onChange={(event) =>
                    onUpdateDraftField("salaryRange", {
                      min: jobDraftVersion.salaryRange?.min ?? 0,
                      max: Number(event.target.value),
                      currency: jobDraftVersion.salaryRange?.currency ?? "BRL",
                      periodicity: jobDraftVersion.salaryRange?.periodicity ?? "monthly"
                    })
                  }
                />
              </FormSection>
            </Card>
          )}

          {canManage && jobProfileHistory.length > 0 && (
            <Card>
              <FormSection title="Histórico">
                <ul className="ds-simple-list">
                  {jobProfileHistory.map((version) => (
                    <li key={version.id}>
                      {version.status} — v{version.versionNumber ?? "-"}
                      {version.discardedAt ? " (descartado)" : ""}
                    </li>
                  ))}
                </ul>
              </FormSection>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
