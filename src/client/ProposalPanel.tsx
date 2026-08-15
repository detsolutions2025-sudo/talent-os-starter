import { useMemo, useState } from "react";

type ApplicationOption = {
  id: string;
  candidateId?: string;
  candidate?: { fullName?: string; full_name?: string } | null;
  candidateName?: string;
  applicationStatus?: string;
  application_status?: string;
  currentStage?: string;
  current_stage?: string;
};

type ProposalView = {
  id: string;
  candidateApplicationId: string;
  currentVersionId: string | null;
  currentVersion: ProposalVersionView | null;
};

type ProposalVersionView = {
  id: string;
  versionNumber: number | null;
  status: string;
  contentSnapshot?: Record<string, unknown>;
  compensationSnapshot?: Record<string, unknown>;
  validUntil: string | null;
  issuedAt?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  expiredAt?: string | null;
  cancelledAt?: string | null;
  supersededAt?: string | null;
  discardedAt?: string | null;
  presentationHash?: string | null;
};

export function ProposalPanel({
  organizationId,
  role,
  headers,
  applications
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
  applications: ApplicationOption[];
}) {
  const canDraft = role === "owner" || role === "admin";
  const canIssue = role === "owner";
  const [applicationId, setApplicationId] = useState("");
  const [proposal, setProposal] = useState<ProposalView | null>(null);
  const [versions, setVersions] = useState<ProposalVersionView[]>([]);
  const [contentText, setContentText] = useState("Proposta para a vaga publicada.");
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [periodicity, setPeriodicity] = useState("monthly");
  const [validUntil, setValidUntil] = useState("");
  const [reason, setReason] = useState("");
  const [stageReason, setStageReason] = useState("");
  const [lastToken, setLastToken] = useState("");
  const [message, setMessage] = useState("");

  const selectedDraftId = useMemo(
    () => versions.find((version) => version.status === "draft" && !version.discardedAt)?.id ?? "",
    [versions]
  );

  function load(nextApplicationId = applicationId) {
    if (!nextApplicationId) return;
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${nextApplicationId}/proposals`,
      {
        headers
      }
    )
      .then(async (response) => {
        setProposal(response.ok ? ((await response.json()) as ProposalView) : null);
      })
      .catch(() => setProposal(null));
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${nextApplicationId}/proposals/versions`,
      { headers }
    )
      .then(async (response) => {
        setVersions(response.ok ? ((await response.json()) as ProposalVersionView[]) : []);
      })
      .catch(() => setVersions([]));
  }

  function saveDraft() {
    if (!applicationId) {
      setMessage("Selecione uma candidatura.");
      return;
    }
    const value = Number(salary || "0");
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId}/proposals/draft`,
      {
        method: proposal ? "PATCH" : "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          contentSnapshot: { text: contentText },
          compensationSnapshot: { salary: value, currency, periodicity },
          validUntil: validUntil || null
        })
      }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel salvar a proposta.");
        setProposal((await response.json()) as ProposalView);
        setMessage("Rascunho salvo.");
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function issue(action: "issue" | "supersede") {
    const proposalVersionId = selectedDraftId;
    if (!applicationId || !proposalVersionId) {
      setMessage("Crie um rascunho antes de emitir.");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId}/proposals/${action}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "Idempotency-Key": `${action}-${applicationId}-${proposalVersionId}-${Date.now()}`
        },
        body: JSON.stringify({ proposalVersionId, stageChangeReason: stageReason || null })
      }
    )
      .then(async (response) => {
        const body = (await response.json()) as ProposalView & {
          rawAccessToken?: string;
          tokenReturned?: boolean;
        };
        if (!response.ok) throw new Error("Nao foi possivel emitir a proposta.");
        setProposal(body);
        setLastToken(body.rawAccessToken ?? "");
        setMessage(
          body.rawAccessToken
            ? "Token gerado. Ele nao sera recuperado depois."
            : "Operacao concluida."
        );
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function postSimple(action: "cancel" | "discard-draft" | "rotate-grant") {
    if (!applicationId) return;
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId}/proposals/${action}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "Idempotency-Key": `${action}-${applicationId}-${Date.now()}`
        },
        body: JSON.stringify(action === "rotate-grant" ? {} : { reason })
      }
    )
      .then(async (response) => {
        const body = (await response.json()) as { rawAccessToken?: string };
        if (!response.ok) throw new Error("Operacao nao concluida.");
        setLastToken(body.rawAccessToken ?? "");
        setMessage(body.rawAccessToken ? "Novo token gerado em memoria." : "Operacao concluida.");
        load();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  return (
    <section className="panel">
      <span>Propostas</span>
      <label>
        Candidatura
        <select
          value={applicationId}
          onChange={(event) => {
            setApplicationId(event.target.value);
            setProposal(null);
            setVersions([]);
            setLastToken("");
            if (event.target.value) load(event.target.value);
          }}
        >
          <option value="">Selecione</option>
          {applications.map((application) => (
            <option key={application.id} value={application.id}>
              {application.candidate?.fullName ??
                application.candidate?.full_name ??
                application.candidateName ??
                application.candidateId ??
                application.id}
            </option>
          ))}
        </select>
      </label>

      {applicationId && (
        <button type="button" onClick={() => load()}>
          Atualizar
        </button>
      )}

      {canDraft && applicationId && (
        <div className="form-grid">
          <textarea
            aria-label="Conteudo da proposta"
            value={contentText}
            onChange={(event) => setContentText(event.target.value)}
          />
          <input
            aria-label="Remuneracao"
            placeholder="Remuneracao"
            value={salary}
            onChange={(event) => setSalary(event.target.value)}
          />
          <input
            aria-label="Moeda"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          />
          <input
            aria-label="Periodicidade"
            value={periodicity}
            onChange={(event) => setPeriodicity(event.target.value)}
          />
          <input
            aria-label="Validade"
            type="datetime-local"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
          <button type="button" onClick={saveDraft}>
            Salvar rascunho
          </button>
        </div>
      )}

      {canIssue && proposal && (
        <div className="actions">
          <input
            aria-label="Motivo de salto de etapa"
            placeholder="Motivo se houver salto para offer"
            value={stageReason}
            onChange={(event) => setStageReason(event.target.value)}
          />
          <button type="button" onClick={() => issue("issue")}>
            Emitir
          </button>
          <button type="button" onClick={() => issue("supersede")}>
            Substituir
          </button>
          <input
            aria-label="Motivo operacional"
            placeholder="Motivo"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <button type="button" onClick={() => postSimple("cancel")}>
            Cancelar
          </button>
          <button type="button" onClick={() => postSimple("discard-draft")}>
            Descartar rascunho
          </button>
          <button type="button" onClick={() => postSimple("rotate-grant")}>
            Novo token
          </button>
        </div>
      )}

      {lastToken && (
        <p className="message" role="status">
          Token: {lastToken}
        </p>
      )}
      <p className="message" role="status">
        {message}
      </p>

      <ul>
        {versions.map((version) => (
          <li key={version.id}>
            <strong>{version.status}</strong> - v{version.versionNumber ?? "draft"} - {version.id}
          </li>
        ))}
      </ul>
    </section>
  );
}
