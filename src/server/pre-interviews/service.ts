import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { conflict, forbidden, notFound, tooManyRequests } from "../core/errors";
import { RateLimiter, type RateLimitConfig } from "../core/rate-limiter";
import type { CoreRepository } from "../core/repository";
import type { Actor, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresPreInterviewRepository } from "../persistence/postgres-pre-interview-repository";
import { generateRawAccessToken, hashAccessToken } from "./access-token";
import { auditPreInterview, auditPreInterviewDenied, auditPreInterviewSystem } from "./audit";
import type { PreInterviewRepository } from "./repository";
import {
  createPreInterviewTransactionRunner,
  type PreInterviewTransaction,
  type PreInterviewTransactionRunner
} from "./transaction";
import type {
  CreateIfConfiguredResult,
  JobOpeningPreInterviewQuestionSetting,
  PreInterview,
  PreInterviewAccessToken,
  PreInterviewAdminReadInput,
  PreInterviewEvent,
  PreInterviewQuestion,
  PreInterviewReasonInput,
  PreInterviewResponseInput,
  PreInterviewSettingsInput,
  PreInterviewStatus
} from "./types";
import {
  validateAdminReason,
  validateId,
  validateReason,
  validateResponseInput,
  validateSettingsInput
} from "./validation";

// Fase 18 (SPEC-021 v1.0). Nunca chama AIGateway, provider, modelo ou Prompt Registry -- esta
// SPEC funciona integralmente sem IA (ADR-0016, "IA nunca e requisito estrutural";
// BACKLOG.md: "SPEC-021 deve funcionar integralmente sem IA habilitada").

// TTL padrao de expiracao de uma instancia. Esta SPEC nunca define esse valor numerico
// (SPEC-021, secao 33); a implementacao escolhe um default razoavel, sem expor a constante como
// contrato normativo -- uma futura configuracao por Organization/Vaga pode substituir isto sem
// quebrar nenhum teste ou regra de negocio ja fechada.
const DEFAULT_ACCESS_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dias

// Revisao destrutiva (Plano Tecnico, correcao final, itens 1/2/3): reutiliza exclusivamente
// `core/rate-limiter.ts` (mesma classe generica ja usada por Fase 11/IA e Fase 17/Candidatura
// Publica) -- nenhuma dependencia nova, nenhum estado compartilhado semanticamente com IA ou
// com a Candidatura Publica (namespaces proprios). Duas dimensoes combinadas: por IP (defesa
// contra enumeracao/brute force com muitos tokens DIFERENTES a partir da mesma origem) e por
// hash do token tentado (defesa contra abuso de UM token especifico, legitimo ou nao, sendo
// martelado rapido demais) -- nunca o token bruto, que nunca vira chave armazenavel/logavel
// (item 2: "nao utilizar o raw token diretamente como key").
const DEFAULT_PRE_INTERVIEW_RATE_LIMITS = {
  publicByIp: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig,
  publicByTokenHash: { limit: 30, windowMs: 60_000 } satisfies RateLimitConfig
};
type PreInterviewRateLimitNamespace = keyof typeof DEFAULT_PRE_INTERVIEW_RATE_LIMITS;

export type PreInterviewPublicMeta = { ip: string };

// Seam de teste, inerte em producao -- mesmo padrao ja usado por `OnOrganizationCreatedHook`
// (Fase 15) e `PublicApplicationTestingHooks` (Fase 17) para provocar falha deliberada em um
// ponto especifico do fluxo e provar atomicidade/rollback real (revisao destrutiva da Fase 18,
// itens 22/43). Nunca referenciado fora de testes; `createPostgresPreInterviewService` nunca
// passa nenhum hook real.
export type PreInterviewTestingHooks = {
  // Chamado logo apos o INSERT da propria linha de `pre_interviews` (e seu evento `created`),
  // antes do snapshot de qualquer pergunta comecar.
  afterInstanceInserted?: () => Promise<void> | void;
  // Chamado apos o snapshot da PRIMEIRA pergunta ser inserido, antes de continuar para as
  // demais (quando houver mais de uma).
  afterFirstQuestionSnapshotted?: () => Promise<void> | void;
  // Chamado imediatamente antes de qualquer evento de auditoria critica (mesmo `action` do
  // evento) -- se lancar, a operacao inteira (sempre dentro da mesma transacao) reverte.
  beforeCriticalAudit?: (action: string) => Promise<void> | void;
};

export class PreInterviewService {
  constructor(
    private readonly core: CoreRepository,
    private readonly preInterviews: PreInterviewRepository,
    private readonly runTransaction: PreInterviewTransactionRunner,
    private readonly rateLimiter: RateLimiter<PreInterviewRateLimitNamespace> = new RateLimiter(
      DEFAULT_PRE_INTERVIEW_RATE_LIMITS
    ),
    private readonly testingHooks: PreInterviewTestingHooks = {}
  ) {}

  // ----------------------------------------------------------------------------------------
  // Settings (SPEC-021, secao 4.2). Somente owner/admin; sempre transacional (Plano Tecnico,
  // correcao final, item 9).
  // ----------------------------------------------------------------------------------------

  async getSettings(actor: Actor, organizationId: string, jobOpeningId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    await this.ensureJobOpeningInOrganization(actor, organizationId, jobOpeningId);
    const settings = await this.preInterviews.findSettingsByJobOpening(
      organizationId,
      jobOpeningId
    );
    if (!settings) {
      return { enabled: false, questions: [] as JobOpeningPreInterviewQuestionSetting[] };
    }
    const questions = await this.preInterviews.listQuestionSettings(organizationId, settings.id);
    return { ...settings, questions };
  }

