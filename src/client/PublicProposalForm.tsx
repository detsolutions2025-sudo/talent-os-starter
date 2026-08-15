import { useMemo, useState } from "react";

type PublicProposal = {
  proposalVersionId: string;
  status: string;
  content: Record<string, unknown>;
  compensation: Record<string, unknown>;
  validUntil: string | null;
  presentationHash: string | null;
};

export function PublicProposalForm() {
  const [token, setToken] = useState("");
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [message, setMessage] = useState("");

  const headers = useMemo(
    () => ({ Authorization: `Proposal ${token}`, "content-type": "application/json" }),
    [token]
  );

  function load() {
    fetch("/api/public/proposals/current", { headers, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Proposta indisponivel.");
        setProposal((await response.json()) as PublicProposal);
        setMessage("");
      })
      .catch((error: Error) => {
        setProposal(null);
        setMessage(error.message);
      });
  }

  function decide(action: "accept" | "decline") {
    fetch(`/api/public/proposals/${action}`, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify(action === "decline" ? { declineReason } : {})
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel registrar a resposta.");
        setProposal((await response.json()) as PublicProposal);
        setMessage(action === "accept" ? "Aceite registrado." : "Recusa registrada.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  return (
    <main className="public-pre-interview-page">
      <h1>Proposta</h1>
      <label>
        Token de acesso
        <input value={token} onChange={(event) => setToken(event.target.value)} />
      </label>
      <button type="button" onClick={load}>
        Consultar
      </button>

      {proposal && (
        <section>
          <h2>Detalhes</h2>
          <pre>{JSON.stringify(proposal.content, null, 2)}</pre>
          <h2>Remuneracao</h2>
          <pre>{JSON.stringify(proposal.compensation, null, 2)}</pre>
          {proposal.validUntil && <p>Validade: {new Date(proposal.validUntil).toLocaleString()}</p>}
          <p>Status: {proposal.status}</p>
          <p>Hash de apresentacao: {proposal.presentationHash}</p>
          <button type="button" onClick={() => decide("accept")}>
            Aceitar
          </button>
          <label>
            Motivo da recusa
            <textarea
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => decide("decline")}>
            Recusar
          </button>
        </section>
      )}

      <p role="status">{message}</p>
    </main>
  );
}
