import { useState } from "react";

// Fase 19 (SPEC-022 v1.0) - Perfil Comportamental: operacoes por CandidateApplication.
//
// Mesmo padrao ja usado por `PreInterviewPanel.tsx` (Fase 18) para instancias por candidatura:
// criar (fluxo interno), listar, cancelar, reabrir e registrar importacao externa. Criacao
// SEMPRE e um ato administrativo explicito (SPEC-022, secao 9.1) -- nunca automatica. Nunca
// exibe score global, ranking, matching ou qualquer "fit" definitivo -- apenas o resultado
// bruto do instrumento, respeitando a politica de visibilidade da versao.

type AssessmentStatus =
  "draft" | "available" | "in_progress" | "completed" | "cancelled" | "expired";

type ResultDimensionView = {
  dimensionCode: string;
  label: string | null;
  displayValue: string;
  interpretationText: string | null;
};

type Assessment = {
  id: string;
  status: AssessmentStatus;
  attemptNumber: number;
  originType: "internal_application" | "external_import";
  behavioralInstrumentId: string;
  result?: { result: { summaryText: string | null }; dimensions: ResultDimensionView[] } | null;
};

const statusLabels: Record<AssessmentStatus, string> = {
  draft: "Rascunho (interno)",
  available: "Disponivel para o candidato",
  in_progress: "Em andamento",
  completed: "Concluida",
  cancelled: "Cancelada",
  expired: "Expirada"
};

