import { useEffect, useState } from "react";

// Fase 18 (SPEC-021 v1.0) - Pre-Entrevista Estruturada.
//
// Mesmo padrao de extracao ja usado por `BlueprintPanel.tsx` (Fase 15): componente proprio,
// auto-contido, que busca seus proprios dados via `organizationId`/`role`/`headers` recebidos
// de `App.tsx`, sem duplicar nenhum estado global existente. Cobre owner/admin: configuracao
// da Pre-Entrevista por vaga (settings) e consulta/administracao de instancias por
// CandidateApplication (cancelar, reabrir, rotacionar token) -- nunca implementa analise,
// nunca chama IA (SPEC-021, secao 2). Edicao de perguntas do Banco de Perguntas continua
// exclusivamente no modulo proprio de Perguntas ja existente (SPEC-021, secao 9.1: esta SPEC
// nunca cria um editor de perguntas paralelo).

type JobOpeningOption = { id: string; title: string; status: string };

type PreInterviewQuestionSetting = {
  id: string;
  questionCatalogItemId: string;
  displayOrder: number;
  required: boolean;
};

type PreInterviewSettings = {
  enabled: boolean;
  questions: PreInterviewQuestionSetting[];
};

type PreInterviewStatus =
  "draft" | "available" | "in_progress" | "completed" | "cancelled" | "expired";

type PreInterviewQuestionView = {
  id: string;
  snapshotTitle: string;
  displayOrder: number;
  required: boolean;
};

type PreInterviewInstance = {
  id: string;
  status: PreInterviewStatus;
  attemptNumber: number;
  previousAttemptId: string | null;
  createdSource: "system_after_application" | "internal_user" | "administrative_retry";
  expiresAt: string | null;
  questions?: PreInterviewQuestionView[];
  responses?: { preInterviewQuestionId: string; submitted: boolean }[];
};

const statusLabels: Record<PreInterviewStatus, string> = {
  draft: "Rascunho (interno)",
  available: "Disponivel para o candidato",
  in_progress: "Em andamento",
  completed: "Concluida",
  cancelled: "Cancelada",
  expired: "Expirada"
};

