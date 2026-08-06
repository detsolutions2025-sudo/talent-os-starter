import type pg from "pg";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import type { CompetencyRepository } from "../competencies/repository";
import { PostgresCompetencyRepository } from "../persistence/postgres-competency-repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresQuestionRepository } from "../persistence/postgres-question-repository";
import type { QuestionRepository } from "./repository";
import type {
  AdoptQuestionInput,
  GlobalQuestion,
  GlobalQuestionStatus,
  OrganizationAdoptedQuestion,
  OrganizationQuestion,
  QuestionAdminReadInput,
  QuestionCatalogItem,
  QuestionContentInput,
  QuestionDetails
} from "./types";
import {
  requireAdminReason,
  validateCreateQuestion,
  validateGlobalStatus,
  validateOrganizationStatus,
  validateQuestionPatch
} from "./validation";

type QuestionTransaction = {
  core: CoreRepository;
  questions: QuestionRepository;
  competencies: CompetencyRepository;
};

type QuestionTransactionRunner = <T>(
  callback: (transaction: QuestionTransaction) => Promise<T>
) => Promise<T>;

export class QuestionService {
  constructor(
    private readonly core: CoreRepository,
    private readonly questions: QuestionRepository,
    private readonly competencies: CompetencyRepository,
    private readonly runTransaction: QuestionTransactionRunner
  ) {}

