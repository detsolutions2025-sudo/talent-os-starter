import type pg from "pg";
import { fingerprint } from "../core/canonical-hash";
import { conflict, forbidden, notFound } from "../core/errors";
import type { CoreRepository } from "../core/repository";
import type { Actor, MembershipRole } from "../core/types";
import type { AIService } from "../ai/service";
import type { JsonObject } from "../ai/types";
import { PostgresCoreRepository } from "../persistence/postgres-core-repository";
import { PostgresPreAnalysisRepository } from "../persistence/postgres-pre-analysis-repository";
import { auditPreAnalysis, auditPreAnalysisDenied, auditPreAnalysisSystem } from "./audit";
import type { PreAnalysisRepository } from "./repository";
import {
  createPreAnalysisTransactionRunner,
  type PreAnalysisTransaction,
  type PreAnalysisTransactionRunner
} from "./transaction";
import {
  preAnalysisFeatureKey,
  preAnalysisFindingCategories,
  preAnalysisOriginKindBySourceType,
  preAnalysisOutputLimits,
  type PreAnalysis,
  type PreAnalysisAdminReadDTO,
  type PreAnalysisErrorCategory,
  type PreAnalysisEvent,
  type PreAnalysisEventType,
  type PreAnalysisEvidence,
  type PreAnalysisEvidencePayloadItem,
  type PreAnalysisGatewayInput,
  type PreAnalysisGatewayOutput,
  type PreAnalysisMemberDTO,
  type PreAnalysisOwnerDTO,
  type PreAnalysisRequestInput,
  type PreAnalysisSourceType,
  type PreAnalysisStatus
} from "./types";
import {
  validateAdminReadInput,
  validateId,
  validateReasonInput,
  validateRequestInput
} from "./validation";

// Fase 20 (SPEC-023 v1.1). Boundary transacional final (Plano Tecnico Consolidado, item 1):
// TX1 (preparacao) -> TX-running (revalidacao + transicao) -> chamada externa ao AIGateway
// (fora de qualquer transacao) -> TX2 (finalizacao). Nenhuma transacao Postgres permanece
// aberta durante a chamada de rede (SPEC-023 Sec 9.2, CA-075).

const PRE_ANALYSIS_DISCLAIMER =
  "Informacao de apoio gerada por Inteligencia Artificial; nunca constitui decisao, aprovacao, " +
  "reprovacao ou score. O Recrutador permanece integralmente responsavel pela decisao final.";

export const DEFAULT_PRE_ANALYSIS_RECONCILIATION_REQUESTED_THRESHOLD_MS = Number(
  process.env.PRE_ANALYSIS_RECONCILIATION_REQUESTED_THRESHOLD_MS ?? 5 * 60_000
);
export const DEFAULT_PRE_ANALYSIS_RECONCILIATION_RUNNING_THRESHOLD_MS = Number(
  process.env.PRE_ANALYSIS_RECONCILIATION_RUNNING_THRESHOLD_MS ?? 5 * 60_000
);

// Seam de teste, inerte em producao -- mesmo padrao ja usado por PreInterviewTestingHooks
// (Fase 18) e BehavioralAssessmentTestingHooks (Fase 19). Permite provocar falha determinstica
// em cada fronteira transacional, sem depender de matar o processo/test runner (Plano Tecnico
// Consolidado, item 24/49).
export type PreAnalysisTestingHooks = {
  afterRequestedInserted?: () => Promise<void> | void;
  afterRunningTransitionCommitted?: () => Promise<void> | void;
  afterGatewayReturned?: () => Promise<void> | void;
  afterResultPersisted?: () => Promise<void> | void;
  beforeCriticalAudit?: (action: string) => Promise<void> | void;
};

type PreparedRequest =
  | { alreadyExists: true; preAnalysis: PreAnalysis }
  | {
      alreadyExists: false;
      preAnalysis: PreAnalysis;
      gatewayInput: PreAnalysisGatewayInput;
      evidenceIdByRef: Map<string, string>;
    };

export class PreAnalysisService {
  constructor(
    private readonly core: CoreRepository,
    private readonly preAnalyses: PreAnalysisRepository,
    private readonly runTransaction: PreAnalysisTransactionRunner,
    private readonly aiService: AIService,
    private readonly testingHooks: PreAnalysisTestingHooks = {},
    private readonly reconciliationThresholdsMs = {
      requested: DEFAULT_PRE_ANALYSIS_RECONCILIATION_REQUESTED_THRESHOLD_MS,
      running: DEFAULT_PRE_ANALYSIS_RECONCILIATION_RUNNING_THRESHOLD_MS
    }
  ) {}

  // ----------------------------------------------------------------------------------------
  // Solicitacao (SPEC-023 Sec 9) -- sempre ato explicito de owner/admin, nunca automatico.
  // ----------------------------------------------------------------------------------------

  async requestPreAnalysis(
    actor: Actor,
    organizationId: string,
    input: PreAnalysisRequestInput
  ): Promise<PreAnalysisOwnerDTO> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const { candidateApplicationId } = validateRequestInput(input);

    const prepared = await this.reconcileStaleForApplication(organizationId).then(() =>
      this.runTransaction(async (tx) => {
        const service = this.scoped(tx);
        await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
        return service.prepareTx1(tx, actor, organizationId, candidateApplicationId);
      })
    );

    if (prepared.alreadyExists) {
      return toOwnerDTO(prepared.preAnalysis);
    }
    await this.testingHooks.afterRequestedInserted?.();

    const runningOutcome = await this.runTransaction((tx) =>
      this.scoped(tx).transitionToRunning(tx, actor, organizationId, prepared.preAnalysis.id)
    );
    if (!runningOutcome.transitioned) {
      return toOwnerDTO(runningOutcome.preAnalysis);
    }
    await this.testingHooks.afterRunningTransitionCommitted?.();

    // Chamada externa, fora de qualquer transacao Postgres (SPEC-023 Sec 9.2, CA-075). Nao
    // reimplementa routing/retry/fallback/timeout/rate limit/provider/model/prompt/secret --
    // tudo delegado inteiramente ao AIGateway.
    const gatewayOutcome = await this.callGateway(
      actor,
      organizationId,
      runningOutcome.preAnalysis,
      prepared.gatewayInput
    );
    await this.testingHooks.afterGatewayReturned?.();

