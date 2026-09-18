import { useEffect, useMemo, useState } from "react";
import { PublicShell } from "./PublicShell";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ErrorState } from "../../components/ui/ErrorState";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";
import "./public.css";

// Fase 19 (SPEC-022 v1.0) - Perfil Comportamental. Migrado para o Design System v1 na Wave 4
// (frontend puro): mesmo contrato HTTP e semantica de token, apenas apresentacao.
//
// Mesmo padrao minimo ja usado por `PublicPreInterviewPage.tsx` (Fase 18): pagina publica sem
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
  "Este Perfil Comportamental não está mais disponível. Se você acredita que isso é um engano, entre em contato com a empresa responsável pelo processo seletivo.";

function readTokenFromFragment(): string {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get("access") ?? "";
}

export function PublicBehavioralAssessmentPage() {
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
    }).catch(() => setMessage("Não foi possível salvar esta resposta agora. Tente novamente."));
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
              ? "Responda todos os itens obrigatórios antes de enviar."
              : "Não foi possível enviar seu Perfil Comportamental agora. Tente novamente."
          );
          return;
        }
        const data = (await response.json()) as PublicBehavioralAssessmentView;
        setView(data);
        setStage("submitted");
      })
      .catch(() =>
        setMessage("Não foi possível enviar seu Perfil Comportamental agora. Tente novamente.")
      )
      .finally(() => setSubmitting(false));
  }

  if (stage === "loading") {
    return (
      <PublicShell>
        <Card>
          <Spinner label="Carregando Perfil Comportamental" />
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
            Perfil Comportamental enviado
          </h1>
          <p>
            Obrigado por responder. Suas respostas foram recebidas e serão consideradas pela equipe
            responsável. Eventuais próximas etapas serão comunicadas oportunamente.
          </p>
        </Card>
        {view?.result?.summaryText && (
          <Card>
            <h2 className="ds-form-section__title">Seu resultado</h2>
            <dl className="ds-public-result">
              <div>
                <dt>Resumo</dt>
                <dd>{view.result.summaryText}</dd>
              </div>
              {view.result.dimensions?.map((dimension) => (
                <div key={dimension.code}>
                  <dt>{dimension.label ?? dimension.code}</dt>
                  <dd>
                    {dimension.displayValue}
                    {dimension.interpretationText && ` — ${dimension.interpretationText}`}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </PublicShell>
    );
  }

  if (stage === "intro") {
    return (
      <PublicShell>
        <div className="ds-public-page-header">
          <h1 className="ds-public-page-header__title">Perfil Comportamental</h1>
          <p className="ds-public-page-header__description">
            Antes da etapa seguinte do processo seletivo, pedimos que você responda a um formulário
            estruturado sobre seu perfil comportamental.{" "}
            {view ? `${view.items.length} item(ns) no total.` : ""}
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
        <h1 className="ds-public-page-header__title">Perfil Comportamental</h1>
        {view && (
          <p className="ds-public-progress">
            Item {view.progress.answered} de {view.progress.total} respondido(s)
            {view.progress.requiredTotal > 0 &&
              ` (${view.progress.requiredAnswered} de ${view.progress.requiredTotal} obrigatórios)`}
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
          {view?.items
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((item) => {
              const labelText = `${item.promptText ?? ""}${item.required ? " *" : " (opcional)"}`;
              if (item.type === "single_choice" || item.type === "multiple_choice") {
                return (
                  <Select
                    key={item.id}
                    id={`ba-item-${item.id}`}
                    label={labelText}
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
                  </Select>
                );
              }
              if (item.type === "yes_no") {
                return (
                  <Select
                    key={item.id}
                    id={`ba-item-${item.id}`}
                    label={labelText}
                    value={draftAnswers[item.id] ?? ""}
                    onChange={(event) => saveAnswer(item.id, event.target.value)}
                    required={item.required}
                    aria-required={item.required}
                  >
                    <option value="">Selecione</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </Select>
                );
              }
              if (item.type === "numeric" || item.type === "scale") {
                return (
                  <Input
                    key={item.id}
                    id={`ba-item-${item.id}`}
                    type="number"
                    label={labelText}
                    value={draftAnswers[item.id] ?? ""}
                    onChange={(event) => saveAnswer(item.id, event.target.value)}
                    required={item.required}
                    aria-required={item.required}
                  />
                );
              }
              return (
                <Textarea
                  key={item.id}
                  id={`ba-item-${item.id}`}
                  label={labelText}
                  value={draftAnswers[item.id] ?? ""}
                  onChange={(event) => saveAnswer(item.id, event.target.value)}
                  required={item.required}
                  aria-required={item.required}
                />
              );
            })}

          {message && (
            <Alert tone="danger" role="alert">
              {message}
            </Alert>
          )}

          <Button type="submit" variant="primary" loading={submitting}>
            {submitting ? "Enviando..." : "Enviar Perfil Comportamental"}
          </Button>
        </form>
      </Card>
    </PublicShell>
  );
}
