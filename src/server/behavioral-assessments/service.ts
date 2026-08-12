import type pg from "pg";
import { conflict, forbidden, notFound, tooManyRequests } from "../core/errors";
import { RateLimiter, type RateLimitConfig } from "../core/rate-limiter";
import type { CoreRepository } from "../core/repository";
import type { Actor, MembershipRole } from "../core/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresBehavioralAssessmentRepository } from "../persistence/postgres-behavioral-assessment-repository";
import { generateRawAccessToken, hashAccessToken } from "./access-token";
import {
  auditBehavioralAssessment,
  auditBehavioralAssessmentDenied,
  auditBehavioralAssessmentSystem
} from "./audit";
import { assertValidCalculatorOutput, findCalculator } from "./calculations";
import type { BehavioralAssessmentRepository } from "./repository";
import {
  createBehavioralAssessmentTransactionRunner,
  type BehavioralAssessmentTransaction,
  type BehavioralAssessmentTransactionRunner
} from "./transaction";
import type {
  BehavioralAssessment,
  BehavioralAssessmentAdminReadInput,
  BehavioralAssessmentCreateInput,
  BehavioralAssessmentEvent,
  BehavioralAssessmentExternalImportInput,
  BehavioralAssessmentReasonInput,
  BehavioralAssessmentResponseInput,
  BehavioralAssessmentStatus,
  BehavioralInstrument,
  BehavioralInstrumentInput,
  BehavioralInstrumentItem,
  BehavioralInstrumentVersion,
  BehavioralInstrumentVersionInput,
  JobOpeningBehavioralAssessmentSettingsInput,
  OrganizationBehavioralInstrumentSettingsInput
} from "./types";
import {
  validateAdminReason,
  validateExternalImportInput,
  validateId,
  validateInstrumentInput,
  validateInstrumentVersionInput,
  validateJobOpeningSettingsInput,
  validateOrganizationSettingsInput,
  validateReason,
  validateResponseInput
} from "./validation";

// Fase 19 (SPEC-022 v1.0). Nunca chama AIGateway, provider, modelo ou Prompt Registry -- este
// modulo funciona integralmente sem IA. Nenhuma metodologia DISC e definida aqui.

const DEFAULT_ACCESS_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dias

// Correcao Final do Plano Tecnico (item 19/consentimento): valor canonico declarado para o
// `purpose` de `candidate_consents` desta finalidade -- nunca uma string livre inventada em
// tempo de execucao. `latestConsentByPurpose` filtra exatamente por este valor, nunca
// reaproveitando a consulta generica "consentimento mais recente" ja usada por outros modulos.
export const BEHAVIORAL_ASSESSMENT_CONSENT_PURPOSE = "behavioral_assessment";

// Mesmo padrao ja validado e corrigido pela revisao destrutiva da Fase 18: duas dimensoes
// combinadas (IP + hash do token tentado, nunca o token bruto), checadas antes de qualquer
// trabalho em banco.
const DEFAULT_RATE_LIMITS = {
  publicByIp: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig,
  publicByTokenHash: { limit: 30, windowMs: 60_000 } satisfies RateLimitConfig
};
type RateLimitNamespace = keyof typeof DEFAULT_RATE_LIMITS;
export type BehavioralAssessmentPublicMeta = { ip: string };

// Seam de teste, inerte em producao -- mesmo padrao ja usado por `PreInterviewTestingHooks`
// (Fase 18) para provar atomicidade/rollback real.
export type BehavioralAssessmentTestingHooks = {
  afterAssessmentInserted?: () => Promise<void> | void;
  beforeCriticalAudit?: (action: string) => Promise<void> | void;
};

export class BehavioralAssessmentService {
  constructor(
    private readonly core: CoreRepository,
    private readonly behavioralAssessments: BehavioralAssessmentRepository,
    private readonly runTransaction: BehavioralAssessmentTransactionRunner,
    private readonly rateLimiter: RateLimiter<RateLimitNamespace> = new RateLimiter(
      DEFAULT_RATE_LIMITS
    ),
    private readonly testingHooks: BehavioralAssessmentTestingHooks = {}
  ) {}

  // ==========================================================================================
  // Instrumento (definicao logica) -- global (Platform Admin) ou proprio (owner/admin).
  // ==========================================================================================

  async createGlobalInstrument(actor: Actor, input: BehavioralInstrumentInput) {
    this.authorizePlatformAdmin(actor);
    const normalized = validateInstrumentInput(input);
    const now = this.behavioralAssessments.now();
    const instrument: BehavioralInstrument = {
      id: this.behavioralAssessments.nextId("bi"),
      scope: "platform",
      organizationId: null,
      name: normalized.name,
      description: normalized.description,
      status: "active",
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now
    };
    await this.behavioralAssessments.createInstrument(instrument);
    await auditBehavioralAssessment(this.core, actor, null, "behavioral_instrument.created", {
      instrumentId: instrument.id,
      scope: "platform"
    });
    return instrument;
  }

  async createPrivateInstrument(
    actor: Actor,
    organizationId: string,
    input: BehavioralInstrumentInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const normalized = validateInstrumentInput(input);
    const now = this.behavioralAssessments.now();
    const instrument: BehavioralInstrument = {
      id: this.behavioralAssessments.nextId("bi"),
      scope: "organization",
      organizationId,
      name: normalized.name,
      description: normalized.description,
      status: "active",
      createdByUserId: requireUserActorId(actor),
      updatedByUserId: requireUserActorId(actor),
      createdAt: now,
      updatedAt: now
    };
    await this.behavioralAssessments.createInstrument(instrument);
    await auditBehavioralAssessment(
      this.core,
      actor,
      organizationId,
      "behavioral_instrument.created",
      {
        instrumentId: instrument.id,
        scope: "organization"
      }
    );
    return instrument;
  }

  async updateInstrument(
    actor: Actor,
    organizationId: string | null,
    instrumentId: string,
    input: BehavioralInstrumentInput
  ) {
    const instrument = await this.behavioralAssessments.findInstrumentById(
      validateId(instrumentId, "instrument_id")
    );
    if (!instrument) {
      throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
    }
    await this.authorizeInstrumentAdministration(actor, organizationId, instrument);
    const normalized = validateInstrumentInput(input);
    const updated: BehavioralInstrument = {
      ...instrument,
      name: normalized.name,
      description: normalized.description,
      updatedByUserId: actor.kind === "user" ? actor.userId : instrument.updatedByUserId,
      updatedAt: this.behavioralAssessments.now()
    };
    await this.behavioralAssessments.updateInstrument(updated);
    await auditBehavioralAssessment(
      this.core,
      actor,
      organizationId,
      "behavioral_instrument.updated",
      {
        instrumentId: instrument.id
      }
    );
    return updated;
  }

  async setInstrumentStatus(
    actor: Actor,
    organizationId: string | null,
    instrumentId: string,
    status: "active" | "inactive"
  ) {
    const instrument = await this.behavioralAssessments.findInstrumentById(
      validateId(instrumentId, "instrument_id")
    );
    if (!instrument) {
      throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
    }
    await this.authorizeInstrumentAdministration(actor, organizationId, instrument);
    const updated: BehavioralInstrument = {
      ...instrument,
      status,
      updatedByUserId: actor.kind === "user" ? actor.userId : instrument.updatedByUserId,
      updatedAt: this.behavioralAssessments.now()
    };
    await this.behavioralAssessments.updateInstrument(updated);
    await auditBehavioralAssessment(
      this.core,
      actor,
      organizationId,
      status === "active" ? "behavioral_instrument.activated" : "behavioral_instrument.inactivated",
      { instrumentId: instrument.id }
    );
    return updated;
  }

  async getInstrument(actor: Actor, organizationId: string | null, instrumentId: string) {
    const instrument = await this.behavioralAssessments.findInstrumentById(
      validateId(instrumentId, "instrument_id")
    );
    if (!instrument) {
      throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
    }
    await this.authorizeInstrumentRead(actor, organizationId, instrument);
    return instrument;
  }

  // Catalogo disponivel para uma Organization: proprios + globais habilitados e ativos.
  async listAvailableInstruments(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const own = await this.behavioralAssessments.listInstruments({
      scope: "organization",
      organizationId
    });
    const settings = await this.behavioralAssessments.listOrganizationSettings(organizationId);
    const enabledIds = new Set(
      settings.filter((entry) => entry.enabled).map((entry) => entry.behavioralInstrumentId)
    );
    const globalInstruments = await this.behavioralAssessments.listInstruments({
      scope: "platform"
    });
    const global = globalInstruments.filter((instrument) => enabledIds.has(instrument.id));
    return [...own, ...global].filter((instrument) => instrument.status === "active");
  }

