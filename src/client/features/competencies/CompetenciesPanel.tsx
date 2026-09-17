import type {
  CompetencyCategory,
  CompetencyDraft,
  GlobalCompetency,
  OrganizationCompetency,
  UnifiedCatalogItem
} from "../../App";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataList, DataListItem } from "../../components/ui/DataList";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Tabs } from "../../components/ui/Tabs";
import { Textarea } from "../../components/ui/Textarea";

export type CompetenciesTab = "catalog" | "organization" | "global";

export type CompetenciesPanelProps = {
  canManage: boolean;
  activeTab: CompetenciesTab;
  onTabChange: (tab: CompetenciesTab) => void;
  catalogItems: UnifiedCatalogItem[];
  organizationCompetencies: OrganizationCompetency[];
  organizationDraft: CompetencyDraft;
  onOrganizationDraftChange: (patch: Partial<CompetencyDraft>) => void;
  onCreateOrganization: () => void;
  onChangeOrganizationStatus: (id: string, action: "activate" | "inactivate") => void;
  globalCompetencies: GlobalCompetency[];
  availableGlobalCompetencies: GlobalCompetency[];
  globalDraft: CompetencyDraft;
  onGlobalDraftChange: (patch: Partial<CompetencyDraft>) => void;
  onCreateGlobal: () => void;
  onAdoptGlobal: (id: string) => void;
};

const COMPETENCY_CATEGORIES: CompetencyCategory[] = [
  "technical",
  "behavioral",
  "leadership",
  "management",
  "tools",
  "languages",
  "compliance",
  "safety",
  "other"
];

export function CompetenciesPanel({
  canManage,
  activeTab,
  onTabChange,
  catalogItems,
  organizationCompetencies,
  organizationDraft,
  onOrganizationDraftChange,
  onCreateOrganization,
  onChangeOrganizationStatus,
  globalCompetencies,
  availableGlobalCompetencies,
  globalDraft,
  onGlobalDraftChange,
  onCreateGlobal,
  onAdoptGlobal
}: CompetenciesPanelProps) {
  return (
    <div className="ds-feature">
      <SectionHeader
        title="Catálogo de Competências"
        description="Competências usadas em cargos e perguntas, combinando o catálogo próprio com a biblioteca global."
      />

      <Tabs
        aria-label="Seções do catálogo de competências"
        items={[
          { id: "catalog", label: "Catálogo Utilizado" },
          { id: "organization", label: "Competências da Empresa" },
          { id: "global", label: "Biblioteca Global" }
        ]}
        activeId={activeTab}
        onChange={(id) => onTabChange(id as CompetenciesTab)}
      />

      {activeTab === "catalog" && (
        <DataList
          items={catalogItems}
          keyExtractor={(item) => item.competencyCatalogItemId}
          emptyTitle="Nenhuma competência disponível"
          renderItem={(item) => (
            <DataListItem
              title={item.name}
              status={item.deprecated && <Badge tone="warning">deprecated</Badge>}
              meta={
                <span>
                  {item.code} · {item.category} · {item.origin}
                </span>
              }
            />
          )}
        />
      )}

      {activeTab === "organization" && (
        <div className={`ds-feature__layout${canManage ? "" : " ds-feature__layout--single"}`}>
          <div className="ds-feature__main">
            <DataList
              items={organizationCompetencies}
              keyExtractor={(competency) => competency.id}
              emptyTitle="Nenhuma competência própria"
              renderItem={(competency) => (
                <DataListItem
                  title={competency.name}
                  status={
                    <Badge tone={competency.status === "active" ? "success" : "neutral"}>
                      {competency.status === "active" ? "ativa" : "inativa"}
                    </Badge>
                  }
                  meta={
                    <span>
                      {competency.code} · {competency.category}
                    </span>
                  }
                  actions={
                    canManage && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          onChangeOrganizationStatus(
                            competency.id,
                            competency.status === "active" ? "inactivate" : "activate"
                          )
                        }
                      >
                        {competency.status === "active" ? "Inativar" : "Ativar"}
                      </Button>
                    )
                  }
                />
              )}
            />
          </div>

          {canManage && (
            <div className="ds-feature__aside">
              <Card>
                <FormSection
                  title="Nova competência"
                  actions={<Button onClick={onCreateOrganization}>Criar competência</Button>}
                >
                  <Input
                    label="Código"
                    placeholder="Código"
                    value={organizationDraft.code}
                    onChange={(event) => onOrganizationDraftChange({ code: event.target.value })}
                  />
                  <Input
                    label="Nome"
                    placeholder="Nome"
                    value={organizationDraft.name}
                    onChange={(event) => onOrganizationDraftChange({ name: event.target.value })}
                  />
                  <Select
                    label="Categoria"
                    value={organizationDraft.category}
                    onChange={(event) =>
                      onOrganizationDraftChange({
                        category: event.target.value as CompetencyCategory
                      })
                    }
                  >
                    {COMPETENCY_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    label="Definição"
                    placeholder="Definição"
                    value={organizationDraft.definition}
                    onChange={(event) =>
                      onOrganizationDraftChange({ definition: event.target.value })
                    }
                  />
                </FormSection>
              </Card>
            </div>
          )}
        </div>
      )}

      {activeTab === "global" && (
        <div className="ds-feature__layout">
          <div className="ds-feature__main">
            <DataList
              items={globalCompetencies}
              keyExtractor={(competency) => competency.id}
              emptyTitle="Nenhuma competência global carregada"
              renderItem={(competency) => (
                <DataListItem
                  title={competency.name}
                  meta={
                    <span>
                      {competency.code} · {competency.category} · {competency.status}
                    </span>
                  }
                />
              )}
            />

            {canManage && (
              <Card>
                <FormSection title="Disponíveis para adoção">
                  <DataList
                    items={availableGlobalCompetencies}
                    keyExtractor={(competency) => competency.id}
                    emptyTitle="Nenhuma competência global disponível para adoção"
                    renderItem={(competency) => (
                      <DataListItem
                        title={competency.name}
                        meta={
                          <span>
                            {competency.code} · {competency.category}
                          </span>
                        }
                        actions={
                          <Button size="sm" onClick={() => onAdoptGlobal(competency.id)}>
                            Adotar
                          </Button>
                        }
                      />
                    )}
                  />
                </FormSection>
              </Card>
            )}
          </div>

          <div className="ds-feature__aside">
            <Card>
              <FormSection
                title="Nova competência global"
                actions={<Button onClick={onCreateGlobal}>Criar global</Button>}
              >
                <Input
                  label="Código global"
                  placeholder="Código global"
                  value={globalDraft.code}
                  onChange={(event) => onGlobalDraftChange({ code: event.target.value })}
                />
                <Input
                  label="Nome global"
                  placeholder="Nome global"
                  value={globalDraft.name}
                  onChange={(event) => onGlobalDraftChange({ name: event.target.value })}
                />
                <Select
                  label="Categoria global"
                  value={globalDraft.category}
                  onChange={(event) =>
                    onGlobalDraftChange({ category: event.target.value as CompetencyCategory })
                  }
                >
                  {COMPETENCY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
                <Textarea
                  label="Definição"
                  placeholder="Definição"
                  value={globalDraft.definition}
                  onChange={(event) => onGlobalDraftChange({ definition: event.target.value })}
                />
              </FormSection>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
