import type pg from "pg";
import type { AIRepository } from "../ai/repository";
import { PostgresAIRepository } from "../persistence/postgres-ai-repository";
import type { CompetencyRepository } from "../competencies/repository";
import { PostgresCompetencyRepository } from "../persistence/postgres-competency-repository";
import { conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import type { Actor, AuditEvent, MembershipRole } from "../core/types";
import type { DnaRepository } from "../dna/repository";
import { PostgresDnaRepository } from "../persistence/postgres-dna-repository";
import type { JobProfileRepository } from "../job-profiles/repository";
import { PostgresJobProfileRepository } from "../persistence/postgres-job-profile-repository";
import type { OrganizationalUnitRepository } from "../organizational-units/repository";
import { PostgresOrganizationalUnitRepository } from "../persistence/postgres-organizational-unit-repository";
import type { QuestionRepository } from "../questions/repository";
import { PostgresQuestionRepository } from "../persistence/postgres-question-repository";
import { BlueprintAuditAction } from "./audit";
import { buildManifestItems } from "./manifest";
import { calculateReadiness } from "./readiness";
import type { BlueprintRepository } from "./repository";
import { PostgresBlueprintRepository } from "../persistence/postgres-blueprint-repository";
import type { BlueprintActivationTransactionRunner } from "./activation-transaction";
import type { BlueprintTransaction, BlueprintTransactionRunner } from "./transaction";
import type {
  BlueprintAdminReadInput,
  BlueprintProgress,
  BlueprintStatusView,
  BlueprintVersion,
  BlueprintVersionWithManifest,
  ResolvedComponents
} from "./types";
import { rejectControlledFields, requireAdminReason } from "./validation";

export class BlueprintService {
  constructor(
    private readonly core: CoreRepository,
    private readonly blueprints: BlueprintRepository,
    private readonly dna: DnaRepository,
    private readonly organizationalUnits: OrganizationalUnitRepository,
    private readonly competencies: CompetencyRepository,
    private readonly jobProfiles: JobProfileRepository,
    private readonly questions: QuestionRepository,
    private readonly ai: AIRepository,
    private readonly runTransaction: BlueprintTransactionRunner,
    private readonly runActivationTransaction: BlueprintActivationTransactionRunner
  ) {}

  // SPEC-018 secao 6.10 / 14: cria o primeiro Blueprint Version `draft` de uma Organization,
  // dentro da mesma transacao fisica da criacao da propria Organization. Usado exclusivamente
  // pelo hook de onboarding (blueprints/organization-onboarding.ts) -- nunca exposto por rota
  // HTTP, e nunca criado de forma lazy (RN-002/RN-003).
  static async createInitialDraft(
    blueprints: BlueprintRepository,
    organizationId: string
  ): Promise<void> {
    const now = blueprints.now();
    const draft: BlueprintVersion = {
      id: blueprints.nextId("bpv"),
      organizationId,
      versionNumber: 1,
      status: "draft",
      createdByUserId: null,
      createdSource: "user",
      activatedByUserId: null,
      createdAt: now,
      updatedAt: now,
      activatedAt: null,
      archivedAt: null,
      activationReadinessSnapshot: null
    };

    await blueprints.createVersion(draft);
  }

  async getStatus(actor: Actor, organizationId: string): Promise<BlueprintStatusView> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const [draft, active] = await Promise.all([
      this.blueprints.findActiveDraft(organizationId),
      this.blueprints.findActive(organizationId)
    ]);

    const resolved = await this.resolveComponents(organizationId);
    const readiness = calculateReadiness(resolved);

    return {
      draft: draft ? await this.withManifest(draft) : null,
      active: active ? await this.withManifest(active) : null,
      progress: progressFromReadiness(readiness)
    };
  }

  async getReadiness(actor: Actor, organizationId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const draft = await this.requireActiveDraft(organizationId);
    const resolved = await this.resolveComponents(organizationId);
    const readiness = calculateReadiness(resolved);
    await this.audit(actor, organizationId, BlueprintAuditAction.readinessEvaluated, {
      blueprintVersionId: draft.id,
      status: readiness.status
    });
    return readiness;
  }

  async getDraft(actor: Actor, organizationId: string): Promise<BlueprintVersionWithManifest> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const draft = await this.requireActiveDraft(organizationId);
    return this.withManifest(draft);
  }

  async getActive(actor: Actor, organizationId: string): Promise<BlueprintVersionWithManifest> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const active = await this.blueprints.findActive(organizationId);

    if (!active) {
      throw notFound("blueprint_active_not_found", "No active blueprint version found.");
    }

    return this.withManifest(active);
  }

  async getHistory(actor: Actor, organizationId: string): Promise<BlueprintVersion[]> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const versions = await this.blueprints.listVersions(organizationId);
    return versions.filter((version) => version.status === "archived");
  }

  async getVersion(
    actor: Actor,
    organizationId: string,
    versionId: string
  ): Promise<BlueprintVersionWithManifest> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const version = await this.findVersionInOrganization(actor, organizationId, versionId);
    return this.withManifest(version);
  }

  // SPEC-018 secao 6.10 / 14; RN-042/043/045/046: somente Owner cria draft.
  async createDraft(
    actor: Actor,
    organizationId: string,
    input: unknown
  ): Promise<BlueprintVersionWithManifest> {
    rejectControlledFields(input);

    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(
        actor,
        organizationId,
        ["owner"],
        BlueprintAuditAction.permissionDenied
      );
      await tx.blueprints.lockBlueprintVersions(organizationId);

      const existingDraft = await tx.blueprints.findActiveDraft(organizationId);

      if (existingDraft) {
        throw conflict("blueprint_draft_already_exists", "A blueprint draft already exists.");
      }

      const now = tx.blueprints.now();
      const nextVersionNumber = (await tx.blueprints.maxVersionNumber(organizationId)) + 1;
      const draft: BlueprintVersion = {
        id: tx.blueprints.nextId("bpv"),
        organizationId,
        versionNumber: nextVersionNumber,
        status: "draft",
        createdByUserId: requireUserActorId(actor),
        createdSource: "user",
        activatedByUserId: null,
        createdAt: now,
        updatedAt: now,
        activatedAt: null,
        archivedAt: null,
        activationReadinessSnapshot: null
      };

      await tx.blueprints.createVersion(draft);
      await service.audit(actor, organizationId, BlueprintAuditAction.draftCreated, {
        blueprintVersionId: draft.id,
        versionNumber: String(nextVersionNumber)
      });

      return { ...draft, manifest: [] };
    });
  }

  // SPEC-018 secao 6.10/13/14; Plano Tecnico Revisado, item 7: unica operacao que abre a
  // transacao de ativacao (REPEATABLE READ).
  //
  // Autorizacao acontece DUAS vezes, com propositos distintos, nunca uma substituindo a
  // outra:
  //   1. preflight, fora da transacao (this.authorizeUser, repositorios ligados ao `pool`) --
  //      existe apenas para que uma negacao "comum" fique auditada de forma persistente, nunca
  //      desfeita por um ROLLBACK posterior. Este preflight NUNCA e tratado como autorizacao
  //      final -- e apenas um early-exit de conveniencia/auditoria.
  //   2. revalidacao obrigatoria dentro da propria transacao de ativacao (`service.
  //      authorizeUser`, repositorios ligados ao `tx`/client transacional), que e a UNICA
  //      autorizacao que realmente guarda a operacao critica. Isso fecha a janela TOCTOU entre
  //      o preflight e o restante do fluxo (por exemplo, o Owner ser rebaixado ou a Membership
  //      ser desativada entre as duas leituras) -- sem essa revalidacao, o preflight sozinho
  //      seria uma checagem que nao protege o estado efetivamente gravado.
  async activateBlueprint(
    actor: Actor,
    organizationId: string
  ): Promise<BlueprintVersionWithManifest> {
    await this.authorizeUser(
      actor,
      organizationId,
      ["owner"],
      BlueprintAuditAction.activationDenied
    );
    await this.audit(actor, organizationId, BlueprintAuditAction.activationRequested, {});

    try {
      return await this.runActivationTransaction(async (tx) => {
        const service = this.scoped(tx);
        // Revalidacao obrigatoria: User ativo, Membership ativa, Organization ativa e role
        // Owner, lidos dentro da propria transacao -- nunca confia no preflight acima como
        // autorizacao final.
        await service.authorizeUser(
          actor,
          organizationId,
          ["owner"],
          BlueprintAuditAction.activationDenied
        );
        await tx.blueprints.lockBlueprintVersions(organizationId);

        const draft = await tx.blueprints.findActiveDraft(organizationId);

        if (!draft) {
          await service.auditDenied(
            actor,
            organizationId,
            BlueprintAuditAction.activationDenied,
            "blueprint_draft_not_found"
          );
          throw notFound("blueprint_draft_not_found", "Blueprint draft not found.");
        }

        const resolved = await service.resolveComponents(organizationId);
        const readiness = calculateReadiness(resolved);

        if (readiness.status !== "ready") {
          await service.auditDenied(
            actor,
            organizationId,
            BlueprintAuditAction.activationDenied,
            "blueprint_not_ready",
            { blueprintVersionId: draft.id }
          );
          throw conflict("blueprint_not_ready", "Blueprint draft is not ready for activation.");
        }

        const now = tx.blueprints.now();
        const manifestItems = buildManifestItems(draft.id, tx.blueprints.nextId, now, resolved);

        const previousActive = await tx.blueprints.findActive(organizationId);

        if (previousActive) {
          await tx.blueprints.updateVersion({
            ...previousActive,
            status: "archived",
            archivedAt: now,
            updatedAt: now
          });
          await service.audit(actor, organizationId, BlueprintAuditAction.previousVersionArchived, {
            blueprintVersionId: previousActive.id,
            versionNumber: String(previousActive.versionNumber)
          });
        }

        // Itens do manifesto sao gravados enquanto o draft ainda esta em status `draft` --
        // as triggers de imutabilidade so bloqueiam mutacao de itens depois que o pai vira
        // active/archived (migration 0016). A propria versao so vira `active` no passo
        // seguinte.
        await tx.blueprints.replaceManifestItems(draft.id, manifestItems);

        const activated: BlueprintVersion = {
          ...draft,
          status: "active",
          activatedAt: now,
          activatedByUserId: requireUserActorId(actor),
          updatedAt: now,
          activationReadinessSnapshot: readiness
        };

        await tx.blueprints.updateVersion(activated);
        await service.audit(actor, organizationId, BlueprintAuditAction.activated, {
          blueprintVersionId: draft.id,
          versionNumber: String(draft.versionNumber)
        });

        return { ...activated, manifest: manifestItems };
      });
    } catch (error) {
      if (isSerializationFailure(error)) {
        throw conflict(
          "blueprint_activation_conflict",
          "Another activation for this Organization completed concurrently; please retry."
        );
      }

      throw error;
    }
  }

  async adminRead(actor: Actor, organizationId: string, input: BlueprintAdminReadInput) {
    const reason = requireAdminReason(input.reason);

    if (actor.kind !== "platform") {
      throw forbidden("permission_denied", "Permission denied.");
    }

    const organization = await this.core.findOrganizationById(organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    const [draft, active, history] = await Promise.all([
      this.blueprints.findActiveDraft(organizationId),
      this.blueprints.findActive(organizationId),
      this.blueprints.listVersions(organizationId)
    ]);

    await this.audit(actor, organizationId, BlueprintAuditAction.administrativeRead, {
      reason,
      versionCount: String(history.length)
    });

    return {
      draft: draft
        ? { id: draft.id, versionNumber: draft.versionNumber, status: draft.status }
        : null,
      active: active
        ? { id: active.id, versionNumber: active.versionNumber, status: active.status }
        : null,
      versionCount: history.length
    };
  }

  // SPEC-018 secao 8/10; ADR-0021 secao "Composicao": resolve, uma unica vez, o estado atual
  // de todos os componentes do Blueprint. Reutilizado tanto por readiness quanto pelo Manifest
  // (nunca reconsultado entre os dois). Cada leitura ja e filtrada por `organizationId` no
  // servidor -- nenhum ID vem do cliente.
  private async resolveComponents(organizationId: string): Promise<ResolvedComponents> {
    const organization = await this.core.findOrganizationById(organizationId);

    if (!organization) {
      throw notFound("organization_not_found", "Organization not found.");
    }

    // Sequencial, nao `Promise.all`: dentro da transacao de ativacao, todos estes
    // repositorios compartilham o MESMO `pg.PoolClient` (uma unica conexao fisica) -- disparar
    // queries concorrentes nele e um padrao deprecado do driver `pg` (uma unica conexao nao
    // faz pipeline de queries concorrentes). Fora de transacao (leitura simples), cada
    // repositorio esta ligado ao `pool` inteiro e series sequenciais aqui continuam corretas,
    // apenas sem o ganho teorico de paralelismo.
    const ownerCount = await this.core.countActiveOwners(organizationId);
    const dnaPublished = await this.dna.findPublished(organizationId);
    const structureUnits = await this.organizationalUnits.listActiveUnits(organizationId);
    const activeJobProfiles = await this.jobProfiles.listJobProfilesByStatus(
      organizationId,
      "active"
    );
    const competencyCatalog = await this.competencies.listUnifiedCatalog(organizationId);
    const questionCatalog = await this.questions.listUnifiedCatalog(organizationId);
    const aiFeatureSettings = await this.ai.listOrganizationFeatureSettings(organizationId);
    const aiProviderConfigs = await this.ai.listProviderConfigs(organizationId);

    const publishedJobProfiles = [];

    for (const profile of activeJobProfiles) {
      const published = await this.jobProfiles.findPublished(profile.id);

      if (published) {
        publishedJobProfiles.push({
          jobProfileId: profile.id,
          jobProfileVersionId: published.id,
          code: profile.code,
          name: profile.name
        });
      }
    }

    return {
      organization,
      ownerActive: ownerCount > 0,
      dna: dnaPublished
        ? {
            organizationDnaVersionId: dnaPublished.id,
            versionNumber: dnaPublished.versionNumber,
            status: dnaPublished.status
          }
        : null,
      structure: structureUnits.map((unit) => ({
        id: unit.id,
        parentId: unit.parentId,
        code: unit.code,
        name: unit.name,
        type: unit.type,
        status: unit.status
      })),
      jobProfiles: publishedJobProfiles,
      competencies: competencyCatalog
        .filter((item) => item.status === "active")
        .map((item) => ({
          competencyCatalogItemId: item.competencyCatalogItemId,
          code: item.code,
          name: item.name,
          category: item.category,
          origin: item.origin
        })),
      questions: questionCatalog
        .filter((item) => item.status === "active")
        .map((item) => ({
          questionCatalogItemId: item.questionCatalogItemId,
          code: item.code,
          title: item.title,
          type: item.type,
          category: item.category,
          questionText: item.questionText
        })),
      aiFeatureSettings: aiFeatureSettings
        .filter((setting) => setting.organizationFeatureEnabled)
        .map((setting) => ({
          featureKey: setting.featureKey,
          organizationFeatureEnabled: setting.organizationFeatureEnabled
        })),
      aiProviderSettings: aiProviderConfigs
        .filter((config) => config.isActive)
        .map((config) => ({
          provider: config.provider,
          credentialMode: config.credentialMode,
          status: config.status
        }))
    };
  }

  private async withManifest(version: BlueprintVersion): Promise<BlueprintVersionWithManifest> {
    const manifest = await this.blueprints.listManifestItems(version.id);
    return { ...version, manifest };
  }

  private async requireActiveDraft(organizationId: string) {
    const draft = await this.blueprints.findActiveDraft(organizationId);

    if (!draft) {
      throw notFound("blueprint_draft_not_found", "Blueprint draft not found.");
    }

    return draft;
  }

  private async findVersionInOrganization(actor: Actor, organizationId: string, versionId: string) {
    const version = await this.blueprints.findVersionById(versionId);

    if (!version || version.organizationId !== organizationId) {
      await this.auditDenied(
        actor,
        organizationId,
        BlueprintAuditAction.crossOrganizationAccessDenied,
        "blueprint_version_organization_mismatch",
        { versionId }
      );
      throw notFound("blueprint_version_not_found", "Blueprint version not found.");
    }

    return version;
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    deniedAction: string = BlueprintAuditAction.permissionDenied
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
        BlueprintAuditAction.crossOrganizationAccessDenied,
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

  private scoped(tx: BlueprintTransaction) {
    return new BlueprintService(
      tx.core,
      tx.blueprints,
      tx.dna,
      tx.organizationalUnits,
      tx.competencies,
      tx.jobProfiles,
      tx.questions,
      tx.ai,
      this.runTransaction,
      this.runActivationTransaction
    );
  }
}

function progressFromReadiness(
  readiness: ReturnType<typeof calculateReadiness>
): BlueprintProgress {
  const applicableSteps = readiness.checks.filter((check) => check.status !== "blocking").length;
  const completedSteps = readiness.checks.filter((check) => check.status === "satisfied").length;
  return { applicableSteps, completedSteps };
}

function requireUserActorId(actor: Actor) {
  if (actor.kind !== "user") {
    throw forbidden("permission_denied", "Permission denied.");
  }

  return actor.userId;
}

// Exportado para permitir teste unitario direto (revisao final da Fase 15, item 14) sem
// depender apenas de uma corrida concorrente real como prova indireta.
export function isSerializationFailure(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "40001"
  );
}