  async listGlobalInstruments(actor: Actor) {
    this.authorizePlatformAdmin(actor);
    return this.behavioralAssessments.listInstruments({ scope: "platform" });
  }

  // Catalogo global somente-leitura, para que owner/admin de uma Organization descubram QUAIS
  // instrumentos globais existem antes de habilita-los (o toggle de habilitacao exige o ID do
  // instrumento -- sem esta leitura nao haveria forma de descobri-lo pela UI). Nunca expoe
  // instrumentos privados de outra Organization -- somente `scope='platform'` e `status='active'`.
  async listGlobalCatalog(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const instruments = await this.behavioralAssessments.listInstruments({ scope: "platform" });
    return instruments.filter((instrument) => instrument.status === "active");
  }

  async listOrganizationInstrumentSettings(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.behavioralAssessments.listOrganizationSettings(organizationId);
  }

  // ==========================================================================================
  // Versao formal do instrumento.
  // ==========================================================================================

  async createDraftVersion(
    actor: Actor,
    organizationId: string | null,
    instrumentId: string,
    input: BehavioralInstrumentVersionInput
  ) {
    const instrument = await this.behavioralAssessments.findInstrumentById(
      validateId(instrumentId, "instrument_id")
    );
    if (!instrument) {
      throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
    }
    await this.authorizeInstrumentAdministration(actor, organizationId, instrument);
    const normalized = validateInstrumentVersionInput(input);

    return this.runTransaction(async (tx) => {
      const existingDraft = await tx.behavioralAssessments.findDraftVersion(instrument.id);
      if (existingDraft) {
        throw conflict(
          "behavioral_instrument_version_draft_exists",
          "A draft version already exists."
        );
      }
      const max = await tx.behavioralAssessments.findMaxVersionNumber(instrument.id);
      const now = tx.behavioralAssessments.now();
      const version: BehavioralInstrumentVersion = {
        id: tx.behavioralAssessments.nextId("biv"),
        behavioralInstrumentId: instrument.id,
        versionNumber: max + 1,
        status: "draft",
        methodologyKey: normalized.methodologyKey,
        calculationMethodVersion: normalized.calculationMethodVersion,
        dimensions: normalized.dimensions,
        instructions: normalized.instructions,
        candidateResultVisibility: normalized.candidateResultVisibility,
        rawResponseOwnerVisibility: normalized.rawResponseOwnerVisibility,
        createdByUserId: actor.kind === "user" ? actor.userId : null,
        publishedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now
      };
      await tx.behavioralAssessments.createVersion(version);

      const items: BehavioralInstrumentItem[] = normalized.items.map((item) => ({
        id: tx.behavioralAssessments.nextId("bii"),
        behavioralInstrumentVersionId: version.id,
        itemKey: item.itemKey,
        itemType: item.itemType,
        promptText: item.promptText,
        externalItemReference: item.externalItemReference,
        dimensionMapping: item.dimensionMapping,
        scoringMetadata: item.scoringMetadata,
        options: item.options,
        displayOrder: item.displayOrder,
        required: item.required,
        createdAt: now
      }));
      for (const item of items) {
        await tx.behavioralAssessments.addItem(item);
      }

      await auditBehavioralAssessment(
        tx.core,
        actor,
        organizationId,
        "behavioral_instrument_version.created",
        {
          instrumentId: instrument.id,
          versionId: version.id
        }
      );
      return { version, items };
    });
  }

  // Correcao Final vinculante: `validateVersionManifest` e obrigatorio em todo calculador --
  // ativacao SEMPRE o invoca, nunca opcionalmente.
  async activateVersion(
    actor: Actor,
    organizationId: string | null,
    instrumentId: string,
    versionId: string
  ) {
    const instrument = await this.behavioralAssessments.findInstrumentById(
      validateId(instrumentId, "instrument_id")
    );
    if (!instrument) {
      throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
    }
    await this.authorizeInstrumentAdministration(actor, organizationId, instrument);

    return this.runTransaction(async (tx) => {
      const version = await tx.behavioralAssessments.findVersionForUpdate(
        validateId(versionId, "instrument_version_id")
      );
      if (!version || version.behavioralInstrumentId !== instrument.id) {
        throw notFound("behavioral_instrument_version_not_found", "Version not found.");
      }
      if (version.status !== "draft") {
        throw conflict(
          "behavioral_instrument_version_not_draft",
          "Only a draft version can be activated."
        );
      }
      if (instrument.status !== "active") {
        throw conflict(
          "behavioral_instrument_not_active",
          "Instrument must be active to publish a version."
        );
      }

      const calculator = findCalculator(version.methodologyKey, version.calculationMethodVersion);
      if (!calculator) {
        throw conflict(
          "behavioral_instrument_version_calculator_missing",
          "No calculator registered for this methodology/version."
        );
      }
      const items = await tx.behavioralAssessments.listItemsByVersion(version.id);
      try {
        calculator.validateVersionManifest(version, items);
      } catch {
        throw conflict(
          "behavioral_instrument_version_manifest_invalid",
          "Version manifest is not valid for its calculator."
        );
      }

      const now = tx.behavioralAssessments.now();
      const updated: BehavioralInstrumentVersion = {
        ...version,
        status: "active",
        publishedAt: now,
        updatedAt: now
      };
      await tx.behavioralAssessments.updateVersion(updated);
      await auditBehavioralAssessment(
        tx.core,
        actor,
        organizationId,
        "behavioral_instrument_version.published",
        {
          instrumentId: instrument.id,
          versionId: version.id
        }
      );
      return updated;
    });
  }

  async archiveVersion(
    actor: Actor,
    organizationId: string | null,
    instrumentId: string,
    versionId: string
  ) {
    const instrument = await this.behavioralAssessments.findInstrumentById(
      validateId(instrumentId, "instrument_id")
    );
    if (!instrument) {
      throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
    }
    await this.authorizeInstrumentAdministration(actor, organizationId, instrument);

    return this.runTransaction(async (tx) => {
      const version = await tx.behavioralAssessments.findVersionForUpdate(
        validateId(versionId, "instrument_version_id")
      );
      if (!version || version.behavioralInstrumentId !== instrument.id) {
        throw notFound("behavioral_instrument_version_not_found", "Version not found.");
      }
      if (version.status !== "active") {
        throw conflict(
          "behavioral_instrument_version_not_active",
          "Only an active version can be archived."
        );
      }
      const now = tx.behavioralAssessments.now();
      const updated: BehavioralInstrumentVersion = {
        ...version,
        status: "archived",
        archivedAt: now,
        updatedAt: now
      };
      await tx.behavioralAssessments.updateVersion(updated);
      await auditBehavioralAssessment(
        tx.core,
        actor,
        organizationId,
        "behavioral_instrument_version.archived",
        {
          instrumentId: instrument.id,
          versionId: version.id
        }
      );
      return updated;
    });
  }

  async listVersions(actor: Actor, organizationId: string | null, instrumentId: string) {
    const instrument = await this.behavioralAssessments.findInstrumentById(
      validateId(instrumentId, "instrument_id")
    );
    if (!instrument) {
      throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
    }
    await this.authorizeInstrumentRead(actor, organizationId, instrument);
    return this.behavioralAssessments.listVersionsByInstrument(instrument.id);
  }

  // ==========================================================================================
  // Disponibilidade de instrumento global por Organization.
  // ==========================================================================================

