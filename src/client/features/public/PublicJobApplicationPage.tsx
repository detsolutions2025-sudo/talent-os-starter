import { useEffect, useMemo, useRef, useState } from "react";
import { PublicShell } from "./PublicShell";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Checkbox } from "../../components/ui/Checkbox";
import { ErrorState } from "../../components/ui/ErrorState";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import "./public.css";

// Fase 17 (SPEC-020 v1.1) - Candidatura Publica. Migrado para o Design System v1 na Wave 4
// (frontend puro -- ver `AGENTS`/roadmap): mesmo contrato HTTP, mesma semantica de seguranca,
// apenas apresentacao.
//
// Pagina publica minima: o suficiente para um visitante nao autenticado acessar o formulario
// e submeter uma candidatura (Plano Tecnico, secao 53/54). Nao implementa o Portal Publico
// agregado da SPEC-019/Fase 16 (SEO, listagem por Organization, Blueprint opt-in) -- apenas
// reutiliza o endpoint publico de Vaga individual ja existente (SPEC-010,
// `GET /api/public/job-openings/:slug`) para exibir o essencial da vaga antes do formulario.
//
// Sem `getActor`, sem Membership, sem conta: nenhum header de autenticacao e enviado por este
// componente, em nenhum momento (SPEC-020, secao 16).

type OrderedText = { text: string; displayOrder: number };

type PublicJobOpening = {
  slug: string;
  title: string;
  description: string;
  responsibilities: OrderedText[];
  requirements: OrderedText[];
  benefits: OrderedText[];
  location: { country: string; region: string; city: string; publicAddress: string; note: string };
  workModel: "onsite" | "hybrid" | "remote" | "flexible";
  workSchedule: { weeklyHours: number; description: string; shift: string };
  salaryRange: { min: number; max: number; currency: string; periodicity: string } | null;
  positionsCount: number;
  expectedStartDate: string | null;
  publicInstructions: string;
  applicationDeadline: string | null;
  isPubliclyAvailable: boolean;
};

type SubmitState = "idle" | "submitting" | "success" | "error";
type JobLoadState = "loading" | "ready" | "error";

const workModelLabels: Record<PublicJobOpening["workModel"], string> = {
  onsite: "Presencial",
  hybrid: "Híbrido",
  remote: "Remoto",
  flexible: "Flexível"
};

// Mapeamento de codigos de erro publicos para mensagens seguras e genericas (SPEC-020, secao
// 21) -- nunca expõe stack, SQL, IDs internos ou o motivo real de negacoes sensiveis
// (Candidate inativo/reaplicacao bloqueada sempre caem no fallback generico).
const errorMessages: Record<string, string> = {
  job_opening_public_not_found: "Esta vaga não está mais disponível.",
  job_opening_not_accepting_applications: "Esta vaga não está mais recebendo candidaturas.",
  public_application_consent_required: "É necessário aceitar o uso dos seus dados para continuar.",
  public_application_rate_limited:
    "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.",
  public_application_idempotency_conflict:
    "Não foi possível reenviar esta candidatura. Recarregue a página e tente novamente.",
  public_application_submission_in_progress: "Sua candidatura já está sendo processada."
};
const genericErrorMessage =
  "Não foi possível concluir sua candidatura. Verifique os dados ou entre em contato com a organização responsável.";

function newIdempotencyKey() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatSalary(range: PublicJobOpening["salaryRange"]) {
  if (!range) return null;
  const currency = range.currency || "BRL";
  const formatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  });
  const periodicityLabel =
    range.periodicity === "hourly" ? "/hora" : range.periodicity === "annual" ? "/ano" : "/mês";
  if (range.min && range.max && range.min !== range.max) {
    return `${formatter.format(range.min)} a ${formatter.format(range.max)}${periodicityLabel}`;
  }
  const value = range.max || range.min;
  return value ? `${formatter.format(value)}${periodicityLabel}` : null;
}

function sortedTexts(items: OrderedText[]) {
  return items.slice().sort((a, b) => a.displayOrder - b.displayOrder);
}

