// Fase 17 -- Candidatura Publica (SPEC-020 v1.1).
//
// Este modulo e um orquestrador: nao define nenhuma entidade de dominio paralela. Persiste
// exclusivamente em `Candidate`, `CandidateConsent` e `CandidateApplication` (ja definidos por
// `candidates/types.ts` e `candidate-applications/types.ts`) e na estrutura de idempotencia
// abaixo, que existe apenas para a coordenacao tecnica da submissao publica.

export type PublicApplicationSubmissionStatus = "pending" | "completed" | "failed";

export type PublicApplicationSubmission = {
  id: string;
  organizationId: string;
  jobOpeningId: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  status: PublicApplicationSubmissionStatus;
  candidateApplicationId: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
};

// DTO publico de entrada (SPEC-020, secao 25) -- allow-list minima. Nunca inclui id,
// organizationId, creationOrigin, createdByUserId, source, applicationStatus, currentStage,
// status de consentimento, timestamps ou qualquer metadado de auditoria: o servidor nunca lê
// esses campos do corpo da requisicao, entao mass assignment desses campos e estruturalmente
// impossivel, nao apenas bloqueado por uma denylist.
export type PublicApplicationInput = {
  fullName?: unknown;
  full_name?: unknown;
  email?: unknown;
  preferredName?: unknown;
  preferred_name?: unknown;
  phone?: unknown;
  location?: unknown;
  consent?: unknown;
  // Honeypot (secao 37 do Plano Tecnico) -- campo invisivel para humanos; jamais um dado real
  // do formulario. Preenchido => submissao tratada como bot, recusada de forma generica.
  website?: unknown;
  // Timing minimo (mesma secao) -- horario em que o formulario foi renderizado no cliente,
  // usado apenas para descartar submissoes implausivelmente rapidas. Nunca a unica defesa
  // (rate limit + honeypot continuam ativos mesmo se este campo estiver ausente).
  formRenderedAt?: unknown;
  form_rendered_at?: unknown;
};

export type NormalizedPublicApplicationInput = {
  fullName: string;
  preferredName: string | null;
  email: string;
  normalizedEmail: string;
  phone: string | null;
  location: unknown;
  consentGranted: boolean;
  consentTermsVersion: string | null;
  honeypot: string | null;
  formRenderedAt: string | null;
};

export type PublicApplicationResult = {
  status: "received";
  submissionId: string;
};
