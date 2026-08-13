import { useState } from "react";

// Fase 20 (SPEC-023 v1.1) - Pre-Analise Assistida por IA.
//
// Mesmo padrao de extracao ja usado por `PreInterviewPanel.tsx`/`BehavioralAssessmentPanel.tsx`:
// componente proprio, auto-contido, consultado por CandidateApplication ID informado
// manualmente (nao existe, nesta Fase, um seletor de candidaturas na UI existente). owner/admin
// veem summary/limitations/findings/evidencias/disclaimer/historico completos; member ve
// exclusivamente id+status, nunca o conteudo (SPEC-023 Sec 24.2) -- a distincao e feita aqui
// escolhendo a ROTA certa (`/status` para member, nunca `/result`/`/evidences` para esse
// perfil), nunca confiando em esconder campos no cliente. O Candidate nunca e ator desta SPEC
// (Sec 3) -- este painel nunca e exposto fora da area autenticada de Organization.

type PreAnalysisStatus =
  "requested" | "running" | "completed" | "failed" | "unavailable" | "cancelled";

type PreAnalysisMemberView = { id: string; status: PreAnalysisStatus };

type PreAnalysisOwnerView = {
  id: string;
  candidateApplicationId: string;
  attemptNumber: number;
  previousAttemptId: string | null;
  status: PreAnalysisStatus;
  requestedByUserId: string;
  requestedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  unavailableAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  errorCategory: string | null;
};

type PreAnalysisFinding = {
  id: string;
  category: string;
  text: string;
  displayOrder: number;
  evidenceIds: string[];
};

type PreAnalysisResult = {
  result: {
    summary: string;
    limitations: string;
    disclaimer: string;
    calculatedAt: string;
  };
  findings: PreAnalysisFinding[];
};

type PreAnalysisEvidence = {
  id: string;
  sourceType: string;
  originKind: string;
};

const statusLabels: Record<PreAnalysisStatus, string> = {
  requested: "Solicitada (preparando)",
  running: "Em execucao",
  completed: "Concluida",
  failed: "Falhou",
  unavailable: "Indisponivel",
  cancelled: "Cancelada"
};

const categoryLabels: Record<string, string> = {
  evidencia_aderencia: "Evidencia de aderencia",
  evidencia_nao_encontrada: "Evidencia nao encontrada",
  ponto_forte: "Ponto forte",
  ponto_atencao: "Ponto de atencao",
  possivel_risco: "Possivel risco",
  pergunta_sugerida_para_validacao: "Pergunta sugerida para validacao"
};

