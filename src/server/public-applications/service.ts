import { createHash } from "node:crypto";
import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { badRequest, conflict, gone, notFound, tooManyRequests } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { RateLimiter, type RateLimitConfig } from "../core/rate-limiter";
import type { CandidateService } from "../candidates/service";
import type { Candidate } from "../candidates/types";
import type { CandidateApplicationService } from "../candidate-applications/service";
import type { JobOpeningRepository } from "../job-openings/repository";
import type { JobOpening } from "../job-openings/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresJobOpeningRepository } from "../persistence/postgres-job-opening-repository";
import { PostgresPublicApplicationRepository } from "../persistence/postgres-public-application-repository";
import { auditPublicDenied, auditPublicSuccess } from "./audit";
import type { PublicApplicationRepository } from "./repository";
import {
  createPublicApplicationTransactionRunner,
  type PublicApplicationTransactionRunner
} from "./transaction";
import type { PublicApplicationResult } from "./types";
import { validateIdempotencyKey, validatePublicApplicationInput } from "./validation";

// Nunca um valor numerico livre por chamada -- configuracao centralizada, mesmo padrao ja
// estabelecido pela Fase 11 para IA (ai/rate-limiter.ts). Independente de qualquer modulo de
// IA: reutiliza apenas a classe generica de `core/rate-limiter.ts` (SPEC-020 v1.1, secao 22).
const DEFAULT_PUBLIC_APPLICATION_RATE_LIMITS = {
  submitByIp: { limit: 5, windowMs: 60_000 } satisfies RateLimitConfig,
  submitByJobOpening: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig
};
type PublicApplicationRateLimitNamespace = keyof typeof DEFAULT_PUBLIC_APPLICATION_RATE_LIMITS;

// Timing minimo (Plano Tecnico, item 37): so avaliado quando o cliente informa
// `formRenderedAt` -- nunca a unica defesa, e nunca aplicado quando ausente, para nao
// penalizar tecnologia assistiva que pode preencher o formulario de forma menos previsivel.
const MIN_HUMAN_SUBMIT_MS = 1200;

const PUBLIC_APPLICATION_CONSENT_PURPOSE =
  "Uso dos dados fornecidos para participacao no processo seletivo desta vaga, na Organization responsavel.";
const DEFAULT_CONSENT_TERMS_VERSION = "1.0";

export type PublicApplicationSubmitMeta = {
  idempotencyKey: unknown;
  ip: string;
};

// Seam de teste, inerte em producao -- mesmo padrao ja usado por `OnOrganizationCreatedHook`
// (Fase 15, `blueprints/organization-onboarding.ts` + `tests/phase15/helpers.ts`) para
// provocar falha deliberada em um ponto especifico do fluxo e provar rollback real (revisao
// destrutiva, itens 13/14/32). Nunca referenciado fora de testes.
export type PublicApplicationTestingHooks = {
  afterCandidateAndConsent?: () => Promise<void> | void;
};

export class PublicApplicationService {
  constructor(
    // Pool-bound (nao transacional) -- usado para leitura previa (resolucao de slug antes de
    // abrir a transacao), auditoria de negacao que precisa sobreviver a rollback, e
    // bookkeeping de idempotencia.
    private readonly core: CoreRepository,
    private readonly jobOpenings: JobOpeningRepository,
    private readonly candidatesService: CandidateService,
    private readonly applicationsService: CandidateApplicationService,
    private readonly publicApplications: PublicApplicationRepository,
    private readonly runTransaction: PublicApplicationTransactionRunner,
    private readonly rateLimiter: RateLimiter<PublicApplicationRateLimitNamespace> = new RateLimiter(
      DEFAULT_PUBLIC_APPLICATION_RATE_LIMITS
    ),
    private readonly testingHooks: PublicApplicationTestingHooks = {}
  ) {}

