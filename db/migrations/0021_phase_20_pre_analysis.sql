-- Fase 20 (SPEC-023 v1.1) - Pre-Analise Assistida por IA.
--
-- Consolidacao final da revisao destrutiva: boundary transacional de tres transacoes curtas
-- (TX1 preparacao / TX-running revalidacao / TX2 finalizacao), evidencias tipadas e
-- discriminadas por source_type (nunca um source_reference_id generico solto), origin_kind
-- fechado em cinco valores canonicos (ADR-0023 + SPEC-023 v1.1: declared_data cobre tanto
-- autoria do candidato quanto autoria da Organization), e duas garantias fisicas via
-- constraint trigger deferido (nunca so disciplina de Service): (a) toda pre_analysis
-- completed possui exatamente um pre_analysis_result; (b) todo pre_analysis_finding possui ao
-- menos uma pre_analysis_evidence.
--
-- 6 tabelas fisicas, 5 entidades conceituais (SPEC-023 Sec 32): pre_analyses,
-- pre_analysis_evidences, pre_analysis_results, pre_analysis_findings, pre_analysis_events --
-- a sexta tabela fisica, pre_analysis_finding_evidences, e a juncao N:N exigida pela relacao
-- finding->evidencias (Sec 4.6/Sec 12), nunca uma entidade de dominio independente.

-- ==========================================================================================
-- 0. Ajustes aditivos a tabelas ja existentes -- nunca remove nem enfraquece nenhuma
--    constraint ja existente, apenas adiciona UNIQUE compostas necessarias para que
--    pre_analyses/pre_analysis_evidences consigam, no banco, amarrar candidate_id,
--    consent_id, behavioral_assessment_id e pre_interview_response_id exatamente ao contexto
--    correto (Organization + CandidateApplication/Candidate/PreInterview), fechando os
--    achados de seguranca cross-candidatura ja formalizados pela SPEC-023 (Sec 10.4) para
--    pre_interview_id/behavioral_assessment_id/consent_id. Volume real das quatro tabelas
--    verificado como zero linhas antes desta migration -- sem risco de violacao de dado
--    existente, sem necessidade de CONCURRENTLY.
-- ==========================================================================================

ALTER TABLE candidate_applications
  ADD CONSTRAINT uq_candidate_applications_org_id_candidate
  UNIQUE (organization_id, id, candidate_id);

ALTER TABLE candidate_consents
  ADD CONSTRAINT uq_candidate_consents_org_candidate_id
  UNIQUE (organization_id, candidate_id, id);

ALTER TABLE behavioral_assessments
  ADD CONSTRAINT uq_behavioral_assessments_org_application_id
  UNIQUE (organization_id, candidate_application_id, id);

ALTER TABLE pre_interview_responses
  ADD CONSTRAINT uq_pre_interview_responses_org_interview_id
  UNIQUE (organization_id, pre_interview_id, id);

