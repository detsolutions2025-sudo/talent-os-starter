import { useEffect, useMemo, useRef, useState } from "react";

// Fase 17 (SPEC-020 v1.1) - Candidatura Publica.
//
// Pagina publica minima: o suficiente para um visitante nao autenticado acessar o formulario
// e submeter uma candidatura (Plano Tecnico, secao 53/54). Nao implementa o Portal Publico
// agregado da SPEC-019/Fase 16 (SEO, listagem por Organization, Blueprint opt-in) -- apenas
// reutiliza o endpoint publico de Vaga individual ja existente (SPEC-010,
// `GET /api/public/job-openings/:slug`) para exibir o essencial da vaga antes do formulario.
//
// Sem `getActor`, sem Membership, sem conta: nenhum header de autenticacao e enviado por este
// componente, em nenhum momento (SPEC-020, secao 16).

type PublicJobOpening = {
  slug: string;
  title: string;
  description: string;
  workModel: "onsite" | "hybrid" | "remote" | "flexible";
  location: { city: string; state: string; country: string };
  isPubliclyAvailable: boolean;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

const workModelLabels: Record<PublicJobOpening["workModel"], string> = {
  onsite: "Presencial",
  hybrid: "Hibrido",
  remote: "Remoto",
  flexible: "Flexivel"
};

// Mapeamento de codigos de erro publicos para mensagens seguras e genericas (SPEC-020, secao
// 21) -- nunca expõe stack, SQL, IDs internos ou o motivo real de negacoes sensiveis
// (Candidate inativo/reaplicacao bloqueada sempre caem no fallback generico).
const errorMessages: Record<string, string> = {
  job_opening_public_not_found: "Esta vaga nao esta mais disponivel.",
  job_opening_not_accepting_applications: "Esta vaga nao esta mais recebendo candidaturas.",
  public_application_consent_required: "E necessario aceitar o uso dos seus dados para continuar.",
  public_application_rate_limited:
    "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.",
  public_application_idempotency_conflict:
    "Nao foi possivel reenviar esta candidatura. Recarregue a pagina e tente novamente.",
  public_application_submission_in_progress: "Sua candidatura ja esta sendo processada."
};
const genericErrorMessage =
  "Nao foi possivel concluir sua candidatura. Verifique os dados ou entre em contato com a organizacao responsavel.";

function newIdempotencyKey() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PublicApplicationForm({ slug }: { slug: string }) {
  const [opening, setOpening] = useState<PublicJobOpening | null>(null);
  const [loadError, setLoadError] = useState(false);

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
          setLoadError(true);
          return;
        }
        setOpening((await response.json()) as PublicJobOpening);
      })
      .catch(() => setLoadError(true));
  }, [slug]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);

    if (!fullName.trim() || !email.trim()) {
      setFieldError("Preencha nome completo e e-mail.");
      return;
    }
    if (!consent) {
      setFieldError("E necessario aceitar o uso dos seus dados para continuar.");
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

  if (loadError) {
    return (
      <main className="public-application-page">
        <p role="alert">Esta vaga nao esta mais disponivel.</p>
      </main>
    );
  }

  if (submitState === "success") {
    return (
      <main className="public-application-page">
        <h1 tabIndex={-1}>Candidatura recebida</h1>
        <p>
          Obrigado por se candidatar{opening ? ` para ${opening.title}` : ""}. A empresa entrara em
          contato caso avance no processo. Eventuais proximas etapas serao comunicadas
          oportunamente.
        </p>
      </main>
    );
  }

  return (
    <main className="public-application-page">
      {opening && (
        <header>
          <h1>{opening.title}</h1>
          <p>
            {workModelLabels[opening.workModel]}
            {opening.location?.city ? ` - ${opening.location.city}` : ""}
            {opening.location?.state ? `/${opening.location.state}` : ""}
          </p>
          {!opening.isPubliclyAvailable && (
            <p role="alert">Esta vaga nao esta mais recebendo candidaturas.</p>
          )}
        </header>
      )}

      <h2>Quero me candidatar</h2>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="pa-full-name">Nome completo</label>
          <input
            id="pa-full-name"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            required
          />
        </div>

        <div>
          <label htmlFor="pa-preferred-name">Nome social / preferido (opcional)</label>
          <input
            id="pa-preferred-name"
            type="text"
            value={preferredName}
            onChange={(event) => setPreferredName(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="pa-email">E-mail</label>
          <input
            id="pa-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label htmlFor="pa-phone">Telefone (opcional)</label>
          <input
            id="pa-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
          />
        </div>

        <div>
          <label htmlFor="pa-city">Cidade (opcional)</label>
          <input
            id="pa-city"
            type="text"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="pa-state">Estado (opcional)</label>
          <input
            id="pa-state"
            type="text"
            value={state}
            onChange={(event) => setState(event.target.value)}
          />
        </div>

        {/* Honeypot -- invisivel e inalcancavel por teclado para pessoas; bots que preenchem
            todos os campos automaticamente costumam preencher este tambem. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
          <label htmlFor="pa-website">Nao preencha este campo</label>
          <input
            id="pa-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="pa-consent">
            <input
              id="pa-consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              required
            />
            Autorizo o uso dos meus dados para participar do processo seletivo desta vaga, nesta
            empresa.
          </label>
        </div>

        {fieldError && (
          <p role="alert" className="message">
            {fieldError}
          </p>
        )}
        {submitState === "error" && (
          <p role="alert" className="message">
            {errorMessage}
          </p>
        )}

        <button type="submit" disabled={submitState === "submitting"}>
          {submitState === "submitting" ? "Enviando..." : "Enviar candidatura"}
        </button>
      </form>
    </main>
  );
}
