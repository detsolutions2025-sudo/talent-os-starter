import { useEffect, useMemo, useState } from "react";

// Fase 19 (SPEC-022 v1.0) - Perfil Comportamental.
//
// Mesmo padrao minimo ja usado por `PublicPreInterviewForm.tsx` (Fase 18): pagina publica sem
// login, sem `getActor`, sem IA. O token de acesso nunca aparece na URL nem em query string --
// chega via fragment (`#access=...`), nunca enviado ao servidor pelo navegador, e e
// transportado nas chamadas subsequentes exclusivamente pelo header
// `Authorization: BehavioralAssessment <token>`.

type PublicItem = {
  id: string;
  type: "open_text" | "single_choice" | "multiple_choice" | "yes_no" | "numeric" | "scale";
  promptText: string | null;
  options: { id: string; text: string }[] | null;
  required: boolean;
  displayOrder: number;
};

type PublicResultView = {
  summaryText?: string | null;
  dimensions?: {
    code: string;
    label: string | null;
    displayValue: string;
    interpretationText: string | null;
  }[];
} | null;

type PublicBehavioralAssessmentView = {
  status: "draft" | "available" | "in_progress" | "completed" | "cancelled" | "expired";
  expiresAt: string | null;
  items: PublicItem[];
  responses: { itemId: string; value: unknown; submitted: boolean }[];
  progress: { answered: number; total: number; requiredAnswered: number; requiredTotal: number };
  result: PublicResultView;
};

type Stage = "loading" | "unavailable" | "intro" | "answering" | "submitted";

const unavailableMessage =
  "Este Perfil Comportamental nao esta mais disponivel. Se voce acredita que isso e um engano, entre em contato com a empresa responsavel pelo processo seletivo.";

function readTokenFromFragment(): string {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get("access") ?? "";
}