  async updateSettings(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string,
    input: PreInterviewSettingsInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await service.ensureJobOpeningInOrganization(actor, organizationId, jobOpeningId);
      const normalized = validateSettingsInput(input);

      // Valida TODAS as perguntas antes de qualquer escrita -- tudo ou nada (Plano Tecnico,
      // correcao final, item 10).
      for (const question of normalized.questions) {
        const catalog = await tx.preInterviews.findQuestionCatalogItem(
          question.questionCatalogItemId
        );
        if (!catalog || catalog.organizationId !== organizationId || catalog.status !== "active") {
          await service.auditDenied(
            actor,
            organizationId,
            "pre_interview.cross_organization_access_denied",
            "question_catalog_item_invalid",
            { questionCatalogItemId: question.questionCatalogItemId }
          );
          throw notFound("question_catalog_item_not_found", "Question catalog item not found.");
        }
      }

      let settings = await tx.preInterviews.findSettingsForUpdate(organizationId, jobOpeningId);
      const now = tx.preInterviews.now();
      const userId = requireUserActorId(actor);
      if (!settings) {
        settings = {
          id: tx.preInterviews.nextId("jopis"),
          organizationId,
          jobOpeningId,
          enabled: normalized.enabled,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now
        };
        await tx.preInterviews.createSettings(settings);
      } else {
        settings = {
          ...settings,
          enabled: normalized.enabled,
          updatedByUserId: userId,
          updatedAt: now
        };
        await tx.preInterviews.updateSettings(settings);
      }

      // Reconstrucao completa da colecao (Plano Tecnico, correcao final, item 10) -- nunca
      // updates 1->2/2->1 que colidiriam com o UNIQUE(settings_id, display_order).
      const questionRows = normalized.questions.map((q) => ({
        id: tx.preInterviews.nextId("jopiqs"),
        organizationId,
        settingsId: settings!.id,
        questionCatalogItemId: q.questionCatalogItemId,
        displayOrder: q.displayOrder,
        required: q.required,
        createdAt: now
      }));
      await tx.preInterviews.replaceQuestionSettings(organizationId, settings.id, questionRows);

      await service.audit(actor, organizationId, "pre_interview.settings_updated", {
        jobOpeningId,
        enabled: String(settings.enabled),
        questionCount: String(questionRows.length)
      });

      return { ...settings, questions: questionRows };
    });
  }

  // ----------------------------------------------------------------------------------------
  // Criacao (SPEC-021, secao 8). `createIfConfigured` e o caminho publico/automatico,
  // desacoplado da transacao da SPEC-020 (Plano Tecnico, correcao final, item 2/23/24) e
  // idempotente para replay (Plano Tecnico, correcao final, ponto 2).
  // ----------------------------------------------------------------------------------------

  async createIfConfigured(candidateApplicationId: string): Promise<CreateIfConfiguredResult> {
    return this.runTransaction(async (tx) => {
      const application =
        await tx.candidateApplications.findApplicationForUpdate(candidateApplicationId);
      if (!application) {
        return { status: "not_configured" };
      }
      const organizationId = application.organizationId;

      const existing = await tx.preInterviews.findOperationalByApplication(
        organizationId,
        candidateApplicationId
      );
      if (existing) {
        // Revisao destrutiva, itens 9/10: a leitura acima nao trava a propria linha de
        // `pre_interviews` (so a CandidateApplication esta travada) -- sem isto, um
        // cancelamento/expiracao administrativo concorrente poderia finalizar a instancia
        // *depois* desta leitura otimista mas *antes* da emissao do token, deixando um token
        // ativo em cima de uma instancia ja finalizada. Trava a linha agora (mesmo lock usado
        // por `cancel`/`rotateAccessToken`) e reconfirma sob lock que ela continua operacional
        // -- inclusive materializando expiracao lazy caso o prazo tenha vencido nesse meio
        // tempo -- antes de decidir se emite o token adicional.
        let locked = await tx.preInterviews.findPreInterviewForUpdate(existing.id);
        if (locked) {
          locked = await this.materializeExpirationIfNeeded(tx, locked);
        }
        if (!locked || !["available", "in_progress"].includes(locked.status)) {
          // A instancia foi cancelada/expirada concorrentemente: nunca emite um token novo
          // para algo ja finalizado, e nunca cria uma tentativa nova automaticamente aqui
          // (mesma regra de "historico ja final" abaixo).
          return { status: "not_configured" };
        }
        // Replay: nunca cria nova tentativa, nunca revoga tokens anteriores -- emite um token
        // adicional para a mesma instancia (Plano Tecnico, correcao final, ponto 2).
        const rawAccessToken = await this.issueAdditionalToken(tx, locked);
        return { status: "existing", preInterviewId: locked.id, rawAccessToken };
      }

      // Historico ja final, sem instancia operacional: nunca cria tentativa nova
      // automaticamente (SPEC-021, secao 12; item 27 do pedido de implementacao).
      if (await tx.preInterviews.hasAnyAttempt(organizationId, candidateApplicationId)) {
        return { status: "not_configured" };
      }

      const settings = await tx.preInterviews.findSettingsByJobOpening(
        organizationId,
        application.jobOpeningId
      );
      if (!settings?.enabled) {
        return { status: "not_configured" };
      }
      const questionSettings = await tx.preInterviews.listQuestionSettings(
        organizationId,
        settings.id
      );
      if (questionSettings.length === 0) {
        return { status: "not_configured" };
      }

      const created = await this.buildAndInsertAttempt(tx, {
        organizationId,
        candidateApplicationId,
        jobOpeningId: application.jobOpeningId,
        jobOpeningVersionId: application.jobOpeningVersionId,
        questionSettings,
        createdSource: "system_after_application",
        createdByUserId: null
      });
      const rawAccessToken = await this.issueAdditionalToken(tx, created);
      return { status: "created", preInterviewId: created.id, rawAccessToken };
    });
  }

  // Criacao interna (owner/admin, para CandidateApplication ja existente -- SPEC-021, secao
  // 8.1). Mesmo caminho de serializacao de `createIfConfigured`.
  async createInternal(actor: Actor, organizationId: string, candidateApplicationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const application = await service.findApplicationForUpdateInOrganization(
        actor,
        organizationId,
        candidateApplicationId,
        tx
      );
      await service.ensureApplicationUsable(actor, tx, application, true);

      const existing = await tx.preInterviews.findOperationalByApplication(
        organizationId,
        candidateApplicationId
      );
      if (existing) {
        throw conflict(
          "pre_interview_already_operational",
          "Pre-interview already exists for this application."
        );
      }

      const settings = await tx.preInterviews.findSettingsByJobOpening(
        organizationId,
        application.jobOpeningId
      );
      if (!settings?.enabled) {
        throw conflict(
          "pre_interview_not_configured",
          "Job opening has no pre-interview configured."
        );
      }
      const questionSettings = await tx.preInterviews.listQuestionSettings(
        organizationId,
        settings.id
      );
      if (questionSettings.length === 0) {
        throw conflict(
          "pre_interview_not_configured",
          "Job opening has no pre-interview questions configured."
        );
      }

      const created = await service.buildAndInsertAttempt(tx, {
        organizationId,
        candidateApplicationId,
        jobOpeningId: application.jobOpeningId,
        jobOpeningVersionId: application.jobOpeningVersionId,
        questionSettings,
        createdSource: "internal_user",
        createdByUserId: requireUserActorId(actor)
      });
      const rawAccessToken = await service.issueAdditionalToken(tx, created);
      await service.audit(actor, organizationId, "pre_interview.created", {
        preInterviewId: created.id,
        candidateApplicationId,
        createdSource: "internal_user"
      });
      return { ...service.serializeOwnerAdmin(await service.aggregate(created)), rawAccessToken };
    });
  }

  // Reabertura administrativa (SPEC-021, secao 12) -- sempre cria nova tentativa, nunca reativa
  // a instancia finalizada.
  async retry(actor: Actor, organizationId: string, preInterviewId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const previous = await service.findPreInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        preInterviewId
      );
      if (!["completed", "cancelled", "expired"].includes(previous.status)) {
        throw conflict("pre_interview_not_final", "Only a finalized attempt can be reopened.");
      }
      const candidateApplicationId = previous.candidateApplicationId;
      const application = await service.findApplicationForUpdateInOrganization(
        actor,
        organizationId,
        candidateApplicationId,
        tx
      );
      await service.ensureApplicationUsable(actor, tx, application, true);

      const existing = await tx.preInterviews.findOperationalByApplication(
        organizationId,
        candidateApplicationId
      );
      if (existing) {
        throw conflict(
          "pre_interview_already_operational",
          "An operational attempt already exists."
        );
      }

      const settings = await tx.preInterviews.findSettingsByJobOpening(
        organizationId,
        application.jobOpeningId
      );
      if (!settings?.enabled) {
        throw conflict(
          "pre_interview_not_configured",
          "Job opening has no pre-interview configured."
        );
      }
      const questionSettings = await tx.preInterviews.listQuestionSettings(
        organizationId,
        settings.id
      );
      if (questionSettings.length === 0) {
        throw conflict(
          "pre_interview_not_configured",
          "Job opening has no pre-interview questions configured."
        );
      }

      const created = await service.buildAndInsertAttempt(tx, {
        organizationId,
        candidateApplicationId,
        jobOpeningId: application.jobOpeningId,
        jobOpeningVersionId: application.jobOpeningVersionId,
        questionSettings,
        createdSource: "administrative_retry",
        createdByUserId: requireUserActorId(actor),
        previousAttemptId: previous.id
      });
      const rawAccessToken = await service.issueAdditionalToken(tx, created);
      await service.addEvent(created, "reopening_authorized", previous.status, null, null, {
        previousAttemptId: previous.id
      });
      await service.audit(actor, organizationId, "pre_interview.retry_created", {
        preInterviewId: created.id,
        previousAttemptId: previous.id,
        candidateApplicationId
      });
      return { ...service.serializeOwnerAdmin(await service.aggregate(created)), rawAccessToken };
    });
  }

  private async buildAndInsertAttempt(
    tx: PreInterviewTransaction,
    params: {
      organizationId: string;
      candidateApplicationId: string;
      jobOpeningId: string;
      jobOpeningVersionId: string;
      questionSettings: JobOpeningPreInterviewQuestionSetting[];
      createdSource: PreInterview["createdSource"];
      createdByUserId: string | null;
      previousAttemptId?: string | null;
    }
  ): Promise<PreInterview> {
    // attempt_number: a CandidateApplication (ja travada pelo chamador via
    // findApplicationForUpdate) e a autoridade estavel de serializacao -- nunca um agregado
    // desta propria tabela sendo travado por si so (Plano Tecnico, correcao final, item 1).
    const max = await tx.preInterviews.findMaxAttemptNumber(
      params.organizationId,
      params.candidateApplicationId
    );
    const attemptNumber = max + 1;
    const now = tx.preInterviews.now();
    const blueprintVersionId = await tx.preInterviews.findActiveBlueprintVersionId(
      params.organizationId
    );

    const preInterview: PreInterview = {
      id: tx.preInterviews.nextId("pint"),
      organizationId: params.organizationId,
      candidateApplicationId: params.candidateApplicationId,
      jobOpeningId: params.jobOpeningId,
      jobOpeningVersionId: params.jobOpeningVersionId,
      blueprintVersionId,
      previousAttemptId: params.previousAttemptId ?? null,
      attemptNumber,
      status: "draft",
      createdSource: params.createdSource,
      createdByUserId: params.createdByUserId,
      availableAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      expiredAt: null,
      expiresAt: new Date(Date.parse(now) + DEFAULT_ACCESS_TOKEN_TTL_MS).toISOString(),
      createdAt: now,
      updatedAt: now
    };
    await tx.preInterviews.createPreInterview(preInterview);
    await this.addEventOnTx(tx, preInterview, "created", null, "draft", null, {});
    // Revisao destrutiva, item 22: seam de teste -- se lancar, a linha de `pre_interviews` e o
    // evento `created` ja inseridos acima devem desaparecer no ROLLBACK, provando que uma
    // instancia nunca sobrevive sozinha, sem nenhum snapshot de pergunta.
    await this.testingHooks.afterInstanceInserted?.();

    // Snapshot de cada pergunta (SPEC-021, secao 9.2/9.3) -- reavaliado contra o catalogo
    // corrente no momento da criacao, nunca contra o estado ja obsoleto da Configuracao.
    let snapshottedCount = 0;
    for (const questionSetting of params.questionSettings) {
      const catalog = await tx.preInterviews.findQuestionCatalogItem(
        questionSetting.questionCatalogItemId
      );
      if (
        !catalog ||
        catalog.organizationId !== params.organizationId ||
        catalog.status !== "active"
      ) {
        throw conflict(
          "pre_interview_question_unavailable",
          "A configured question is no longer available."
        );
      }
      const contentFingerprint = fingerprint({
        snapshotTitle: catalog.title,
        snapshotText: catalog.questionText,
        snapshotType: catalog.type,
        snapshotCategory: catalog.category,
        snapshotOptions: catalog.options,
        snapshotSettings: catalog.settings,
        required: questionSetting.required,
        displayOrder: questionSetting.displayOrder
      });
      const question: PreInterviewQuestion = {
        id: tx.preInterviews.nextId("pintq"),
        organizationId: params.organizationId,
        preInterviewId: preInterview.id,
        questionCatalogItemId: catalog.id,
        snapshotTitle: catalog.title,
        snapshotText: catalog.questionText,
        snapshotType: catalog.type,
        snapshotCategory: catalog.category,
        snapshotOptions: catalog.options,
        snapshotSettings: catalog.settings,
        displayOrder: questionSetting.displayOrder,
        required: questionSetting.required,
        contentFingerprint,
        createdAt: now
      };
      await tx.preInterviews.addQuestion(question);
      snapshottedCount += 1;
      if (snapshottedCount === 1) {
        // Revisao destrutiva, item 22: se lancar aqui, a instancia + o unico snapshot ja
        // inserido devem desaparecer juntos no ROLLBACK -- nunca uma instancia com snapshot
        // parcial (algumas perguntas congeladas, outras nao) sobrevivendo.
        await this.testingHooks.afterFirstQuestionSnapshotted?.();
      }
    }

    // draft -> available, mesma transacao (SPEC-021, secao 5.1/8.3; Plano Tecnico, correcao
    // final, item 5).
    const available: PreInterview = {
      ...preInterview,
      status: "available",
      availableAt: now,
      updatedAt: now
    };
    await tx.preInterviews.updatePreInterview(available);
    await this.addEventOnTx(tx, available, "available", "draft", "available", null, {});

    // Revisao destrutiva: auditoria de "pre_interview.created" so e emitida AQUI (sem Actor
    // humano) para o caminho publico/automatico (`createIfConfigured`) -- `createInternal` e
    // `retry` ja emitem seu proprio `pre_interview.created`/`pre_interview.retry_created`
    // atribuido ao Actor logo apos chamar este metodo; emitir os dois duplicaria a entrada de
    // auditoria (uma sem Actor, outra com) para o MESMO evento de criacao nesses dois casos.
    if (params.createdSource === "system_after_application") {
      await this.auditSystem(tx.core, params.organizationId, "pre_interview.created", {
        preInterviewId: preInterview.id,
        candidateApplicationId: params.candidateApplicationId,
        createdSource: params.createdSource,
        attemptNumber: String(attemptNumber)
      });
    }

    return available;
  }

  private async issueAdditionalToken(tx: PreInterviewTransaction, preInterview: PreInterview) {
    const rawToken = generateRawAccessToken();
    const tokenHash = hashAccessToken(rawToken);
    const expiresAt =
      preInterview.expiresAt ??
      new Date(Date.parse(tx.preInterviews.now()) + DEFAULT_ACCESS_TOKEN_TTL_MS).toISOString();
    const token: PreInterviewAccessToken = {
      id: tx.preInterviews.nextId("pintat"),
      organizationId: preInterview.organizationId,
      preInterviewId: preInterview.id,
      tokenHash,
      status: "active",
      expiresAt,
      createdAt: tx.preInterviews.now(),
      revokedAt: null
    };
    await tx.preInterviews.addAccessToken(token);
    return rawToken;
  }

  // ----------------------------------------------------------------------------------------
  // Rotacao administrativa (Plano Tecnico, correcao final, item 22) -- distinta do replay:
  // sempre revoga os tokens anteriores e emite exatamente um novo.
  // ----------------------------------------------------------------------------------------

  async rotateAccessToken(actor: Actor, organizationId: string, preInterviewId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    await this.materializeExpirationForPreInterviewId(organizationId, preInterviewId);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      let preInterview = await service.findPreInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        preInterviewId
      );
      preInterview = await service.materializeExpirationIfNeeded(tx, preInterview);
      if (!["available", "in_progress", "completed"].includes(preInterview.status)) {
        throw conflict(
          "pre_interview_token_not_rotatable",
          "Token cannot be rotated in this state."
        );
      }
      await tx.preInterviews.revokeActiveTokens(organizationId, preInterview.id);
      const rawAccessToken = await service.issueAdditionalToken(tx, preInterview);
      await service.addEvent(
        preInterview,
        "access_token_rotated",
        preInterview.status,
        preInterview.status,
        null,
        {}
      );
      await service.audit(actor, organizationId, "pre_interview.access_token_rotated", {
        preInterviewId
      });
      return { rawAccessToken };
    });
  }

  // ----------------------------------------------------------------------------------------
  // Cancelamento (SPEC-021, secao 13) -- somente owner/admin, nunca o Candidate.
  // ----------------------------------------------------------------------------------------

  async cancel(
    actor: Actor,
    organizationId: string,
    preInterviewId: string,
    input: PreInterviewReasonInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    await this.materializeExpirationForPreInterviewId(organizationId, preInterviewId);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      let preInterview = await service.findPreInterviewInOrganizationForUpdate(
        actor,
        organizationId,
        preInterviewId
      );
      preInterview = await service.materializeExpirationIfNeeded(tx, preInterview);
      if (["completed", "cancelled", "expired"].includes(preInterview.status)) {
        throw conflict("pre_interview_final", "Final pre-interview cannot be cancelled.");
      }
      const reason = validateReason(input);
      const now = tx.preInterviews.now();
      const updated: PreInterview = {
        ...preInterview,
        status: "cancelled",
        cancelledAt: now,
        cancelledByUserId: requireUserActorId(actor),
        cancellationReason: reason,
        updatedAt: now
      };
      await tx.preInterviews.updatePreInterview(updated);
      await tx.preInterviews.revokeActiveTokens(organizationId, updated.id);
      await service.addEvent(updated, "cancelled", preInterview.status, "cancelled", reason, {});
      await service.audit(actor, organizationId, "pre_interview.cancelled", {
        preInterviewId,
        reasonProvided: "true"
      });
      return service.serializeOwnerAdmin(await service.aggregate(updated));
    });
  }

  // ----------------------------------------------------------------------------------------
  // Fluxo publico do Candidate (SPEC-021, secao 10) -- sem User, sem Membership, resolvido por
  // token (Plano Tecnico, correcao final, ponto 3/36).
  // ----------------------------------------------------------------------------------------

  async getPublic(rawToken: string, meta: PreInterviewPublicMeta) {
    this.ensurePublicRateLimitAllowed(meta, hashAccessToken(String(rawToken ?? "")));
    await this.materializeExpirationForToken(rawToken);
    return this.runTransaction(async (tx) => {
      let preInterview = await this.resolveTokenForUpdate(tx, rawToken);
      preInterview = await this.materializeExpirationIfNeeded(tx, preInterview);
      return this.serializePublic(tx, preInterview);
    });
  }

  async start(rawToken: string, meta: PreInterviewPublicMeta) {
    this.ensurePublicRateLimitAllowed(meta, hashAccessToken(String(rawToken ?? "")));
    await this.materializeExpirationForToken(rawToken);
    return this.runTransaction(async (tx) => {
      let preInterview = await this.resolveTokenForUpdate(tx, rawToken);
      preInterview = await this.materializeExpirationIfNeeded(tx, preInterview);
      if (preInterview.status === "in_progress") {
        // Idempotente: repetir /start nunca gera novo started_at nem novo evento.
        return this.serializePublic(tx, preInterview);
      }
      if (preInterview.status !== "available") {
        throw conflict(
          "pre_interview_not_available",
          "Pre-interview cannot be started in this state."
        );
      }
      await this.ensureOperationalByPreInterview(tx, preInterview);
      const now = tx.preInterviews.now();
      const updated: PreInterview = {
        ...preInterview,
        status: "in_progress",
        startedAt: now,
        updatedAt: now
      };
      await tx.preInterviews.updatePreInterview(updated);
      await this.addEventOnTx(tx, updated, "started", "available", "in_progress", null, {});
      await this.auditSystem(tx.core, updated.organizationId, "pre_interview.started", {
        preInterviewId: updated.id
      });
      return this.serializePublic(tx, updated);
    });
  }

  async saveResponse(
    rawToken: string,
    questionPublicId: string,
    input: PreInterviewResponseInput,
    meta: PreInterviewPublicMeta
  ) {
    this.ensurePublicRateLimitAllowed(meta, hashAccessToken(String(rawToken ?? "")));
    await this.materializeExpirationForToken(rawToken);
    return this.runTransaction(async (tx) => {
      let preInterview = await this.resolveTokenForUpdate(tx, rawToken);
      preInterview = await this.materializeExpirationIfNeeded(tx, preInterview);
      if (preInterview.status !== "in_progress") {
        throw conflict(
          "pre_interview_not_in_progress",
          "Pre-interview must be in progress to save a response."
        );
      }
      await this.ensureOperationalByPreInterview(tx, preInterview);
      const questions = await tx.preInterviews.listQuestions(preInterview.id);
      const question = questions.find(
        (candidate) => candidate.id === validateId(questionPublicId, "question_id")
      );
      if (!question) {
        throw notFound("pre_interview_question_not_found", "Pre-interview question not found.");
      }
      const normalized = validateResponseInput(input, question);
      const now = tx.preInterviews.now();
      const saved = await tx.preInterviews.upsertResponse({
        id: tx.preInterviews.nextId("pintr"),
        organizationId: preInterview.organizationId,
        preInterviewId: preInterview.id,
        preInterviewQuestionId: question.id,
        responseValue: normalized.responseValue,
        submitted: false,
        createdAt: now,
        updatedAt: now,
        submittedAt: null
      });
      await this.addEventOnTx(
        tx,
        preInterview,
        "response_saved",
        preInterview.status,
        preInterview.status,
        null,
        {
          preInterviewQuestionId: question.id
        }
      );
      await this.auditSystem(tx.core, preInterview.organizationId, "pre_interview.response_saved", {
        preInterviewId: preInterview.id,
        preInterviewQuestionId: question.id
      });
      return { questionId: question.id, submitted: saved.submitted };
    });
  }

  async submit(rawToken: string, meta: PreInterviewPublicMeta) {
    this.ensurePublicRateLimitAllowed(meta, hashAccessToken(String(rawToken ?? "")));
    await this.materializeExpirationForToken(rawToken);
    return this.runTransaction(async (tx) => {
      let preInterview = await this.resolveTokenForUpdate(tx, rawToken);
      preInterview = await this.materializeExpirationIfNeeded(tx, preInterview);
      if (preInterview.status === "completed") {
        // Idempotente: segundo submit encontra completed e retorna confirmacao segura, sem
        // duplicar evento nem criar nova tentativa (Plano Tecnico, correcao final, item 47).
        return this.serializePublic(tx, preInterview);
      }
      if (preInterview.status !== "in_progress") {
        throw conflict(
          "pre_interview_not_in_progress",
          "Pre-interview must be in progress to submit."
        );
      }
      await this.ensureOperationalByPreInterview(tx, preInterview);
      const questions = await tx.preInterviews.listQuestions(preInterview.id);
      const responses = await tx.preInterviews.listResponses(preInterview.id);
      const answered = new Set(responses.map((response) => response.preInterviewQuestionId));
      if (questions.some((question) => question.required && !answered.has(question.id))) {
        throw conflict(
          "pre_interview_required_response_missing",
          "Required responses are missing."
        );
      }
      const now = tx.preInterviews.now();
      await tx.preInterviews.markResponsesSubmitted(preInterview.id, now);
      const updated: PreInterview = {
        ...preInterview,
        status: "completed",
        completedAt: now,
        updatedAt: now
      };
      await tx.preInterviews.updatePreInterview(updated);
      await this.addEventOnTx(tx, updated, "submitted", "in_progress", "completed", null, {});
      await this.auditSystem(tx.core, updated.organizationId, "pre_interview.submitted", {
        preInterviewId: updated.id
      });
      return this.serializePublic(tx, updated);
    });
  }

  // ----------------------------------------------------------------------------------------
  // Consultas internas (owner/admin/member/Platform Admin -- SPEC-021, secao 24).
  // ----------------------------------------------------------------------------------------

  async listByApplication(actor: Actor, organizationId: string, candidateApplicationId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const application = await this.findApplicationInOrganization(
      actor,
      organizationId,
      candidateApplicationId
    );
    if (context.role === "member" && application.applicationStatus !== "active") {
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    const rows = await this.preInterviews.listByApplication(organizationId, candidateApplicationId);
    const now = this.preInterviews.now();
    return Promise.all(
      rows.map(async (row) => {
        const effective = { ...row, status: computeEffectiveStatus(row, now) };
        return context.role === "member"
          ? this.serializeMember(effective)
          : this.serializeOwnerAdmin(await this.aggregate(effective));
      })
    );
  }

  async getById(actor: Actor, organizationId: string, preInterviewId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const preInterview = await this.findPreInterviewInOrganization(
      actor,
      organizationId,
      preInterviewId
    );
    const now = this.preInterviews.now();
    const effective = { ...preInterview, status: computeEffectiveStatus(preInterview, now) };
    if (context.role === "member") {
      const application = await this.findApplicationInOrganization(
        actor,
        organizationId,
        preInterview.candidateApplicationId
      );
      if (application.applicationStatus !== "active") {
        throw notFound("pre_interview_not_found", "Pre-interview not found.");
      }
      return this.serializeMember(effective);
    }
    return this.serializeOwnerAdmin(await this.aggregate(effective, true));
  }

  async timeline(actor: Actor, organizationId: string, preInterviewId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const preInterview = await this.findPreInterviewInOrganization(
      actor,
      organizationId,
      preInterviewId
    );
    return this.preInterviews.listEvents(preInterview.id);
  }

  async adminRead(actor: Actor, organizationId: string, input: PreInterviewAdminReadInput) {
    const reason = validateAdminReason(input);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }
    const rows = await this.preInterviews.listByOrganization(organizationId);
    await this.audit(actor, organizationId, "pre_interview.administrative_read", {
      reason,
      preInterviewCount: String(rows.length)
    });
    const now = this.preInterviews.now();
    return rows.map((row) =>
      this.serializeAdminRead({ ...row, status: computeEffectiveStatus(row, now) })
    );
  }

  // ----------------------------------------------------------------------------------------
  // Helpers privados
  // ----------------------------------------------------------------------------------------

  private scoped(tx: PreInterviewTransaction) {
    return new PreInterviewService(
      tx.core,
      tx.preInterviews,
      this.runTransaction,
      this.rateLimiter,
      this.testingHooks
    );
  }

  // Revisao destrutiva, item 4: a checagem de rate limit ocorre ANTES de resolver se o token e
  // valido/invalido/revogado/expirado -- nunca depois, para que o limite em si nunca vire um
  // oracle que diferencie esses casos (a resposta 429, quando ocorre, e identica
  // independentemente do token ser real ou forjado).
  private ensurePublicRateLimitAllowed(meta: PreInterviewPublicMeta, tokenHash: string) {
    if (!this.rateLimiter.checkAndRecord("publicByIp", meta.ip || "unknown")) {
      throw tooManyRequests("pre_interview_rate_limited", "Too many requests.");
    }
    if (!this.rateLimiter.checkAndRecord("publicByTokenHash", tokenHash)) {
      throw tooManyRequests("pre_interview_rate_limited", "Too many requests.");
    }
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    deniedAction = "pre_interview.permission_denied"
  ) {
    if (actor.kind === "platform") {
      await this.auditDenied(actor, organizationId, deniedAction, "permission_denied");
      throw forbidden("permission_denied", "Permission denied.");
    }
    const user = await this.core.findUserById(actor.userId);
    if (!user || user.status !== "active") {
      throw forbidden("user_inactive_or_missing", "Active user is required.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }
    if (organization.status !== "active") {
      await this.auditDenied(actor, organizationId, deniedAction, "organization_archived");
      throw forbidden("organization_archived", "Archived organization cannot be used as context.");
    }
    const membership = await this.core.findMembershipByOrganizationAndUser(
      organizationId,
      actor.userId
    );
    if (!membership || membership.status !== "active") {
      await this.auditDenied(
        actor,
        organizationId,
        "pre_interview.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(actor, organizationId, deniedAction, "permission_denied");
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { actor, organization, role: membership.role };
  }

  // Revisao de seguranca: valida no servidor que a Job Opening pertence de fato a esta
  // Organization ANTES de qualquer leitura/escrita de settings -- nunca depende apenas da FK
  // (`job_opening_pre_interview_settings.job_opening_id`), que rejeitaria a combinacao
  // invalida, mas com um erro cru de banco (500) em vez de uma resposta 404 generica e
  // auditada. Mesmo padrao de "find X in Organization" usado em todo o resto do modulo.
  private async ensureJobOpeningInOrganization(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string
  ) {
    const ownerOrganizationId = await this.preInterviews.findJobOpeningOrganizationId(jobOpeningId);
    if (!ownerOrganizationId || ownerOrganizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "pre_interview.cross_organization_access_denied",
        "job_opening_organization_mismatch",
        { jobOpeningId }
      );
      throw notFound("job_opening_not_found", "Job opening not found.");
    }
  }

  private async findApplicationInOrganization(
    actor: Actor,
    organizationId: string,
    candidateApplicationId: string
  ) {
    const application = await this.preInterviews.findApplication(candidateApplicationId);
    if (!application || application.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "pre_interview.cross_organization_access_denied",
        "candidate_application_organization_mismatch",
        { candidateApplicationId }
      );
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    return application;
  }

  private async findApplicationForUpdateInOrganization(
    actor: Actor,
    organizationId: string,
    candidateApplicationId: string,
    tx: PreInterviewTransaction
  ) {
    const application =
      await tx.candidateApplications.findApplicationForUpdate(candidateApplicationId);
    if (!application || application.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "pre_interview.cross_organization_access_denied",
        "candidate_application_organization_mismatch",
        { candidateApplicationId }
      );
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    return application;
  }

  private async findPreInterviewInOrganization(
    actor: Actor,
    organizationId: string,
    preInterviewId: string
  ) {
    const preInterview = await this.preInterviews.findPreInterviewById(preInterviewId);
    if (!preInterview || preInterview.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "pre_interview.cross_organization_access_denied",
        "pre_interview_organization_mismatch",
        { preInterviewId }
      );
      throw notFound("pre_interview_not_found", "Pre-interview not found.");
    }
    return preInterview;
  }

  private async findPreInterviewInOrganizationForUpdate(
    actor: Actor,
    organizationId: string,
    preInterviewId: string
  ) {
    const preInterview = await this.preInterviews.findPreInterviewForUpdate(preInterviewId);
    if (!preInterview || preInterview.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "pre_interview.cross_organization_access_denied",
        "pre_interview_organization_mismatch",
        { preInterviewId }
      );
      throw notFound("pre_interview_not_found", "Pre-interview not found.");
    }
    return preInterview;
  }

  // Candidate inativo / Consentimento invalido (SPEC-021, secao 16) -- espelha exatamente
  // InterviewService.ensureApplicationUsable (interviews/service.ts). CandidateApplication
  // finalizada tambem bloqueia toda operacao funcional (SPEC-021, secao 7; item 18 do pedido de
  // implementacao), mesmo precedente.
  private async ensureApplicationUsable(
    actor: Actor,
    tx: PreInterviewTransaction,
    application: {
      id: string;
      organizationId: string;
      candidateId: string;
      applicationStatus: string;
    },
    auditBlocked: boolean
  ) {
    if (application.applicationStatus !== "active") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          application.organizationId,
          "pre_interview.application_final_denied",
          "application_final",
          { candidateApplicationId: application.id }
        );
      }
      throw conflict("candidate_application_final", "Final application cannot be used.");
    }
    const candidate = await tx.preInterviews.findCandidate(application.candidateId);
    if (!candidate || candidate.organizationId !== application.organizationId) {
      throw notFound("candidate_not_found", "Candidate not found.");
    }
    if (candidate.status !== "active") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          application.organizationId,
          "pre_interview.operational_use_denied",
          "candidate_inactive",
          { candidateId: candidate.id }
        );
      }
      throw conflict("candidate_inactive", "Inactive candidate cannot be used operationally.");
    }
    const consent = await tx.preInterviews.latestConsent(candidate.id);
    if (!consent || consent.status !== "granted") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          application.organizationId,
          "pre_interview.operational_use_denied",
          "candidate_consent_invalid",
          { candidateId: candidate.id }
        );
      }
      throw conflict("candidate_consent_invalid", "Candidate consent blocks operational use.");
    }
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= Date.now()) {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          application.organizationId,
          "pre_interview.operational_use_denied",
          "candidate_consent_expired",
          { candidateId: candidate.id }
        );
      }
      throw conflict("candidate_consent_expired", "Candidate consent blocks operational use.");
    }
  }

  // Mesma checagem, para o fluxo publico (sem Actor humano) -- revalida a cada operacao,
  // nunca confia no estado que valia quando o token foi emitido (SPEC-021, secao 53 do
  // pedido de implementacao).
  private async ensureOperationalByPreInterview(
    tx: PreInterviewTransaction,
    preInterview: PreInterview
  ) {
    const application = await tx.preInterviews.findApplication(preInterview.candidateApplicationId);
    if (!application || application.organizationId !== preInterview.organizationId) {
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    if (application.applicationStatus !== "active") {
      throw conflict("candidate_application_final", "Final application cannot be used.");
    }
    const candidate = await tx.preInterviews.findCandidate(application.candidateId);
    if (!candidate || candidate.status !== "active") {
      throw conflict("candidate_inactive", "Inactive candidate cannot be used operationally.");
    }
    const consent = await tx.preInterviews.latestConsent(candidate.id);
    if (!consent || consent.status !== "granted") {
      throw conflict("candidate_consent_invalid", "Candidate consent blocks operational use.");
    }
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= Date.now()) {
      throw conflict("candidate_consent_expired", "Candidate consent blocks operational use.");
    }
  }

  // Expiracao lazy determinista (SPEC-021, secao 14; Plano Tecnico, correcao final, item 17):
  // decidida por expires_at vs. um timestamp capturado uma unica vez, apos o lock -- nunca por
  // "quem pegou o lock primeiro".
  private async materializeExpirationIfNeeded(
    tx: PreInterviewTransaction,
    preInterview: PreInterview
  ): Promise<PreInterview> {
    if (!["available", "in_progress"].includes(preInterview.status) || !preInterview.expiresAt) {
      return preInterview;
    }
    const operationNow = tx.preInterviews.now();
    if (new Date(preInterview.expiresAt).getTime() > new Date(operationNow).getTime()) {
      return preInterview;
    }
    const updated: PreInterview = {
      ...preInterview,
      status: "expired",
      expiredAt: operationNow,
      updatedAt: operationNow
    };
    await tx.preInterviews.updatePreInterview(updated);
    await tx.preInterviews.revokeActiveTokens(preInterview.organizationId, preInterview.id);
    await this.addEventOnTx(tx, updated, "expired", preInterview.status, "expired", null, {});
    await this.auditSystem(tx.core, updated.organizationId, "pre_interview.expired", {
      preInterviewId: updated.id
    });
    return updated;
  }

  // Revisao destrutiva: BUG REAL encontrado e corrigido aqui. `runTransaction` faz ROLLBACK da
  // transacao INTEIRA sempre que o callback lanca -- inclusive a propria materializacao de
  // expiracao feita ali dentro, se a operacao original (start/saveResponse/submit/cancel/
  // rotateAccessToken) lancar um conflito LOGO DEPOIS de materializar, porque o novo status
  // 'expired' nao satisfaz a pre-condicao daquela operacao (ex.: `submit` exige 'in_progress').
  // Sem esta correcao, expirar via qualquer uma dessas cinco operacoes nunca persistia de fato
  // -- so `getPublic` (que nunca lanca depois de materializar) conseguia. A correcao materializa
  // em uma transacao PROPRIA, sempre commitada de forma independente, ANTES da transacao da
  // operacao principal comecar -- a materializacao interna de cada operacao continua existindo
  // (defesa em profundidade para a janela minuscula entre as duas transacoes), mas na pratica
  // vira um no-op na maioria das chamadas, porque o estado ja chega atualizado.
  private async materializeExpirationForToken(rawToken: string): Promise<void> {
    await this.runTransaction(async (tx) => {
      const tokenHash = hashAccessToken(String(rawToken ?? ""));
      const token = await tx.preInterviews.findAccessTokenByHash(tokenHash);
      if (!token || token.status !== "active") {
        return;
      }
      const preInterview = await tx.preInterviews.findPreInterviewForUpdate(token.preInterviewId);
      if (!preInterview || preInterview.organizationId !== token.organizationId) {
        return;
      }
      await this.materializeExpirationIfNeeded(tx, preInterview);
    });
  }

  private async materializeExpirationForPreInterviewId(
    organizationId: string,
    preInterviewId: string
  ): Promise<void> {
    await this.runTransaction(async (tx) => {
      const preInterview = await tx.preInterviews.findPreInterviewForUpdate(preInterviewId);
      if (!preInterview || preInterview.organizationId !== organizationId) {
        return;
      }
      await this.materializeExpirationIfNeeded(tx, preInterview);
    });
  }

  // Resolve o token publico dentro da transacao, com lock na instancia (Plano Tecnico, correcao
  // final, ponto 3). Token invalido/expirado/revogado -> 404 generico, mesma resposta para
  // todos os casos (SPEC-020, secao 22, reaproveitado aqui).
  private async resolveTokenForUpdate(
    tx: PreInterviewTransaction,
    rawToken: string
  ): Promise<PreInterview> {
    const tokenHash = hashAccessToken(String(rawToken ?? ""));
    const token = await tx.preInterviews.findAccessTokenByHash(tokenHash);
    if (!token || token.status !== "active" || new Date(token.expiresAt).getTime() <= Date.now()) {
      throw notFound("pre_interview_access_denied", "Pre-interview not found.");
    }
    const preInterview = await tx.preInterviews.findPreInterviewForUpdate(token.preInterviewId);
    if (!preInterview || preInterview.organizationId !== token.organizationId) {
      throw notFound("pre_interview_access_denied", "Pre-interview not found.");
    }
    return preInterview;
  }

  private async addEvent(
    preInterview: PreInterview,
    eventType: PreInterviewEvent["eventType"],
    statusBefore: PreInterviewStatus | null,
    statusAfter: PreInterviewStatus | null,
    reason: string | null,
    metadata: Record<string, string>
  ) {
    await this.preInterviews.addEvent({
      id: this.preInterviews.nextId("pintevt"),
      organizationId: preInterview.organizationId,
      preInterviewId: preInterview.id,
      eventType,
      statusBefore,
      statusAfter,
      actorUserId: null,
      reason,
      metadata,
      createdAt: this.preInterviews.now()
    });
  }

  private async addEventOnTx(
    tx: PreInterviewTransaction,
    preInterview: PreInterview,
    eventType: PreInterviewEvent["eventType"],
    statusBefore: PreInterviewStatus | null,
    statusAfter: PreInterviewStatus | null,
    reason: string | null,
    metadata: Record<string, string>
  ) {
    await tx.preInterviews.addEvent({
      id: tx.preInterviews.nextId("pintevt"),
      organizationId: preInterview.organizationId,
      preInterviewId: preInterview.id,
      eventType,
      statusBefore,
      statusAfter,
      actorUserId: null,
      reason,
      metadata,
      createdAt: tx.preInterviews.now()
    });
  }

  private async aggregate(preInterview: PreInterview, includeEvents = false) {
    const questions = await this.preInterviews.listQuestions(preInterview.id);
    const responses = await this.preInterviews.listResponses(preInterview.id);
    const events = includeEvents ? await this.preInterviews.listEvents(preInterview.id) : undefined;
    return { preInterview, questions, responses, events };
  }

  private serializeOwnerAdmin(aggregate: {
    preInterview: PreInterview;
    questions: PreInterviewQuestion[];
    responses: unknown[];
    events?: PreInterviewEvent[];
  }) {
    return {
      ...aggregate.preInterview,
      questions: aggregate.questions,
      responses: aggregate.responses,
      events: aggregate.events
    };
  }

  private serializeMember(preInterview: PreInterview) {
    // DTO positivo do member (SPEC-021, secao 24.2): somente existencia e status. Nunca
    // conteudo de perguntas, respostas, motivos, eventos ou versoes internas.
    return {
      id: preInterview.id,
      status: preInterview.status,
      attemptNumber: preInterview.attemptNumber
    };
  }

  private serializeAdminRead(preInterview: PreInterview) {
    return {
      id: preInterview.id,
      organizationId: preInterview.organizationId,
      candidateApplicationId: preInterview.candidateApplicationId,
      status: preInterview.status,
      attemptNumber: preInterview.attemptNumber,
      createdAt: preInterview.createdAt,
      updatedAt: preInterview.updatedAt
    };
  }

  private async serializePublic(tx: PreInterviewTransaction, preInterview: PreInterview) {
    const questions = await tx.preInterviews.listQuestions(preInterview.id);
    const responses = await tx.preInterviews.listResponses(preInterview.id);
    const byQuestion = new Map(
      responses.map((response) => [response.preInterviewQuestionId, response])
    );
    const requiredTotal = questions.filter((question) => question.required).length;
    const requiredAnswered = questions.filter(
      (question) => question.required && byQuestion.has(question.id)
    ).length;
    return {
      status: preInterview.status,
      expiresAt: preInterview.expiresAt,
      questions: questions
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((question) => ({
          id: question.id,
          title: question.snapshotTitle,
          text: question.snapshotText,
          type: question.snapshotType,
          options: question.snapshotOptions,
          required: question.required,
          displayOrder: question.displayOrder
        })),
      responses: responses.map((response) => ({
        questionId: response.preInterviewQuestionId,
        value: response.responseValue,
        submitted: response.submitted
      })),
      progress: {
        answered: responses.length,
        total: questions.length,
        requiredAnswered,
        requiredTotal
      }
    };
  }

  private async audit(
    actor: Actor,
    organizationId: string | null,
    action: string,
    metadata: Record<string, string> = {}
  ) {
    await this.testingHooks.beforeCriticalAudit?.(action);
    await auditPreInterview(this.core, actor, organizationId, action, metadata);
  }

  private async auditDenied(
    actor: Actor,
    organizationId: string | null,
    action: string,
    reason: string,
    metadata: Record<string, string> = {}
  ) {
    await auditPreInterviewDenied(this.core, actor, organizationId, action, reason, metadata);
  }

  // Mesma checagem de seam de teste do `audit()` acima, para os eventos de auditoria
  // system-triggered (sem Actor humano -- criacao automatica, start/save/submit/expiracao
  // publicos). Wrapper fino sobre `auditPreInterviewSystem`, nunca duplicando sua logica.
  private async auditSystem(
    core: CoreRepository,
    organizationId: string | null,
    action: string,
    metadata: Record<string, string> = {}
  ) {
    await this.testingHooks.beforeCriticalAudit?.(action);
    await auditPreInterviewSystem(core, organizationId, action, metadata);
  }
}