export function PreInterviewPanel({
  organizationId,
  role,
  headers
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
}) {
  const canManage = role === "owner" || role === "admin";

  const [jobOpenings, setJobOpenings] = useState<JobOpeningOption[]>([]);
  const [selectedJobOpeningId, setSelectedJobOpeningId] = useState("");
  const [settings, setSettings] = useState<PreInterviewSettings | null>(null);
  const [newQuestionCatalogItemId, setNewQuestionCatalogItemId] = useState("");
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);

  const [applicationId, setApplicationId] = useState("");
  const [instances, setInstances] = useState<PreInterviewInstance[]>([]);
  const [cancelReason, setCancelReason] = useState("");

  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!organizationId || !canManage) {
      setJobOpenings([]);
      setSelectedJobOpeningId("");
      setSettings(null);
      return;
    }

    fetch(`/api/organizations/${organizationId}/job-openings`, { headers })
      .then(async (response) => {
        setJobOpenings(response.ok ? ((await response.json()) as JobOpeningOption[]) : []);
      })
      .catch(() => setJobOpenings([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, canManage]);

  useEffect(() => {
    if (!selectedJobOpeningId) {
      setSettings(null);
      return;
    }
    loadSettings(selectedJobOpeningId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobOpeningId]);

  function loadSettings(jobOpeningId: string) {
    fetch(
      `/api/organizations/${organizationId}/job-openings/${jobOpeningId}/pre-interview-settings`,
      {
        headers
      }
    )
      .then(async (response) => {
        setSettings(response.ok ? ((await response.json()) as PreInterviewSettings) : null);
      })
      .catch(() => setSettings(null));
  }

  function saveSettings(next: PreInterviewSettings) {
    fetch(
      `/api/organizations/${organizationId}/job-openings/${selectedJobOpeningId}/pre-interview-settings`,
      {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          enabled: next.enabled,
          questions: next.questions.map((question, index) => ({
            questionCatalogItemId: question.questionCatalogItemId,
            displayOrder: index,
            required: question.required
          }))
        })
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel salvar a configuracao da Pre-Entrevista.");
        }
        setSettings((await response.json()) as PreInterviewSettings);
        setMessage("Configuracao da Pre-Entrevista salva.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function toggleEnabled() {
    if (!settings) {
      return;
    }
    saveSettings({ ...settings, enabled: !settings.enabled });
  }

  function addQuestion() {
    if (!settings || !newQuestionCatalogItemId.trim()) {
      setMessage("Informe o ID da pergunta do Banco de Perguntas.");
      return;
    }
    saveSettings({
      ...settings,
      questions: [
        ...settings.questions,
        {
          id: "",
          questionCatalogItemId: newQuestionCatalogItemId.trim(),
          displayOrder: settings.questions.length,
          required: newQuestionRequired
        }
      ]
    });
    setNewQuestionCatalogItemId("");
  }

  function removeQuestion(questionCatalogItemId: string) {
    if (!settings) {
      return;
    }
    saveSettings({
      ...settings,
      questions: settings.questions.filter(
        (question) => question.questionCatalogItemId !== questionCatalogItemId
      )
    });
  }

  function loadInstances() {
    if (!applicationId.trim()) {
      setMessage("Informe o ID da candidatura (CandidateApplication).");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/pre-interviews`,
      { headers }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel consultar as Pre-Entrevistas desta candidatura.");
        }
        setInstances((await response.json()) as PreInterviewInstance[]);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function createForApplication() {
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/pre-interviews`,
      {
        method: "POST",
        headers
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel criar a Pre-Entrevista para esta candidatura.");
        }
        setMessage("Pre-Entrevista criada.");
        loadInstances();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function cancelInstance(preInterviewId: string) {
    if (!cancelReason.trim()) {
      setMessage("Informe o motivo do cancelamento.");
      return;
    }
    fetch(`/api/organizations/${organizationId}/pre-interviews/${preInterviewId}/cancel`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ reason: cancelReason })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel cancelar a Pre-Entrevista.");
        }
        setCancelReason("");
        setMessage("Pre-Entrevista cancelada.");
        loadInstances();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function retryInstance(preInterviewId: string) {
    fetch(`/api/organizations/${organizationId}/pre-interviews/${preInterviewId}/retry`, {
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
        loadInstances();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function rotateToken(preInterviewId: string) {
    fetch(
      `/api/organizations/${organizationId}/pre-interviews/${preInterviewId}/rotate-access-token`,
      {
        method: "POST",
        headers
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel rotacionar o acesso desta Pre-Entrevista.");
        }
        const body = (await response.json()) as { rawAccessToken: string };
        setMessage(
          `Novo acesso gerado (envie ao candidato por um canal seguro, ele nunca sera mostrado novamente): ${body.rawAccessToken}`
        );
      })
      .catch((error: Error) => setMessage(error.message));
  }

  if (!organizationId || !canManage) {
    return null;
  }

  return (
    <div className="panel pre-interview-panel" aria-label="Pre-Entrevista Estruturada">
      <span>Pre-Entrevista Estruturada</span>

      <div className="panel">
        <span>Configuracao por Vaga</span>
        <label htmlFor="pint-job-opening">
          Vaga
          <select
            id="pint-job-opening"
            value={selectedJobOpeningId}
            onChange={(event) => setSelectedJobOpeningId(event.target.value)}
          >
            <option value="">Selecione uma vaga</option>
            {jobOpenings.map((opening) => (
              <option key={opening.id} value={opening.id}>
                {opening.title} ({opening.status})
              </option>
            ))}
          </select>
        </label>

        {settings && (
          <>
            <p>
              Status:{" "}
              <strong>{settings.enabled ? "Pre-Entrevista habilitada" : "Desabilitada"}</strong>
            </p>
            <button type="button" onClick={toggleEnabled}>
              {settings.enabled ? "Desabilitar" : "Habilitar"}
            </button>

            <ul>
              {settings.questions.map((question) => (
                <li key={question.questionCatalogItemId}>
                  {question.questionCatalogItemId}{" "}
                  {question.required ? "(obrigatoria)" : "(opcional)"}
                  <button
                    type="button"
                    onClick={() => removeQuestion(question.questionCatalogItemId)}
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>

            <div>
              <label htmlFor="pint-new-question">
                ID da pergunta (Banco de Perguntas)
                <input
                  id="pint-new-question"
                  type="text"
                  value={newQuestionCatalogItemId}
                  onChange={(event) => setNewQuestionCatalogItemId(event.target.value)}
                />
              </label>
              <label htmlFor="pint-new-question-required">
                <input
                  id="pint-new-question-required"
                  type="checkbox"
                  checked={newQuestionRequired}
                  onChange={(event) => setNewQuestionRequired(event.target.checked)}
                />
                Obrigatoria
              </label>
              <button type="button" onClick={addQuestion}>
                Adicionar pergunta
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <span>Instancias por Candidatura</span>
        <label htmlFor="pint-application-id">
          ID da candidatura (CandidateApplication)
          <input
            id="pint-application-id"
            type="text"
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
          />
        </label>
        <button type="button" onClick={loadInstances}>
          Consultar
        </button>
        <button type="button" onClick={createForApplication}>
          Criar Pre-Entrevista (fluxo interno)
        </button>

        {instances.length > 0 && (
          <ul>
            {instances.map((instance) => (
              <li key={instance.id}>
                Tentativa {instance.attemptNumber} - {statusLabels[instance.status]}
                {instance.questions && ` - ${instance.questions.length} pergunta(s)`}
                {["draft", "available", "in_progress"].includes(instance.status) && (
                  <button type="button" onClick={() => cancelInstance(instance.id)}>
                    Cancelar
                  </button>
                )}
                {["completed", "cancelled", "expired"].includes(instance.status) && (
                  <button type="button" onClick={() => retryInstance(instance.id)}>
                    Reabrir (nova tentativa)
                  </button>
                )}
                {["available", "in_progress", "completed"].includes(instance.status) && (
                  <button type="button" onClick={() => rotateToken(instance.id)}>
                    Rotacionar acesso do candidato
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <label htmlFor="pint-cancel-reason">
          Motivo do cancelamento
          <input
            id="pint-cancel-reason"
            type="text"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
          />
        </label>
      </div>

      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
