import { useEffect, useState } from "react";

// Fase 15 (SPEC-018) - Implantacao Guiada / Blueprint Organizacional.
//
// Esta e a primeira extracao de componente do cliente: uma decisao pontual para nao agravar
// mais o crescimento de `src/client/App.tsx` (ja com milhares de linhas, seguindo o padrao
// unico usado pelas 9 fases anteriores). Nao e uma refatoracao dos modulos ja existentes em
// App.tsx -- eles continuam exatamente como estao; apenas o Blueprint, que comeca nesta fase,
// vive em seu proprio arquivo.
//
// A tela mostra apenas leitura e a acao de ativacao (Owner); toda edicao de conteudo continua
// acontecendo nos modulos reais ja existentes (DNA, Estrutura, Competencias, Cargos,
// Perguntas, IA) -- nenhum editor duplicado e criado aqui (SPEC-018, RN-053).

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
    <div className="panel blueprint-panel" aria-label="Implantacao / Blueprint Organizacional">
      <span>Implantacao / Blueprint Organizacional</span>

      {status?.progress && (
        <p>
          Progresso: {status.progress.completedSteps} de {status.progress.applicableSteps} etapas
          concluidas
        </p>
      )}

      {readiness && (
        <div className="blueprint-readiness">
          <p>
            Readiness: <strong>{readiness.status}</strong>
          </p>
          {readiness.pendingRequired.length > 0 && (
            <div>
              <span>Pendencias obrigatorias</span>
              <ul>
                {readiness.pendingRequired.map((key) => (
                  <li key={key}>{stepDestinations[key] ?? key}</li>
                ))}
              </ul>
            </div>
          )}
          {readiness.pendingOptional.length > 0 && (
            <div>
              <span>Recomendacoes (opcionais, nunca bloqueiam)</span>
              <ul>
                {readiness.pendingOptional.map((key) => (
                  <li key={key}>{stepDestinations[key] ?? key}</li>
                ))}
              </ul>
            </div>
          )}
          {readiness.blockingReasons.length > 0 && (
            <div>
              <span>Bloqueios</span>
              <ul>
                {readiness.blockingReasons.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <span>Draft atual</span>
        {status?.draft ? (
          <p>
            Versao {status.draft.versionNumber} - {status.draft.status}
          </p>
        ) : (
          <p>Nenhum draft em construcao.</p>
        )}
        {canActivate && status?.draft && (
          <button type="button" onClick={activate} disabled={readiness?.status !== "ready"}>
            Ativar Blueprint
          </button>
        )}
      </div>

      <div className="panel">
        <span>Versao ativa</span>
        {status?.active ? (
          <p>
            Versao {status.active.versionNumber} - ativada em {status.active.activatedAt}
          </p>
        ) : (
          <p>Nenhuma versao ativa ainda.</p>
        )}
        {canActivate && status?.active && !status.draft && (
          <button type="button" onClick={createRevision}>
            Iniciar nova revisao
          </button>
        )}
      </div>

      <div className="panel">
        <span>Historico</span>
        {history.length === 0 ? (
          <p>Nenhuma versao arquivada ainda.</p>
        ) : (
          <ul>
            {history.map((version) => (
              <li key={version.id}>Versao {version.versionNumber} - archived</li>
            ))}
          </ul>
        )}
      </div>

      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