  async setOrganizationInstrumentEnabled(
    actor: Actor,
    organizationId: string,
    instrumentId: string,
    input: OrganizationBehavioralInstrumentSettingsInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const normalized = validateOrganizationSettingsInput(input);

    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const instrument = await tx.behavioralAssessments.findInstrumentById(
        validateId(instrumentId, "instrument_id")
      );
      if (!instrument || instrument.scope !== "platform") {
        // Nunca revela se o instrumento existe como privado de outra Organization.
        throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
      }
      let settings = await tx.behavioralAssessments.findOrganizationSettingsForUpdate(
        organizationId,
        instrument.id
      );
      const now = tx.behavioralAssessments.now();
      const userId = requireUserActorId(actor);
      if (!settings) {
        settings = {
          id: tx.behavioralAssessments.nextId("obis"),
          organizationId,
          behavioralInstrumentId: instrument.id,
          enabled: normalized.enabled,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now
        };
        await tx.behavioralAssessments.createOrganizationSettings(settings);
      } else {
        settings = {
          ...settings,
          enabled: normalized.enabled,
          updatedByUserId: userId,
          updatedAt: now
        };
        await tx.behavioralAssessments.updateOrganizationSettings(settings);
      }
      await service.audit(
        actor,
        organizationId,
        "organization_behavioral_instrument_settings.updated",
        {
          instrumentId: instrument.id,
          enabled: String(settings.enabled)
        }
      );
      return settings;
    });
  }

  // ==========================================================================================
  // Configuracao da vaga (preferencia -- nunca dispara aplicacao sozinha).
  // ==========================================================================================

  async getJobOpeningSettings(actor: Actor, organizationId: string, jobOpeningId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    await this.ensureJobOpeningInOrganization(actor, organizationId, jobOpeningId);
    const settings = await this.behavioralAssessments.findJobOpeningSettings(
      organizationId,
      jobOpeningId
    );
    return (
      settings ?? {
        id: null,
        organizationId,
        jobOpeningId,
        enabled: false,
        behavioralInstrumentId: null,
        behavioralInstrumentScope: null,
        behavioralInstrumentVersionId: null
      }
    );
  }

  async updateJobOpeningSettings(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string,
    input: JobOpeningBehavioralAssessmentSettingsInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await service.ensureJobOpeningInOrganization(actor, organizationId, jobOpeningId);
      const normalized = validateJobOpeningSettingsInput(input);

      let behavioralInstrumentScope: "platform" | "organization" | null = null;
      if (normalized.enabled) {
        const instrument = await tx.behavioralAssessments.findInstrumentById(
          normalized.behavioralInstrumentId!
        );
        const version = await tx.behavioralAssessments.findVersionById(
          normalized.behavioralInstrumentVersionId!
        );
        if (!instrument || !version || version.behavioralInstrumentId !== instrument.id) {
          throw notFound(
            "behavioral_instrument_version_not_found",
            "Instrument/version not found."
          );
        }
        // Sanidade em tempo de configuracao (mensagem amigavel) -- a autoridade final continua
        // sendo a trigger fisica no momento de criar a aplicacao (item 5 da Correcao Final).
        if (instrument.scope === "organization" && instrument.organizationId !== organizationId) {
          throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
        }
        behavioralInstrumentScope = instrument.scope;
      }

      let settings = await tx.behavioralAssessments.findJobOpeningSettingsForUpdate(
        organizationId,
        jobOpeningId
      );
      const now = tx.behavioralAssessments.now();
      const userId = requireUserActorId(actor);
      if (!settings) {
        settings = {
          id: tx.behavioralAssessments.nextId("jobas"),
          organizationId,
          jobOpeningId,
          enabled: normalized.enabled,
          behavioralInstrumentId: normalized.behavioralInstrumentId,
          behavioralInstrumentScope,
          behavioralInstrumentVersionId: normalized.behavioralInstrumentVersionId,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now
        };
        await tx.behavioralAssessments.createJobOpeningSettings(settings);
      } else {
        settings = {
          ...settings,
          enabled: normalized.enabled,
          behavioralInstrumentId: normalized.behavioralInstrumentId,
          behavioralInstrumentScope,
          behavioralInstrumentVersionId: normalized.behavioralInstrumentVersionId,
          updatedByUserId: userId,
          updatedAt: now
        };
        await tx.behavioralAssessments.updateJobOpeningSettings(settings);
      }
      await service.audit(
        actor,
        organizationId,
        "job_opening_behavioral_assessment_settings.updated",
        {
          jobOpeningId,
          enabled: String(settings.enabled)
        }
      );
      return settings;
    });
  }

  // ==========================================================================================
  // Aplicacao -- criacao SEMPRE administrativa e explicita (SPEC-022, secao 9.1). Nunca
  // automatica apos candidatura ou Pre-Entrevista.
  // ==========================================================================================

  async createAssessment(
    actor: Actor,
    organizationId: string,
    candidateApplicationId: string,
    input: BehavioralAssessmentCreateInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const requestedInstrumentId = input.behavioralInstrumentId ?? input.behavioral_instrument_id;
    const requestedVersionId =
      input.behavioralInstrumentVersionId ?? input.behavioral_instrument_version_id;

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

      let instrumentId = requestedInstrumentId
        ? validateId(requestedInstrumentId, "instrument_id")
        : null;
      let versionId = requestedVersionId
        ? validateId(requestedVersionId, "instrument_version_id")
        : null;
      if (!instrumentId || !versionId) {
        const settings = await tx.behavioralAssessments.findJobOpeningSettings(
          organizationId,
          application.jobOpeningId
        );
        if (
          !settings?.enabled ||
          !settings.behavioralInstrumentId ||
          !settings.behavioralInstrumentVersionId
        ) {
          throw conflict(
            "behavioral_assessment_not_configured",
            "Job opening has no Behavioral Instrument configured."
          );
        }
        instrumentId = settings.behavioralInstrumentId;
        versionId = settings.behavioralInstrumentVersionId;
      }

      const instrument = await tx.behavioralAssessments.findInstrumentById(instrumentId);
      const version = await tx.behavioralAssessments.findVersionById(versionId);
      if (!instrument || !version || version.behavioralInstrumentId !== instrument.id) {
        throw notFound("behavioral_instrument_version_not_found", "Instrument/version not found.");
      }
      if (instrument.scope === "organization" && instrument.organizationId !== organizationId) {
        await service.auditDenied(
          actor,
          organizationId,
          "behavioral_assessment.cross_organization_access_denied",
          "instrument_organization_mismatch",
          { instrumentId: instrument.id }
        );
        throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
      }

      const existing = await tx.behavioralAssessments.findOperationalByApplication(
        organizationId,
        candidateApplicationId,
        instrument.id
      );
      if (existing) {
        throw conflict(
          "behavioral_assessment_already_operational",
          "An operational assessment already exists."
        );
      }

      const consent = await service.resolveGrantedConsent(tx, application.candidateId);

      const created = await service.buildAndInsertAssessment(tx, {
        organizationId,
        candidateApplicationId,
        jobOpeningId: application.jobOpeningId,
        jobOpeningVersionId: application.jobOpeningVersionId,
        instrument,
        version,
        consentId: consent.id,
        createdByUserId: requireUserActorId(actor),
        previousAttemptId: null
      });
      const rawAccessToken = await service.issueAdditionalToken(tx, created);
      await service.audit(actor, organizationId, "behavioral_assessment.created", {
        assessmentId: created.id,
        candidateApplicationId,
        instrumentId: instrument.id
      });
      return { ...(await service.serializeOwnerAdmin(created)), rawAccessToken };
    });
  }

  async retry(actor: Actor, organizationId: string, assessmentId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      let previous = await service.findAssessmentInOrganizationForUpdate(
        actor,
        organizationId,
        assessmentId
      );
      // Revisao destrutiva final, item 44: sem esta materializacao, uma tentativa anterior
      // fisicamente `available`/`in_progress` mas com `expires_at` ja vencido (e ainda nao
      // tocada por nenhuma chamada do fluxo publico) seria injustamente recusada aqui como
      // "nao finalizada" -- o proprio retry precisa reconhecer expiracao efetiva, nao apenas
      // o status fisico bruto.
      previous = await service.materializeExpirationIfNeeded(tx, previous);
      if (!["completed", "cancelled", "expired"].includes(previous.status)) {
        throw conflict(
          "behavioral_assessment_not_final",
          "Only a finalized attempt can be reopened."
        );
      }
      const application = await service.findApplicationForUpdateInOrganization(
        actor,
        organizationId,
        previous.candidateApplicationId,
        tx
      );
      await service.ensureApplicationUsable(actor, tx, application, true);

      const existing = await tx.behavioralAssessments.findOperationalByApplication(
        organizationId,
        previous.candidateApplicationId,
        previous.behavioralInstrumentId
      );
      if (existing) {
        throw conflict(
          "behavioral_assessment_already_operational",
          "An operational assessment already exists."
        );
      }

      // Correcao Final do Plano Tecnico, item 37: a nova tentativa resolve a versao VIGENTE do
      // MESMO instrumento no momento da reabertura -- nunca herda a versao da tentativa anterior.
      const instrument = await tx.behavioralAssessments.findInstrumentById(
        previous.behavioralInstrumentId
      );
      const version = await tx.behavioralAssessments.findActiveVersion(
        previous.behavioralInstrumentId
      );
      if (!instrument || instrument.status !== "active" || !version) {
        throw conflict(
          "behavioral_assessment_not_configured",
          "Instrument has no active version to reopen with."
        );
      }

      const consent = await service.resolveGrantedConsent(tx, application.candidateId);

      const created = await service.buildAndInsertAssessment(tx, {
        organizationId,
        candidateApplicationId: previous.candidateApplicationId,
        jobOpeningId: application.jobOpeningId,
        jobOpeningVersionId: application.jobOpeningVersionId,
        instrument,
        version,
        consentId: consent.id,
        createdByUserId: requireUserActorId(actor),
        previousAttemptId: previous.id
      });
      const rawAccessToken = await service.issueAdditionalToken(tx, created);
      await service.addEvent(created, "reopening_authorized", previous.status, null, null, {
        previousAttemptId: previous.id
      });
      await service.audit(actor, organizationId, "behavioral_assessment.reopening_authorized", {
        assessmentId: created.id,
        previousAttemptId: previous.id
      });
      return { ...(await service.serializeOwnerAdmin(created)), rawAccessToken };
    });
  }

  private async buildAndInsertAssessment(
    tx: BehavioralAssessmentTransaction,
    params: {
      organizationId: string;
      candidateApplicationId: string;
      jobOpeningId: string;
      jobOpeningVersionId: string;
      instrument: BehavioralInstrument;
      version: BehavioralInstrumentVersion;
      consentId: string;
      createdByUserId: string;
      previousAttemptId: string | null;
    }
  ): Promise<BehavioralAssessment> {
    if (params.instrument.status !== "active" || params.version.status !== "active") {
      throw conflict(
        "behavioral_assessment_instrument_not_active",
        "Instrument/version is not active."
      );
    }

    const max = await tx.behavioralAssessments.findMaxAttemptNumber(
      params.organizationId,
      params.candidateApplicationId,
      params.instrument.id
    );
    const attemptNumber = max + 1;
    const now = tx.behavioralAssessments.now();
    const blueprintVersionId = await tx.behavioralAssessments.findActiveBlueprintVersionId(
      params.organizationId
    );

    const assessment: BehavioralAssessment = {
      id: tx.behavioralAssessments.nextId("ba"),
      organizationId: params.organizationId,
      candidateApplicationId: params.candidateApplicationId,
      jobOpeningId: params.jobOpeningId,
      jobOpeningVersionId: params.jobOpeningVersionId,
      blueprintVersionId,
      behavioralInstrumentId: params.instrument.id,
      behavioralInstrumentScope: params.instrument.scope,
      behavioralInstrumentOwnerOrganizationId:
        params.instrument.scope === "organization" ? params.instrument.organizationId : null,
      behavioralInstrumentVersionId: params.version.id,
      originType: "internal_application",
      attemptNumber,
      previousAttemptId: params.previousAttemptId,
      status: "draft",
      candidateConsentId: params.consentId,
      createdSource: "internal_user",
      createdByUserId: params.createdByUserId,
      availableAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      expiredAt: null,
      expiresAt: new Date(Date.parse(now) + DEFAULT_ACCESS_TOKEN_TTL_MS).toISOString(),
      externalProvider: null,
      externalReferenceId: null,
      appliedAtExternal: null,
      completedAtExternal: null,
      importedAt: null,
      importedByUserId: null,
      createdAt: now,
      updatedAt: now
    };
    await tx.behavioralAssessments.createAssessment(assessment);
    await this.addEventOnTx(tx, assessment, "created", null, "draft", null, {});

    // Revisao destrutiva (mesmo padrao da Fase 18, item 22): seam de teste -- se lancar, a
    // linha e o evento ja inseridos acima devem desaparecer no ROLLBACK.
    await this.testingHooks.afterAssessmentInserted?.();

    // draft -> available, sempre atomico com a criacao -- nunca uma pausa persistida
    // observavel (SPEC-022, secao 7.1; Correcao Final, item 25/item 21).
    const available: BehavioralAssessment = {
      ...assessment,
      status: "available",
      availableAt: now,
      updatedAt: now
    };
    await tx.behavioralAssessments.updateAssessment(available);
    await this.addEventOnTx(tx, available, "available", "draft", "available", null, {});

    return available;
  }

  private async issueAdditionalToken(
    tx: BehavioralAssessmentTransaction,
    assessment: BehavioralAssessment
  ) {
    const rawToken = generateRawAccessToken();
    const tokenHash = hashAccessToken(rawToken);
    const expiresAt =
      assessment.expiresAt ??
      new Date(
        Date.parse(tx.behavioralAssessments.now()) + DEFAULT_ACCESS_TOKEN_TTL_MS
      ).toISOString();
    await tx.behavioralAssessments.addAccessToken({
      id: tx.behavioralAssessments.nextId("bat"),
      organizationId: assessment.organizationId,
      behavioralAssessmentId: assessment.id,
      tokenHash,
      status: "active",
      expiresAt,
      createdAt: tx.behavioralAssessments.now(),
      revokedAt: null
    });
    return rawToken;
  }

  // ==========================================================================================
  // Importacao externa -- sempre owner/admin, sempre atomica, nunca confia cegamente no
  // payload (Correcao Final do Plano Tecnico, itens 32-36).
  // ==========================================================================================

  async registerExternalImport(
    actor: Actor,
    organizationId: string,
    candidateApplicationId: string,
    input: BehavioralAssessmentExternalImportInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const normalized = validateExternalImportInput(input);

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

      const instrument = await tx.behavioralAssessments.findInstrumentById(
        normalized.behavioralInstrumentId
      );
      const version = await tx.behavioralAssessments.findVersionById(
        normalized.behavioralInstrumentVersionId
      );
      if (!instrument || !version || version.behavioralInstrumentId !== instrument.id) {
        throw notFound("behavioral_instrument_version_not_found", "Instrument/version not found.");
      }
      if (instrument.scope === "organization" && instrument.organizationId !== organizationId) {
        await service.auditDenied(
          actor,
          organizationId,
          "behavioral_assessment.cross_organization_access_denied",
          "instrument_organization_mismatch",
          { instrumentId: instrument.id }
        );
        throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
      }
      if (instrument.status !== "active" || version.status !== "active") {
        throw conflict(
          "behavioral_assessment_instrument_not_active",
          "Instrument/version is not active."
        );
      }

      // Idempotencia de replay quando o provedor fornece identificador estavel (Correcao
      // Final, item 35) -- reimportacao do mesmo external_reference_id nunca cria segunda
      // aplicacao.
      if (normalized.externalReferenceId) {
        const already = await tx.behavioralAssessments.findByExternalReference(
          organizationId,
          instrument.id,
          normalized.externalProvider,
          normalized.externalReferenceId
        );
        if (already) {
          return service.serializeOwnerAdmin(already);
        }
      }

      const existing = await tx.behavioralAssessments.findOperationalByApplication(
        organizationId,
        candidateApplicationId,
        instrument.id
      );
      if (existing) {
        throw conflict(
          "behavioral_assessment_already_operational",
          "An operational assessment already exists."
        );
      }

      const consent = await service.resolveGrantedConsent(tx, application.candidateId);

      const max = await tx.behavioralAssessments.findMaxAttemptNumber(
        organizationId,
        candidateApplicationId,
        instrument.id
      );
      const now = tx.behavioralAssessments.now();
      const blueprintVersionId =
        await tx.behavioralAssessments.findActiveBlueprintVersionId(organizationId);

      const assessment: BehavioralAssessment = {
        id: tx.behavioralAssessments.nextId("ba"),
        organizationId,
        candidateApplicationId,
        jobOpeningId: application.jobOpeningId,
        jobOpeningVersionId: application.jobOpeningVersionId,
        blueprintVersionId,
        behavioralInstrumentId: instrument.id,
        behavioralInstrumentScope: instrument.scope,
        behavioralInstrumentOwnerOrganizationId:
          instrument.scope === "organization" ? instrument.organizationId : null,
        behavioralInstrumentVersionId: version.id,
        originType: "external_import",
        attemptNumber: max + 1,
        previousAttemptId: null,
        status: "draft",
        candidateConsentId: consent.id,
        createdSource: "internal_user",
        createdByUserId: requireUserActorId(actor),
        availableAt: null,
        startedAt: null,
        completedAt: now,
        cancelledAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
        expiredAt: null,
        expiresAt: null,
        externalProvider: normalized.externalProvider,
        externalReferenceId: normalized.externalReferenceId,
        appliedAtExternal: normalized.appliedAtExternal,
        completedAtExternal: normalized.completedAtExternal,
        importedAt: now,
        importedByUserId: requireUserActorId(actor),
        createdAt: now,
        updatedAt: now
      };
      await tx.behavioralAssessments.createAssessment(assessment);
      await this.addEventOnTx(tx, assessment, "created", null, "draft", null, {});
      await this.testingHooks.afterAssessmentInserted?.();

      // Importacao externa nasce diretamente completed, na mesma operacao atomica (SPEC-022,
      // secao 7.2) -- nunca passa por available/in_progress.
      const completedAssessment: BehavioralAssessment = {
        ...assessment,
        status: "completed",
        updatedAt: now
      };
      await tx.behavioralAssessments.updateAssessment(completedAssessment);
      await this.addEventOnTx(
        tx,
        completedAssessment,
        "external_result_imported",
        "draft",
        "completed",
        null,
        {}
      );

      const result = {
        id: tx.behavioralAssessments.nextId("bares"),
        organizationId,
        behavioralAssessmentId: assessment.id,
        behavioralInstrumentVersionId: version.id,
        calculationMethodVersion: version.calculationMethodVersion,
        origin: "imported" as const,
        summaryText: normalized.summaryText,
        calculatedAt: null,
        importedAt: now,
        createdAt: now
      };
      // Revisao destrutiva final, item 47/48 (mesmo bug real corrigido em `submit()`): sem
      // este try/catch, um payload de importacao externa com dimension_code fora do manifesto,
      // duplicado, ou faltando uma dimensao required, violava uma trigger fisica e vazava como
      // 500 generico nao tipado em vez de um 409 seguro -- a integridade dos dados sempre
      // esteve correta (Postgres reverte tudo em qualquer RAISE EXCEPTION), o bug era apenas
      // de contrato HTTP.
      try {
        await tx.behavioralAssessments.createResult(result);
        // Sequencial e aguardado (nunca fire-and-forget) -- garante ordem de display_order e
        // que qualquer falha de constraint (manifesto/required-dimensions) reverta a
        // transacao inteira via o catch deste bloco.
        for (const [index, dimension] of normalized.dimensions.entries()) {
          await tx.behavioralAssessments.addResultDimension({
            id: tx.behavioralAssessments.nextId("bard"),
            organizationId,
            behavioralAssessmentResultId: result.id,
            dimensionCode: dimension.code,
            label: dimension.label ?? null,
            rawValue: dimension.value,
            displayValue:
              typeof dimension.value === "string"
                ? dimension.value
                : JSON.stringify(dimension.value),
            unit: null,
            rangeMin: null,
            rangeMax: null,
            interpretationText: dimension.interpretationText ?? null,
            displayOrder: index
          });
        }
      } catch {
        throw conflict(
          "behavioral_assessment_external_result_invalid",
          "External result payload is invalid for this version's manifest."
        );
      }

      await service.audit(actor, organizationId, "behavioral_assessment.external_result_imported", {
        assessmentId: assessment.id,
        candidateApplicationId,
        instrumentId: instrument.id
      });
      return service.serializeOwnerAdmin(completedAssessment);
    });
  }

  // ==========================================================================================
  // Cancelamento
  // ==========================================================================================

  async cancel(
    actor: Actor,
    organizationId: string,
    assessmentId: string,
    input: BehavioralAssessmentReasonInput
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      let assessment = await service.findAssessmentInOrganizationForUpdate(
        actor,
        organizationId,
        assessmentId
      );
      assessment = await service.materializeExpirationIfNeeded(tx, assessment);
      if (["completed", "cancelled", "expired"].includes(assessment.status)) {
        throw conflict("behavioral_assessment_final", "Final assessment cannot be cancelled.");
      }
      const reason = validateReason(input);
      const now = tx.behavioralAssessments.now();
      const updated: BehavioralAssessment = {
        ...assessment,
        status: "cancelled",
        cancelledAt: now,
        cancelledByUserId: requireUserActorId(actor),
        cancellationReason: reason,
        updatedAt: now
      };
      await tx.behavioralAssessments.updateAssessment(updated);
      await tx.behavioralAssessments.revokeActiveTokens(organizationId, updated.id);
      await service.addEvent(updated, "cancelled", assessment.status, "cancelled", reason, {});
      await service.audit(actor, organizationId, "behavioral_assessment.cancelled", {
        assessmentId
      });
      return service.serializeOwnerAdmin(updated);
    });
  }

  // ==========================================================================================
  // Fluxo publico do Candidate (internal_application apenas).
  // ==========================================================================================

  async getPublic(rawToken: string, meta: BehavioralAssessmentPublicMeta) {
    this.ensurePublicRateLimitAllowed(meta, hashAccessToken(String(rawToken ?? "")));
    await this.materializeExpirationForToken(rawToken);
    return this.runTransaction(async (tx) => {
      let assessment = await this.resolveTokenForUpdate(tx, rawToken);
      assessment = await this.materializeExpirationIfNeeded(tx, assessment);
      return this.serializePublic(tx, assessment);
    });
  }

  async start(rawToken: string, meta: BehavioralAssessmentPublicMeta) {
    this.ensurePublicRateLimitAllowed(meta, hashAccessToken(String(rawToken ?? "")));
    await this.materializeExpirationForToken(rawToken);
    return this.runTransaction(async (tx) => {
      let assessment = await this.resolveTokenForUpdate(tx, rawToken);
      assessment = await this.materializeExpirationIfNeeded(tx, assessment);
      if (assessment.status === "in_progress") {
        return this.serializePublic(tx, assessment);
      }
      if (assessment.status !== "available") {
        throw conflict(
          "behavioral_assessment_not_available",
          "Assessment cannot be started in this state."
        );
      }
      await this.ensureOperationalByAssessment(tx, assessment);
      const now = tx.behavioralAssessments.now();
      const updated: BehavioralAssessment = {
        ...assessment,
        status: "in_progress",
        startedAt: now,
        updatedAt: now
      };
      await tx.behavioralAssessments.updateAssessment(updated);
      await this.addEventOnTx(tx, updated, "started", "available", "in_progress", null, {});
      await this.auditSystem(tx.core, updated.organizationId, "behavioral_assessment.started", {
        assessmentId: updated.id
      });
      return this.serializePublic(tx, updated);
    });
  }

  async saveResponse(
    rawToken: string,
    itemPublicId: string,
    input: BehavioralAssessmentResponseInput,
    meta: BehavioralAssessmentPublicMeta
  ) {
    this.ensurePublicRateLimitAllowed(meta, hashAccessToken(String(rawToken ?? "")));
    await this.materializeExpirationForToken(rawToken);
    return this.runTransaction(async (tx) => {
      let assessment = await this.resolveTokenForUpdate(tx, rawToken);
      assessment = await this.materializeExpirationIfNeeded(tx, assessment);
      if (assessment.status !== "in_progress") {
        throw conflict(
          "behavioral_assessment_not_in_progress",
          "Assessment must be in progress to save a response."
        );
      }
      await this.ensureOperationalByAssessment(tx, assessment);
      const items = await tx.behavioralAssessments.listItemsByVersion(
        assessment.behavioralInstrumentVersionId
      );
      const item = items.find((candidate) => candidate.id === validateId(itemPublicId, "item_id"));
      if (!item) {
        throw notFound("behavioral_assessment_item_not_found", "Item not found.");
      }
      const normalized = validateResponseInput(input, item);
      const now = tx.behavioralAssessments.now();
      const saved = await tx.behavioralAssessments.upsertResponse({
        id: tx.behavioralAssessments.nextId("bar"),
        organizationId: assessment.organizationId,
        behavioralAssessmentId: assessment.id,
        behavioralInstrumentVersionId: assessment.behavioralInstrumentVersionId,
        behavioralInstrumentItemId: item.id,
        responseValue: normalized.responseValue,
        submitted: false,
        createdAt: now,
        updatedAt: now,
        submittedAt: null
      });
      await this.addEventOnTx(
        tx,
        assessment,
        "response_saved",
        assessment.status,
        assessment.status,
        null,
        {
          itemId: item.id
        }
      );
      await this.auditSystem(
        tx.core,
        assessment.organizationId,
        "behavioral_assessment.response_saved",
        {
          assessmentId: assessment.id,
          itemId: item.id
        }
      );
      return { itemId: item.id, submitted: saved.submitted };
    });
  }

  async submit(rawToken: string, meta: BehavioralAssessmentPublicMeta) {
    this.ensurePublicRateLimitAllowed(meta, hashAccessToken(String(rawToken ?? "")));
    await this.materializeExpirationForToken(rawToken);
    return this.runTransaction(async (tx) => {
      let assessment = await this.resolveTokenForUpdate(tx, rawToken);
      assessment = await this.materializeExpirationIfNeeded(tx, assessment);
      if (assessment.status === "completed") {
        return this.serializePublic(tx, assessment);
      }
      if (assessment.status !== "in_progress") {
        throw conflict(
          "behavioral_assessment_not_in_progress",
          "Assessment must be in progress to submit."
        );
      }
      await this.ensureOperationalByAssessment(tx, assessment);

      const version = await tx.behavioralAssessments.findVersionById(
        assessment.behavioralInstrumentVersionId
      );
      if (!version) {
        throw conflict(
          "behavioral_assessment_instrument_not_active",
          "Instrument version is unavailable."
        );
      }
      const items = await tx.behavioralAssessments.listItemsByVersion(version.id);
      const responses = await tx.behavioralAssessments.listResponses(assessment.id);
      const answered = new Set(responses.map((response) => response.behavioralInstrumentItemId));
      if (items.some((item) => item.required && !answered.has(item.id))) {
        throw conflict(
          "behavioral_assessment_required_response_missing",
          "Required responses are missing."
        );
      }

      const calculator = findCalculator(version.methodologyKey, version.calculationMethodVersion);
      if (!calculator) {
        // Nunca deveria acontecer -- activate() ja exige calculador registrado -- mas
        // permanece defensivo (por exemplo, um deploy que remova um calculador de producao).
        throw conflict(
          "behavioral_assessment_calculator_unavailable",
          "No calculator available for this version."
        );
      }
      const itemsById = new Map(items.map((item) => [item.id, item] as const));
      // Revisao destrutiva final, item 47/48: BUG REAL encontrado e corrigido aqui -- o
      // try/catch original cobria apenas `calculate`/`assertValidCalculatorOutput` (validacao
      // em JS). Uma saida que passasse nessa validacao mas violasse uma trigger fisica do
      // banco (dimension_code fora do manifesto, duplicado, etc. -- todas defesas legitimas)
      // escapava do catch, virava um 500 generico nao tipado em vez do mesmo 409
      // `behavioral_assessment_calculation_failed` seguro. A integridade dos dados JA estava
      // correta (o Postgres sempre reverte a transacao inteira em qualquer RAISE EXCEPTION,
      // nunca deixando resultado/dimensao parcial) -- o bug era apenas de contrato HTTP. Agora
      // TODA a persistencia do resultado calculado (nao so o calculo em si) esta dentro do
      // mesmo try/catch, garantindo sempre a mesma resposta tipada para qualquer falha nesta
      // etapa, seja ela JS ou fisica.
      let now: string;
      try {
        const raw = calculator.calculate(responses, itemsById, version);
        assertValidCalculatorOutput(raw);

        now = tx.behavioralAssessments.now();
        await tx.behavioralAssessments.markResponsesSubmitted(assessment.id, now);

        const resultId = tx.behavioralAssessments.nextId("bares");
        await tx.behavioralAssessments.createResult({
          id: resultId,
          organizationId: assessment.organizationId,
          behavioralAssessmentId: assessment.id,
          behavioralInstrumentVersionId: version.id,
          calculationMethodVersion: version.calculationMethodVersion,
          origin: "calculated",
          summaryText: raw.summaryText ?? null,
          calculatedAt: now,
          importedAt: null,
          createdAt: now
        });
        for (const [index, dimension] of raw.dimensions.entries()) {
          await tx.behavioralAssessments.addResultDimension({
            id: tx.behavioralAssessments.nextId("bard"),
            organizationId: assessment.organizationId,
            behavioralAssessmentResultId: resultId,
            dimensionCode: dimension.code,
            label: dimension.label ?? null,
            rawValue: dimension.value,
            displayValue:
              typeof dimension.value === "string"
                ? dimension.value
                : JSON.stringify(dimension.value),
            unit: null,
            rangeMin: null,
            rangeMax: null,
            interpretationText: dimension.interpretationText ?? null,
            displayOrder: index
          });
        }
      } catch {
        // Correcao Final do Plano Tecnico, item 29: falha de calculo (ou de persistencia do
        // resultado calculado) nunca deixa resultado parcial nem marca completed -- lanca
        // aqui, e o `runTransaction` faz ROLLBACK da transacao inteira (respostas em rascunho
        // permanecem preservadas, aplicacao volta a ficar visivel como `in_progress`).
        throw conflict("behavioral_assessment_calculation_failed", "Calculation failed.");
      }

      const updated: BehavioralAssessment = {
        ...assessment,
        status: "completed",
        completedAt: now,
        updatedAt: now
      };
      await tx.behavioralAssessments.updateAssessment(updated);
      await this.addEventOnTx(tx, updated, "submitted", "in_progress", "completed", null, {});
      await this.addEventOnTx(
        tx,
        updated,
        "calculation_completed",
        "completed",
        "completed",
        null,
        {}
      );
      await this.auditSystem(tx.core, updated.organizationId, "behavioral_assessment.submitted", {
        assessmentId: updated.id
      });
      return this.serializePublic(tx, updated);
    });
  }

  // ==========================================================================================
  // Consultas internas
  // ==========================================================================================

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
    const rows = await this.behavioralAssessments.listByApplication(
      organizationId,
      candidateApplicationId
    );
    const now = this.behavioralAssessments.now();
    const effectiveRows = rows.map((row) => ({ ...row, status: computeEffectiveStatus(row, now) }));
    return context.role === "member"
      ? effectiveRows.map(serializeMember)
      : Promise.all(effectiveRows.map((row) => this.serializeOwnerAdmin(row)));
  }

  async getById(actor: Actor, organizationId: string, assessmentId: string) {
    const context = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const assessment = await this.findAssessmentInOrganization(actor, organizationId, assessmentId);
    const now = this.behavioralAssessments.now();
    const effective = { ...assessment, status: computeEffectiveStatus(assessment, now) };
    if (context.role === "member") {
      const application = await this.findApplicationInOrganization(
        actor,
        organizationId,
        assessment.candidateApplicationId
      );
      if (application.applicationStatus !== "active") {
        throw notFound("behavioral_assessment_not_found", "Behavioral assessment not found.");
      }
      return serializeMember(effective);
    }
    return this.serializeOwnerAdmin(effective);
  }

  async timeline(actor: Actor, organizationId: string, assessmentId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const assessment = await this.findAssessmentInOrganization(actor, organizationId, assessmentId);
    return this.behavioralAssessments.listEvents(assessment.id);
  }

  async adminRead(actor: Actor, organizationId: string, input: BehavioralAssessmentAdminReadInput) {
    const reason = validateAdminReason(input);
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
    const organization = await this.core.findOrganizationById(organizationId);
    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }
    const rows = await this.behavioralAssessments.listByOrganization(organizationId);
    await this.audit(actor, organizationId, "behavioral_assessment.administrative_read", {
      reason,
      assessmentCount: String(rows.length)
    });
    const now = this.behavioralAssessments.now();
    return rows.map((row) =>
      serializeAdminRead({ ...row, status: computeEffectiveStatus(row, now) })
    );
  }

  // ==========================================================================================
  // Helpers privados
  // ==========================================================================================

  private scoped(tx: BehavioralAssessmentTransaction) {
    return new BehavioralAssessmentService(
      tx.core,
      tx.behavioralAssessments,
      this.runTransaction,
      this.rateLimiter,
      this.testingHooks
    );
  }

  private ensurePublicRateLimitAllowed(meta: BehavioralAssessmentPublicMeta, tokenHash: string) {
    if (!this.rateLimiter.checkAndRecord("publicByIp", meta.ip || "unknown")) {
      throw tooManyRequests("behavioral_assessment_rate_limited", "Too many requests.");
    }
    if (!this.rateLimiter.checkAndRecord("publicByTokenHash", tokenHash)) {
      throw tooManyRequests("behavioral_assessment_rate_limited", "Too many requests.");
    }
  }

  private authorizePlatformAdmin(actor: Actor) {
    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }
  }

  private async authorizeInstrumentAdministration(
    actor: Actor,
    organizationId: string | null,
    instrument: BehavioralInstrument
  ) {
    if (instrument.scope === "platform") {
      this.authorizePlatformAdmin(actor);
      return;
    }
    if (!organizationId || instrument.organizationId !== organizationId) {
      throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
    }
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
  }

  private async authorizeInstrumentRead(
    actor: Actor,
    organizationId: string | null,
    instrument: BehavioralInstrument
  ) {
    if (instrument.scope === "platform") {
      if (actor.kind === "platform") {
        return;
      }
      if (organizationId) {
        await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
        return;
      }
      throw forbidden("permission_denied", "Permission denied.");
    }
    if (!organizationId || instrument.organizationId !== organizationId) {
      throw notFound("behavioral_instrument_not_found", "Behavioral instrument not found.");
    }
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    deniedAction = "behavioral_assessment.permission_denied"
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
        "behavioral_assessment.cross_organization_access_denied",
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

  private async ensureJobOpeningInOrganization(
    actor: Actor,
    organizationId: string,
    jobOpeningId: string
  ) {
    const ownerOrganizationId =
      await this.behavioralAssessments.findJobOpeningOrganizationId(jobOpeningId);
    if (!ownerOrganizationId || ownerOrganizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "behavioral_assessment.cross_organization_access_denied",
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
    const application = await this.behavioralAssessments.findApplication(candidateApplicationId);
    if (!application || application.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "behavioral_assessment.cross_organization_access_denied",
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
    tx: BehavioralAssessmentTransaction
  ) {
    const application =
      await tx.candidateApplications.findApplicationForUpdate(candidateApplicationId);
    if (!application || application.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "behavioral_assessment.cross_organization_access_denied",
        "candidate_application_organization_mismatch",
        { candidateApplicationId }
      );
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    return application;
  }

  private async findAssessmentInOrganization(
    actor: Actor,
    organizationId: string,
    assessmentId: string
  ) {
    const assessment = await this.behavioralAssessments.findAssessmentById(assessmentId);
    if (!assessment || assessment.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "behavioral_assessment.cross_organization_access_denied",
        "assessment_organization_mismatch",
        { assessmentId }
      );
      throw notFound("behavioral_assessment_not_found", "Behavioral assessment not found.");
    }
    return assessment;
  }

  private async findAssessmentInOrganizationForUpdate(
    actor: Actor,
    organizationId: string,
    assessmentId: string
  ) {
    const assessment = await this.behavioralAssessments.findAssessmentForUpdate(assessmentId);
    if (!assessment || assessment.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "behavioral_assessment.cross_organization_access_denied",
        "assessment_organization_mismatch",
        { assessmentId }
      );
      throw notFound("behavioral_assessment_not_found", "Behavioral assessment not found.");
    }
    return assessment;
  }

  // Candidate inativo / Consentimento invalido -- espelha exatamente
  // PreInterviewService.ensureApplicationUsable (Fase 18). CandidateApplication finalizada
  // tambem bloqueia toda operacao funcional (SPEC-022, secao 20), incluindo importacao
  // externa.
  private async ensureApplicationUsable(
    actor: Actor,
    tx: BehavioralAssessmentTransaction,
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
          "behavioral_assessment.application_final_denied",
          "application_final",
          { candidateApplicationId: application.id }
        );
      }
      throw conflict("candidate_application_final", "Final application cannot be used.");
    }
    const candidate = await tx.behavioralAssessments.findCandidate(application.candidateId);
    if (!candidate || candidate.organizationId !== application.organizationId) {
      throw notFound("candidate_not_found", "Candidate not found.");
    }
    if (candidate.status !== "active") {
      if (auditBlocked) {
        await this.auditDenied(
          actor,
          application.organizationId,
          "behavioral_assessment.operational_use_denied",
          "candidate_inactive",
          { candidateId: candidate.id }
        );
      }
      throw conflict("candidate_inactive", "Inactive candidate cannot be used operationally.");
    }
  }

  // Consentimento especifico desta finalidade -- NUNCA generico. Correcao Final do Plano
  // Tecnico, itens 16-17/19-20.
  private async resolveGrantedConsent(tx: BehavioralAssessmentTransaction, candidateId: string) {
    const consent = await tx.behavioralAssessments.latestConsentByPurpose(
      candidateId,
      BEHAVIORAL_ASSESSMENT_CONSENT_PURPOSE
    );
    if (!consent || consent.status !== "granted") {
      throw conflict(
        "behavioral_assessment_consent_invalid",
        "Consent for this purpose is required."
      );
    }
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= Date.now()) {
      throw conflict(
        "behavioral_assessment_consent_expired",
        "Consent for this purpose has expired."
      );
    }
    return consent;
  }

  // Mesma checagem, para o fluxo publico -- revalida a cada operacao.
  //
  // Revisao destrutiva final, item 55: BUG REAL encontrado e corrigido aqui --
  // `ensureOperationalByAssessment` nunca checava o status da Organization, entao
  // start/saveResponse/submit continuavam funcionando normalmente para uma Organization ja
  // arquivada. SPEC-022, secao 31, e explicita e vinculante: "nenhuma aplicacao existente
  // pode ser iniciada, respondida, enviada, cancelada, reaberta ou receber importacao externa"
  // quando a Organization esta `archived`. Cancelamento/reabertura/importacao ja passavam por
  // `authorizeUser` (que ja checa isso para o ator interno); apenas o fluxo PUBLICO, sem User
  // autenticado, ficava sem esta defesa.
  private async ensureOperationalByAssessment(
    tx: BehavioralAssessmentTransaction,
    assessment: BehavioralAssessment
  ) {
    const organization = await tx.core.findOrganizationById(assessment.organizationId);
    if (!organization || organization.status !== "active") {
      throw conflict(
        "organization_archived",
        "Archived organization cannot be used operationally."
      );
    }
    const application = await tx.behavioralAssessments.findApplication(
      assessment.candidateApplicationId
    );
    if (!application || application.organizationId !== assessment.organizationId) {
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    if (application.applicationStatus !== "active") {
      throw conflict("candidate_application_final", "Final application cannot be used.");
    }
    const candidate = await tx.behavioralAssessments.findCandidate(application.candidateId);
    if (!candidate || candidate.status !== "active") {
      throw conflict("candidate_inactive", "Inactive candidate cannot be used operationally.");
    }
    const consent = await tx.behavioralAssessments.latestConsentByPurpose(
      candidate.id,
      BEHAVIORAL_ASSESSMENT_CONSENT_PURPOSE
    );
    if (!consent || consent.status !== "granted") {
      throw conflict(
        "behavioral_assessment_consent_invalid",
        "Consent for this purpose is required."
      );
    }
    if (consent.expiresAt && new Date(consent.expiresAt).getTime() <= Date.now()) {
      throw conflict(
        "behavioral_assessment_consent_expired",
        "Consent for this purpose has expired."
      );
    }
  }

  // Expiracao lazy determinista, materializada em transacao PROPRIA e decoupled da transacao
  // da operacao principal -- correcao real encontrada e ja validada pela revisao destrutiva da
  // Fase 18: sem isso, uma operacao que lanca conflito LOGO DEPOIS de materializar (por
  // exemplo, `submit` quando o novo status `expired` nao satisfaz `in_progress`) reverteria a
  // propria materializacao junto, porque `runTransaction` faz ROLLBACK de tudo.
  private async materializeExpirationForToken(rawToken: string): Promise<void> {
    await this.runTransaction(async (tx) => {
      const tokenHash = hashAccessToken(String(rawToken ?? ""));
      const token = await tx.behavioralAssessments.findAccessTokenByHash(tokenHash);
      if (!token || token.status !== "active") {
        return;
      }
      const assessment = await tx.behavioralAssessments.findAssessmentForUpdate(
        token.behavioralAssessmentId
      );
      if (!assessment || assessment.organizationId !== token.organizationId) {
        return;
      }
      await this.materializeExpirationIfNeeded(tx, assessment);
    });
  }

  private async materializeExpirationIfNeeded(
    tx: BehavioralAssessmentTransaction,
    assessment: BehavioralAssessment
  ): Promise<BehavioralAssessment> {
    if (!["available", "in_progress"].includes(assessment.status) || !assessment.expiresAt) {
      return assessment;
    }
    const operationNow = tx.behavioralAssessments.now();
    if (new Date(assessment.expiresAt).getTime() > new Date(operationNow).getTime()) {
      return assessment;
    }
    const updated: BehavioralAssessment = {
      ...assessment,
      status: "expired",
      expiredAt: operationNow,
      updatedAt: operationNow
    };
    await tx.behavioralAssessments.updateAssessment(updated);
    await tx.behavioralAssessments.revokeActiveTokens(assessment.organizationId, assessment.id);
    await this.addEventOnTx(tx, updated, "expired", assessment.status, "expired", null, {});
    await this.auditSystem(tx.core, updated.organizationId, "behavioral_assessment.expired", {
      assessmentId: updated.id
    });
    return updated;
  }

  private async resolveTokenForUpdate(
    tx: BehavioralAssessmentTransaction,
    rawToken: string
  ): Promise<BehavioralAssessment> {
    const tokenHash = hashAccessToken(String(rawToken ?? ""));
    const token = await tx.behavioralAssessments.findAccessTokenByHash(tokenHash);
    if (!token || token.status !== "active" || new Date(token.expiresAt).getTime() <= Date.now()) {
      throw notFound("behavioral_assessment_access_denied", "Behavioral assessment not found.");
    }
    const assessment = await tx.behavioralAssessments.findAssessmentForUpdate(
      token.behavioralAssessmentId
    );
    if (!assessment || assessment.organizationId !== token.organizationId) {
      throw notFound("behavioral_assessment_access_denied", "Behavioral assessment not found.");
    }
    return assessment;
  }

  private async addEvent(
    assessment: BehavioralAssessment,
    eventType: BehavioralAssessmentEvent["eventType"],
    statusBefore: BehavioralAssessmentStatus | null,
    statusAfter: BehavioralAssessmentStatus | null,
    reason: string | null,
    metadata: Record<string, string>
  ) {
    await this.behavioralAssessments.addEvent({
      id: this.behavioralAssessments.nextId("baev"),
      organizationId: assessment.organizationId,
      behavioralAssessmentId: assessment.id,
      eventType,
      statusBefore,
      statusAfter,
      reason,
      metadata,
      createdAt: this.behavioralAssessments.now()
    });
  }

  private async addEventOnTx(
    tx: BehavioralAssessmentTransaction,
    assessment: BehavioralAssessment,
    eventType: BehavioralAssessmentEvent["eventType"],
    statusBefore: BehavioralAssessmentStatus | null,
    statusAfter: BehavioralAssessmentStatus | null,
    reason: string | null,
    metadata: Record<string, string>
  ) {
    await tx.behavioralAssessments.addEvent({
      id: tx.behavioralAssessments.nextId("baev"),
      organizationId: assessment.organizationId,
      behavioralAssessmentId: assessment.id,
      eventType,
      statusBefore,
      statusAfter,
      reason,
      metadata,
      createdAt: tx.behavioralAssessments.now()
    });
  }

  // Revisao destrutiva final: `rawResponseOwnerVisibility` era persistido mas nunca lido --
  // owner/admin recebiam sempre as respostas brutas do Candidate, mesmo quando a versao usada
  // declara `restricted` (SPEC-022, secao 25/nota 1: nesse caso owner/admin continuam
  // recebendo o resultado estruturado, nunca as respostas brutas subjacentes). Corrigido aqui
  // -- nunca na migration 0020 (ja aplicada e congelada): e uma leitura de politica ja
  // persistida, nao requer nenhuma alteracao fisica de schema.
  private async serializeOwnerAdmin(assessment: BehavioralAssessment) {
    const resultAggregate = await this.behavioralAssessments.findResultByAssessment(assessment.id);
    const version = await this.behavioralAssessments.findVersionById(
      assessment.behavioralInstrumentVersionId
    );
    // external_import nunca possui respostas brutas nesta plataforma (SPEC-022, secao 4.9) --
    // a restricao e irrelevante para ela, mas a checagem abaixo e segura de qualquer forma
    // porque `listResponses` simplesmente retornaria vazio.
    const restricted = version?.rawResponseOwnerVisibility === "restricted";
    const responses = restricted
      ? []
      : await this.behavioralAssessments.listResponses(assessment.id);
    return {
      ...assessment,
      responses,
      rawResponsesRestricted: restricted,
      result: resultAggregate
    };
  }

  private async serializePublic(
    tx: BehavioralAssessmentTransaction,
    assessment: BehavioralAssessment
  ) {
    const version = await tx.behavioralAssessments.findVersionById(
      assessment.behavioralInstrumentVersionId
    );
    const items = await tx.behavioralAssessments.listItemsByVersion(
      assessment.behavioralInstrumentVersionId
    );
    const responses = await tx.behavioralAssessments.listResponses(assessment.id);
    const byItem = new Map(
      responses.map((response) => [response.behavioralInstrumentItemId, response])
    );
    const requiredTotal = items.filter((item) => item.required).length;
    const requiredAnswered = items.filter((item) => item.required && byItem.has(item.id)).length;

    let result: { summaryText?: string | null; dimensions?: unknown[] } | null = null;
    if (assessment.status === "completed" && version) {
      const aggregate = await tx.behavioralAssessments.findResultByAssessment(assessment.id);
      if (aggregate) {
        if (version.candidateResultVisibility === "summary") {
          result = { summaryText: aggregate.result.summaryText };
        } else if (version.candidateResultVisibility === "full") {
          result = {
            summaryText: aggregate.result.summaryText,
            dimensions: aggregate.dimensions.map((dimension) => ({
              code: dimension.dimensionCode,
              label: dimension.label,
              displayValue: dimension.displayValue,
              interpretationText: dimension.interpretationText
            }))
          };
        }
      }
    }

    return {
      status: assessment.status,
      expiresAt: assessment.expiresAt,
      items: items
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((item) => ({
          id: item.id,
          type: item.itemType,
          promptText: item.promptText,
          options: item.options,
          required: item.required,
          displayOrder: item.displayOrder
        })),
      responses: responses.map((response) => ({
        itemId: response.behavioralInstrumentItemId,
        value: response.responseValue,
        submitted: response.submitted
      })),
      progress: {
        answered: responses.length,
        total: items.length,
        requiredAnswered,
        requiredTotal
      },
      result
    };
  }

  private async audit(
    actor: Actor,
    organizationId: string | null,
    action: string,
    metadata: Record<string, string> = {}
  ) {
    await this.testingHooks.beforeCriticalAudit?.(action);
    await auditBehavioralAssessment(this.core, actor, organizationId, action, metadata);
  }

  private async auditDenied(
    actor: Actor,
    organizationId: string | null,
    action: string,
    reason: string,
    metadata: Record<string, string> = {}
  ) {
    await auditBehavioralAssessmentDenied(
      this.core,
      actor,
      organizationId,
      action,
      reason,
      metadata
    );
  }

  private async auditSystem(
    core: CoreRepository,
    organizationId: string | null,
    action: string,
    metadata: Record<string, string> = {}
  ) {
    await this.testingHooks.beforeCriticalAudit?.(action);
    await auditBehavioralAssessmentSystem(core, organizationId, action, metadata);
  }
}