export function PublicBehavioralAssessmentForm() {
  const [token] = useState(readTokenFromFragment);
  const [stage, setStage] = useState<Stage>("loading");
  const [view, setView] = useState<PublicBehavioralAssessmentView | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = useMemo(
    () => ({ Authorization: `BehavioralAssessment ${token}`, "content-type": "application/json" }),
    [token]
  );

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!token) {
      setStage("unavailable");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function load() {
    fetch("/api/public/behavioral-assessments/current", { headers: authHeaders })
      .then(async (response) => {
        if (!response.ok) {
          setStage("unavailable");
          return;
        }
        const data = (await response.json()) as PublicBehavioralAssessmentView;
        setView(data);
        const answers: Record<string, string> = {};
        for (const response_ of data.responses) {
          answers[response_.itemId] = typeof response_.value === "string" ? response_.value : "";
        }
        setDraftAnswers(answers);
        if (data.status === "completed") {
          setStage("submitted");
        } else if (data.status === "in_progress") {
          setStage("answering");
        } else if (data.status === "available") {
          setStage("intro");
        } else {
          setStage("unavailable");
        }
      })
      .catch(() => setStage("unavailable"));
  }

  function start() {
    fetch("/api/public/behavioral-assessments/start", { method: "POST", headers: authHeaders })
      .then(async (response) => {
        if (!response.ok) {
          setStage("unavailable");
          return;
        }
        setStage("answering");
        load();
      })
      .catch(() => setStage("unavailable"));
  }

  function saveAnswer(itemId: string, value: string) {
    setDraftAnswers((current) => ({ ...current, [itemId]: value }));
    fetch(`/api/public/behavioral-assessments/responses/${encodeURIComponent(itemId)}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ responseValue: value })
    }).catch(() => setMessage("Nao foi possivel salvar esta resposta agora. Tente novamente."));
  }

  function submit() {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    fetch("/api/public/behavioral-assessments/submit", { method: "POST", headers: authHeaders })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: string };
          } | null;
          setMessage(
            body?.error?.code === "behavioral_assessment_required_response_missing"
              ? "Responda todos os itens obrigatorios antes de enviar."
              : "Nao foi possivel enviar seu Perfil Comportamental agora. Tente novamente."
          );
          return;
        }
        const data = (await response.json()) as PublicBehavioralAssessmentView;
        setView(data);
        setStage("submitted");
      })
      .catch(() =>
        setMessage("Nao foi possivel enviar seu Perfil Comportamental agora. Tente novamente.")
      )
      .finally(() => setSubmitting(false));
  }

  if (stage === "loading") {
    return (
      <main className="public-behavioral-assessment-page">
        <p>Carregando...</p>
      </main>
    );
  }

  if (stage === "unavailable") {
    return (
      <main className="public-behavioral-assessment-page">
        <p role="alert">{unavailableMessage}</p>
      </main>
    );
  }

  if (stage === "submitted") {
    return (
      <main className="public-behavioral-assessment-page">
        <h1 tabIndex={-1}>Perfil Comportamental enviado</h1>
        <p>
          Obrigado por responder. Suas respostas foram recebidas e serao consideradas pela equipe
          responsavel. Eventuais proximas etapas serao comunicadas oportunamente.
        </p>
        {view?.result?.summaryText && (
          <div className="panel">
            <span>Seu resultado</span>
            <p>{view.result.summaryText}</p>
            {view.result.dimensions?.map((dimension) => (
              <p key={dimension.code}>
                {dimension.label ?? dimension.code}: {dimension.displayValue}
                {dimension.interpretationText && ` - ${dimension.interpretationText}`}
              </p>
            ))}
          </div>
        )}
      </main>
    );
  }

  if (stage === "intro") {
    return (
      <main className="public-behavioral-assessment-page">
        <h1>Perfil Comportamental</h1>
        <p>
          Antes da etapa seguinte do processo seletivo, pedimos que voce responda a um formulario
          estruturado sobre seu perfil comportamental.{" "}
          {view ? `${view.items.length} item(ns) no total.` : ""}
        </p>
        <button type="button" onClick={start}>
          Iniciar
        </button>
      </main>
    );
  }

  return (
    <main className="public-behavioral-assessment-page">
      <h1>Perfil Comportamental</h1>
      {view && (
        <p>
          Progresso: {view.progress.answered} de {view.progress.total} itens respondidos
          {view.progress.requiredTotal > 0 &&
            ` (${view.progress.requiredAnswered} de ${view.progress.requiredTotal} obrigatorios)`}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        noValidate
      >
        {view?.items
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((item) => (
            <div key={item.id}>
              <label htmlFor={`ba-item-${item.id}`}>
                {item.promptText}
                {item.required ? " *" : " (opcional)"}
              </label>
              {item.type === "single_choice" || item.type === "multiple_choice" ? (
                <select
                  id={`ba-item-${item.id}`}
                  value={draftAnswers[item.id] ?? ""}
                  onChange={(event) => saveAnswer(item.id, event.target.value)}
                  required={item.required}
                  aria-required={item.required}
                >
                  <option value="">Selecione</option>
                  {item.options?.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.text}
                    </option>
                  ))}
                </select>
              ) : item.type === "yes_no" ? (
                <select
                  id={`ba-item-${item.id}`}
                  value={draftAnswers[item.id] ?? ""}
                  onChange={(event) => saveAnswer(item.id, event.target.value)}
                  required={item.required}
                  aria-required={item.required}
                >
                  <option value="">Selecione</option>
                  <option value="true">Sim</option>
                  <option value="false">Nao</option>
                </select>
              ) : item.type === "numeric" || item.type === "scale" ? (
                <input
                  id={`ba-item-${item.id}`}
                  type="number"
                  value={draftAnswers[item.id] ?? ""}
                  onChange={(event) => saveAnswer(item.id, event.target.value)}
                  required={item.required}
                  aria-required={item.required}
                />
              ) : (
                <textarea
                  id={`ba-item-${item.id}`}
                  value={draftAnswers[item.id] ?? ""}
                  onChange={(event) => saveAnswer(item.id, event.target.value)}
                  required={item.required}
                  aria-required={item.required}
                />
              )}
            </div>
          ))}

        {message && (
          <p role="alert" className="message">
            {message}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? "Enviando..." : "Enviar Perfil Comportamental"}
        </button>
      </form>
    </main>
  );
}