-- ==========================================================================================
-- 1. pre_analyses -- execucao concreta (SPEC-023 Sec 4.4). requested/running nunca observados
--    como pausa persistida de longo prazo (Sec 5.1): TX1 cria em `requested`, TX-running
--    revalida e transiciona para `running` imediatamente antes da chamada ao AIGateway, ambas
--    transacoes curtas e sequenciais, nunca a mesma transacao que aguarda a rede.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_analyses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  candidate_application_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  job_opening_id TEXT NOT NULL,
  job_opening_version_id TEXT NOT NULL,
  blueprint_version_id TEXT,
  pre_interview_id TEXT,
  behavioral_assessment_id TEXT,
  consent_id TEXT NOT NULL,

  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  previous_attempt_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('requested', 'running', 'completed', 'failed', 'unavailable', 'cancelled')
  ),

  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL,
  running_at TIMESTAMPTZ,

  ai_execution_id TEXT,

  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  unavailable_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id TEXT REFERENCES users(id),
  cancellation_reason TEXT CHECK (
    cancellation_reason IS NULL OR char_length(cancellation_reason) <= 1000
  ),
  error_category TEXT CHECK (
    error_category IS NULL OR error_category IN (
      'authentication_error', 'quota_exceeded', 'rate_limited', 'timeout',
      'provider_unavailable', 'network_error', 'invalid_response',
      'configuration_error', 'policy_denied', 'content_blocked', 'unknown_error'
    )
  ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, candidate_application_id, id),
  UNIQUE (organization_id, candidate_application_id, attempt_number),

  -- Coerencia com CandidateApplication: candidate_id, job_opening_id/version_id herdados de
  -- forma imutavel (Sec 4.4), nunca aceitos como valor livre sem prova fisica.
  FOREIGN KEY (organization_id, candidate_application_id, candidate_id)
    REFERENCES candidate_applications (organization_id, id, candidate_id),
  FOREIGN KEY (organization_id, candidate_application_id, job_opening_id, job_opening_version_id)
    REFERENCES candidate_applications (organization_id, id, job_opening_id, job_opening_version_id),

  -- consent_id precisa pertencer exatamente ao MESMO Candidate desta CandidateApplication,
  -- nunca apenas a mesma Organization (Sec 10.4, achado de seguranca cross-candidatura).
  FOREIGN KEY (organization_id, candidate_id, consent_id)
    REFERENCES candidate_consents (organization_id, candidate_id, id),

  -- pre_interview_id/behavioral_assessment_id, quando informados, precisam pertencer
  -- exatamente a esta MESMA CandidateApplication, nunca apenas a mesma Organization (Sec
  -- 10.4, CA-064/CA-065).
  FOREIGN KEY (organization_id, candidate_application_id, pre_interview_id)
    REFERENCES pre_interviews (organization_id, candidate_application_id, id),
  FOREIGN KEY (organization_id, candidate_application_id, behavioral_assessment_id)
    REFERENCES behavioral_assessments (organization_id, candidate_application_id, id),

  FOREIGN KEY (organization_id, blueprint_version_id)
    REFERENCES organization_blueprint_versions (organization_id, id),

  FOREIGN KEY (organization_id, candidate_application_id, previous_attempt_id)
    REFERENCES pre_analyses (organization_id, candidate_application_id, id),
  CHECK (previous_attempt_id IS NULL OR previous_attempt_id <> id),

  CHECK (status <> 'running' OR running_at IS NOT NULL),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (status <> 'failed' OR failed_at IS NOT NULL),
  CHECK (status <> 'unavailable' OR unavailable_at IS NOT NULL),
  CHECK (
    status <> 'cancelled'
    OR (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND cancellation_reason IS NOT NULL)
  ),

  -- Invariante estrutural SPEC-023 Sec 4.4/CA-012: unavailable significa, por definicao, que o
  -- AIGateway nunca foi acionado -- nenhuma ai_execution pode existir para essa PreAnalysis.
  CHECK (status <> 'unavailable' OR ai_execution_id IS NULL),
  -- ai_execution_id so passa a existir depois que o AIGateway foi efetivamente acionado (Sec
  -- 20/9.2) -- nunca em requested (que ainda nao chamou o Gateway) nem em unavailable/cancelled
  -- antes da chamada.
  CHECK (ai_execution_id IS NULL OR status IN ('running', 'completed', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pre_analyses_one_operational
  ON pre_analyses (organization_id, candidate_application_id)
  WHERE status IN ('requested', 'running');

CREATE INDEX IF NOT EXISTS idx_pre_analyses_organization_status
  ON pre_analyses (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_pre_analyses_candidate_application
  ON pre_analyses (organization_id, candidate_application_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_pre_analyses_ai_execution
  ON pre_analyses (ai_execution_id) WHERE ai_execution_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_pre_analysis_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pre_analysis_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_no_delete ON pre_analyses;
CREATE TRIGGER trg_pre_analysis_no_delete
BEFORE DELETE ON pre_analyses
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_delete();

-- Campos de contexto/linhagem imutaveis mesmo em estado operacional (mesmo padrao de
-- `prevent_behavioral_assessment_parent_change`, Fase 19).
CREATE OR REPLACE FUNCTION prevent_pre_analysis_parent_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
    OR NEW.candidate_application_id <> OLD.candidate_application_id
    OR NEW.candidate_id <> OLD.candidate_id
    OR NEW.job_opening_id <> OLD.job_opening_id
    OR NEW.job_opening_version_id <> OLD.job_opening_version_id
    OR NEW.blueprint_version_id IS DISTINCT FROM OLD.blueprint_version_id
    OR NEW.pre_interview_id IS DISTINCT FROM OLD.pre_interview_id
    OR NEW.behavioral_assessment_id IS DISTINCT FROM OLD.behavioral_assessment_id
    OR NEW.consent_id <> OLD.consent_id
    OR NEW.attempt_number <> OLD.attempt_number
    OR NEW.previous_attempt_id IS DISTINCT FROM OLD.previous_attempt_id
    OR NEW.requested_by_user_id <> OLD.requested_by_user_id
    OR NEW.requested_at <> OLD.requested_at THEN
    RAISE EXCEPTION 'pre_analysis_parent_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_parent_immutable ON pre_analyses;
CREATE TRIGGER trg_pre_analysis_parent_immutable
BEFORE UPDATE ON pre_analyses
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_parent_change();

-- Estado final -> imutavel por completo (nenhuma saida, SPEC-023 Sec 5.7). Precisa disparar
-- ANTES do trigger de transicao -- ordem alfabetica de nome ("final_immutable" < "transition"),
-- mesmo artificio ja usado pela Fase 19.
CREATE OR REPLACE FUNCTION prevent_final_pre_analysis_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('completed', 'failed', 'unavailable', 'cancelled') THEN
    RAISE EXCEPTION 'pre_analysis_final_state_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_final_immutable ON pre_analyses;
CREATE TRIGGER trg_pre_analysis_final_immutable
BEFORE UPDATE ON pre_analyses
FOR EACH ROW EXECUTE FUNCTION prevent_final_pre_analysis_mutation();

-- State machine fisica -- matriz exata da SPEC-023 Sec 5.7. `cancelled` nunca vira `completed`
-- em nenhuma circunstancia, mesmo sob corrida entre cancel() e a persistencia do resultado
-- (Sec 35, item 5 da revisao destrutiva): esta e a segunda camada de defesa, depois do
-- `UPDATE ... WHERE status = 'running'` condicional do Service.
CREATE OR REPLACE FUNCTION enforce_pre_analysis_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'requested' AND NEW.status IN ('running', 'unavailable', 'cancelled') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'running' AND NEW.status IN ('completed', 'failed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'pre_analysis_transition_invalid';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_transition ON pre_analyses;
CREATE TRIGGER trg_pre_analysis_transition
BEFORE UPDATE ON pre_analyses
FOR EACH ROW EXECUTE FUNCTION enforce_pre_analysis_transition();

CREATE OR REPLACE FUNCTION enforce_pre_analysis_attempt_order()
RETURNS TRIGGER AS $$
DECLARE
  previous_attempt_number INTEGER;
BEGIN
  IF NEW.previous_attempt_id IS NOT NULL THEN
    SELECT attempt_number INTO previous_attempt_number
    FROM pre_analyses
    WHERE organization_id = NEW.organization_id AND id = NEW.previous_attempt_id;

    IF previous_attempt_number IS NULL OR previous_attempt_number >= NEW.attempt_number THEN
      RAISE EXCEPTION 'pre_analysis_attempt_order_invalid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_attempt_order ON pre_analyses;
CREATE TRIGGER trg_pre_analysis_attempt_order
BEFORE INSERT ON pre_analyses
FOR EACH ROW EXECUTE FUNCTION enforce_pre_analysis_attempt_order();

-- Constraint trigger deferido -- garante, fisicamente e no COMMIT (nunca so disciplina de
-- Service), que toda pre_analysis `completed` possui exatamente um pre_analysis_result. Dispara
-- em INSERT/UPDATE porque TX2 tanto pode inserir uma pre_analysis nova quanto (no fluxo real)
-- atualizar uma ja existente para completed -- o resultado, quando existe, ja foi inserido
-- ANTES desta linha na mesma transacao (ordem de TX2: results/findings/juncao -> UPDATE status).
CREATE OR REPLACE FUNCTION enforce_pre_analysis_completed_has_result()
RETURNS TRIGGER AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pre_analysis_results r WHERE r.pre_analysis_id = NEW.id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'pre_analysis_completed_without_result';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_completed_has_result ON pre_analyses;
CREATE CONSTRAINT TRIGGER trg_pre_analysis_completed_has_result
AFTER INSERT OR UPDATE ON pre_analyses
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_pre_analysis_completed_has_result();

-- ==========================================================================================
-- 2. pre_analysis_evidences -- referencia rastreavel a cada fonte efetivamente consumida
--    (SPEC-023 Sec 4.5). Evidencias tipadas e discriminadas por source_type -- nunca um
--    source_reference_id generico solto sem integridade fisica (correcao obrigatoria da
--    revisao destrutiva, item 8/11 do Plano Tecnico Consolidado).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_analysis_evidences (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  pre_analysis_id TEXT NOT NULL,
  candidate_application_id TEXT NOT NULL,

  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'candidate_field', 'job_opening_version', 'pre_interview_response',
      'behavioral_assessment_result', 'blueprint_version'
    )
  ),
  -- Taxonomia fechada de cinco valores (ADR-0023 + SPEC-023 v1.1, Sec 12): declared_data cobre
  -- autoria do candidato OU da Organization; origin_kind classifica natureza/proveniencia
  -- conceitual, source_type identifica a fonte tecnica exata -- nunca a mesma coisa.
  origin_kind TEXT NOT NULL CHECK (
    origin_kind IN ('declared_data', 'observed_evidence', 'instrument_result', 'human_evaluation', 'ai_inference')
  ),

  content_hash TEXT,
  -- Excecao obrigatoria (SPEC-023 Sec 4.5.1): candidate_field nunca possui versionamento
  -- formal -- snapshot_value preserva o valor exato enviado, nunca apenas seu hash.
  snapshot_value TEXT,

  -- Colunas discriminadas por source_type -- exatamente uma combinacao preenchida, todas as
  -- demais nulas (CHECK abaixo).
  candidate_field_name TEXT,
  job_opening_id TEXT,
  job_opening_version_id TEXT,
  pre_interview_id TEXT,
  pre_interview_response_id TEXT,
  behavioral_assessment_id TEXT,
  behavioral_assessment_result_id TEXT,
  blueprint_version_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, pre_analysis_id),

  FOREIGN KEY (organization_id, candidate_application_id, pre_analysis_id)
    REFERENCES pre_analyses (organization_id, candidate_application_id, id),

  -- origin_kind <-> source_type: mapeamento canonico fechado (Plano Tecnico Consolidado, item
  -- 13/14) -- torna human_evaluation/observed_evidence/ai_inference fisicamente inatingiveis
  -- nesta tabela, sem precisar de uma segunda lista redundante.
  CHECK (
    (source_type IN ('candidate_field', 'job_opening_version', 'pre_interview_response', 'blueprint_version')
      AND origin_kind = 'declared_data')
    OR (source_type = 'behavioral_assessment_result' AND origin_kind = 'instrument_result')
  ),

  -- Allow-list fechada de campos do Candidate (SPEC-023 Sec 10.1) -- nunca full_name,
  -- preferred_name, email, normalized_email, phone, secondary_phone, salary_expectation,
  -- work_authorization ou qualquer campo fora desta lista.
  CHECK (
    candidate_field_name IS NULL OR candidate_field_name IN (
      'professional_summary', 'experiences', 'education', 'certifications',
      'languages', 'declared_competencies', 'availability'
    )
  ),

  -- Exatamente uma combinacao de colunas discriminadas preenchida por source_type; todas as
  -- demais nulas.
  CHECK (
    (source_type = 'candidate_field'
      AND candidate_field_name IS NOT NULL AND snapshot_value IS NOT NULL
      AND job_opening_id IS NULL AND job_opening_version_id IS NULL
      AND pre_interview_id IS NULL AND pre_interview_response_id IS NULL
      AND behavioral_assessment_id IS NULL AND behavioral_assessment_result_id IS NULL
      AND blueprint_version_id IS NULL)
    OR (source_type = 'job_opening_version'
      AND job_opening_id IS NOT NULL AND job_opening_version_id IS NOT NULL
      AND candidate_field_name IS NULL AND snapshot_value IS NULL
      AND pre_interview_id IS NULL AND pre_interview_response_id IS NULL
      AND behavioral_assessment_id IS NULL AND behavioral_assessment_result_id IS NULL
      AND blueprint_version_id IS NULL)
    OR (source_type = 'pre_interview_response'
      AND pre_interview_id IS NOT NULL AND pre_interview_response_id IS NOT NULL
      AND candidate_field_name IS NULL AND snapshot_value IS NULL
      AND job_opening_id IS NULL AND job_opening_version_id IS NULL
      AND behavioral_assessment_id IS NULL AND behavioral_assessment_result_id IS NULL
      AND blueprint_version_id IS NULL)
    OR (source_type = 'behavioral_assessment_result'
      AND behavioral_assessment_id IS NOT NULL AND behavioral_assessment_result_id IS NOT NULL
      AND candidate_field_name IS NULL AND snapshot_value IS NULL
      AND job_opening_id IS NULL AND job_opening_version_id IS NULL
      AND pre_interview_id IS NULL AND pre_interview_response_id IS NULL
      AND blueprint_version_id IS NULL)
    OR (source_type = 'blueprint_version'
      AND blueprint_version_id IS NOT NULL
      AND candidate_field_name IS NULL AND snapshot_value IS NULL
      AND job_opening_id IS NULL AND job_opening_version_id IS NULL
      AND pre_interview_id IS NULL AND pre_interview_response_id IS NULL
      AND behavioral_assessment_id IS NULL AND behavioral_assessment_result_id IS NULL)
  ),

  -- job_opening_version: prova Organization + job_opening_id + job_opening_version_id exatos.
  FOREIGN KEY (organization_id, job_opening_id, job_opening_version_id)
    REFERENCES job_opening_versions (organization_id, job_opening_id, id),

  -- pre_interview_response: prova em dois saltos -- (a) o PreInterview referenciado pertence
  -- exatamente a esta CandidateApplication (nunca so a mesma Organization, Sec 10.4); (b) a
  -- resposta referenciada pertence exatamente a esse PreInterview.
  FOREIGN KEY (organization_id, candidate_application_id, pre_interview_id)
    REFERENCES pre_interviews (organization_id, candidate_application_id, id),
  FOREIGN KEY (organization_id, pre_interview_id, pre_interview_response_id)
    REFERENCES pre_interview_responses (organization_id, pre_interview_id, id),

  -- behavioral_assessment_result: prova que o Assessment referenciado pertence exatamente a
  -- esta CandidateApplication; a prova de que o Result referenciado pertence exatamente a esse
  -- Assessment (nunca a outro) e feita por trigger dedicado abaixo -- fronteira fisica declarada
  -- (FK simples nao alcanca essa composicao sem uma quinta UNIQUE aditiva nao aprovada nesta
  -- migration; ver `enforce_pre_analysis_evidence_behavioral_result_matches_assessment`).
  FOREIGN KEY (organization_id, candidate_application_id, behavioral_assessment_id)
    REFERENCES behavioral_assessments (organization_id, candidate_application_id, id),
  FOREIGN KEY (organization_id, behavioral_assessment_result_id)
    REFERENCES behavioral_assessment_results (organization_id, id),

  -- blueprint_version: escopo de Organization apenas (Blueprint nunca e amarrado a
  -- CandidateApplication, SPEC-023 Sec 10.1).
  FOREIGN KEY (organization_id, blueprint_version_id)
    REFERENCES organization_blueprint_versions (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_pre_analysis_evidences_pre_analysis
  ON pre_analysis_evidences (organization_id, pre_analysis_id);

-- Fronteira fisica/codigo declarada explicitamente (Plano Tecnico Consolidado, item 12): nao
-- existe FK composta unica que prove, sem UNIQUE aditiva extra, que
-- behavioral_assessment_result_id pertence exatamente a behavioral_assessment_id (e nao a outro
-- Assessment). Este trigger fecha essa lacuna fisicamente, no INSERT, sem exigir mais UNIQUEs
-- aditivas alem das quatro ja aprovadas.
CREATE OR REPLACE FUNCTION enforce_pre_analysis_evidence_behavioral_result_matches_assessment()
RETURNS TRIGGER AS $$
DECLARE
  v_actual_assessment_id TEXT;
BEGIN
  IF NEW.source_type <> 'behavioral_assessment_result' THEN
    RETURN NEW;
  END IF;

  SELECT behavioral_assessment_id INTO v_actual_assessment_id
  FROM behavioral_assessment_results
  WHERE id = NEW.behavioral_assessment_result_id;

  IF v_actual_assessment_id IS DISTINCT FROM NEW.behavioral_assessment_id THEN
    RAISE EXCEPTION 'pre_analysis_evidence_behavioral_result_assessment_mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_evidence_behavioral_result_match ON pre_analysis_evidences;
CREATE TRIGGER trg_pre_analysis_evidence_behavioral_result_match
BEFORE INSERT ON pre_analysis_evidences
FOR EACH ROW EXECUTE FUNCTION enforce_pre_analysis_evidence_behavioral_result_matches_assessment();

CREATE OR REPLACE FUNCTION prevent_pre_analysis_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pre_analysis_evidence_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_evidence_no_update ON pre_analysis_evidences;
CREATE TRIGGER trg_pre_analysis_evidence_no_update
BEFORE UPDATE ON pre_analysis_evidences
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_evidence_mutation();

DROP TRIGGER IF EXISTS trg_pre_analysis_evidence_no_delete ON pre_analysis_evidences;
CREATE TRIGGER trg_pre_analysis_evidence_no_delete
BEFORE DELETE ON pre_analysis_evidences
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_evidence_mutation();

-- ==========================================================================================
-- 3. pre_analysis_results -- envelope do resultado, um por PreAnalysis concluida com sucesso
--    (SPEC-023 Sec 4.6). Imutavel apos INSERT (mesmo padrao de behavioral_assessment_results).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_analysis_results (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  pre_analysis_id TEXT NOT NULL UNIQUE,

  ai_execution_id TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,

  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 4000),
  -- Obrigatorio, nunca nulo, mesmo quando todas as fontes estavam disponiveis (Sec 13.1.1).
  limitations TEXT NOT NULL CHECK (char_length(limitations) BETWEEN 1 AND 2000),
  disclaimer TEXT NOT NULL CHECK (char_length(disclaimer) >= 1),

  calculated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, pre_analysis_id),
  FOREIGN KEY (organization_id, pre_analysis_id)
    REFERENCES pre_analyses (organization_id, id)
);

CREATE OR REPLACE FUNCTION prevent_pre_analysis_result_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pre_analysis_result_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_result_no_update ON pre_analysis_results;
CREATE TRIGGER trg_pre_analysis_result_no_update
BEFORE UPDATE ON pre_analysis_results
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_result_mutation();

DROP TRIGGER IF EXISTS trg_pre_analysis_result_no_delete ON pre_analysis_results;
CREATE TRIGGER trg_pre_analysis_result_no_delete
BEFORE DELETE ON pre_analysis_results
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_result_mutation();

-- ==========================================================================================
-- 4. pre_analysis_findings -- achados individuais (SPEC-023 Sec 4.6). Categorias canonicas
--    fechadas (Sec 13.2) -- deliberadamente sem score/ranking/recomendacao/veredito/aprovacao.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_analysis_findings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  pre_analysis_result_id TEXT NOT NULL,
  -- Denormalizado deliberadamente: permite a FK composta da juncao (bloco 5) provar,
  -- fisicamente, que finding e evidencia referenciados pertencem a MESMA execucao.
  pre_analysis_id TEXT NOT NULL,

  category TEXT NOT NULL CHECK (
    category IN (
      'evidencia_aderencia', 'evidencia_nao_encontrada', 'ponto_forte',
      'ponto_atencao', 'possivel_risco', 'pergunta_sugerida_para_validacao'
    )
  ),
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  display_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, pre_analysis_id),

  FOREIGN KEY (organization_id, pre_analysis_result_id, pre_analysis_id)
    REFERENCES pre_analysis_results (organization_id, id, pre_analysis_id)
);