    const final = await this.runTransaction((tx) =>
      this.scoped(tx).finalizeTx2(
        tx,
        actor,
        organizationId,
        runningOutcome.preAnalysis.id,
        gatewayOutcome,
        prepared.evidenceIdByRef
      )
    );
    await this.testingHooks.afterResultPersisted?.();
    return toOwnerDTO(final);
  }

  // ------------------------------------------------------------------------------------ TX1

  private async prepareTx1(
    tx: PreAnalysisTransaction,
    actor: Actor,
    organizationId: string,
    candidateApplicationId: string
  ): Promise<PreparedRequest> {
    // Lock da CandidateApplication -- autoridade de serializacao de attempt_number, mesmo
    // principio ja exigido pela Fase 19.
    const application =
      await tx.candidateApplications.findApplicationForUpdate(candidateApplicationId);
    if (!application || application.organizationId !== organizationId) {
      await auditPreAnalysisDenied(
        tx.core,
        actor,
        organizationId,
        "pre_analysis.cross_organization_access_denied",
        "candidate_application_organization_mismatch",
        { candidateApplicationId }
      );
      throw notFound("candidate_application_not_found", "Candidate application not found.");
    }
    if (application.applicationStatus !== "active") {
      throw conflict("pre_analysis_application_not_active", "CandidateApplication is not active.");
    }

    const candidate = await tx.preAnalyses.findCandidate(application.candidateId);
    if (
      !candidate ||
      candidate.organizationId !== organizationId ||
      candidate.status !== "active"
    ) {
      throw conflict("pre_analysis_candidate_inactive", "Candidate is not active.");
    }

    const consent = await tx.preAnalyses.latestConsent(application.candidateId);
    if (!isConsentValid(consent, tx.preAnalyses.now())) {
      throw conflict(
        "pre_analysis_consent_invalid",
        "A valid ai_pre_analysis consent is required."
      );
    }

    const existingOperational = await tx.preAnalyses.findOperationalByApplication(
      organizationId,
      candidateApplicationId
    );
    if (existingOperational) {
      // Idempotencia de solicitacao (SPEC-023 Sec 36): duplo clique/retry nunca cria uma
      // segunda PreAnalysis nao finalizada -- devolve a mesma execucao ja em curso.
      return { alreadyExists: true, preAnalysis: existingOperational };
    }

    const maxAttempt = await tx.preAnalyses.findMaxAttemptNumber(
      organizationId,
      candidateApplicationId
    );
    const history =
      maxAttempt > 0
        ? await tx.preAnalyses.listByApplication(organizationId, candidateApplicationId)
        : [];
    const previousAttempt = history[0] ?? null;

    const blueprintVersion = await tx.preAnalyses.findActiveBlueprintVersion(organizationId);
    const preInterview = await tx.preAnalyses.findCompletedPreInterview(candidateApplicationId);
    const behavioralAssessment =
      await tx.preAnalyses.findCompletedBehavioralAssessment(candidateApplicationId);

    const now = tx.preAnalyses.now();
    const preAnalysis: PreAnalysis = {
      id: tx.preAnalyses.nextId("pa"),
      organizationId,
      candidateApplicationId,
      candidateId: application.candidateId,
      jobOpeningId: application.jobOpeningId,
      jobOpeningVersionId: application.jobOpeningVersionId,
      blueprintVersionId: blueprintVersion?.id ?? null,
      preInterviewId: preInterview?.id ?? null,
      behavioralAssessmentId: behavioralAssessment?.id ?? null,
      consentId: consent!.id,
      attemptNumber: maxAttempt + 1,
      previousAttemptId: previousAttempt?.id ?? null,
      status: "requested",
      requestedByUserId: actorUserId(actor),
      requestedAt: now,
      runningAt: null,
      aiExecutionId: null,
      completedAt: null,
      failedAt: null,
      unavailableAt: null,
      cancelledAt: null,
      cancelledByUserId: null,
      cancellationReason: null,
      errorCategory: null,
      createdAt: now,
      updatedAt: now
    };
    await tx.preAnalyses.addPreAnalysis(preAnalysis);

    const { evidences, gatewayInput, evidenceIdByRef } = await this.freezeEvidences(
      tx,
      preAnalysis,
      candidate,
      behavioralAssessment
    );
    for (const evidence of evidences) {
      await tx.preAnalyses.addEvidence(evidence);
    }

    await tx.preAnalyses.addEvent(
      makeEvent(tx, preAnalysis.id, organizationId, "requested", null, "requested")
    );
    if (maxAttempt > 0) {
      await tx.preAnalyses.addEvent(
        makeEvent(tx, preAnalysis.id, organizationId, "reanalysis_requested", null, "requested")
      );
    }
    await this.testingHooks.beforeCriticalAudit?.("pre_analysis.requested");
    await auditPreAnalysis(tx.core, actor, organizationId, "pre_analysis.requested", {
      candidateApplicationId,
      preAnalysisId: preAnalysis.id,
      attemptNumber: String(preAnalysis.attemptNumber),
      consentId: consent!.id
    });

    return { alreadyExists: false, preAnalysis, gatewayInput, evidenceIdByRef };
  }

  // Congela evidencias (SPEC-023 Sec 10/11) -- resolvidas uma unica vez, dentro de TX1, nunca
  // reconsultadas depois (Sec 9.2/Sec 35, CA-074). Payload minimizado, allow-list fechada, nunca
  // full_name/preferred_name/email/telefone (Sec 10.1.1/19).
  private async freezeEvidences(
    tx: PreAnalysisTransaction,
    preAnalysis: PreAnalysis,
    candidate: Awaited<ReturnType<PreAnalysisRepository["findCandidate"]>>,
    behavioralAssessment: Awaited<
      ReturnType<PreAnalysisRepository["findCompletedBehavioralAssessment"]>
    >
  ) {
    const evidences: PreAnalysisEvidence[] = [];
    const payloadItems: PreAnalysisEvidencePayloadItem[] = [];
    const evidenceIdByRef = new Map<string, string>();
    let refCounter = 0;
    const nextRef = () => `ev${++refCounter}`;

    const now = tx.preAnalyses.now();
    const base = {
      organizationId: preAnalysis.organizationId,
      preAnalysisId: preAnalysis.id,
      candidateApplicationId: preAnalysis.candidateApplicationId,
      createdAt: now
    };

    type PushEvidenceInput = {
      sourceType: PreAnalysisSourceType;
      snapshotValue?: string | null;
      candidateFieldName?: PreAnalysisEvidence["candidateFieldName"];
      jobOpeningId?: string | null;
      jobOpeningVersionId?: string | null;
      preInterviewId?: string | null;
      preInterviewResponseId?: string | null;
      behavioralAssessmentId?: string | null;
      behavioralAssessmentResultId?: string | null;
      blueprintVersionId?: string | null;
    };

    // `content_hash` e sempre derivado do CONTEUDO efetivamente enviado (`text`), nunca do
    // `id` da entidade de origem (correcao da revisao destrutiva: hashear apenas o id nao prova
    // integridade nenhuma -- "este id hasheia para este valor" e trivialmente verdadeiro sempre;
    // o proposito do campo, SPEC-023 Sec 4.5, e permitir provar depois que o conteudo enviado
    // era exatamente este, o que so um hash do proprio conteudo pode fazer).
    const pushEvidence = (partial: PushEvidenceInput, text: string) => {
      const id = tx.preAnalyses.nextId("pae");
      const evidence: PreAnalysisEvidence = {
        ...base,
        id,
        contentHash: fingerprint({ text }),
        snapshotValue: partial.snapshotValue ?? null,
        candidateFieldName: partial.candidateFieldName ?? null,
        jobOpeningId: partial.jobOpeningId ?? null,
        jobOpeningVersionId: partial.jobOpeningVersionId ?? null,
        preInterviewId: partial.preInterviewId ?? null,
        preInterviewResponseId: partial.preInterviewResponseId ?? null,
        behavioralAssessmentId: partial.behavioralAssessmentId ?? null,
        behavioralAssessmentResultId: partial.behavioralAssessmentResultId ?? null,
        blueprintVersionId: partial.blueprintVersionId ?? null,
        sourceType: partial.sourceType,
        originKind: preAnalysisOriginKindBySourceType[partial.sourceType]
      };
      evidences.push(evidence);
      const ref = nextRef();
      evidenceIdByRef.set(ref, id);
      payloadItems.push({
        ref,
        sourceType: partial.sourceType,
        text,
        fieldName: partial.candidateFieldName ?? undefined
      });
    };

    // candidate_field -- allow-list fechada (SPEC-023 Sec 10.1); nunca full_name/preferred_name/
    // email/telefone/salary_expectation/work_authorization.
    const candidateFields: Array<[string, unknown]> = [
      ["professional_summary", candidate?.professionalSummary],
      ["experiences", candidate?.experiences],
      ["education", candidate?.education],
      ["certifications", candidate?.certifications],
      ["languages", candidate?.languages],
      ["declared_competencies", candidate?.declaredCompetencies],
      ["availability", candidate?.availability]
    ];
    for (const [fieldName, value] of candidateFields) {
      if (isEmptyFieldValue(value)) continue;
      const snapshotValue = typeof value === "string" ? value : JSON.stringify(value);
      pushEvidence(
        { sourceType: "candidate_field", snapshotValue, candidateFieldName: fieldName as never },
        snapshotValue
      );
    }

    // job_opening_version -- sempre a versao herdada de forma imutavel pela CandidateApplication.
    const jobOpeningVersion = await tx.preAnalyses.findJobOpeningVersion(
      preAnalysis.jobOpeningVersionId
    );
    if (jobOpeningVersion) {
      const text = [
        jobOpeningVersion.publicTitle,
        jobOpeningVersion.description,
        JSON.stringify(jobOpeningVersion.responsibilities),
        JSON.stringify(jobOpeningVersion.requirements),
        JSON.stringify(jobOpeningVersion.benefits)
      ].join("\n");
      pushEvidence(
        {
          sourceType: "job_opening_version",
          jobOpeningId: jobOpeningVersion.jobOpeningId,
          jobOpeningVersionId: jobOpeningVersion.id
        },
        text
      );
    }

    // pre_interview_response -- apenas respostas submetidas de instancia completed (Sec 10.1).
    if (preAnalysis.preInterviewId) {
      const responses = await tx.preAnalyses.listSubmittedPreInterviewResponses(
        preAnalysis.preInterviewId
      );
      for (const response of responses) {
        const text = `${response.questionText ?? ""}\n${JSON.stringify(response.responseValue)}`;
        pushEvidence(
          {
            sourceType: "pre_interview_response",
            preInterviewId: preAnalysis.preInterviewId,
            preInterviewResponseId: response.id
          },
          text
        );
      }
    }

    // behavioral_assessment_result -- exclusivamente o resultado estruturado, nunca respostas
    // brutas (Sec 10.1, CA-022).
    if (preAnalysis.behavioralAssessmentId && behavioralAssessment?.resultId) {
      const result = await tx.preAnalyses.findBehavioralAssessmentResult(
        behavioralAssessment.resultId
      );
      if (result) {
        const text = [
          result.summaryText ?? "",
          ...result.dimensions.map(
            (d) => `${d.dimensionCode}: ${d.displayValue ?? ""} (${d.interpretationText ?? ""})`
          )
        ].join("\n");
        pushEvidence(
          {
            sourceType: "behavioral_assessment_result",
            behavioralAssessmentId: preAnalysis.behavioralAssessmentId,
            behavioralAssessmentResultId: result.id
          },
          text
        );
      }
    }

    // blueprint_version -- contexto organizacional (Sec 10.1: "missao, valores, cultura,
    // competencias organizacionais, criterios do Cargo vinculado"). Le o conteudo estruturado
    // real do Manifesto ativado (Fase 15, ADR-0022) -- nunca um placeholder generico. A fonte
    // e sempre o DNA/competencias que o proprio Manifesto ja congelou na ativacao desta
    // Blueprint Version, nunca uma releitura do DNA "atual" (ADR-0022, "Nao retroatividade").
    //
    // Decisao normativa deliberada (revisao destrutiva final, Ponto 4): "criterios do Cargo
    // vinculado" permanece FORA desta evidencia, por decisao, nao por prazo. A lista entre
    // parenteses de Sec 10.1 e ilustrativa do subconjunto relevante, nunca uma allow-list
    // fechada e obrigatoria com cada item individualmente exigido -- ao contrario de
    // `candidate_field` (Sec 10.1), cuja allow-list e explicitamente exaustiva ("nunca inclui:
    // ..."), a SPEC nunca define fisicamente COMO correlacionar "o Cargo vinculado" desta Vaga
    // especifica a uma entrada do Manifesto, e Sec 38 ("Limitacoes Conhecidas") -- que lista
    // exaustivamente toda pendencia conhecida da SPEC -- nao menciona isso como pendencia.
    // Implementar essa correlacao exigiria: (a) ler `job_profile_versions` (Fase 5, modulo
    // nunca antes tocado por esta Fase) para obter os criterios reais (requisitos/
    // competencias/responsabilidades) alem do snapshot minimo (code/name) ja presente no
    // Manifesto; (b) definir uma regra de integridade nao normatizada pela SPEC para o caso em
    // que o Job Profile Version da Vaga nao esta (mais) no Manifesto ativo -- uma ampliacao de
    // escopo real, nao uma correcao pontual. Missao/valores/cultura/competencias
    // organizacionais, que ja sao dado real (nao placeholder), cobrem a parte do contrato que a
    // SPEC de fato especifica com precisao suficiente para implementar sem inventar regra.
    if (preAnalysis.blueprintVersionId) {
      const blueprintContent = await tx.preAnalyses.findBlueprintContent(
        preAnalysis.blueprintVersionId
      );
      const text = blueprintContent
        ? [
            `Missao: ${blueprintContent.mission}`,
            `Visao: ${blueprintContent.vision}`,
            `Proposito: ${blueprintContent.purpose}`,
            `Valores: ${JSON.stringify(blueprintContent.values)}`,
            `Cultura: ${blueprintContent.cultureContent}`,
            `Estilo de lideranca: ${blueprintContent.leadershipStyleContent}`,
            `Ambiente de trabalho: ${blueprintContent.workEnvironmentContent}`,
            `Competencias organizacionais: ${blueprintContent.competencies
              .map((c) => `${c.name} (${c.category})`)
              .join(", ")}`
          ].join("\n")
        : "Blueprint Organizacional vigente sem entrada de DNA no manifesto ativado.";
      pushEvidence(
        { sourceType: "blueprint_version", blueprintVersionId: preAnalysis.blueprintVersionId },
        text
      );
    }

    // Correcao da revisao destrutiva: o payload enviado ao Gateway contem EXCLUSIVAMENTE
    // `evidences[]` -- nenhum campo solto/redundante fora dela. Uma versao anterior desta
    // funcao tambem enviava um objeto `candidate` paralelo, com o mesmo conteudo ja presente em
    // `evidences[]`; isso duplicava dado (custo/tokens desnecessarios) e, mais grave, quebrava o
    // principio de rastreabilidade unica por evidencia (SPEC-023 Sec 12: "todo achado deve
    // referenciar ao menos uma evidencia") -- um campo fora de `evidences[]` pode ser citado por
    // um achado sem nenhum `evidence_ref` valido para apontar. Nunca reintroduzir esse campo.
    const gatewayInput: PreAnalysisGatewayInput = { evidences: payloadItems };

    return { evidences, gatewayInput, evidenceIdByRef };
  }

  // ------------------------------------------------------------------------------ TX-running

  private async transitionToRunning(
    tx: PreAnalysisTransaction,
    actor: Actor,
    organizationId: string,
    preAnalysisId: string
  ): Promise<{ transitioned: boolean; preAnalysis: PreAnalysis }> {
    const locked = await tx.preAnalyses.findPreAnalysisForUpdate(organizationId, preAnalysisId);
    if (!locked) {
      throw notFound("pre_analysis_not_found", "Pre-analysis not found.");
    }
    if (locked.status !== "requested") {
      // Corrida ja resolvida por outro caminho (por exemplo cancelamento antes da chamada ao
      // Gateway) -- nunca reprocessar.
      return { transitioned: false, preAnalysis: locked };
    }

    const now = tx.preAnalyses.now();

    // Revalidacao imediatamente antes do envio (SPEC-023 Sec 9.5, CA-071).
    const application = await tx.preAnalyses.findApplication(locked.candidateApplicationId);
    const candidate = await tx.preAnalyses.findCandidate(locked.candidateId);
    const consent = await tx.preAnalyses.latestConsent(locked.candidateId);
    const organization = await tx.core.findOrganizationById(organizationId);
    const businessOk =
      application?.applicationStatus === "active" &&
      candidate?.status === "active" &&
      isConsentValid(consent, now) &&
      organization?.status === "active";

    // Pre-checagem das quatro condicoes de IA + routing/prompt (SPEC-023 Sec 20, passos 1-9),
    // usando exclusivamente a fachada publica de AIService (policy/routing/promptRegistry) --
    // nunca reimplementando a logica, apenas chamando os mesmos servicos que o AIGateway chama
    // internamente, sem efeito colateral, para decidir requested->running vs
    // requested->unavailable ANTES de qualquer chamada real ao Gateway (Plano Tecnico
    // Consolidado, item 2).
    let aiOk = false;
    let aiDenialCategory: PreAnalysisErrorCategory = "configuration_error";
    if (businessOk) {
      try {
        const gate = await this.aiService.policy.assertExecutable(
          organizationId,
          preAnalysisFeatureKey
        );
        const routes = await this.aiService.routing.resolveOrderedRoutes(
          organizationId,
          preAnalysisFeatureKey
        );
        const promptKey = gate.featureCatalog.defaultPromptKey;
        const prompt = promptKey
          ? await this.aiService.promptRegistry.getPublishedForExecution(promptKey)
          : null;
        aiOk = routes.length > 0 && Boolean(promptKey) && Boolean(prompt);
        if (!aiOk) aiDenialCategory = "configuration_error";
      } catch {
        aiOk = false;
        aiDenialCategory = "policy_denied";
      }
    }

    if (!businessOk || !aiOk) {
      const next: PreAnalysis = {
        ...locked,
        status: "unavailable",
        unavailableAt: now,
        errorCategory: businessOk ? aiDenialCategory : "policy_denied",
        updatedAt: now
      };
      await tx.preAnalyses.updatePreAnalysis(next);
      await tx.preAnalyses.addEvent(
        makeEvent(tx, locked.id, organizationId, "unavailable", "requested", "unavailable")
      );
      await this.testingHooks.beforeCriticalAudit?.("pre_analysis.unavailable");
      await auditPreAnalysis(tx.core, actor, organizationId, "pre_analysis.unavailable", {
        preAnalysisId: locked.id,
        errorCategory: next.errorCategory
      });
      return { transitioned: false, preAnalysis: next };
    }

    const next: PreAnalysis = { ...locked, status: "running", runningAt: now, updatedAt: now };
    await tx.preAnalyses.updatePreAnalysis(next);
    await tx.preAnalyses.addEvent(
      makeEvent(tx, locked.id, organizationId, "running", "requested", "running")
    );
    await this.testingHooks.beforeCriticalAudit?.("pre_analysis.running");
    await auditPreAnalysis(tx.core, actor, organizationId, "pre_analysis.running", {
      preAnalysisId: locked.id
    });
    return { transitioned: true, preAnalysis: next };
  }

  // ------------------------------------------------------------------------- Chamada externa

  private async callGateway(
    actor: Actor,
    organizationId: string,
    preAnalysis: PreAnalysis,
    gatewayInput: PreAnalysisGatewayInput
  ) {
    try {
      return await this.aiService.gateway.execute(actor, organizationId, {
        featureKey: preAnalysisFeatureKey,
        input: gatewayInput as unknown as JsonObject,
        idempotencyKey: `pre-analysis:${preAnalysis.id}`
      });
    } catch (error) {
      // `ai_execution_in_progress` (chave de idempotencia colidindo com execucao ainda
      // pending/running) -- tratado defensivamente, nunca propagado como 500 nao tratado
      // (Plano Tecnico Consolidado, item 9/item 30). Na pratica nao deveria ocorrer, dado o
      // invariante de uma unica PreAnalysis operacional por candidatura, mas a defesa existe.
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "ai_execution_in_progress"
      ) {
        return { kind: "conflict_in_progress" as const };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------------- TX2

  private async finalizeTx2(
    tx: PreAnalysisTransaction,
    actor: Actor,
    organizationId: string,
    preAnalysisId: string,
    gatewayOutcome: Awaited<ReturnType<PreAnalysisService["callGateway"]>>,
    evidenceIdByRef: Map<string, string>
  ): Promise<PreAnalysis> {
    const locked = await tx.preAnalyses.findPreAnalysisForUpdate(organizationId, preAnalysisId);
    if (!locked) {
      throw notFound("pre_analysis_not_found", "Pre-analysis not found.");
    }

    if (locked.status !== "running") {
      // Algum outro caminho ja venceu a corrida (cancelamento explicito -- SPEC-023 Sec 35 --
      // OU a reconciliacao de `running` preso, Sec 4.4, que pode legitimamente correr em
      // paralelo a uma chamada ainda genuinamente em voo). O retorno do provider, quando existe,
      // e sempre descartado -- NUNCA sobrescreve um estado final ja alcancado por outro caminho,
      // qualquer que ele seja (Plano Tecnico Consolidado, item 8; correcao da revisao
      // destrutiva: o audit de descarte cobre TODO estado final concorrente, nao apenas
      // `cancelled` -- um resultado perdido silenciosamente pela reconciliacao, sem nenhum
      // registro, seria uma lacuna de auditoria equivalente e igualmente grave).
      if (gatewayOutcome.kind === "executed") {
        await tx.preAnalyses.addEvent(
          makeEvent(
            tx,
            locked.id,
            organizationId,
            "result_discarded_after_cancellation",
            locked.status,
            locked.status
          )
        );
        await auditPreAnalysis(
          tx.core,
          actor,
          organizationId,
          "pre_analysis.result_discarded_after_cancellation",
          {
            preAnalysisId: locked.id,
            aiExecutionId: gatewayOutcome.usage.executionId,
            supersededByStatus: locked.status
          }
        );
      }
      return locked;
    }

    const now = tx.preAnalyses.now();

    if (gatewayOutcome.kind === "executed") {
      const parsed = parseGatewayOutput(gatewayOutcome.output);
      if (!parsed) {
        return this.persistFailure(
          tx,
          actor,
          organizationId,
          locked,
          now,
          "invalid_response",
          gatewayOutcome.usage.executionId
        );
      }
      const validRefs = new Set(evidenceIdByRef.keys());
      for (const finding of parsed.findings) {
        const uniqueRefs = new Set(finding.evidenceRefs);
        if (uniqueRefs.size !== finding.evidenceRefs.length) {
          return this.persistFailure(
            tx,
            actor,
            organizationId,
            locked,
            now,
            "invalid_response",
            gatewayOutcome.usage.executionId
          );
        }
        for (const ref of finding.evidenceRefs) {
          if (!validRefs.has(ref)) {
            return this.persistFailure(
              tx,
              actor,
              organizationId,
              locked,
              now,
              "invalid_response",
              gatewayOutcome.usage.executionId
            );
          }
        }
      }

      const resultId = tx.preAnalyses.nextId("par");
      await tx.preAnalyses.addResult({
        id: resultId,
        organizationId,
        preAnalysisId: locked.id,
        aiExecutionId: gatewayOutcome.usage.executionId,
        promptKey: gatewayOutcome.usage.promptKey,
        promptVersion: gatewayOutcome.usage.promptVersion,
        summary: parsed.summary,
        limitations: parsed.limitations,
        disclaimer: PRE_ANALYSIS_DISCLAIMER,
        calculatedAt: gatewayOutcome.usage.finishedAt ?? now,
        createdAt: now
      });
      for (const [index, finding] of parsed.findings.entries()) {
        const findingId = tx.preAnalyses.nextId("paf");
        await tx.preAnalyses.addFinding({
          id: findingId,
          organizationId,
          preAnalysisResultId: resultId,
          preAnalysisId: locked.id,
          category: finding.category,
          text: finding.text,
          displayOrder: index,
          createdAt: now,
          evidenceIds: []
        });
        for (const ref of finding.evidenceRefs) {
          const evidenceId = evidenceIdByRef.get(ref);
          if (evidenceId) {
            await tx.preAnalyses.addFindingEvidence(
              organizationId,
              findingId,
              evidenceId,
              locked.id
            );
          }
        }
      }

      const next: PreAnalysis = {
        ...locked,
        status: "completed",
        completedAt: now,
        aiExecutionId: gatewayOutcome.usage.executionId,
        updatedAt: now
      };
      await tx.preAnalyses.updatePreAnalysis(next);
      await tx.preAnalyses.addEvent(
        makeEvent(tx, locked.id, organizationId, "completed", "running", "completed")
      );
      await this.testingHooks.beforeCriticalAudit?.("pre_analysis.completed");
      await auditPreAnalysis(tx.core, actor, organizationId, "pre_analysis.completed", {
        preAnalysisId: locked.id,
        aiExecutionId: gatewayOutcome.usage.executionId,
        promptKey: gatewayOutcome.usage.promptKey,
        promptVersion: String(gatewayOutcome.usage.promptVersion)
      });
      return next;
    }

    if (gatewayOutcome.kind === "failed") {
      return this.persistFailure(
        tx,
        actor,
        organizationId,
        locked,
        now,
        gatewayOutcome.errorCategory,
        gatewayOutcome.usage.executionId
      );
    }

    // "denied" apos ja estar running (corrida rara entre a pre-checagem de TX-running e a
    // chamada real -- Plano Tecnico Consolidado, secao de decisao de desenho): running->
    // unavailable nao e transicao legal (SPEC-023 Sec 5.7); reconciliado fisicamente como
    // failed, nunca como completed nem deixado preso.
    if (gatewayOutcome.kind === "denied") {
      return this.persistFailure(
        tx,
        actor,
        organizationId,
        locked,
        now,
        gatewayOutcome.errorCategory,
        null
      );
    }

    // idempotent_replay ou conflict_in_progress: NUNCA tratado como executed -- nao possui
    // output recuperavel (Plano Tecnico Consolidado, item 5/7/9). Reconciliado como failed,
    // preservando o ai_execution_id quando disponivel para auditoria/telemetria.
    return this.persistFailure(
      tx,
      actor,
      organizationId,
      locked,
      now,
      "unknown_error",
      gatewayOutcome.kind === "idempotent_replay" ? gatewayOutcome.usage.executionId : null
    );
  }

  private async persistFailure(
    tx: PreAnalysisTransaction,
    actor: Actor,
    organizationId: string,
    locked: PreAnalysis,
    now: string,
    errorCategory: PreAnalysisErrorCategory,
    aiExecutionId: string | null
  ): Promise<PreAnalysis> {
    const next: PreAnalysis = {
      ...locked,
      status: "failed",
      failedAt: now,
      errorCategory,
      aiExecutionId: aiExecutionId ?? locked.aiExecutionId,
      updatedAt: now
    };
    await tx.preAnalyses.updatePreAnalysis(next);
    await tx.preAnalyses.addEvent(
      makeEvent(tx, locked.id, organizationId, "failed", "running", "failed")
    );
    await this.testingHooks.beforeCriticalAudit?.("pre_analysis.failed");
    await auditPreAnalysis(tx.core, actor, organizationId, "pre_analysis.failed", {
      preAnalysisId: locked.id,
      errorCategory
    });
    return next;
  }

  // ----------------------------------------------------------------------------------------
  // Cancelamento (SPEC-023 Sec 5.6/Sec 35). Cancelled nunca vira completed sob nenhuma corrida
  // (garantido fisicamente pelo trigger de transicao da migration 0021 -- este UPDATE
  // condicional e a primeira camada de defesa).
  // ----------------------------------------------------------------------------------------

  async cancel(
    actor: Actor,
    organizationId: string,
    preAnalysisId: string,
    reasonInput: { reason?: unknown }
  ) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const reason = validateReasonInput(reasonInput);
    return this.runTransaction(async (tx) => {
      const service = this.scoped(tx);
      await service.authorizeUser(actor, organizationId, ["owner", "admin"]);
      const locked = await tx.preAnalyses.findPreAnalysisForUpdate(organizationId, preAnalysisId);
      if (!locked) throw notFound("pre_analysis_not_found", "Pre-analysis not found.");
      if (locked.status !== "requested" && locked.status !== "running") {
        throw conflict(
          "pre_analysis_not_cancellable",
          "Pre-analysis is not in a cancellable state."
        );
      }
      const now = tx.preAnalyses.now();
      const next: PreAnalysis = {
        ...locked,
        status: "cancelled",
        cancelledAt: now,
        cancelledByUserId: actorUserId(actor),
        cancellationReason: reason,
        updatedAt: now
      };
      await tx.preAnalyses.updatePreAnalysis(next);
      await tx.preAnalyses.addEvent(
        makeEvent(tx, locked.id, organizationId, "cancelled", locked.status, "cancelled", reason)
      );
      await this.testingHooks.beforeCriticalAudit?.("pre_analysis.cancelled");
      await auditPreAnalysis(tx.core, actor, organizationId, "pre_analysis.cancelled", {
        preAnalysisId: locked.id,
        reason
      });
      return toOwnerDTO(next);
    });
  }

  // ----------------------------------------------------------------------------------------
  // Reconciliacao (SPEC-023 Sec 4.4, CA-068; Plano Tecnico Consolidado, itens 3/4/5). Nunca
  // fabrica resultado; sempre transiciona para `failed`. Cobre `requested` E `running` presos
  // -- nunca apenas `running` (correcao explicita desta consolidacao: um crash entre TX1 e
  // TX-running deixaria `requested` preso para sempre sem essa cobertura).
  // ----------------------------------------------------------------------------------------

  async reconcileStale(organizationId: string | null = null) {
    await this.reconcileStatus(
      organizationId,
      "requested",
      this.reconciliationThresholdsMs.requested
    );
    await this.reconcileStatus(organizationId, "running", this.reconciliationThresholdsMs.running);
  }

  // Materializacao lazy (Plano Tecnico Consolidado, item 3): antes de decidir se ja existe uma
  // execucao operacional para uma candidatura, reconcilia primeiro qualquer execucao presa
  // desta Organization -- nunca deixa uma `requested`/`running` obsoleta bloquear uma nova
  // solicitacao legitima indefinidamente. Escopo por Organization (nao ha, hoje, indice que
  // permita reconciliar apenas uma CandidateApplication sem varrer a Organization inteira).
  private async reconcileStaleForApplication(organizationId: string) {
    await this.reconcileStale(organizationId);
  }

  private async reconcileStatus(
    organizationId: string | null,
    status: "requested" | "running",
    thresholdMs: number
  ) {
    const cutoff = new Date(Date.now() - thresholdMs).toISOString();
    const stale = await this.preAnalyses.listStale(organizationId, status, cutoff);
    for (const item of stale) {
      await this.runTransaction(async (tx) => {
        const locked = await tx.preAnalyses.findPreAnalysisForUpdate(item.organizationId, item.id);
        if (!locked || locked.status !== status) return;
        const now = tx.preAnalyses.now();
        const next: PreAnalysis = {
          ...locked,
          status: "failed",
          failedAt: now,
          errorCategory: "unknown_error",
          updatedAt: now
        };
        await tx.preAnalyses.updatePreAnalysis(next);
        await tx.preAnalyses.addEvent(
          makeEvent(
            tx,
            locked.id,
            locked.organizationId,
            status === "requested" ? "reconciled_stale_requested" : "reconciled_stale_running",
            status,
            "failed"
          )
        );
        await auditPreAnalysisSystem(tx.core, locked.organizationId, "pre_analysis.reconciled", {
          preAnalysisId: locked.id,
          fromStatus: status
        });
      });
    }
  }

  // ----------------------------------------------------------------------------------------
  // Consultas (SPEC-023 Sec 24) -- DTO positivo por perfil, nunca por omissao.
  // ----------------------------------------------------------------------------------------

  async getForMember(
    actor: Actor,
    organizationId: string,
    preAnalysisId: string
  ): Promise<PreAnalysisMemberDTO> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const found = await this.findOwned(organizationId, preAnalysisId);
    return { id: found.id, status: found.status };
  }

  async getForOwner(
    actor: Actor,
    organizationId: string,
    preAnalysisId: string
  ): Promise<PreAnalysisOwnerDTO> {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    return toOwnerDTO(await this.findOwned(organizationId, preAnalysisId));
  }

  async listByApplication(actor: Actor, organizationId: string, candidateApplicationId: string) {
    const { role } = await this.authorizeUser(actor, organizationId, ["owner", "admin", "member"]);
    const list = await this.preAnalyses.listByApplication(organizationId, candidateApplicationId);
    if (role === "member") {
      return list.map((p) => ({ id: p.id, status: p.status }) satisfies PreAnalysisMemberDTO);
    }
    return list.map(toOwnerDTO);
  }

  async getResult(actor: Actor, organizationId: string, preAnalysisId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const found = await this.findOwned(organizationId, preAnalysisId);
    const result = await this.preAnalyses.findResultByPreAnalysis(organizationId, found.id);
    if (!result) return null;
    const findings = await this.preAnalyses.listFindings(organizationId, result.id);
    return { result, findings };
  }

  async getEvidences(actor: Actor, organizationId: string, preAnalysisId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const found = await this.findOwned(organizationId, preAnalysisId);
    return this.preAnalyses.listEvidences(organizationId, found.id);
  }

  async listEvents(actor: Actor, organizationId: string, preAnalysisId: string) {
    await this.authorizeUser(actor, organizationId, ["owner", "admin"]);
    const found = await this.findOwned(organizationId, preAnalysisId);
    return this.preAnalyses.listEvents(organizationId, found.id);
  }

  // ----------------------------------------------------------------------------------------
  // Platform Admin -- leitura administrativa auditada, minimizada, nunca conteudo funcional
  // (SPEC-023 Sec 27, CA-047, Plano Tecnico Consolidado item 21).
  // ----------------------------------------------------------------------------------------

  // Mesma convencao ja usada por `behavioralAssessments.adminRead` (Fase 19) e por todo o
  // restante da plataforma: rota generica `/platform/organizations/:organizationId/<modulo>/
  // admin-read`, sem ID no path -- o alvo especifico e informado no corpo, junto do motivo
  // obrigatorio (SPEC-023 Sec 27).
  async adminRead(
    actor: Actor,
    organizationId: string,
    input: { reason?: unknown; preAnalysisId?: unknown }
  ): Promise<PreAnalysisAdminReadDTO> {
    if (actor.kind !== "platform") {
      throw forbidden("pre_analysis_admin_only", "Platform Admin only.");
    }
    const reason = validateAdminReadInput(input);
    const preAnalysisId = validateId(input.preAnalysisId, "pre_analysis_id");
    const found = await this.preAnalyses.findPreAnalysisById(organizationId, preAnalysisId);
    if (!found) {
      // Correcao da revisao destrutiva final (item opcional 1.6.b): a tentativa e sempre
      // auditada, mesmo quando o registro nao existe -- inclusive quando o `preAnalysisId`
      // informado pertence a OUTRA Organization (cross-tenant), caso em que
      // `findPreAnalysisById` tambem retorna nulo por ja filtrar por `organizationId`. Sem
      // isso, uma varredura administrativa (enumeracao de IDs) por um Platform Admin nunca
      // deixaria rastro algum -- uma lacuna de auditoria real, ainda que de baixo risco (o
      // ator ja e Platform Admin, autenticado e de confianca elevada).
      await auditPreAnalysisDenied(
        this.core,
        actor,
        organizationId,
        "pre_analysis.administrative_read_denied",
        "pre_analysis_not_found",
        { preAnalysisId, reason }
      );
      throw notFound("pre_analysis_not_found", "Pre-analysis not found.");
    }
    const result = await this.preAnalyses.findResultByPreAnalysis(organizationId, found.id);
    await auditPreAnalysis(this.core, actor, organizationId, "pre_analysis.administrative_read", {
      preAnalysisId: found.id,
      reason
    });
    return {
      id: found.id,
      organizationId: found.organizationId,
      candidateApplicationId: found.candidateApplicationId,
      attemptNumber: found.attemptNumber,
      status: found.status,
      requestedByUserId: found.requestedByUserId,
      requestedAt: found.requestedAt,
      aiExecutionId: found.aiExecutionId,
      errorCategory: found.errorCategory,
      hasResult: Boolean(result)
    };
  }

  // ----------------------------------------------------------------------------------------
  // Internos
  // ----------------------------------------------------------------------------------------

  private async findOwned(organizationId: string, preAnalysisId: string): Promise<PreAnalysis> {
    const found = await this.preAnalyses.findPreAnalysisById(organizationId, preAnalysisId);
    if (!found) throw notFound("pre_analysis_not_found", "Pre-analysis not found.");
    return found;
  }

  private scoped(tx: PreAnalysisTransaction) {
    return new PreAnalysisService(
      tx.core,
      tx.preAnalyses,
      this.runTransaction,
      this.aiService,
      this.testingHooks,
      this.reconciliationThresholdsMs
    );
  }

  private async authorizeUser(
    actor: Actor,
    organizationId: string,
    allowedRoles: MembershipRole[],
    deniedAction = "pre_analysis.permission_denied"
  ) {
    if (actor.kind === "platform") {
      await auditPreAnalysisDenied(
        this.core,
        actor,
        organizationId,
        deniedAction,
        "permission_denied"
      );
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
      await auditPreAnalysisDenied(
        this.core,
        actor,
        organizationId,
        deniedAction,
        "organization_archived"
      );
      throw forbidden("organization_archived", "Archived organization cannot be used as context.");
    }
    const membership = await this.core.findMembershipByOrganizationAndUser(
      organizationId,
      actor.userId
    );
    if (!membership || membership.status !== "active") {
      await auditPreAnalysisDenied(
        this.core,
        actor,
        organizationId,
        "pre_analysis.cross_organization_access_denied",
        "membership_required"
      );
      throw forbidden("membership_required", "Active membership is required.");
    }
    if (!allowedRoles.includes(membership.role)) {
      await auditPreAnalysisDenied(
        this.core,
        actor,
        organizationId,
        deniedAction,
        "permission_denied"
      );
      throw forbidden("permission_denied", "Permission denied.");
    }
    return { actor, organization, role: membership.role };
  }
}