  async createGlobal(actor: Actor, input: QuestionContentInput) {
    return this.runTransaction(async ({ core, questions, competencies }) => {
      const service = this.scoped(core, questions, competencies);
      await service.authorizePlatform(actor, "question.global_edit_denied");
      const status = input.status === undefined ? "inactive" : validateGlobalStatus(input.status);
      const { competencyCatalogItemId, ...content } = validateCreateQuestion(
        { ...input, status },
        false
      );
      void competencyCatalogItemId;
      await service.ensureGlobalCodeAvailable(content.normalizedCode, null);
      const now = questions.now();
      const global: GlobalQuestion = {
        ...content,
        id: questions.nextId("gqst"),
        status,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
        createdAt: now,
        updatedAt: now
      };

      try {
        await questions.createGlobalQuestion(global);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("global_question_code_duplicate", "Global question code exists.");
        }
        throw error;
      }
      await service.audit(actor, null, "global_question.created", { globalQuestionId: global.id });
      return global;
    });
  }

  async listGlobals(actor: Actor) {
    if (actor.kind === "platform") {
      return this.questions.listGlobalQuestions();
    }

    await this.auditDenied(actor, null, "question.permission_denied", "permission_denied");
    throw forbidden("permission_denied", "Permission denied.");
  }

  async getGlobal(actor: Actor, globalQuestionId: string) {
    await this.authorizePlatform(actor);
    return this.findGlobal(globalQuestionId);
  }

  async updateGlobal(actor: Actor, globalQuestionId: string, input: QuestionContentInput) {
    return this.runTransaction(async ({ core, questions, competencies }) => {
      const service = this.scoped(core, questions, competencies);
      await service.authorizePlatform(actor, "question.global_edit_denied");
      const global = await service.findGlobal(globalQuestionId);
      const patchWithCompetency = validateQuestionPatch(
        input,
        { ...global, competencyCatalogItemId: null },
        false
      );
      const { competencyCatalogItemId, ...patch } = patchWithCompetency;
      void competencyCatalogItemId;

      if (patch.normalizedCode && patch.normalizedCode !== global.normalizedCode) {
        await service.ensureGlobalCodeAvailable(patch.normalizedCode, global.id);
      }

      const updated: GlobalQuestion = {
        ...global,
        ...definedPatch(patch),
        updatedByUserId: actor.userId,
        updatedAt: questions.now()
      };

      await questions.updateGlobalQuestion(updated);
      await service.audit(actor, null, "global_question.updated", {
        globalQuestionId,
        fields: changedFields(global, updated).join(",")
      });

      if (global.code !== updated.code) {
        await service.audit(actor, null, "global_question.code_changed", { globalQuestionId });
      }

      return updated;
    });
  }

  async setGlobalStatus(actor: Actor, globalQuestionId: string, status: GlobalQuestionStatus) {
    return this.runTransaction(async ({ core, questions, competencies }) => {
      const service = this.scoped(core, questions, competencies);
      await service.authorizePlatform(actor, "question.global_edit_denied");
      await questions.lockGlobalQuestion(globalQuestionId);
      const global = await service.findGlobal(globalQuestionId);
      const updated = {
        ...global,
        status,
        updatedByUserId: actor.userId,
        updatedAt: questions.now()
      };

      await questions.updateGlobalQuestion(updated);

      if (status === "active" || status === "inactive") {
        await service.syncCatalogItemsForGlobal(actor, globalQuestionId, status);
      }

      await service.audit(actor, null, globalStatusAction(status), { globalQuestionId });
      return updated;
    });
  }

  async createOrganizationQuestion(
    actor: Actor,
    organizationId: string,
    input: QuestionContentInput
  ) {
    return this.runTransaction(async ({ core, questions, competencies }) => {
      const service = this.scoped(core, questions, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      await questions.lockOrganizationQuestions(organizationId);
      const status =
        input.status === undefined ? "active" : validateOrganizationStatus(input.status);
      const content = validateCreateQuestion({ ...input, status }, true);
      await service.ensureCompetencyAllowed(actor, organizationId, content.competencyCatalogItemId);
      await service.ensureOrganizationCodeAvailable(organizationId, content.normalizedCode, null);

      const now = questions.now();
      const userId = requireUserActorId(actor);
      const question: OrganizationQuestion = {
        ...content,
        id: questions.nextId("oqst"),
        organizationId,
        status,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now
      };

      try {
        await questions.createOrganizationQuestion(question);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict(
            "organization_question_code_duplicate",
            "Organization question code exists."
          );
        }
        throw error;
      }
      await service.audit(actor, organizationId, "organization_question.created", {
        organizationQuestionId: question.id,
        competencyCatalogItemId: question.competencyCatalogItemId
      });

      if (question.status === "active") {
        await service.ensureOrganizationCatalogItem(actor, organizationId, question.id, "active");
      }

      return question;
    });
  }

  async listOrganizationQuestions(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.questions.listOrganizationQuestions(organizationId);
  }

  async updateOrganizationQuestion(
    actor: Actor,
    organizationId: string,
    questionId: string,
    input: QuestionContentInput
  ) {
    return this.runTransaction(async ({ core, questions, competencies }) => {
      const service = this.scoped(core, questions, competencies);
      const context = await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      service.ensureNoOrganizationChange(organizationId, input.organizationId);
      const question = await service.findOrganizationQuestionInOrganization(
        actor,
        organizationId,
        questionId
      );
      const patch = validateQuestionPatch(input, question, true);
      await service.ensureCompetencyAllowed(actor, organizationId, patch.competencyCatalogItemId);

      if (patch.normalizedCode && patch.normalizedCode !== question.normalizedCode) {
        if (context.role !== "owner") {
          await service.auditDenied(
            actor,
            organizationId,
            "organization_question.code_change_denied",
            "permission_denied",
            { organizationQuestionId: questionId }
          );
          throw forbidden("permission_denied", "Permission denied.");
        }
        await service.ensureOrganizationCodeAvailable(
          organizationId,
          patch.normalizedCode,
          question.id
        );
      }

      const updated: OrganizationQuestion = {
        ...question,
        ...definedPatch(patch),
        updatedByUserId: requireUserActorId(actor),
        updatedAt: questions.now()
      };

      await questions.updateOrganizationQuestion(updated);
      await service.audit(actor, organizationId, "organization_question.updated", {
        organizationQuestionId: questionId,
        fields: changedFields(question, updated).join(",")
      });

      if (question.code !== updated.code) {
        await service.audit(actor, organizationId, "organization_question.code_changed", {
          organizationQuestionId: questionId
        });
      }

      return updated;
    });
  }

  async setOrganizationQuestionStatus(
    actor: Actor,
    organizationId: string,
    questionId: string,
    status: OrganizationQuestion["status"]
  ) {
    return this.runTransaction(async ({ core, questions, competencies }) => {
      const service = this.scoped(core, questions, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await questions.lockOrganizationQuestions(organizationId);
      const question = await service.findOrganizationQuestionInOrganization(
        actor,
        organizationId,
        questionId
      );
      const updated = {
        ...question,
        status,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: questions.now()
      };

      await questions.updateOrganizationQuestion(updated);
      await service.ensureOrganizationCatalogItem(actor, organizationId, question.id, status);
      await service.audit(
        actor,
        organizationId,
        status === "active"
          ? "organization_question.activated"
          : "organization_question.inactivated",
        { organizationQuestionId: questionId }
      );
      return updated;
    });
  }

  async listUnifiedCatalog(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    return this.questions.listUnifiedCatalog(organizationId);
  }

  async getCatalogItem(actor: Actor, organizationId: string, itemId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const item = await this.questions.findCatalogItemById(itemId);

    if (!item || item.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "question_catalog_item.cross_organization_access_denied",
        "catalog_item_organization_mismatch",
        { questionCatalogItemId: itemId }
      );
      throw notFound("question_catalog_item_not_found", "Question catalog item not found.");
    }

    if (item.status !== "active") {
      throw notFound("question_catalog_item_not_found", "Question catalog item not found.");
    }

    return this.toCatalogDetails(item);
  }

  async listAvailableGlobals(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return this.questions.listAvailableGlobalsForOrganization(organizationId);
  }

  async adoptGlobal(actor: Actor, organizationId: string, input: AdoptQuestionInput) {
    return this.runTransaction(async ({ core, questions, competencies }) => {
      const service = this.scoped(core, questions, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await questions.lockOrganizationQuestions(organizationId);
      await questions.lockGlobalQuestion(String(input.globalQuestionId ?? ""));
      const global = await service.findGlobal(String(input.globalQuestionId ?? ""));

      if (global.status !== "active") {
        throw conflict("global_question_not_adoptable", "Global question cannot be adopted.");
      }

      if (await questions.findAdoptionByOrganizationAndGlobal(organizationId, global.id)) {
        throw conflict("adopted_question_duplicate", "Global question already adopted.");
      }

      const now = questions.now();
      const userId = requireUserActorId(actor);
      const adoption: OrganizationAdoptedQuestion = {
        id: questions.nextId("adqst"),
        organizationId,
        globalQuestionId: global.id,
        status: "active",
        adoptedByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now
      };

      try {
        await questions.createAdoption(adoption);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("adopted_question_duplicate", "Global question already adopted.");
        }
        throw error;
      }
      const item = await service.ensureGlobalCatalogItem(
        actor,
        organizationId,
        global.id,
        "active"
      );
      await service.audit(actor, organizationId, "adopted_question.created", {
        adoptionId: adoption.id,
        globalQuestionId: global.id,
        questionCatalogItemId: item.id
      });

      return { adoption, catalogItem: item };
    });
  }

  async setAdoptionStatus(
    actor: Actor,
    organizationId: string,
    adoptionId: string,
    status: OrganizationAdoptedQuestion["status"]
  ) {
    return this.runTransaction(async ({ core, questions, competencies }) => {
      const service = this.scoped(core, questions, competencies);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      await questions.lockOrganizationQuestions(organizationId);
      const adoption = await service.findAdoptionInOrganization(actor, organizationId, adoptionId);
      const global = await service.findGlobal(adoption.globalQuestionId);

      if (status === "active" && global.status !== "active") {
        throw conflict(
          "adopted_question_cannot_reactivate",
          "Adoption cannot be reactivated for this global question status."
        );
      }

      const updated = {
        ...adoption,
        status,
        updatedByUserId: requireUserActorId(actor),
        updatedAt: questions.now()
      };

      await questions.updateAdoption(updated);
      const item = await service.ensureGlobalCatalogItem(actor, organizationId, global.id, status);
      await service.audit(
        actor,
        organizationId,
        status === "active" ? "adopted_question.activated" : "adopted_question.inactivated",
        { adoptionId, questionCatalogItemId: item.id }
      );

      return updated;
    });
  }

  async listHistory(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return (await this.core.listAuditEvents()).filter(
      (event) => event.organizationId === organizationId && event.action.includes("question")
    );
  }

  async globalHistory(actor: Actor) {
    await this.authorizePlatform(actor);
    return (await this.core.listAuditEvents()).filter((event) =>
      event.action.startsWith("global_question.")
    );
  }

  async adminRead(actor: Actor, organizationId: string, input: QuestionAdminReadInput) {
    const reason = requireAdminReason(input.reason);

    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }

    const organization = await this.core.findOrganizationById(organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    const [own, adoptions, catalog] = await Promise.all([
      this.questions.listOrganizationQuestions(organizationId),
      this.questions.listAdoptions(organizationId),
      this.questions.listUnifiedCatalog(organizationId)
    ]);

    await this.audit(actor, organizationId, "question.administrative_read", {
      reason,
      organizationQuestionCount: String(own.length),
      adoptionCount: String(adoptions.length),
      catalogItemCount: String(catalog.length)
    });

    return { organizationQuestions: own, adoptions, catalog };
  }

  private scoped(
    core: CoreRepository,
    questions: QuestionRepository,
    competencies: CompetencyRepository
  ) {
    return new QuestionService(core, questions, competencies, this.runTransaction);
  }

  private async authorizePlatform(actor: Actor, deniedAction = "question.permission_denied") {
    if (actor.kind !== "platform") {
      await this.auditDenied(actor, null, deniedAction, "permission_denied");
      throw forbidden("permission_denied", "Permission denied.");
    }
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[]
  ) {
    if (actor.kind === "platform") {
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
      await this.auditDenied(
        actor,
        organizationId,
        "question.archived_organization_denied",
        "organization_archived"
      );
      throw forbidden("organization_archived", "Archived organization cannot be used as context.");
    }

    const membership = await this.core.findMembershipByOrganizationAndUser(
      organization.id,
      user.id
    );

    if (!membership || membership.status !== "active") {
      await this.auditDenied(
        actor,
        organizationId,
        "question.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }

    if (!allowedRoles.includes(membership.role)) {
      await this.auditDenied(
        actor,
        organizationId,
        "question.permission_denied",
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }

    return { actor, organization, role: membership.role };
  }

  private async ensureGlobalCodeAvailable(normalizedCode: string, currentId: string | null) {
    const existing = await this.questions.findGlobalQuestionByNormalizedCode(normalizedCode);

    if (existing && existing.id !== currentId) {
      throw conflict("global_question_code_duplicate", "Global question code exists.");
    }
  }

  private async ensureOrganizationCodeAvailable(
    organizationId: string,
    normalizedCode: string,
    currentId: string | null
  ) {
    const existing = await this.questions.findOrganizationQuestionByNormalizedCode(
      organizationId,
      normalizedCode
    );

    if (existing && existing.id !== currentId) {
      throw conflict("organization_question_code_duplicate", "Organization question code exists.");
    }
  }

  private async ensureCompetencyAllowed(
    actor: Actor,
    organizationId: string,
    competencyCatalogItemId: string | null | undefined
  ) {
    if (!competencyCatalogItemId) {
      return;
    }

    const item = await this.competencies.findCatalogItemById(competencyCatalogItemId);

    if (!item || item.organizationId !== organizationId || item.status !== "active") {
      await this.auditDenied(
        actor,
        organizationId,
        "question.invalid_competency_denied",
        "invalid_competency",
        { competencyCatalogItemId }
      );
      throw badRequest("question_competency_invalid", "Competency catalog item is invalid.");
    }
  }

  private async findGlobal(globalQuestionId: string) {
    const global = await this.questions.findGlobalQuestionById(globalQuestionId);

    if (!global) {
      throw notFound("global_question_not_found", "Global question not found.");
    }

    return global;
  }

  private async findOrganizationQuestionInOrganization(
    actor: Actor,
    organizationId: string,
    questionId: string
  ) {
    const question = await this.questions.findOrganizationQuestionById(questionId);

    if (!question || question.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "organization_question.cross_organization_access_denied",
        "question_organization_mismatch",
        { organizationQuestionId: questionId }
      );
      throw notFound("organization_question_not_found", "Organization question not found.");
    }

    return question;
  }

  private async findAdoptionInOrganization(
    actor: Actor,
    organizationId: string,
    adoptionId: string
  ) {
    const adoption = await this.questions.findAdoptionById(adoptionId);

    if (!adoption || adoption.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        "adopted_question.cross_organization_access_denied",
        "adoption_organization_mismatch",
        { adoptionId }
      );
      throw notFound("adopted_question_not_found", "Adopted question not found.");
    }

    return adoption;
  }

  private async ensureOrganizationCatalogItem(
    actor: Actor,
    organizationId: string,
    organizationQuestionId: string,
    status: QuestionCatalogItem["status"]
  ) {
    const existing = await this.questions.findCatalogItemForOrganizationQuestion(
      organizationId,
      organizationQuestionId
    );
    const now = this.questions.now();

    if (existing) {
      const updated = { ...existing, status, updatedAt: now };
      await this.questions.updateCatalogItem(updated);
      await this.audit(actor, organizationId, catalogItemAction(status), {
        questionCatalogItemId: updated.id,
        organizationQuestionId
      });
      return updated;
    }

    const item: QuestionCatalogItem = {
      id: this.questions.nextId("qcat"),
      organizationId,
      origin: "organization",
      globalQuestionId: null,
      organizationQuestionId,
      status,
      createdAt: now,
      updatedAt: now
    };
    await this.questions.createCatalogItem(item);
    await this.audit(actor, organizationId, "question_catalog_item.created", {
      questionCatalogItemId: item.id,
      organizationQuestionId
    });
    return item;
  }

  private async ensureGlobalCatalogItem(
    actor: Actor,
    organizationId: string,
    globalQuestionId: string,
    status: QuestionCatalogItem["status"]
  ) {
    const existing = await this.questions.findCatalogItemForGlobal(
      organizationId,
      globalQuestionId
    );
    const now = this.questions.now();

    if (existing) {
      const updated = { ...existing, status, updatedAt: now };
      await this.questions.updateCatalogItem(updated);
      await this.audit(actor, organizationId, catalogItemAction(status), {
        questionCatalogItemId: updated.id,
        globalQuestionId
      });
      return updated;
    }

    const item: QuestionCatalogItem = {
      id: this.questions.nextId("qcat"),
      organizationId,
      origin: "global",
      globalQuestionId,
      organizationQuestionId: null,
      status,
      createdAt: now,
      updatedAt: now
    };
    await this.questions.createCatalogItem(item);
    await this.audit(actor, organizationId, "question_catalog_item.created", {
      questionCatalogItemId: item.id,
      globalQuestionId
    });
    return item;
  }

  private async syncCatalogItemsForGlobal(
    actor: Actor,
    globalQuestionId: string,
    globalStatus: Extract<GlobalQuestionStatus, "active" | "inactive">
  ) {
    const allOrganizations = await this.core.listOrganizations();

    for (const organization of allOrganizations) {
      const item = await this.questions.findCatalogItemForGlobal(organization.id, globalQuestionId);

      if (!item) {
        continue;
      }

      const adoption = await this.questions.findAdoptionByOrganizationAndGlobal(
        organization.id,
        globalQuestionId
      );
      const nextStatus =
        globalStatus === "active" && adoption?.status === "active" ? "active" : "inactive";

      if (item.status !== nextStatus) {
        await this.questions.updateCatalogItem({
          ...item,
          status: nextStatus,
          updatedAt: this.questions.now()
        });
        await this.audit(actor, organization.id, catalogItemAction(nextStatus), {
          questionCatalogItemId: item.id,
          globalQuestionId
        });
      }
    }
  }

  private ensureNoOrganizationChange(
    organizationId: string,
    inputOrganizationId: string | undefined
  ) {
    if (inputOrganizationId !== undefined && inputOrganizationId !== organizationId) {
      throw badRequest(
        "organization_question_organization_immutable",
        "Question cannot change Organization."
      );
    }
  }

  private async toCatalogDetails(item: QuestionCatalogItem): Promise<QuestionDetails> {
    const catalog = (await this.questions.listUnifiedCatalog(item.organizationId)).find(
      (candidate) => candidate.questionCatalogItemId === item.id
    );

    if (!catalog) {
      throw notFound("question_catalog_item_not_found", "Question catalog item not found.");
    }

    if (item.origin === "global" && item.globalQuestionId) {
      return {
        ...catalog,
        globalQuestion: await this.findGlobal(item.globalQuestionId),
        organizationQuestion: null
      };
    }

    const organizationQuestion = await this.questions.findOrganizationQuestionById(
      String(item.organizationQuestionId)
    );

    if (!organizationQuestion) {
      throw notFound("question_catalog_item_not_found", "Question catalog item not found.");
    }

    return { ...catalog, globalQuestion: null, organizationQuestion };
  }

  private async audit(
    actor: Actor,
    organizationId: string | null,
    action: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.core.addAuditEvent({
      id: this.core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "allowed",
      reason: null,
      metadata,
      createdAt: this.core.now()
    });
  }

  private async auditDenied(
    actor: Actor,
    organizationId: string | null,
    action: string,
    reason: string,
    metadata: AuditEvent["metadata"] = {}
  ) {
    await this.core.addAuditEvent({
      id: this.core.nextId("aud"),
      organizationId,
      actorUserId: actor.userId,
      action,
      result: "denied",
      reason,
      metadata,
      createdAt: this.core.now()
    });
  }
}

