import { useState } from "react";

type CandidateDossierStatus = "generated";
type CandidateDossierGenerationKind = "regular" | "final_record";

type CandidateDossierMemberView = {
  id: string;
  status: CandidateDossierStatus;
  versionNumber: number;
};

type CandidateDossierOwnerView = CandidateDossierMemberView & {
  generationKind: CandidateDossierGenerationKind;
  candidateApplicationId: string;
  previousVersionId: string | null;
  finalRecordReason: string | null;
  presentedSnapshot: Record<string, unknown>;
  contentHash: string;
  sourceCount: number;
  generatedByUserId: string;
  generatedAt: string;
};

type CandidateDossierSource = {
  id: string;
  sourceType: string;
  originKind: string;
  fieldName: string | null;
  contentHash: string;
  presentedOrder: number;
};

export function CandidateDossierPanel({
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
  const [list, setList] = useState<Array<CandidateDossierOwnerView | CandidateDossierMemberView>>(
    []
  );
  const [selected, setSelected] = useState<CandidateDossierOwnerView | null>(null);
  const [sources, setSources] = useState<CandidateDossierSource[]>([]);
  const [message, setMessage] = useState("");

  function loadList() {
    if (!applicationId.trim()) {
      setMessage("Informe o ID da candidatura (CandidateApplication).");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/candidate-dossiers`,
      { headers }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel consultar os dossies desta candidatura.");
        }
        setList((await response.json()) as Array<CandidateDossierOwnerView>);
        setSelected(null);
        setSources([]);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function generateDossier() {
    if (!applicationId.trim()) {
      setMessage("Informe o ID da candidatura (CandidateApplication).");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/candidate-applications/${applicationId.trim()}/candidate-dossiers`,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "Idempotency-Key": `dossier-${crypto.randomUUID()}`
        },
        body: JSON.stringify({})
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? "Nao foi possivel gerar o dossie.");
        }
        setMessage("Dossie gerado.");
        loadList();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function loadDetail(dossierId: string) {
    fetch(`/api/organizations/${organizationId}/candidate-dossiers/${dossierId}`, { headers })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel consultar o dossie.");
        }
        setSelected((await response.json()) as CandidateDossierOwnerView);
      })
      .catch((error: Error) => setMessage(error.message));

    fetch(`/api/organizations/${organizationId}/candidate-dossiers/${dossierId}/sources`, {
      headers
    })
      .then(async (response) => {
        setSources(response.ok ? ((await response.json()) as CandidateDossierSource[]) : []);
      })
      .catch(() => setSources([]));
  }

  if (!organizationId || (!canManage && !isMember)) {
    return null;
  }

  return (
    <div className="panel pre-analysis-panel" aria-label="Dossie Inteligente do Candidato">
      <span>Dossie Inteligente do Candidato</span>
      <label htmlFor="candidate-dossier-application-id">
        ID da candidatura (CandidateApplication)
        <input
          id="candidate-dossier-application-id"
          type="text"
          value={applicationId}
          onChange={(event) => setApplicationId(event.target.value)}
        />
      </label>
      <button type="button" onClick={loadList}>
        Consultar dossies
      </button>
      {canManage && (
        <button type="button" onClick={generateDossier}>
          Gerar dossie
        </button>
      )}

      {list.length > 0 && (
        <ul>
          {list.map((item) => (
            <li key={item.id}>
              Versao {item.versionNumber}
              {"generationKind" in item ? ` - ${item.generationKind}` : ""} - {item.status}
              {canManage && (
                <button type="button" onClick={() => loadDetail(item.id)}>
                  Ver fontes
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="panel">
          <span>Dossie v{selected.versionNumber}</span>
          <p>{selected.sourceCount} fonte(s) materializada(s).</p>
          <code>{selected.contentHash}</code>
        </div>
      )}

      {sources.length > 0 && (
        <div className="panel">
          <span>Fontes do dossie</span>
          <ul>
            {sources.map((source) => (
              <li key={source.id}>
                {source.presentedOrder}. {source.sourceType} - {source.originKind}
                {source.fieldName ? ` - ${source.fieldName}` : ""}
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