CREATE INDEX IF NOT EXISTS idx_pre_analysis_findings_result
  ON pre_analysis_findings (organization_id, pre_analysis_result_id, display_order);

CREATE OR REPLACE FUNCTION prevent_pre_analysis_finding_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pre_analysis_finding_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_finding_no_update ON pre_analysis_findings;
CREATE TRIGGER trg_pre_analysis_finding_no_update
BEFORE UPDATE ON pre_analysis_findings
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_finding_mutation();

DROP TRIGGER IF EXISTS trg_pre_analysis_finding_no_delete ON pre_analysis_findings;
CREATE TRIGGER trg_pre_analysis_finding_no_delete
BEFORE DELETE ON pre_analysis_findings
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_finding_mutation();

-- Constraint trigger deferido -- garante, no COMMIT, que todo finding possui ao menos uma
-- evidencia associada (SPEC-023 Sec 12/CA-017/CA-018). Amarrado a `pre_analysis_findings`
-- (AFTER INSERT), NUNCA a tabela de juncao -- um finding com zero evidencias nunca dispara
-- nenhum INSERT na juncao, entao um trigger la nunca capturaria esse caso (armadilha
-- identificada na revisao destrutiva, item 4).
CREATE OR REPLACE FUNCTION enforce_pre_analysis_finding_requires_evidence()
RETURNS TRIGGER AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pre_analysis_finding_evidences e WHERE e.pre_analysis_finding_id = NEW.id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'pre_analysis_finding_without_evidence';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_finding_requires_evidence ON pre_analysis_findings;
CREATE CONSTRAINT TRIGGER trg_pre_analysis_finding_requires_evidence
AFTER INSERT ON pre_analysis_findings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_pre_analysis_finding_requires_evidence();

