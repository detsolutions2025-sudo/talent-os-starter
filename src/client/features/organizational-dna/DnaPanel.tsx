import type { DnaCompetency, DnaValue, DnaVersion } from "../../App";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfigStatus } from "../../components/ui/ConfigStatus";
import { Divider } from "../../components/ui/Divider";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";

export type DnaPanelProps = {
  canManage: boolean;
  canPublish: boolean;
  publishedDna: DnaVersion | null;
  draftDna: DnaVersion | null;
  history: DnaVersion[];
  onCreateDraft: () => void;
  onUpdateField: (field: keyof DnaVersion, value: string) => void;
  onUpdateFirstValue: (field: keyof DnaValue, value: string) => void;
  onUpdateFirstCompetency: (field: keyof DnaCompetency, value: string) => void;
  onSave: () => void;
  onPublish: () => void;
  onDiscard: () => void;
};

export function DnaPanel({
  canManage,
  canPublish,
  publishedDna,
  draftDna,
  history,
  onCreateDraft,
  onUpdateField,
  onUpdateFirstValue,
  onUpdateFirstCompetency,
  onSave,
  onPublish,
  onDiscard
}: DnaPanelProps) {
  const firstValue = draftDna?.values[0];
  const firstCompetency = draftDna?.competencies[0];

  return (
    <div className="ds-feature">
      <SectionHeader
        title="DNA Organizacional"
        description="Missão, visão, valores e cultura publicados para toda a organização."
      />

      <Card>
        <CardHeader title="Versão publicada" />
        {publishedDna ? (
          <ConfigStatus
            label={`Publicado v${publishedDna.versionNumber ?? "-"}`}
            tone="success"
            description={publishedDna.mission || "Sem missão informada."}
          />
        ) : (
          <ConfigStatus label="Sem versão publicada" tone="neutral" />
        )}
        {canManage && !draftDna && (
          <div className="ds-form-section__actions">
            <Button onClick={onCreateDraft}>Criar rascunho</Button>
          </div>
        )}
      </Card>

      {canManage && draftDna && (
        <Card>
          <CardHeader
            title="Rascunho"
            action={<ConfigStatus label={draftDna.status} tone="info" />}
          />

          <FormSection title="Fundamentos">
            <Input
              label="Missão"
              placeholder="Missão"
              value={draftDna.mission}
              onChange={(event) => onUpdateField("mission", event.target.value)}
            />
            <Input
              label="Visão"
              placeholder="Visão"
              value={draftDna.vision}
              onChange={(event) => onUpdateField("vision", event.target.value)}
            />
            <Input
              label="Propósito"
              placeholder="Propósito"
              value={draftDna.purpose}
              onChange={(event) => onUpdateField("purpose", event.target.value)}
            />
          </FormSection>

          <Divider />

          <FormSection title="Valor" description="Edita o primeiro valor do DNA.">
            <Input
              label="Nome do valor"
              placeholder="Valor"
              value={firstValue?.name ?? ""}
              onChange={(event) => onUpdateFirstValue("name", event.target.value)}
            />
            <Input
              label="Descrição do valor"
              placeholder="Descrição do valor"
              value={firstValue?.description ?? ""}
              onChange={(event) => onUpdateFirstValue("description", event.target.value)}
            />
          </FormSection>

          <Divider />

          <FormSection title="Competência" description="Edita a primeira competência do DNA.">
            <Input
              label="Nome da competência"
              placeholder="Competência"
              value={firstCompetency?.name ?? ""}
              onChange={(event) => onUpdateFirstCompetency("name", event.target.value)}
            />
            <Input
              label="Descrição da competência"
              placeholder="Descrição da competência"
              value={firstCompetency?.description ?? ""}
              onChange={(event) => onUpdateFirstCompetency("description", event.target.value)}
            />
            <Select
              label="Importância"
              value={firstCompetency?.importance ?? "medium"}
              onChange={(event) => onUpdateFirstCompetency("importance", event.target.value)}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </Select>
          </FormSection>

          <Divider />

          <FormSection
            title="Cultura"
            actions={
              <>
                <Button variant="secondary" onClick={onSave}>
                  Salvar
                </Button>
                {canPublish && <Button onClick={onPublish}>Publicar</Button>}
                <Button variant="danger" onClick={onDiscard}>
                  Descartar
                </Button>
              </>
            }
          >
            <Input
              label="Cultura"
              placeholder="Cultura"
              value={draftDna.culture}
              onChange={(event) => onUpdateField("culture", event.target.value)}
            />
            <Input
              label="Liderança"
              placeholder="Liderança"
              value={draftDna.leadershipStyle}
              onChange={(event) => onUpdateField("leadershipStyle", event.target.value)}
            />
            <Input
              label="Ambiente"
              placeholder="Ambiente"
              value={draftDna.workEnvironment}
              onChange={(event) => onUpdateField("workEnvironment", event.target.value)}
            />
          </FormSection>
        </Card>
      )}

      {canManage && history.length > 0 && (
        <Card>
          <CardHeader title="Histórico" />
          <ul className="ds-simple-list">
            {history.map((version) => (
              <li key={version.id}>
                {version.status} — v{version.versionNumber ?? "-"}
                {version.discardedAt ? " (descartado)" : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
