import type { NavGroup } from "../navigation/nav-config";
import { Card, CardHeader } from "../ui/Card";
import { AiBadge } from "../ui/AiBadge";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";
import { BriefcaseIcon, UsersIcon, TrendingUpIcon, BuildingIcon, SettingsIcon } from "../ui/icons";

export type OrganizationSummary = {
  name: string;
  slug: string;
  status: string;
};

export type HomeStats = {
  membershipsCount: number;
  jobOpeningsCount: number;
  candidatesCount: number;
  applicationsCount: number;
  interviewsCount: number;
};

export type DnaStatus = {
  published: boolean;
  versionNumber?: number;
};

export type HomeProps = {
  organization: OrganizationSummary | null;
  organizationsCount: number;
  stats: HomeStats;
  dnaStatus: DnaStatus;
  currentRole?: string;
  groups: NavGroup[];
  onNavigate: (anchorId: string) => void;
};

const groupIcons: Record<string, JSX.Element> = {
  recrutamento: <BriefcaseIcon />,
  pessoas: <UsersIcon />,
  desenvolvimento: <TrendingUpIcon />,
  organizacao: <BuildingIcon />,
  configuracoes: <SettingsIcon />
};

const groupDescriptions: Record<string, string> = {
  recrutamento: "Vagas, cargos, candidatos, entrevistas, perfil comportamental e propostas.",
  pessoas: "Onboarding, vínculos empregatícios e offboarding.",
  desenvolvimento: "Planos de desenvolvimento e retenção de talentos.",
  organizacao: "DNA organizacional, estrutura, competências e blueprint de implantação.",
  configuracoes: "Membros, convites e ciclo de vida de acesso."
};

const aiModules = [
  { anchorId: "panel-blueprint", label: "Blueprint Organizacional" },
  { anchorId: "panel-pre-analysis", label: "Pré-Análise" }
];

export function Home({
  organization,
  organizationsCount,
  stats,
  dnaStatus,
  currentRole,
  groups,
  onNavigate
}: HomeProps) {
  return (
    <div className="ds-home">
      <PageHeader
        title="Visão Geral"
        description="Núcleo multiempresa, DNA Organizacional e Estrutura Organizacional com autorização no servidor."
      />

      {!organization ? (
        <Card>
          <EmptyState
            title={
              organizationsCount === 0
                ? "Nenhuma organização acessível"
                : "Nenhuma organização selecionada"
            }
            description={
              organizationsCount === 0
                ? "Este usuário de desenvolvimento ainda não tem acesso a nenhuma Organization."
                : "Selecione uma Organization atual no topo da página para ver os indicadores."
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label="Indicadores da organização atual" className="ds-home__stats">
            <Card>
              <span className="ds-home__stat-label">Organização atual</span>
              <strong className="ds-home__stat-value ds-home__stat-value--text">
                {organization.name}
              </strong>
              <span className="ds-home__stat-hint">
                {organization.slug} · {organization.status}
                {currentRole ? ` · ${currentRole}` : ""}
              </span>
            </Card>
            <Card>
              <span className="ds-home__stat-label">Membros ativos</span>
              <strong className="ds-home__stat-value">{stats.membershipsCount}</strong>
            </Card>
            <Card>
              <span className="ds-home__stat-label">Vagas carregadas</span>
              <strong className="ds-home__stat-value">{stats.jobOpeningsCount}</strong>
            </Card>
            <Card>
              <span className="ds-home__stat-label">Candidatos</span>
              <strong className="ds-home__stat-value">{stats.candidatesCount}</strong>
            </Card>
            <Card>
              <span className="ds-home__stat-label">Candidaturas</span>
              <strong className="ds-home__stat-value">{stats.applicationsCount}</strong>
            </Card>
            <Card>
              <span className="ds-home__stat-label">Entrevistas</span>
              <strong className="ds-home__stat-value">{stats.interviewsCount}</strong>
            </Card>
            <Card>
              <span className="ds-home__stat-label">DNA Organizacional</span>
              <strong className="ds-home__stat-value ds-home__stat-value--text">
                {dnaStatus.published
                  ? `Publicado v${dnaStatus.versionNumber ?? "-"}`
                  : "Sem versão publicada"}
              </strong>
            </Card>
          </section>

          <section aria-label="Atalhos por módulo" className="ds-home__section">
            <h2 className="ds-home__section-title">Atalhos</h2>
            <div className="ds-home__shortcuts">
              {groups.map((group) => (
                <Card key={group.id} className="ds-home__shortcut-card">
                  <CardHeader
                    title={
                      <span className="ds-home__shortcut-title">
                        {groupIcons[group.id]}
                        {group.label}
                      </span>
                    }
                  />
                  <p className="ds-home__shortcut-description">{groupDescriptions[group.id]}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onNavigate(group.items[0].id)}
                  >
                    Abrir
                  </Button>
                </Card>
              ))}
            </div>
          </section>

          <section aria-label="Módulos assistidos por IA" className="ds-home__section">
            <h2 className="ds-home__section-title">
              Assistido por IA <AiBadge />
            </h2>
            <p className="ds-home__section-hint">
              Estes módulos usam o AI Gateway para gerar recomendações. Toda sugestão permanece como
              análise assistida até ser revisada e confirmada por uma pessoa.
            </p>
            <div className="ds-home__ai-modules">
              {aiModules.map((module) => (
                <button
                  key={module.anchorId}
                  type="button"
                  className="ds-home__ai-module"
                  onClick={() => onNavigate(module.anchorId)}
                >
                  <Badge tone="info">{module.label}</Badge>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