-- ==========================================================================================
-- 5. pre_analysis_finding_evidences -- juncao N:N finding <-> evidencia (Sec 4.6/Sec 12). Nao
--    e entidade conceitual independente (Sec 32) -- e a sexta tabela fisica exigida pela
--    relacao "um ou mais PreAnalysisEvidence.id" por finding.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_analysis_finding_evidences (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  pre_analysis_finding_id TEXT NOT NULL,
  pre_analysis_evidence_id TEXT NOT NULL,
  -- Denormalizado deliberadamente, dos dois lados: prova fisica de que finding e evidencia
  -- pertencem a mesma pre_analysis_id, nunca apenas confiado ao Service (SPEC-023, teste 89).
  pre_analysis_id TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, pre_analysis_finding_id, pre_analysis_evidence_id),

  FOREIGN KEY (organization_id, pre_analysis_finding_id, pre_analysis_id)
    REFERENCES pre_analysis_findings (organization_id, id, pre_analysis_id),
  FOREIGN KEY (organization_id, pre_analysis_evidence_id, pre_analysis_id)
    REFERENCES pre_analysis_evidences (organization_id, id, pre_analysis_id)
);

CREATE INDEX IF NOT EXISTS idx_pre_analysis_finding_evidences_finding
  ON pre_analysis_finding_evidences (organization_id, pre_analysis_finding_id);
