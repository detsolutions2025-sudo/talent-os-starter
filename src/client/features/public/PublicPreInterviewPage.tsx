import { useEffect, useMemo, useState } from "react";
import { PublicShell } from "./PublicShell";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";
import "./public.css";

// Fase 18 (SPEC-021 v1.0) - Pre-Entrevista Estruturada. Migrado para o Design System v1 na
// Wave 4 (frontend puro): mesmo contrato HTTP e semantica de token, apenas apresentacao.
//
// Mesmo padrao minimo ja usado por `PublicJobApplicationPage.tsx` (Fase 17): pagina publica sem
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
  "Esta Pré-Entrevista não está mais disponível. Se você acredita que isso é um engano, entre em contato com a empresa responsável pelo processo seletivo.";

function readTokenFromFragment(): string {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get("access") ?? "";
}

export function PublicPreInterviewPage() {
  const [token] = useState(readTokenFromFragment);
  const [stage, setStage] = useState<Stage>("loading");
  const [view, setView] = useState<PublicPreInterviewView | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  // Revisao destrutiva, item 46: mesmo guard ja usado por `PublicJobApplicationPage.tsx` (Fase
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
    }).catch(() => setMessage("Não foi possível salvar esta resposta agora. Tente novamente."));
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
              ? "Responda todas as perguntas obrigatórias antes de enviar."
              : "Não foi possível enviar sua Pré-Entrevista agora. Tente novamente."
          );
          return;
        }
        setStage("submitted");
      })
      .catch(() => setMessage("Não foi possível enviar sua Pré-Entrevista agora. Tente novamente."))
      .finally(() => setSubmitting(false));
  }

  if (stage === "loading") {
    return (
      <PublicShell>
        <Card>
          <Spinner label="Carregando Pré-Entrevista" />
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

  if (stage === "submitted") {
    return (
      <PublicShell>
        <Card>
          <h1 tabIndex={-1} className="ds-public-page-header__title">
            Pré-Entrevista enviada
          </h1>
          <p>
            Obrigado por responder. Suas respostas foram recebidas e serão analisadas pela equipe
            responsável. Eventuais próximas etapas serão comunicadas oportunamente.
          </p>
        </Card>
      </PublicShell>
    );
  }

  if (stage === "intro") {
    return (
      <PublicShell>
        <div className="ds-public-page-header">
          <h1 className="ds-public-page-header__title">Pré-Entrevista Estruturada</h1>
          <p className="ds-public-page-header__description">
            Antes da etapa seguinte do processo seletivo, pedimos que você responda a um pequeno
            formulário estruturado. {view ? `${view.questions.length} pergunta(s) no total.` : ""}
          </p>
        </div>
        <Card>
          <Button type="button" variant="primary" onClick={start}>
            Iniciar
          </Button>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="ds-public-page-header">
        <h1 className="ds-public-page-header__title">Pré-Entrevista Estruturada</h1>
        {view && (
          <p className="ds-public-progress">
            Pergunta {view.progress.answered} de {view.progress.total} respondida(s)
            {view.progress.requiredTotal > 0 &&
              ` (${view.progress.requiredAnswered} de ${view.progress.requiredTotal} obrigatórias)`}
          </p>
        )}
      </div>

      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          noValidate
          className="ds-form-section__fields"
        >
          {view?.questions
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((question) => (
              <div className="ds-field" key={question.id}>
                <label className="ds-field__label" htmlFor={`pint-q-${question.id}`}>
                  {question.title}
                  {question.required ? " *" : " (opcional)"}
                </label>
                <p className="ds-field__hint">{question.text}</p>
                <Textarea
                  id={`pint-q-${question.id}`}
                  value={draftAnswers[question.id] ?? ""}
                  onChange={(event) => saveAnswer(question.id, event.target.value)}
                  required={question.required}
                  aria-required={question.required}
                />
              </div>
            ))}

          {message && (
            <Alert tone="danger" role="alert">
              {message}
            </Alert>
          )}

          <Button type="submit" variant="primary" loading={submitting}>
            {submitting ? "Enviando..." : "Enviar Pré-Entrevista"}
          </Button>
        </form>
      </Card>
    </PublicShell>
  );
}