  async submit(
    slug: string,
    rawInput: unknown,
    meta: PublicApplicationSubmitMeta
  ): Promise<PublicApplicationResult> {
    const normalizedSlug = String(slug ?? "").toLowerCase();
    const preOpening = await this.jobOpenings.findJobOpeningByPublicSlug(normalizedSlug);
    if (!preOpening) {
      throw notFound("job_opening_public_not_found", "Job opening not found.");
    }
    const organizationId = preOpening.organizationId;
    const jobOpeningId = preOpening.id;

    this.ensureRateLimitAllowed(meta.ip, jobOpeningId);

    const parsed = validatePublicApplicationInput(rawInput);
    this.ensureNotBot(parsed);
    if (!parsed.consentGranted) {
      throw badRequest(
        "public_application_consent_required",
        "Consent is required to submit an application."
      );
    }

    const idempotencyKey = validateIdempotencyKey(meta.idempotencyKey);
    const idempotencyKeyHash = sha256Hex(idempotencyKey);
    // Fingerprint canonico do payload funcional inteiro (revisao destrutiva, itens 6/7) --
    // nao apenas e-mail + Vaga. A mesma Idempotency-Key com qualquer campo funcional
    // diferente (nome, telefone, localizacao, consentimento) produz um fingerprint diferente
    // e e recusada como reuso indevido da chave (seção 15). Nunca inclui honeypot, timing,
    // IP, headers, timestamps, a propria Idempotency-Key ou IDs gerados pelo servidor --
    // apenas os campos funcionais aceitos do formulario. Canonicalizado recursivamente
    // (`fingerprint`, `core/canonical-hash.ts`) para que a ordem das propriedades no JSON
    // recebido nunca altere o resultado.
    const requestFingerprint = fingerprint({
      jobOpeningId,
      normalizedEmail: parsed.normalizedEmail,
      fullName: parsed.fullName,
      preferredName: parsed.preferredName,
      phone: parsed.phone,
      location: parsed.location,
      consentGranted: parsed.consentGranted
    });

    const begin = await this.publicApplications.beginSubmission({
      organizationId,
      jobOpeningId,
      idempotencyKeyHash,
      requestFingerprint
    });
    const submission = begin.submission;
    if (!begin.created) {
      if (submission.requestFingerprint !== requestFingerprint) {
        throw conflict(
          "public_application_idempotency_conflict",
          "This Idempotency-Key was already used for a different submission."
        );
      }
      if (submission.status === "completed") {
        // `candidateApplicationId` e sempre NOT NULL quando `status = 'completed'`
        // (public_application_submissions CHECK, migration 0018).
        return {
          status: "received",
          submissionId: submission.id,
          candidateApplicationId: submission.candidateApplicationId as string
        };
      }
      if (submission.status === "pending") {
        throw conflict(
          "public_application_submission_in_progress",
          "This submission is already being processed."
        );
      }
      await this.publicApplications.resetSubmissionToPending(submission.id);
    }

    try {
      const result = await this.runTransaction(async (tx) => {
        await tx.jobOpenings.lockJobOpening(jobOpeningId);
        const opening = await tx.jobOpenings.findJobOpeningById(jobOpeningId);
        const organization = await tx.core.findOrganizationById(organizationId);
        this.ensureOpeningPubliclyValid(opening, organization?.status === "active");
        const published = await tx.jobOpenings.findPublished(opening.id);
        if (!published) {
          throw notFound("job_opening_public_not_found", "Job opening not found.");
        }

        const candidateTx = { core: tx.core, candidates: tx.candidateRepository };
        const existing = await tx.candidateRepository.findCandidateByNormalizedEmail(
          organizationId,
          parsed.normalizedEmail
        );
        let candidate: Candidate;
        let reusedExisting: boolean;
        if (existing) {
          candidate = existing;
          reusedExisting = true;
        } else {
          // `createCandidateFromPublicApplication` nunca lanca por corrida concorrente (usa
          // `ON CONFLICT DO NOTHING` internamente) -- se outra submissao venceu a criacao
          // entre a leitura acima e o INSERT, `created` volta `false` e `candidate` ja e o
          // registro vencedor real, relido dentro desta mesma transacao (revisao destrutiva,
          // item 15; nunca uma releitura ingenua apos 23505 em transacao abortada).
          const result = await this.candidatesService.createCandidateFromPublicApplication(
            candidateTx,
            organizationId,
            {
              fullName: parsed.fullName,
              email: parsed.email,
              preferredName: parsed.preferredName,
              phone: parsed.phone,
              location: parsed.location ?? undefined,
              source: "career_page"
            }
          );
          candidate = result.candidate;
          reusedExisting = !result.created;
        }

        if (candidate.status === "inactive") {
          await auditPublicDenied(
            this.core,
            organizationId,
            "public_application.denied_inactive_candidate",
            "candidate_inactive",
            { jobOpeningId }
          );
          // Mesmo codigo/mensagem generico usado pela reaplicacao bloqueada
          // (candidate-applications/service.ts, `ensureReapplicationAllowed`) -- a resposta
          // publica nunca pode permitir distinguir "Candidate inativo" de "reaplicacao apos
          // rejected/hired/cancelled" (revisao destrutiva, item 21; SPEC-020, secao 22).
          throw conflict(
            "candidate_application_reapplication_blocked",
            "Application could not be completed."
          );
        }

        // Consentimento anterior (SPEC-020, secao 10.4): revalida sempre: se o Candidate ja
        // possui um consentimento operacional `granted` e ainda valido (nao expirado), ele e
        // reutilizado -- uma nova manifestacao publica nao duplica um consentimento ja valido
        // (revisao destrutiva, item 31). Consentimento ausente, `pending`, `revoked` ou
        // `expired` sempre produz uma nova manifestacao.
        const currentConsent = reusedExisting
          ? await tx.candidateRepository.latestOperationalConsent(candidate.id)
          : null;
        const currentConsentValid =
          currentConsent !== null &&
          currentConsent.status === "granted" &&
          (!currentConsent.expiresAt || new Date(currentConsent.expiresAt).getTime() > Date.now());
        if (!currentConsentValid) {
          await this.candidatesService.addPublicConsent(candidateTx, organizationId, candidate.id, {
            status: "granted",
            source: "public_application",
            // `termsVersion` e sempre o valor canonico do servidor -- nunca o valor enviado
            // pelo cliente, que so validaria formato/tamanho, nunca se e uma versao
            // realmente vigente (revisao destrutiva, item 30; nao existe Registry de Terms
            // nesta fase, entao a solucao v1 minima e nao aceitar nenhuma escolha do
            // cliente).
            termsVersion: DEFAULT_CONSENT_TERMS_VERSION,
            // `purpose` sempre canonico do servidor -- nunca aceito do cliente (revisao
            // destrutiva, item 29).
            purpose: PUBLIC_APPLICATION_CONSENT_PURPOSE,
            consentAt: tx.core.now()
          });
        }

        await this.testingHooks.afterCandidateAndConsent?.();

        const applicationTx = { core: tx.core, applications: tx.applicationRepository };
        const application = await this.applicationsService.createApplicationFromPublicSubmission(
          applicationTx,
          organizationId,
          {
            candidateId: candidate.id,
            jobOpeningId: opening.id,
            jobOpeningVersionId: published.id
          }
        );

        await auditPublicSuccess(
          tx.core,
          organizationId,
          reusedExisting
            ? "candidate.existing_reused_from_public_application"
            : "candidate.created_from_public_application",
          { candidateId: candidate.id, jobOpeningId, creationOrigin: candidate.creationOrigin }
        );
        await auditPublicSuccess(tx.core, organizationId, "candidate_application.created", {
          candidateApplicationId: application.id,
          candidateId: candidate.id,
          jobOpeningId,
          source: application.source
        });

        return { candidateApplicationId: application.id };
      });

      await this.publicApplications.markSubmissionCompleted(
        submission.id,
        result.candidateApplicationId
      );
      // Fase 18: `candidateApplicationId` sai apenas neste objeto de retorno INTERNO -- nunca
      // e o DTO publico final (ver public-applications/types.ts).
      return {
        status: "received",
        submissionId: submission.id,
        candidateApplicationId: result.candidateApplicationId
      };
    } catch (error) {
      await this.publicApplications.markSubmissionFailed(submission.id);
      throw error;
    }
  }