export function createPostgresQuestionService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const questions = new PostgresQuestionRepository(pool);
  const competencies = new PostgresCompetencyRepository(pool);
  const runTransaction: QuestionTransactionRunner = async (callback) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new PostgresCoreRepository(client, true),
        questions: new PostgresQuestionRepository(client),
        competencies: new PostgresCompetencyRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  return new QuestionService(core, questions, competencies, runTransaction);
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }

  return actor.userId;
}

function globalStatusAction(status: GlobalQuestionStatus) {
  if (status === "active") {
    return "global_question.activated";
  }

  if (status === "deprecated") {
    return "global_question.deprecated";
  }

  return "global_question.inactivated";
}

function catalogItemAction(status: QuestionCatalogItem["status"]) {
  return status === "active"
    ? "question_catalog_item.activated"
    : "question_catalog_item.inactivated";
}

function changedFields(before: GlobalQuestion | OrganizationQuestion, after: typeof before) {
  return [
    "code",
    "title",
    "questionText",
    "description",
    "type",
    "category",
    "instructions",
    "options",
    "settings",
    "competencyCatalogItemId"
  ].filter(
    (field) =>
      JSON.stringify(before[field as keyof typeof before]) !==
      JSON.stringify(after[field as keyof typeof after])
  );
}

function definedPatch<T extends Record<string, unknown>>(patch: T) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