export function PublicJobApplicationPage({ slug }: { slug: string }) {
  const [opening, setOpening] = useState<PublicJobOpening | null>(null);
  const [jobLoadState, setJobLoadState] = useState<JobLoadState>("loading");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const formRenderedAt = useMemo(() => new Date().toISOString(), []);
  // A mesma Idempotency-Key so e reutilizada quando o payload da nova tentativa e
  // EXATAMENTE igual ao da tentativa anterior (retry de erro de rede/timeout, sem edicao do
  // formulario). Se o visitante alterar qualquer campo apos uma falha, uma nova chave e
  // gerada automaticamente -- caso contrario, o novo fingerprint (calculado no servidor a
  // partir do payload completo) seria detectado como reuso indevido da mesma chave para uma
  // submissao semanticamente diferente e recusado com conflito seguro (revisao destrutiva da
  // Fase 17, itens 6/7/36).
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const lastSubmittedPayloadSnapshot = useRef<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/job-openings/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        if (!response.ok) {
          setJobLoadState("error");
          return;
        }
        setOpening((await response.json()) as PublicJobOpening);
        setJobLoadState("ready");
      })
      .catch(() => setJobLoadState("error"));
  }, [slug]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);

    if (!fullName.trim() || !email.trim()) {
      setFieldError("Preencha nome completo e e-mail.");
      return;
    }
    if (!consent) {
      setFieldError("É necessário aceitar o uso dos seus dados para continuar.");
      return;
    }

    const payloadSnapshot = JSON.stringify({
      fullName,
      email,
      preferredName,
      phone,
      city,
      state
    });
    let keyForThisAttempt = idempotencyKey;
    if (
      lastSubmittedPayloadSnapshot.current !== null &&
      lastSubmittedPayloadSnapshot.current !== payloadSnapshot
    ) {
      keyForThisAttempt = newIdempotencyKey();
      setIdempotencyKey(keyForThisAttempt);
    }
    lastSubmittedPayloadSnapshot.current = payloadSnapshot;

    setSubmitState("submitting");
    fetch(`/api/public/job-openings/${encodeURIComponent(slug)}/applications`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": keyForThisAttempt
      },
      body: JSON.stringify({
        fullName,
        email,
        preferredName: preferredName || undefined,
        phone: phone || undefined,
        location: city || state ? { city, state } : undefined,
        consent: { granted: true, termsVersion: "1.0" },
        website: honeypot,
        formRenderedAt
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: string };
          } | null;
          const code = body?.error?.code;
          setErrorMessage((code && errorMessages[code]) || genericErrorMessage);
          setSubmitState("error");
          return;
        }
        setSubmitState("success");
      })
      .catch(() => {
        setErrorMessage(genericErrorMessage);
        setSubmitState("error");
      });
  }

  if (jobLoadState === "error") {
    return (
      <PublicShell>
        <ErrorState
          title="Esta vaga não está mais disponível."
          description="Verifique se o link está correto ou entre em contato com a organização responsável."
        />
      </PublicShell>
    );
  }

  if (submitState === "success") {
    return (
      <PublicShell>
        <Card>
          <h1 tabIndex={-1} className="ds-public-page-header__title">
            Candidatura recebida
          </h1>
          <p>
            Obrigado por se candidatar{opening ? ` para ${opening.title}` : ""}. A empresa entrará
            em contato caso avance no processo. Eventuais próximas etapas serão comunicadas
            oportunamente.
          </p>
        </Card>
      </PublicShell>
    );
  }

  const salaryLabel = opening ? formatSalary(opening.salaryRange) : null;
  const responsibilities = opening ? sortedTexts(opening.responsibilities) : [];
  const requirements = opening ? sortedTexts(opening.requirements) : [];
  const benefits = opening ? sortedTexts(opening.benefits) : [];

  return (
    <PublicShell wide>
      {jobLoadState === "loading" && (
        <Card>
          <Skeleton height={28} width="60%" />
          <div style={{ marginTop: "var(--space-3)" }}>
            <Skeleton height={16} />
          </div>
          <div style={{ marginTop: "var(--space-2)" }}>
            <Skeleton height={16} width="80%" />
          </div>
        </Card>
      )}

      {opening && (
        <>
          <div className="ds-public-page-header">
            <h1 className="ds-public-page-header__title">{opening.title}</h1>
            <p className="ds-public-page-header__description">
              {workModelLabels[opening.workModel]}
              {opening.location?.city ? ` · ${opening.location.city}` : ""}
              {opening.location?.region ? `/${opening.location.region}` : ""}
              {opening.positionsCount > 1 ? ` · ${opening.positionsCount} vagas` : ""}
            </p>
          </div>

          {!opening.isPubliclyAvailable && (
            <Alert tone="warning" role="alert">
              Esta vaga não está mais recebendo candidaturas.
            </Alert>
          )}

          <Card>
            {opening.description && <p>{opening.description}</p>}

            {(salaryLabel ||
              opening.workSchedule?.description ||
              opening.expectedStartDate ||
              opening.applicationDeadline) && (
              <dl className="ds-public-result">
                {salaryLabel && (
                  <div>
                    <dt>Remuneração</dt>
                    <dd>{salaryLabel}</dd>
                  </div>
                )}
                {opening.workSchedule?.description && (
                  <div>
                    <dt>Jornada</dt>
                    <dd>{opening.workSchedule.description}</dd>
                  </div>
                )}
                {opening.expectedStartDate && (
                  <div>
                    <dt>Início previsto</dt>
                    <dd>{new Date(opening.expectedStartDate).toLocaleDateString("pt-BR")}</dd>
                  </div>
                )}
                {opening.applicationDeadline && (
                  <div>
                    <dt>Prazo para candidatura</dt>
                    <dd>{new Date(opening.applicationDeadline).toLocaleDateString("pt-BR")}</dd>
                  </div>
                )}
              </dl>
            )}

            {responsibilities.length > 0 && (
              <div>
                <h2 className="ds-form-section__title">Responsabilidades</h2>
                <ul>
                  {responsibilities.map((item, index) => (
                    <li key={index}>{item.text}</li>
                  ))}
                </ul>
              </div>
            )}

            {requirements.length > 0 && (
              <div>
                <h2 className="ds-form-section__title">Requisitos</h2>
                <ul>
                  {requirements.map((item, index) => (
                    <li key={index}>{item.text}</li>
                  ))}
                </ul>
              </div>
            )}

            {benefits.length > 0 && (
              <div>
                <h2 className="ds-form-section__title">Benefícios</h2>
                <ul>
                  {benefits.map((item, index) => (
                    <li key={index}>{item.text}</li>
                  ))}
                </ul>
              </div>
            )}

            {opening.publicInstructions && <p>{opening.publicInstructions}</p>}
          </Card>
        </>
      )}

      <Card>
        <h2 className="ds-form-section__title">Quero me candidatar</h2>
        <form onSubmit={handleSubmit} noValidate className="ds-form-section__fields">
          <Input
            id="pa-full-name"
            label="Nome completo"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            required
          />

          <Input
            id="pa-preferred-name"
            label="Nome social / preferido (opcional)"
            value={preferredName}
            onChange={(event) => setPreferredName(event.target.value)}
          />

          <Input
            id="pa-email"
            type="email"
            label="E-mail"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <Input
            id="pa-phone"
            type="tel"
            label="Telefone (opcional)"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
          />

          <Input
            id="pa-city"
            label="Cidade (opcional)"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />

          <Input
            id="pa-state"
            label="Estado (opcional)"
            value={state}
            onChange={(event) => setState(event.target.value)}
          />

          {/* Honeypot -- invisivel e inalcancavel por teclado para pessoas; bots que preenchem
              todos os campos automaticamente costumam preencher este tambem. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
            <label htmlFor="pa-website">Não preencha este campo</label>
            <input
              id="pa-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />
          </div>

          <Checkbox
            id="pa-consent"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            required
            label="Autorizo o uso dos meus dados para participar do processo seletivo desta vaga, nesta empresa."
          />

          {fieldError && (
            <Alert tone="danger" role="alert">
              {fieldError}
            </Alert>
          )}
          {submitState === "error" && (
            <Alert tone="danger" role="alert">
              {errorMessage}
            </Alert>
          )}

          <Button type="submit" variant="primary" loading={submitState === "submitting"}>
            {submitState === "submitting" ? "Enviando..." : "Enviar candidatura"}
          </Button>
        </form>
      </Card>
    </PublicShell>
  );
}
