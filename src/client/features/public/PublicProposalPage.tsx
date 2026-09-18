import { useEffect, useMemo, useState } from "react";
import { PublicShell } from "./PublicShell";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";
import "./public.css";

// Fase 22 - Proposta / Aceite. Migrado para o Design System v1 na Wave 4 (frontend puro):
// mesmo contrato HTTP (`Authorization: Proposal <token>`) e semantica de token dos demais
// fluxos publicos (Fase 18/19) -- o token chega via fragment (`#access=...`), nunca na URL
// visivel nem em query string, e e transportado nas chamadas subsequentes exclusivamente pelo
// header Authorization.

type PublicProposal = {
  proposalVersionId: string;
  status: string;
  content: Record<string, unknown>;
  compensation: Record<string, unknown>;
  validUntil: string | null;
  presentationHash: string | null;
};

type Stage = "loading" | "unavailable" | "ready" | "decided";

const unavailableMessage =
  "Esta proposta não está mais disponível. Se você acredita que isso é um engano, entre em contato com a empresa responsável pelo processo seletivo.";

function readTokenFromFragment(): string {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get("access") ?? "";
}

function humanizeKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function RecordDetails({ record }: { record: Record<string, unknown> }) {
  const entries = Object.entries(record).filter(([, value]) => value !== null && value !== "");
  if (entries.length === 0) return null;
  return (
    <dl className="ds-public-result">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{humanizeKey(key)}</dt>
          <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PublicProposalPage() {
  const [token] = useState(readTokenFromFragment);
  const [stage, setStage] = useState<Stage>("loading");
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [message, setMessage] = useState("");
  const [deciding, setDeciding] = useState(false);

  const headers = useMemo(
    () => ({ Authorization: `Proposal ${token}`, "content-type": "application/json" }),
    [token]
  );

  useEffect(() => {
    // Mesmo padrao de seguranca dos demais fluxos publicos por token (Fase 18/19): o fragment e
    // removido da barra de enderecos assim que capturado, nunca voltando para a URL visivel.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!token) {
      setStage("unavailable");
      return;
    }
    fetch("/api/public/proposals/current", { headers, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setStage("unavailable");
          return;
        }
        setProposal((await response.json()) as PublicProposal);
        setStage("ready");
      })
      .catch(() => setStage("unavailable"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function decide(action: "accept" | "decline") {
    if (deciding) return;
    setDeciding(true);
    setMessage("");
    fetch(`/api/public/proposals/${action}`, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify(action === "decline" ? { declineReason } : {})
    })
      .then(async (response) => {
        if (!response.ok) {
          setMessage("Não foi possível registrar a resposta. Tente novamente.");
          return;
        }
        setProposal((await response.json()) as PublicProposal);
        setStage("decided");
      })
      .catch(() => setMessage("Não foi possível registrar a resposta. Tente novamente."))
      .finally(() => setDeciding(false));
  }

  if (stage === "loading") {
    return (
      <PublicShell>
        <Card>
          <Spinner label="Carregando proposta" />
        </Card>
      </PublicShell>
    );
  }

  if (stage === "unavailable") {
    return (
      <PublicShell>
        <ErrorState title={unavailableMessage} />
      </PublicShell>
    );
  }

  if (stage === "decided") {
    return (
      <PublicShell>
        <Card>
          <h1 tabIndex={-1} className="ds-public-page-header__title">
            {proposal?.status === "accepted" ? "Proposta aceita" : "Proposta recusada"}
          </h1>
          <p>
            {proposal?.status === "accepted"
              ? "Sua resposta foi registrada. A empresa entrará em contato para os próximos passos."
              : "Sua resposta foi registrada. Agradecemos o seu tempo."}
          </p>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="ds-public-page-header">
        <h1 className="ds-public-page-header__title">Proposta</h1>
        {proposal?.validUntil && (
          <p className="ds-public-page-header__description">
            Válida até {new Date(proposal.validUntil).toLocaleString("pt-BR")}
          </p>
        )}
      </div>

      {proposal && (
        <>
          <Card>
            <h2 className="ds-form-section__title">Detalhes</h2>
            <RecordDetails record={proposal.content} />
          </Card>

          <Card>
            <h2 className="ds-form-section__title">Remuneração</h2>
            <RecordDetails record={proposal.compensation} />
          </Card>

          <Card>
            <div className="ds-form-section__fields">
              {message && (
                <Alert tone="danger" role="alert">
                  {message}
                </Alert>
              )}

              <div className="ds-form-section__actions">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => decide("accept")}
                  loading={deciding}
                >
                  Aceitar proposta
                </Button>
              </div>

              <Textarea
                id="proposal-decline-reason"
                label="Motivo da recusa (opcional)"
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
              />

              <div className="ds-form-section__actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => decide("decline")}
                  loading={deciding}
                >
                  Recusar proposta
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </PublicShell>
  );
}
