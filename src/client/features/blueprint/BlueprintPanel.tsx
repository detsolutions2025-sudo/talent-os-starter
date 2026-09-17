import { useEffect, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfigStatus } from "../../components/ui/ConfigStatus";
import { EmptyState } from "../../components/ui/EmptyState";
import { SectionHeader } from "../../components/ui/SectionHeader";

// Fase 15 (SPEC-018) - Implantacao Guiada / Blueprint Organizacional.
//
// Migrado para o Design System v1 na Wave 2 (visual apenas -- toda a logica interna, chamadas de
// API e sequencia de operacoes permanecem identicas ao componente original).
//
// A tela mostra apenas leitura e a acao de ativacao (Owner); toda edicao de conteudo continua
// acontecendo nos modulos reais ja existentes (DNA, Estrutura, Competencias, Cargos,
// Perguntas, IA) -- nenhum editor duplicado e criado aqui (SPEC-018, RN-053).
//
// Investigacao desta Wave (src/server/blueprints/readiness.ts, linha 11): "Readiness e uma
// funcao pura e deterministica ... Nunca usa IA (RN-024)". O unico uso de IA em
// blueprints/service.ts e leitura de configuracao (listOrganizationFeatureSettings/
// listProviderConfigs) para o manifesto versionado -- nenhum conteudo exibido aqui e gerado ou
// sugerido por IA. Por isso este painel nao usa AiBadge: aplica-lo seria simular participacao de
// IA que nao existe neste fluxo (Wave 2, item 9 -- "nunca representar resultado de IA como
// configuracao confirmada" tambem cobre o inverso, nao inventar IA onde nao ha).

type ReadinessCheck = {
  key: string;
  label: string;
  status: "satisfied" | "pending_required" | "pending_optional" | "blocking";
};

type ReadinessResult = {
  status: "incomplete" | "ready" | "blocked";
  checks: ReadinessCheck[];
  pendingRequired: string[];
  pendingOptional: string[];
  blockingReasons: string[];
};

type ManifestItem = {
  componentType: string;
  componentRefId: string | null;
  componentVersionId: string | null;
};

type BlueprintVersion = {
  id: string;
  versionNumber: number;
  status: "draft" | "active" | "archived";
  createdSource: "user" | "migration_backfill";
  activatedAt: string | null;
  manifest: ManifestItem[];
};

type BlueprintStatus = {
  draft: BlueprintVersion | null;
  active: BlueprintVersion | null;
  progress: { applicableSteps: number; completedSteps: number };
};

// Cada pendencia direciona o usuario para o modulo real de configuracao (SPEC-018, secao 23) --
// nunca edita nada aqui.
const stepDestinations: Record<string, string> = {
  dna_published: "Configure o DNA Organizacional",
  organizational_structure: "Configure a Estrutura Organizacional",
  job_profile_published: "Publique ao menos um Cargo",
  owner_active: "Verifique o Owner da Organization",
  organization_active: "Verifique se a Organization esta ativa"
};

const readinessTone: Record<ReadinessResult["status"], BadgeTone> = {
  ready: "success",
  incomplete: "warning",
  blocked: "danger"
};

