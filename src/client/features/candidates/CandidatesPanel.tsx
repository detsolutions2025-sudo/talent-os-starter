import type { Candidate, CandidateDraft } from "../../App";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Textarea } from "../../components/ui/Textarea";

export type CandidatesPanelProps = {
  canManage: boolean;
  candidates: Candidate[];
  inactiveCandidates: Candidate[];
  draft: CandidateDraft;
  onDraftChange: (patch: Partial<CandidateDraft>) => void;
  onCreate: () => void;
  onChangeStatus: (candidate: Candidate, action: "inactivate" | "reactivate") => void;
};

const CANDIDATE_SOURCES = [
  "career_page",
  "referral",
  "recruiter",
  "agency",
  "linkedin",
  "job_board",
  "event",
  "import",
  "manual",
  "other"
];

function candidateLocation(candidate: Candidate) {
  const city = candidate.location?.city ?? candidate.city;
  const state = candidate.location?.state ?? candidate.state;
  return [city, state].filter(Boolean).join(" - ");
}

export function CandidatesPanel({
  canManage,
  candidates,
  inactiveCandidates,
  draft,
  onDraftChange,
  onCreate,
  onChangeStatus
}: CandidatesPanelProps) {
  return (
    <div className="ds-feature">
      <SectionHeader
        title="Candidatos"
        description="Base de candidatos da organização, com histórico profissional e status de participação."
      />

      <div className={`ds-feature__layout${canManage ? "" : " ds-feature__layout--single"}`}>
        <div className="ds-feature__main">
          <DataList
            items={candidates}
            keyExtractor={(candidate) => candidate.id}
            emptyTitle="Nenhum candidato ativo"
            renderItem={(candidate) => (
              <DataListItem
                title={candidate.fullName}
                status={
                  <Badge tone={candidate.status === "active" ? "success" : "neutral"}>
                    {candidate.status === "active" ? "ativo" : "inativo"}
                  </Badge>
                }
                meta={
                  <>
                    <span>
                      {candidate.preferredName ? `${candidate.preferredName} · ` : ""}
                      {candidate.source}
                      {candidateLocation(candidate) ? ` · ${candidateLocation(candidate)}` : ""}
                    </span>
                    {candidate.professionalSummary && <span>{candidate.professionalSummary}</span>}
                    <span>
                      {candidate.experiences.length} experiência(s) · {candidate.education.length}{" "}
                      escolaridade(s) · {candidate.languages.length} idioma(s)
                    </span>
                  </>
                }
                actions={
                  canManage && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onChangeStatus(candidate, "inactivate")}
                    >
                      Inativar
                    </Button>
                  )
                }
              />
            )}
          />

          {canManage && (
            <Card>
              <FormSection title="Inativos">
                <DataList
                  items={inactiveCandidates}
                  keyExtractor={(candidate) => candidate.id}
                  emptyTitle="Nenhum candidato inativo"
                  renderItem={(candidate) => (
                    <DataListItem
                      title={candidate.fullName}
                      status={<Badge tone="neutral">inativo</Badge>}
                      meta={<span>{candidate.source}</span>}
                      actions={
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onChangeStatus(candidate, "reactivate")}
                        >
                          Reativar
                        </Button>
                      }
                    />
                  )}
                />
              </FormSection>
            </Card>
          )}
        </div>

        {canManage && (
          <div className="ds-feature__aside">
            <Card>
              <FormSection
                title="Novo candidato"
                actions={<Button onClick={onCreate}>Criar candidato</Button>}
              >
                <Input
                  label="Nome completo"
                  placeholder="Nome completo"
                  value={draft.fullName}
                  onChange={(event) => onDraftChange({ fullName: event.target.value })}
                />
                <Input
                  label="Nome preferido"
                  placeholder="Nome preferido"
                  value={draft.preferredName}
                  onChange={(event) => onDraftChange({ preferredName: event.target.value })}
                />
                <Input
                  label="E-mail"
                  placeholder="email@exemplo.com"
                  value={draft.email}
                  onChange={(event) => onDraftChange({ email: event.target.value })}
                />
                <Select
                  label="Origem"
                  value={draft.source}
                  onChange={(event) => onDraftChange({ source: event.target.value })}
                >
                  {CANDIDATE_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Cidade"
                  placeholder="Cidade"
                  value={draft.city}
                  onChange={(event) => onDraftChange({ city: event.target.value })}
                />
                <Input
                  label="Estado"
                  placeholder="Estado"
                  value={draft.state}
                  onChange={(event) => onDraftChange({ state: event.target.value })}
                />
                <Textarea
                  label="Resumo profissional"
                  placeholder="Resumo profissional"
                  value={draft.professionalSummary}
                  onChange={(event) => onDraftChange({ professionalSummary: event.target.value })}
                />
              </FormSection>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