export function PreAnalysisPanel({
  organizationId,
  role,
  headers
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
}) {
  const canManage = role === "owner" || role === "admin";
  const isMember = role === "member";

  const [applicationId, setApplicationId] = useState("");
  const [list, setList] = useState<Array<PreAnalysisOwnerView | PreAnalysisMemberView>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<PreAnalysisResult | null>(null);
  const [evidences, setEvidences] = useState<PreAnalysisEvidence[]>([]);
  const [cancelReason, setCancelReason] = useState("");
  const [message, setMessage] = useState("");

  function loadList() {
    if (!applicationId.trim()) {
      setMessage("Informe o ID da candidatura (CandidateApplication).");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/pre-analyses`,
      { headers }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel consultar as Pre-Analises desta candidatura.");
        }
        setList((await response.json()) as Array<PreAnalysisOwnerView | PreAnalysisMemberView>);
        setResult(null);
        setEvidences([]);
        setSelectedId(null);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function requestPreAnalysis() {
    if (!applicationId.trim()) {
      setMessage("Informe o ID da candidatura (CandidateApplication).");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/pre-analyses`,
      { method: "POST", headers }
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? "Nao foi possivel solicitar a Pre-Analise.");
        }
        setMessage("Pre-Analise solicitada.");
        loadList();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function cancelPreAnalysis(preAnalysisId: string) {
    if (!cancelReason.trim()) {
      setMessage("Informe o motivo do cancelamento.");
      return;
    }
    fetch(`/api/organizations/${organizationId}/pre-analyses/${preAnalysisId}/cancel`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ reason: cancelReason })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel cancelar a Pre-Analise.");
        }
        setCancelReason("");
        setMessage("Pre-Analise cancelada.");
        loadList();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function loadResult(preAnalysisId: string) {
    setSelectedId(preAnalysisId);
    fetch(`/api/organizations/${organizationId}/pre-analyses/${preAnalysisId}/result`, {
      headers
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel consultar o resultado.");
        }
        setResult((await response.json()) as PreAnalysisResult | null);
      })
      .catch((error: Error) => setMessage(error.message));

    fetch(`/api/organizations/${organizationId}/pre-analyses/${preAnalysisId}/evidences`, {
      headers
    })
      .then(async (response) => {
        setEvidences(response.ok ? ((await response.json()) as PreAnalysisEvidence[]) : []);
      })
      .catch(() => setEvidences([]));
  }

  // member: consulta unica e minima, exclusivamente id+status -- nunca a rota de resultado
  // (SPEC-023 Sec 24.2). A distincao e feita escolhendo qual rota a UI chama, nunca escondendo
  // campos de uma resposta que ja os contivesse.
  function loadMemberStatus() {
    if (!applicationId.trim()) {
      setMessage("Informe o ID da candidatura (CandidateApplication).");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/pre-analyses`,
      { headers }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel consultar a Pre-Analise desta candidatura.");
        }
        setList((await response.json()) as PreAnalysisMemberView[]);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  if (!organizationId || (!canManage && !isMember)) {
    return null;
  }

  if (isMember) {
    return (
      <div className="panel pre-analysis-panel" aria-label="Pre-Analise Assistida por IA">
        <span>Pre-Analise Assistida por IA</span>
        <label htmlFor="pa-member-application-id">
          ID da candidatura (CandidateApplication)
          <input
            id="pa-member-application-id"
            type="text"
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
          />
        </label>
        <button type="button" onClick={loadMemberStatus}>
          Consultar status
        </button>
        {list.length > 0 && (
          <ul>
            {list.map((item) => (
              <li key={item.id}>{statusLabels[item.status]}</li>
            ))}
          </ul>
        )}
        {message && (
          <div className="message" role="status">
            {message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="panel pre-analysis-panel" aria-label="Pre-Analise Assistida por IA">
      <span>Pre-Analise Assistida por IA</span>
      <p>
        Sintese opcional produzida por IA sobre evidencias ja existentes de uma candidatura. Nunca
        constitui decisao, aprovacao, reprovacao ou score (SPEC-023).
      </p>

      <label htmlFor="pa-application-id">
        ID da candidatura (CandidateApplication)
        <input
          id="pa-application-id"
          type="text"
          value={applicationId}
          onChange={(event) => setApplicationId(event.target.value)}
        />
      </label>
      <button type="button" onClick={loadList}>
        Consultar historico
      </button>
      <button type="button" onClick={requestPreAnalysis}>
        Solicitar Pre-Analise
      </button>

      {list.length > 0 && (
        <ul>
          {list.map((item) => {
            const owned = item as PreAnalysisOwnerView;
            return (
              <li key={item.id}>
                {"attemptNumber" in owned && `Tentativa ${owned.attemptNumber} - `}
                {statusLabels[item.status]}
                {"errorCategory" in owned && owned.errorCategory && ` (${owned.errorCategory})`}
                {(item.status === "completed" || item.status === "failed") && (
                  <button type="button" onClick={() => loadResult(item.id)}>
                    Ver detalhes
                  </button>
                )}
                {(item.status === "requested" || item.status === "running") && (
                  <button type="button" onClick={() => cancelPreAnalysis(item.id)}>
                    Cancelar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <label htmlFor="pa-cancel-reason">
        Motivo do cancelamento
        <input
          id="pa-cancel-reason"
          type="text"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </label>

      {selectedId && result && (
        <div className="panel">
          <span>Resultado</span>
          <p>{result.result.summary}</p>
          <p>
            <em>Limitacoes: {result.result.limitations}</em>
          </p>
          <p role="note">{result.result.disclaimer}</p>
          {result.findings.length > 0 && (
            <ul>
              {result.findings.map((finding) => (
                <li key={finding.id}>
                  <strong>{categoryLabels[finding.category] ?? finding.category}:</strong>{" "}
                  {finding.text} ({finding.evidenceIds.length} evidencia(s))
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selectedId && evidences.length > 0 && (
        <div className="panel">
          <span>Evidencias utilizadas</span>
          <ul>
            {evidences.map((evidence) => (
              <li key={evidence.id}>
                {evidence.sourceType} - origem: {evidence.originKind}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
