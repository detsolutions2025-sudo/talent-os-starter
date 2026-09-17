// Mapa de navegacao do Design System v1. Cada item aponta para um id de ancora que ja existe
// no espaco de trabalho (App.tsx) -- nenhum destes destinos e inventado; todos correspondem a
// paineis/funcionalidades reais ja implementados. `ai: true` marca modulos que de fato geram ou
// sugerem conteudo via AI Gateway para revisao humana (ver src/server/pre-analyses).
//
// Blueprint (src/server/blueprints) NAO leva `ai: true` -- correcao feita na Wave 2 apos
// investigar o codigo-fonte: readiness.ts declara explicitamente "Nunca usa IA (RN-024)"; o
// unico uso de IA em blueprints/service.ts e leitura de configuracao (feature settings/provider
// configs) para o manifesto versionado, nao geracao de conteudo. A marcacao anterior (Wave 0)
// era imprecisa.

export type NavItem = {
  id: string;
  label: string;
  ai?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "recrutamento",
    label: "Recrutamento",
    items: [
      { id: "panel-job-openings", label: "Vagas" },
      { id: "panel-job-profiles", label: "Cargos" },
      { id: "panel-candidates", label: "Candidatos" },
      { id: "panel-applications", label: "Processo Seletivo" },
      { id: "panel-interviews", label: "Entrevistas" },
      { id: "panel-questions", label: "Banco de Perguntas" },
      { id: "panel-preinterview", label: "Pré-Entrevista Estruturada" },
      { id: "panel-behavioral-instrument", label: "Perfil Comportamental — Instrumentos" },
      { id: "panel-behavioral-assessment", label: "Perfil Comportamental — Instâncias" },
      { id: "panel-pre-analysis", label: "Pré-Análise", ai: true },
      { id: "panel-candidate-dossier", label: "Dossiê do Candidato" },
      { id: "panel-proposal", label: "Propostas" }
    ]
  },
  {
    id: "pessoas",
    label: "Pessoas",
    items: [
      { id: "panel-onboarding", label: "Onboarding" },
      { id: "panel-employment", label: "Pessoas e Vínculos" },
      { id: "panel-offboarding", label: "Offboarding" }
    ]
  },
  {
    id: "desenvolvimento",
    label: "Desenvolvimento",
    items: [{ id: "panel-development-retention", label: "Desenvolvimento e Retenção" }]
  },
  {
    id: "organizacao",
    label: "Organização",
    items: [
      { id: "panel-blueprint", label: "Blueprint Organizacional" },
      { id: "panel-dna", label: "DNA Organizacional" },
      { id: "panel-org-units", label: "Estrutura Organizacional" },
      { id: "panel-competencies", label: "Catálogo de Competências" }
    ]
  },
  {
    id: "configuracoes",
    label: "Configurações",
    items: [
      { id: "panel-memberships", label: "Membros" },
      { id: "panel-access-grant", label: "Ciclo de Vida de Acesso" },
      { id: "panel-invitation", label: "Convites" }
    ]
  }
];

export const ALL_NAV_ITEM_IDS = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));
