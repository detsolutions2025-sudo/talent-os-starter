import type {
  GlobalQuestion,
  OrganizationQuestion,
  QuestionCategory,
  QuestionDraft,
  QuestionType,
  UnifiedCatalogItem,
  UnifiedQuestionCatalogItem
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

export type QuestionBankTab = "catalog" | "organization" | "global";

export type QuestionBankPanelProps = {
  canManage: boolean;
  activeTab: QuestionBankTab;
  onTabChange: (tab: QuestionBankTab) => void;
  questionCatalogItems: UnifiedQuestionCatalogItem[];
  competencyCatalogItems: UnifiedCatalogItem[];
  organizationQuestions: OrganizationQuestion[];
  organizationDraft: QuestionDraft;
  onOrganizationDraftChange: (patch: Partial<QuestionDraft>) => void;
  onCreateOrganization: () => void;
  onChangeOrganizationStatus: (id: string, action: "activate" | "inactivate") => void;
  globalQuestions: GlobalQuestion[];
  availableGlobalQuestions: GlobalQuestion[];
  onAdoptGlobal: (id: string) => void;
};

const QUESTION_TYPES: QuestionType[] = [
  "open_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "yes_no",
  "numeric",
  "scale",
  "date",
  "situational",
  "behavioral",
  "technical"
];

const QUESTION_CATEGORIES: QuestionCategory[] = [
  "general",
  "technical",
  "behavioral",
  "situational",
  "culture",
  "leadership",
  "management",
  "compliance",
  "safety",
  "screening",
  "other"
];

export function QuestionBankPanel({
  canManage,
  activeTab,
  onTabChange,
  questionCatalogItems,
  competencyCatalogItems,
  organizationQuestions,
  organizationDraft,
  onOrganizationDraftChange,
  onCreateOrganization,
  onChangeOrganizationStatus,
  globalQuestions,
  availableGlobalQuestions,
  onAdoptGlobal
}: QuestionBankPanelProps) {
  const tabItems = [
    { id: "catalog", label: "Catálogo Utilizado" },
    ...(canManage
      ? [
          { id: "organization", label: "Perguntas da Empresa" },
          { id: "global", label: "Biblioteca Global" }
        ]
      : [])
  ];

  return (
    <div className="ds-feature">
      <SectionHeader
        title="Banco de Perguntas"
        description="Perguntas reutilizáveis para entrevistas, associadas às competências do catálogo quando relevante."
      />

      <Tabs
        aria-label="Seções do banco de perguntas"
        items={tabItems}
        activeId={activeTab}
        onChange={(id) => onTabChange(id as QuestionBankTab)}
      />

      {activeTab === "catalog" && (
        <DataList
          items={questionCatalogItems}
          keyExtractor={(item) => item.questionCatalogItemId}
          emptyTitle="Nenhuma pergunta disponível"
          renderItem={(item) => (
            <DataListItem
              title={item.title}
              status={item.deprecated && <Badge tone="warning">deprecated</Badge>}
              meta={
                <span>
                  {item.code} · {item.type} · {item.category} · {item.origin}
                </span>
              }
            />
          )}
        />
      )}

      {activeTab === "organization" && canManage && (
        <div className="ds-feature__layout">
          <div className="ds-feature__main">
            <DataList
              items={organizationQuestions}
              keyExtractor={(question) => question.id}
              emptyTitle="Nenhuma pergunta própria"
              renderItem={(question) => (
                <DataListItem
                  title={question.title}
                  status={
                    <Badge tone={question.status === "active" ? "success" : "neutral"}>
                      {question.status === "active" ? "ativa" : "inativa"}
                    </Badge>
                  }
                  meta={
                    <span>
                      {question.code} · {question.type} · {question.category}
                    </span>
                  }
                  actions={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        onChangeOrganizationStatus(
                          question.id,
                          question.status === "active" ? "inactivate" : "activate"
                        )
                      }
                    >
                      {question.status === "active" ? "Inativar" : "Ativar"}
                    </Button>
                  }
                />
              )}
            />
          </div>

          <div className="ds-feature__aside">
            <Card>
              <FormSection
                title="Nova pergunta"
                actions={<Button onClick={onCreateOrganization}>Criar pergunta</Button>}
              >
                <Input
                  label="Código"
                  placeholder="Código"
                  value={organizationDraft.code}
                  onChange={(event) => onOrganizationDraftChange({ code: event.target.value })}
                />
                <Input
                  label="Título"
                  placeholder="Título"
                  value={organizationDraft.title}
                  onChange={(event) => onOrganizationDraftChange({ title: event.target.value })}
                />
                <Textarea
                  label="Texto da pergunta"
                  placeholder="Texto da pergunta"
                  value={organizationDraft.questionText}
                  onChange={(event) =>
                    onOrganizationDraftChange({ questionText: event.target.value })
                  }
                />
                <Select
                  label="Tipo"
                  value={organizationDraft.type}
                  onChange={(event) =>
                    onOrganizationDraftChange({ type: event.target.value as QuestionType })
                  }
                >
                  {QUESTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Categoria"
                  value={organizationDraft.category}
                  onChange={(event) =>
                    onOrganizationDraftChange({ category: event.target.value as QuestionCategory })
                  }
                >
                  {QUESTION_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Competência associada"
                  value={organizationDraft.competencyCatalogItemId}
                  onChange={(event) =>
                    onOrganizationDraftChange({ competencyCatalogItemId: event.target.value })
                  }
                >
                  <option value="">Sem competência</option>
                  {competencyCatalogItems.map((item) => (
                    <option key={item.competencyCatalogItemId} value={item.competencyCatalogItemId}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </FormSection>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "global" && canManage && (
        <div className="ds-feature__main">
          <DataList
            items={globalQuestions}
            keyExtractor={(question) => question.id}
            emptyTitle="Nenhuma pergunta global carregada"
            renderItem={(question) => (
              <DataListItem
                title={question.title}
                meta={
                  <span>
                    {question.code} · {question.type} · {question.category} · {question.status}
                  </span>
                }
              />
            )}
          />

          <Card>
            <FormSection title="Disponíveis para adoção">
              <DataList
                items={availableGlobalQuestions}
                keyExtractor={(question) => question.id}
                emptyTitle="Nenhuma pergunta global disponível para adoção"
                renderItem={(question) => (
                  <DataListItem
                    title={question.title}
                    meta={
                      <span>
                        {question.code} · {question.type} · {question.category}
                      </span>
                    }
                    actions={
                      <Button size="sm" onClick={() => onAdoptGlobal(question.id)}>
                        Adotar
                      </Button>
                    }
                  />
                )}
              />
            </FormSection>
          </Card>
        </div>
      )}
    </div>
  );
}