export function createPostgresBlueprintService(pool: pg.Pool) {
  const core = new PostgresCoreRepository(pool);
  const blueprints = new PostgresBlueprintRepository(pool);
  const dna = new PostgresDnaRepository(pool);
  const organizationalUnits = new PostgresOrganizationalUnitRepository(pool);
  const competencies = new PostgresCompetencyRepository(pool);
  const jobProfiles = new PostgresJobProfileRepository(pool);
  const questions = new PostgresQuestionRepository(pool);
  const ai = new PostgresAIRepository(pool);

  const composeTransaction = (client: pg.PoolClient): BlueprintTransaction => ({
    core: new PostgresCoreRepository(client, true),
    blueprints: new PostgresBlueprintRepository(client),
    dna: new PostgresDnaRepository(client),
    organizationalUnits: new PostgresOrganizationalUnitRepository(client),
    competencies: new PostgresCompetencyRepository(client),
    jobProfiles: new PostgresJobProfileRepository(client),
    questions: new PostgresQuestionRepository(client),
    ai: new PostgresAIRepository(client)
  });

  const runTransaction: BlueprintTransactionRunner = async (callback) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback(composeTransaction(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  // Plano Tecnico Revisado, item 7: REPEATABLE READ apenas para a transacao de ativacao --
  // garante que a mesma visao de componentes usada para calcular readiness e para construir o
  // Manifest permanece consistente, mesmo que o codigo futuramente precise reconsultar algum
  // modulo dentro da mesma transacao. Nenhum outro fluxo do modulo usa essa isolation level.
  const runActivationTransaction: BlueprintActivationTransactionRunner = async (callback) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const result = await callback(composeTransaction(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  return new BlueprintService(
    core,
    blueprints,
    dna,
    organizationalUnits,
    competencies,
    jobProfiles,
    questions,
    ai,
    runTransaction,
    runActivationTransaction
  );
}