// ------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------

function actorUserId(actor: Actor): string {
  if (actor.kind !== "user") {
    throw forbidden("pre_analysis_actor_invalid", "A user actor is required.");
  }
  return actor.userId;
}

function isConsentValid(
  consent: { status: string; expiresAt: string | null } | null,
  nowIso: string
): boolean {
  if (!consent || consent.status !== "granted") return false;
  if (consent.expiresAt && consent.expiresAt <= nowIso) return false;
  return true;
}

function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function makeEvent(
  tx: PreAnalysisTransaction,
  preAnalysisId: string,
  organizationId: string,
  eventType: PreAnalysisEventType,
  statusBefore: PreAnalysisStatus | null,
  statusAfter: PreAnalysisStatus | null,
  reason: string | null = null
): PreAnalysisEvent {
  return {
    id: tx.preAnalyses.nextId("pae2"),
    organizationId,
    preAnalysisId,
    eventType,
    statusBefore,
    statusAfter,
    reason,
    metadata: {},
    createdAt: tx.preAnalyses.now()
  };
}

function toOwnerDTO(p: PreAnalysis): PreAnalysisOwnerDTO {
  return {
    id: p.id,
    candidateApplicationId: p.candidateApplicationId,
    attemptNumber: p.attemptNumber,
    previousAttemptId: p.previousAttemptId,
    status: p.status,
    requestedByUserId: p.requestedByUserId,
    requestedAt: p.requestedAt,
    completedAt: p.completedAt,
    failedAt: p.failedAt,
    unavailableAt: p.unavailableAt,
    cancelledAt: p.cancelledAt,
    cancellationReason: p.cancellationReason,
    errorCategory: p.errorCategory
  };
}