  private ensureRateLimitAllowed(ip: string, jobOpeningId: string) {
    if (!this.rateLimiter.checkAndRecord("submitByIp", ip || "unknown")) {
      throw tooManyRequests("public_application_rate_limited", "Too many requests.");
    }
    if (!this.rateLimiter.checkAndRecord("submitByJobOpening", jobOpeningId)) {
      throw tooManyRequests("public_application_rate_limited", "Too many requests.");
    }
  }

  private ensureNotBot(parsed: { honeypot: string | null; formRenderedAt: string | null }) {
    if (parsed.honeypot) {
      throw conflict("public_application_denied", "Application could not be completed.");
    }
    if (parsed.formRenderedAt) {
      const elapsed = Date.now() - new Date(parsed.formRenderedAt).getTime();
      if (elapsed >= 0 && elapsed < MIN_HUMAN_SUBMIT_MS) {
        throw conflict("public_application_denied", "Application could not be completed.");
      }
    }
  }

  private ensureOpeningPubliclyValid(
    opening: JobOpening | null,
    organizationActive: boolean
  ): asserts opening is JobOpening {
    if (!opening || !opening.isPublic || !organizationActive) {
      throw notFound("job_opening_public_not_found", "Job opening not found.");
    }
    if (opening.status !== "open") {
      throw gone(
        "job_opening_not_accepting_applications",
        "Job opening is no longer accepting applications."
      );
    }
    if (
      opening.applicationDeadline &&
      new Date(opening.applicationDeadline).getTime() <= Date.now()
    ) {
      throw gone(
        "job_opening_not_accepting_applications",
        "Job opening is no longer accepting applications."
      );
    }
  }
}

export function createPostgresPublicApplicationService(
  pool: pg.Pool,
  candidatesService: CandidateService,
  applicationsService: CandidateApplicationService,
  testingHooks: PublicApplicationTestingHooks = {}
) {
  const core = new PostgresCoreRepository(pool);
  const jobOpenings = new PostgresJobOpeningRepository(pool);
  const publicApplications = new PostgresPublicApplicationRepository(pool);
  const runTransaction = createPublicApplicationTransactionRunner(pool);
  return new PublicApplicationService(
    core,
    jobOpenings,
    candidatesService,
    applicationsService,
    publicApplications,
    runTransaction,
    new RateLimiter(DEFAULT_PUBLIC_APPLICATION_RATE_LIMITS),
    testingHooks
  );
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