export function BehavioralAssessmentPanel({
  organizationId,
  role,
  headers
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
}) {
  const canManage = role === "owner" || role === "admin";

  const [applicationId, setApplicationId] = useState("");
  const [instrumentId, setInstrumentId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [cancelReason, setCancelReason] = useState("");

  const [importSummary, setImportSummary] = useState("");
  const [importProvider, setImportProvider] = useState("");
  const [importReferenceId, setImportReferenceId] = useState("");
  const [importAppliedAt, setImportAppliedAt] = useState("");
  const [importCompletedAt, setImportCompletedAt] = useState("");
  // externalImport exige ao menos uma dimensao (validateExternalImportInput rejeita array
  // vazio) -- mesma logica de lista dinamica ja usada por `BehavioralInstrumentPanel.tsx`
  // para as dimensoes do manifesto.
  const [importDimensions, setImportDimensions] = useState<{ code: string; value: string }[]>([]);
  const [newImportDimensionCode, setNewImportDimensionCode] = useState("");
  const [newImportDimensionValue, setNewImportDimensionValue] = useState("");

  const [message, setMessage] = useState("");

  function loadAssessments() {
    if (!applicationId.trim()) {
      setMessage("Informe o ID da candidatura (CandidateApplication).");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/behavioral-assessments`,
      {
        headers
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            "Nao foi possivel consultar as instancias de Perfil Comportamental desta candidatura."
          );
        }
        setAssessments((await response.json()) as Assessment[]);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createForApplication() {
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/behavioral-assessments`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(
          instrumentId.trim() && versionId.trim()
            ? {
                behavioralInstrumentId: instrumentId.trim(),
                behavioralInstrumentVersionId: versionId.trim()
              }
            : {}
        )
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: string };
          } | null;
          throw new Error(
            body?.error?.code === "behavioral_assessment_not_configured"
              ? "Esta vaga nao tem instrumento configurado -- informe instrumentId/versionId explicitamente."
              : "Nao foi possivel criar o Perfil Comportamental para esta candidatura."
          );
        }
        setMessage("Perfil Comportamental criado.");
        loadAssessments();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function cancelAssessment(assessmentId: string) {
    if (!cancelReason.trim()) {
      setMessage("Informe o motivo do cancelamento.");
      return;
    }
    fetch(`/api/organizations/${organizationId}/behavioral-assessments/${assessmentId}/cancel`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ reason: cancelReason })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel cancelar este Perfil Comportamental.");
        }
        setCancelReason("");
        setMessage("Perfil Comportamental cancelado.");
        loadAssessments();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function retryAssessment(assessmentId: string) {
    fetch(`/api/organizations/${organizationId}/behavioral-assessments/${assessmentId}/retry`, {
      method: "POST",
      headers
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            "Nao foi possivel reabrir uma nova tentativa (a anterior precisa estar finalizada)."
          );
        }
        setMessage("Nova tentativa criada.");
        loadAssessments();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function addImportDimension() {
    if (!newImportDimensionCode.trim() || !newImportDimensionValue.trim()) {
      setMessage("Informe codigo e valor da dimensao importada.");
      return;
    }
    setImportDimensions((current) => [
      ...current,
      { code: newImportDimensionCode.trim(), value: newImportDimensionValue.trim() }
    ]);
    setNewImportDimensionCode("");
    setNewImportDimensionValue("");
  }

  function removeImportDimension(code: string) {
    setImportDimensions((current) => current.filter((dimension) => dimension.code !== code));
  }

  function registerExternalImport() {
    if (
      !instrumentId.trim() ||
      !versionId.trim() ||
      !importSummary.trim() ||
      !importAppliedAt.trim() ||
      !importCompletedAt.trim() ||
      importDimensions.length === 0
    ) {
      setMessage(
        "Informe instrumento, versao, datas de aplicacao/conclusao externas, resumo e ao menos uma dimensao."
      );
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/behavioral-assessments/external-import`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          behavioralInstrumentId: instrumentId.trim(),
          behavioralInstrumentVersionId: versionId.trim(),
          externalProvider: importProvider.trim() || "manual",
          externalReferenceId: importReferenceId.trim() || null,
          appliedAtExternal: new Date(importAppliedAt).toISOString(),
          completedAtExternal: new Date(importCompletedAt).toISOString(),
          summaryText: importSummary.trim(),
          dimensions: importDimensions.map((dimension) => ({
            code: dimension.code,
            value: dimension.value
          }))
        })
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel registrar a importacao externa.");
        }
        setImportSummary("");
        setImportReferenceId("");
        setImportAppliedAt("");
        setImportCompletedAt("");
        setImportDimensions([]);
        setMessage("Resultado externo importado.");
        loadAssessments();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  if (!organizationId || !canManage) {
    return null;
  }

  return (
    <div
      className="panel behavioral-assessment-panel"
      aria-label="Perfil Comportamental - Instancias"
    >
      <span>Perfil Comportamental - Instancias por Candidatura</span>

      <label htmlFor="ba-application-id">
        ID da candidatura (CandidateApplication)
        <input
          id="ba-application-id"
          type="text"
          value={applicationId}
          onChange={(event) => setApplicationId(event.target.value)}
        />
      </label>
      <button type="button" onClick={loadAssessments}>
        Consultar
      </button>

      <div className="panel">
        <span>Criar / importar</span>
        <label htmlFor="ba-instrument-id">
          ID do instrumento (opcional se a vaga ja tiver preferencia configurada)
          <input
            id="ba-instrument-id"
            type="text"
            value={instrumentId}
            onChange={(event) => setInstrumentId(event.target.value)}
          />
        </label>
        <label htmlFor="ba-version-id">
          ID da versao
          <input
            id="ba-version-id"
            type="text"
            value={versionId}
            onChange={(event) => setVersionId(event.target.value)}
          />
        </label>
        <button type="button" onClick={createForApplication}>
          Criar Perfil Comportamental (fluxo interno)
        </button>

        <label htmlFor="ba-import-provider">
          Provedor externo
          <input
            id="ba-import-provider"
            type="text"
            value={importProvider}
            onChange={(event) => setImportProvider(event.target.value)}
          />
        </label>
        <label htmlFor="ba-import-reference">
          Referencia externa (idempotencia)
          <input
            id="ba-import-reference"
            type="text"
            value={importReferenceId}
            onChange={(event) => setImportReferenceId(event.target.value)}
          />
        </label>
        <label htmlFor="ba-import-applied-at">
          Data/hora da aplicacao externa
          <input
            id="ba-import-applied-at"
            type="datetime-local"
            value={importAppliedAt}
            onChange={(event) => setImportAppliedAt(event.target.value)}
          />
        </label>
        <label htmlFor="ba-import-completed-at">
          Data/hora da conclusao externa
          <input
            id="ba-import-completed-at"
            type="datetime-local"
            value={importCompletedAt}
            onChange={(event) => setImportCompletedAt(event.target.value)}
          />
        </label>
        <label htmlFor="ba-import-summary">
          Resumo do resultado
          <input
            id="ba-import-summary"
            type="text"
            value={importSummary}
            onChange={(event) => setImportSummary(event.target.value)}
          />
        </label>

        <div>
          <span>Dimensoes importadas</span>
          <ul>
            {importDimensions.map((dimension) => (
              <li key={dimension.code}>
                {dimension.code}: {dimension.value}
                <button type="button" onClick={() => removeImportDimension(dimension.code)}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <label htmlFor="ba-import-dimension-code">
            Codigo da dimensao
            <input
              id="ba-import-dimension-code"
              type="text"
              value={newImportDimensionCode}
              onChange={(event) => setNewImportDimensionCode(event.target.value)}
            />
          </label>
          <label htmlFor="ba-import-dimension-value">
            Valor
            <input
              id="ba-import-dimension-value"
              type="text"
              value={newImportDimensionValue}
              onChange={(event) => setNewImportDimensionValue(event.target.value)}
            />
          </label>
          <button type="button" onClick={addImportDimension}>
            Adicionar dimensao
          </button>
        </div>

        <button type="button" onClick={registerExternalImport}>
          Registrar importacao externa
        </button>
      </div>

      {assessments.length > 0 && (
        <ul>
          {assessments.map((assessment) => (
            <li key={assessment.id}>
              Tentativa {assessment.attemptNumber} - {statusLabels[assessment.status]} -{" "}
              {assessment.originType === "external_import" ? "importado" : "fluxo interno"}
              {["draft", "available", "in_progress"].includes(assessment.status) && (
                <button type="button" onClick={() => cancelAssessment(assessment.id)}>
                  Cancelar
                </button>
              )}
              {["completed", "cancelled", "expired"].includes(assessment.status) && (
                <button type="button" onClick={() => retryAssessment(assessment.id)}>
                  Reabrir (nova tentativa)
                </button>
              )}
              {assessment.result && (
                <div className="panel">
                  <span>Resultado</span>
                  {assessment.result.result.summaryText && (
                    <p>{assessment.result.result.summaryText}</p>
                  )}
                  <ul>
                    {assessment.result.dimensions.map((dimension) => (
                      <li key={dimension.dimensionCode}>
                        {dimension.label ?? dimension.dimensionCode}: {dimension.displayValue}
                        {dimension.interpretationText && ` - ${dimension.interpretationText}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <label htmlFor="ba-cancel-reason">
        Motivo do cancelamento
        <input
          id="ba-cancel-reason"
          type="text"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
        />
      </label>

      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