// Valida a resposta do provider contra o schema fechado esperado (mesmos limites fisicos da
// migration 0021 -- Plano Tecnico Consolidado, item 17). Uma resposta fora desses limites e
// tratada como `invalid_response`, nunca persistida parcialmente.
// Correcao critica da revisao destrutiva: `AIGateway.assertStructuredOutput` (Fase 11) usa
// `MinimalJsonSchema`, um subconjunto deliberadamente simplificado de JSON Schema que NUNCA
// implementou `additionalProperties` (confirmado no proprio codigo-fonte de
// `src/server/ai/prompt-renderer.ts`: "a deliberately minimal... subset of JSON Schema"). Ou
// seja, `additionalProperties:false` declarado no `outputSchema` do Prompt Registry e LETRA
// MORTA na validacao real -- o Gateway aceita e repassa qualquer campo extra, incluindo um
// eventual `score`/`recommendation`/`hired` que um provider (comprometido ou manipulado por
// prompt injection) tente incluir. Esta SPEC PROIBE ABSOLUTAMENTE esses campos em qualquer
// circunstancia (Sec 15) -- esta funcao e quem fisicamente impede isso na pratica, nunca
// confiando na garantia inexistente do Gateway. Uma unica chave fora da allow-list, em
// qualquer nivel (raiz ou dentro de um finding), reprova o output inteiro.
const PRE_ANALYSIS_OUTPUT_ROOT_KEYS = new Set(["summary", "limitations", "findings"]);
const PRE_ANALYSIS_OUTPUT_FINDING_KEYS = new Set(["category", "text", "evidenceRefs"]);

function hasOnlyAllowedKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

// Exportada exclusivamente para testes unitarios diretos (revisao destrutiva final, Ponto 2) --
// funcao pura, sem dependencia de banco/HTTP/Gateway, entao testar casos extremos diretamente
// e mais preciso e mais rapido que atravessar todo o pipeline real para cada caso.
export function parseGatewayOutput(raw: unknown): PreAnalysisGatewayOutput | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!hasOnlyAllowedKeys(value, PRE_ANALYSIS_OUTPUT_ROOT_KEYS)) return null;
  const summary = value.summary;
  const limitations = value.limitations;
  const findings = value.findings;
  if (
    typeof summary !== "string" ||
    summary.length < preAnalysisOutputLimits.summaryMin ||
    summary.length > preAnalysisOutputLimits.summaryMax
  ) {
    return null;
  }
  if (
    typeof limitations !== "string" ||
    limitations.length < preAnalysisOutputLimits.limitationsMin ||
    limitations.length > preAnalysisOutputLimits.limitationsMax
  ) {
    return null;
  }
  if (!Array.isArray(findings) || findings.length > preAnalysisOutputLimits.findingsMax) {
    return null;
  }
  const parsedFindings: PreAnalysisGatewayOutput["findings"] = [];
  for (const entry of findings) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const f = entry as Record<string, unknown>;
    if (!hasOnlyAllowedKeys(f, PRE_ANALYSIS_OUTPUT_FINDING_KEYS)) return null;
    if (!preAnalysisFindingCategories.includes(f.category as never)) return null;
    if (
      typeof f.text !== "string" ||
      f.text.length < preAnalysisOutputLimits.findingTextMin ||
      f.text.length > preAnalysisOutputLimits.findingTextMax
    ) {
      return null;
    }
    if (
      !Array.isArray(f.evidenceRefs) ||
      f.evidenceRefs.length < preAnalysisOutputLimits.evidenceRefsMin ||
      f.evidenceRefs.length > preAnalysisOutputLimits.evidenceRefsMax ||
      !f.evidenceRefs.every((r) => typeof r === "string")
    ) {
      return null;
    }
    parsedFindings.push({
      category: f.category as never,
      text: f.text,
      evidenceRefs: f.evidenceRefs as string[]
    });
  }
  return { summary, limitations, findings: parsedFindings };
}

export function createPostgresPreAnalysisService(
  pool: pg.Pool,
  aiService: AIService,
  testingHooks: PreAnalysisTestingHooks = {},
  reconciliationThresholdsMs?: { requested: number; running: number }
): PreAnalysisService {
  return new PreAnalysisService(
    new PostgresCoreRepository(pool),
    new PostgresPreAnalysisRepository(pool),
    createPreAnalysisTransactionRunner(pool),
    aiService,
    testingHooks,
    reconciliationThresholdsMs ?? {
      requested: DEFAULT_PRE_ANALYSIS_RECONCILIATION_REQUESTED_THRESHOLD_MS,
      running: DEFAULT_PRE_ANALYSIS_RECONCILIATION_RUNNING_THRESHOLD_MS
    }
  );
}