CREATE INDEX IF NOT EXISTS idx_pre_analysis_finding_evidences_evidence
  ON pre_analysis_finding_evidences (organization_id, pre_analysis_evidence_id);

CREATE OR REPLACE FUNCTION prevent_pre_analysis_finding_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pre_analysis_finding_evidence_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_finding_evidence_no_update ON pre_analysis_finding_evidences;
CREATE TRIGGER trg_pre_analysis_finding_evidence_no_update
BEFORE UPDATE ON pre_analysis_finding_evidences
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_finding_evidence_mutation();

DROP TRIGGER IF EXISTS trg_pre_analysis_finding_evidence_no_delete ON pre_analysis_finding_evidences;
CREATE TRIGGER trg_pre_analysis_finding_evidence_no_delete
BEFORE DELETE ON pre_analysis_finding_evidences
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_finding_evidence_mutation();

-- ==========================================================================================
-- 6. pre_analysis_events -- timeline de dominio imutavel (SPEC-023 Sec 4.7/Sec 29.1),
--    distinta de audit_events (auditoria transversal) e de ai_executions (telemetria tecnica).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_analysis_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  pre_analysis_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'requested', 'running', 'completed', 'failed', 'unavailable', 'cancelled',
      'reanalysis_requested', 'administrative_read', 'permission_denied',
      'cross_organization_access_denied', 'cross_candidature_reference_denied',
      'result_discarded_after_cancellation', 'reconciled_stale_requested',
      'reconciled_stale_running'
    )
  ),
  status_before TEXT CHECK (
    status_before IS NULL
    OR status_before IN ('requested', 'running', 'completed', 'failed', 'unavailable', 'cancelled')
  ),
  status_after TEXT CHECK (
    status_after IS NULL
    OR status_after IN ('requested', 'running', 'completed', 'failed', 'unavailable', 'cancelled')
  ),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (organization_id, pre_analysis_id)
    REFERENCES pre_analyses (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_pre_analysis_events_pre_analysis
  ON pre_analysis_events (organization_id, pre_analysis_id, created_at);

CREATE OR REPLACE FUNCTION prevent_pre_analysis_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pre_analysis_event_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_analysis_event_no_update ON pre_analysis_events;
CREATE TRIGGER trg_pre_analysis_event_no_update
BEFORE UPDATE ON pre_analysis_events
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_event_mutation();

DROP TRIGGER IF EXISTS trg_pre_analysis_event_no_delete ON pre_analysis_events;
CREATE TRIGGER trg_pre_analysis_event_no_delete
BEFORE DELETE ON pre_analysis_events
FOR EACH ROW EXECUTE FUNCTION prevent_pre_analysis_event_mutation();