export function BlueprintPanel({
  organizationId,
  role,
  headers
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
}) {
  const [status, setStatus] = useState<BlueprintStatus | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [history, setHistory] = useState<BlueprintVersion[]>([]);
  const [message, setMessage] = useState("");

  const canView = role === "owner" || role === "admin";
  const canActivate = role === "owner";

  useEffect(() => {
    if (!organizationId || !canView) {
      setStatus(null);
      setReadiness(null);
      setHistory([]);
      return;
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, canView]);

  function load() {
    fetch(`/api/organizations/${organizationId}/blueprint`, { headers })
      .then(async (response) => {
        setStatus(response.ok ? ((await response.json()) as BlueprintStatus) : null);
      })
      .catch(() => setStatus(null));
    fetch(`/api/organizations/${organizationId}/blueprint/readiness`, { headers })
      .then(async (response) => {
        setReadiness(response.ok ? ((await response.json()) as ReadinessResult) : null);
      })
      .catch(() => setReadiness(null));
    fetch(`/api/organizations/${organizationId}/blueprint/history`, { headers })
      .then(async (response) => {
        setHistory(response.ok ? ((await response.json()) as BlueprintVersion[]) : []);
      })
      .catch(() => setHistory([]));
  }

  function createRevision() {
    fetch(`/api/organizations/${organizationId}/blueprint/drafts`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({})
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel criar uma nova revisao do Blueprint.");
        }
        setMessage("Nova revisao (draft) criada.");
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function activate() {
    fetch(`/api/organizations/${organizationId}/blueprint/draft/activate`, {
      method: "POST",
      headers
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: string };
          } | null;
          throw new Error(
            body?.error?.code === "blueprint_not_ready"
              ? "Blueprint ainda nao esta pronto para ativacao."
              : body?.error?.code === "blueprint_activation_conflict"
                ? "Outra ativacao concorrente ja foi confirmada; tente novamente."
                : "Nao foi possivel ativar o Blueprint."
          );
        }
        setMessage("Blueprint ativado.");
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  if (!organizationId || !canView) {
    return null;
  }

  return (
    <div className="ds-feature">
      <SectionHeader
        title="Blueprint Organizacional"
        description="Checklist de implantação — cada pendência aponta para o módulo real onde ela é resolvida. Nunca usa IA (readiness é uma função determinística)."
      />

      {message && <Alert tone="info">{message}</Alert>}

      {status?.progress && (
        <p className="ds-blueprint-progress">
          Progresso: <strong>{status.progress.completedSteps}</strong> de{" "}
          {status.progress.applicableSteps} etapas concluídas
        </p>
      )}

      {readiness && (
        <Card>
          <CardHeader
            title="Readiness"
            action={<Badge tone={readinessTone[readiness.status]}>{readiness.status}</Badge>}
          />

          {readiness.pendingRequired.length > 0 && (
            <>
              <p className="ds-blueprint-group-title">Pendências obrigatórias</p>
              <ul className="ds-simple-list">
                {readiness.pendingRequired.map((key) => (
                  <li key={key}>{stepDestinations[key] ?? key}</li>
                ))}
              </ul>
            </>
          )}

          {readiness.pendingOptional.length > 0 && (
            <>
              <p className="ds-blueprint-group-title">Recomendações (opcionais, nunca bloqueiam)</p>
              <ul className="ds-simple-list">
                {readiness.pendingOptional.map((key) => (
                  <li key={key}>{stepDestinations[key] ?? key}</li>
                ))}
              </ul>
            </>
          )}

          {readiness.blockingReasons.length > 0 && (
            <>
              <p className="ds-blueprint-group-title">Bloqueios</p>
              <ul className="ds-simple-list">
                {readiness.blockingReasons.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Draft atual" />
        {status?.draft ? (
          <ConfigStatus
            label={`Versão ${status.draft.versionNumber}`}
            tone="info"
            meta={status.draft.status}
          />
        ) : (
          <EmptyState title="Nenhum draft em construção" />
        )}
        {canActivate && status?.draft && (
          <div className="ds-form-section__actions">
            <Button onClick={activate} disabled={readiness?.status !== "ready"}>
              Ativar Blueprint
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Versão ativa" />
        {status?.active ? (
          <ConfigStatus
            label={`Versão ${status.active.versionNumber}`}
            tone="success"
            meta={`ativada em ${status.active.activatedAt}`}
          />
        ) : (
          <EmptyState title="Nenhuma versão ativa ainda" />
        )}
        {canActivate && status?.active && !status.draft && (
          <div className="ds-form-section__actions">
            <Button variant="secondary" onClick={createRevision}>
              Iniciar nova revisão
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Histórico" />
        {history.length === 0 ? (
          <EmptyState title="Nenhuma versão arquivada ainda" />
        ) : (
          <ul className="ds-simple-list">
            {history.map((version) => (
              <li key={version.id}>Versão {version.versionNumber} — archived</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