function computeEffectiveStatus(preInterview: PreInterview, now: string): PreInterviewStatus {
  // Item 34 do pedido de implementacao: listagens nunca apresentam `available`/`in_progress`
  // quando `expires_at` ja passou, mesmo sem materializacao fisica ainda ter ocorrido.
  if (
    ["available", "in_progress"].includes(preInterview.status) &&
    preInterview.expiresAt &&
    new Date(preInterview.expiresAt).getTime() <= new Date(now).getTime()
  ) {
    return "expired";
  }
  return preInterview.status;
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }
  return actor.userId;
}

// `testingHooks` (revisao destrutiva, itens 22/43): permite provocar falha deliberada dentro
// da transacao de criacao de tentativa / auditoria critica, para provar rollback real -- mesmo
// padrao ja usado por `PublicApplicationTestingHooks` (Fase 17). Em producao
// (`src/server/index.ts`) nunca e passado, entao o hook e sempre um no-op real.
export function createPostgresPreInterviewService(
  pool: pg.Pool,
  testingHooks: PreInterviewTestingHooks = {}
) {
  const core = new PostgresCoreRepository(pool);
  const preInterviews = new PostgresPreInterviewRepository(pool);
  const runTransaction = createPreInterviewTransactionRunner(pool);
  return new PreInterviewService(
    core,
    preInterviews,
    runTransaction,
    new RateLimiter(DEFAULT_PRE_INTERVIEW_RATE_LIMITS),
    testingHooks
  );
}