// Revisao destrutiva final, item 46: leitura administrativa/member NUNCA apresenta
// `available`/`in_progress` quando `expires_at` ja passou, mesmo sem a materializacao fisica
// (lazy, disparada apenas por chamadas do fluxo publico) ter ocorrido ainda -- mesma correcao
// ja aplicada em `pre-interviews/service.ts::computeEffectiveStatus` (Fase 18).
function computeEffectiveStatus(
  assessment: BehavioralAssessment,
  now: string
): BehavioralAssessmentStatus {
  if (
    ["available", "in_progress"].includes(assessment.status) &&
    assessment.expiresAt &&
    new Date(assessment.expiresAt).getTime() <= new Date(now).getTime()
  ) {
    return "expired";
  }
  return assessment.status;
}

function serializeMember(assessment: BehavioralAssessment) {
  // DTO positivo do member (SPEC-022, secao 25.2): apenas existencia e status -- ainda mais
  // restrito que a Fase 18 (nunca expoe attemptNumber), por se tratar de informacao
  // comportamental potencialmente sensivel.
  return { id: assessment.id, status: assessment.status };
}

function serializeAdminRead(assessment: BehavioralAssessment) {
  return {
    id: assessment.id,
    organizationId: assessment.organizationId,
    candidateApplicationId: assessment.candidateApplicationId,
    status: assessment.status,
    attemptNumber: assessment.attemptNumber,
    behavioralInstrumentId: assessment.behavioralInstrumentId,
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt
  };
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }
  return actor.userId;
}

// `testingHooks` (mesmo padrao ja usado por `createPostgresPreInterviewService`, Fase 18):
// permite provocar falha deliberada dentro da transacao de criacao/auditoria critica para
// provar rollback real. Em producao (`src/server/index.ts`) nunca e passado.
export function createPostgresBehavioralAssessmentService(
  pool: pg.Pool,
  testingHooks: BehavioralAssessmentTestingHooks = {}
) {
  const core = new PostgresCoreRepository(pool);
  const behavioralAssessments = new PostgresBehavioralAssessmentRepository(pool);
  const runTransaction = createBehavioralAssessmentTransactionRunner(pool);
  return new BehavioralAssessmentService(
    core,
    behavioralAssessments,
    runTransaction,
    new RateLimiter(DEFAULT_RATE_LIMITS),
    testingHooks
  );
}
