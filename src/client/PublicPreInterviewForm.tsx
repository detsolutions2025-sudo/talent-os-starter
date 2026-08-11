import { useEffect, useMemo, useState } from "react";

// Fase 18 (SPEC-021 v1.0) - Pre-Entrevista Estruturada.
//
// Mesmo padrao minimo ja usado por `PublicApplicationForm.tsx` (Fase 17): pagina publica sem
// login, sem `getActor`, sem IA. O token de acesso nunca aparece na URL nem em query string
// (Plano Tecnico da Fase 18, correcao final, item 3/36/37) -- chega via fragment
// (`#access=...`), nunca enviado ao servidor pelo navegador, e e transportado nas chamadas
// subsequentes exclusivamente pelo header `Authorization: PreInterview <token>`.

type PublicQuestion = {
  id: string;
  title: string;
  text: string;
  type:
    | "open_text"
    | "long_text"
    | "single_choice"
    | "multiple_choice"
    | "yes_no"
    | "numeric"
    | "scale"
    | "date"
    | "situational"
    | "behavioral"
    | "technical";
  options: { id: string; text: string }[];
  required: boolean;
  displayOrder: number;
};

type PublicPreInterviewView = {
  status: "draft" | "available" | "in_progress" | "completed" | "cancelled" | "expired";
  expiresAt: string | null;
  questions: PublicQuestion[];
  responses: { questionId: string; value: unknown; submitted: boolean }[];
  progress: { answered: number; total: number; requiredAnswered: number; requiredTotal: number };
};

type Stage = "loading" | "unavailable" | "intro" | "answering" | "submitted";

const unavailableMessage =
  "Esta Pre-Entrevista nao esta mais disponivel. Se voce acredita que isso e um engano, entre em contato com a empresa responsavel pelo processo seletivo.";

function readTokenFromFragment(): string {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get("access") ?? "";
}

export function PublicPreInterviewForm() {
  const [token] = useState(readTokenFromFragment);
  const [stage, setStage] = useState<Stage>("loading");
  const [view, setView] = useState<PublicPreInterviewView | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  // Revisao destrutiva, item 46: mesmo guard ja usado por `PublicApplicationForm.tsx` (Fase
  // 17) -- o servidor ja e idempotente para submit duplicado, mas o botao desabilitado evita
  // um duplo-clique disparar duas requisicoes desnecessarias.
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = useMemo(
    () => ({ Authorization: `PreInterview ${token}`, "content-type": "application/json" }),
    [token]
  );

  useEffect(() => {
    // Remove o token da barra de enderecos assim que capturado -- ele so continua vivo em
    // memoria (estado do componente), nunca voltando para a URL visivel nem para o historico
    // do navegador.
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
    fetch("/api/public/pre-interviews/current", { headers: authHeaders })
      .then(async (response) => {
        if (!response.ok) {
          setStage("unavailable");
          return;
        }
        const data = (await response.json()) as PublicPreInterviewView;
        setView(data);
        const answers: Record<string, string> = {};
        for (const response_ of data.responses) {
          answers[response_.questionId] =
            typeof response_.value === "string" ? response_.value : "";
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
    fetch("/api/public/pre-interviews/start", { method: "POST", headers: authHeaders })
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

  function saveAnswer(questionId: string, value: string) {
    setDraftAnswers((current) => ({ ...current, [questionId]: value }));
    fetch(`/api/public/pre-interviews/responses/${encodeURIComponent(questionId)}`, {
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
    fetch("/api/public/pre-interviews/submit", { method: "POST", headers: authHeaders })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: string };
          } | null;
          setMessage(
            body?.error?.code === "pre_interview_required_response_missing"
              ? "Responda todas as perguntas obrigatorias antes de enviar."
              : "Nao foi possivel enviar sua Pre-Entrevista agora. Tente novamente."
          );
          return;
        }
        setStage("submitted");
      })
      .catch(() => setMessage("Nao foi possivel enviar sua Pre-Entrevista agora. Tente novamente."))
      .finally(() => setSubmitting(false));
  }

  if (stage === "loading") {
    return (
      <main className="public-pre-interview-page">
        <p>Carregando...</p>
      </main>
    );
  }

  if (stage === "unavailable") {
    return (
      <main className="public-pre-interview-page">
        <p role="alert">{unavailableMessage}</p>
      </main>
    );
  }

  if (stage === "submitted") {
    return (
      <main className="public-pre-interview-page">
        <h1 tabIndex={-1}>Pre-Entrevista enviada</h1>
        <p>
          Obrigado por responder. Suas respostas foram recebidas e serao analisadas pela equipe
          responsavel. Eventuais proximas etapas serao comunicadas oportunamente.
        </p>
      </main>
    );
  }

  if (stage === "intro") {
    return (
      <main className="public-pre-interview-page">
        <h1>Pre-Entrevista Estruturada</h1>
        <p>
          Antes da etapa seguinte do processo seletivo, pedimos que voce responda a um pequeno
          formulario estruturado. {view ? `${view.questions.length} pergunta(s) no total.` : ""}
        </p>
        <button type="button" onClick={start}>
          Iniciar
        </button>
      </main>
    );
  }

  return (
    <main className="public-pre-interview-page">
      <h1>Pre-Entrevista Estruturada</h1>
      {view && (
        <p>
          Progresso: {view.progress.answered} de {view.progress.total} perguntas respondidas
          {view.progress.requiredTotal > 0 &&
            ` (${view.progress.requiredAnswered} de ${view.progress.requiredTotal} obrigatorias)`}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        noValidate
      >
        {view?.questions
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((question) => (
            <div key={question.id}>
              <label htmlFor={`pint-q-${question.id}`}>
                {question.title}
                {question.required ? " *" : " (opcional)"}
              </label>
              <p>{question.text}</p>
              <textarea
                id={`pint-q-${question.id}`}
                value={draftAnswers[question.id] ?? ""}
                onChange={(event) => saveAnswer(question.id, event.target.value)}
                required={question.required}
                aria-required={question.required}
              />
            </div>
          ))}

        {message && (
          <p role="alert" className="message">
            {message}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? "Enviando..." : "Enviar Pre-Entrevista"}
        </button>
      </form>
    </main>
  );
}
