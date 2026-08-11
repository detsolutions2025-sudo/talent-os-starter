-- Fase 18 - Pre-Entrevista Estruturada (SPEC-021 v1.0).
--
-- Sem IA, DISC, Perfil Comportamental, Pre-Analise Assistida ou Dossie Inteligente (fora de
-- escopo desta fase, ADR-0023). A Pre-Entrevista pertence exclusivamente a CandidateApplication
-- (ADR-0023, secao "Pre-Entrevista"; SPEC-012, RN-037) e nunca altera current_stage/
-- application_status automaticamente.
--
-- ==========================================================================================
-- 0. Ajustes aditivos a tabelas ja existentes (Plano Tecnico da Fase 18, correcao final,
--    itens 19/20/21) -- nunca remove nem enfraquece nenhuma constraint ja existente, apenas
--    adiciona UNIQUE compostas necessarias para que pre_interviews consiga, no banco, amarrar
--    job_opening_version_id ao job_opening_id exato e a CandidateApplication exata.
-- ==========================================================================================

ALTER TABLE job_opening_versions
  ADD CONSTRAINT uq_job_opening_versions_org_opening_id
  UNIQUE (organization_id, job_opening_id, id);

ALTER TABLE candidate_applications
  ADD CONSTRAINT uq_candidate_applications_org_id_opening_version
  UNIQUE (organization_id, id, job_opening_id, job_opening_version_id);

ALTER TABLE organization_blueprint_versions
  ADD CONSTRAINT uq_org_blueprint_versions_org_id
  UNIQUE (organization_id, id);

-- ==========================================================================================
-- 1. job_opening_pre_interview_settings -- configuracao corrente da Vaga (SPEC-021, secao
--    4.2). Mutavel, nunca historico (secao 4.2.1). Somente owner/admin escrevem.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS job_opening_pre_interview_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  job_opening_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, job_opening_id),
  FOREIGN KEY (organization_id, job_opening_id)
    REFERENCES job_openings (organization_id, id)
);

-- ==========================================================================================
-- 2. job_opening_pre_interview_question_settings -- perguntas da configuracao corrente.
--    Nunca copia texto/tipo/categoria -- apenas referencia question_catalog_items.id (SPEC-021,
--    secao 9.1). Confirmado fisicamente (Plano Tecnico, correcao final, item 3):
--    question_catalog_items.organization_id e NOT NULL em toda linha, inclusive origin =
--    'global' (migration 0007) -- a FK composta abaixo ja impede cross-Organization sem
--    trigger adicional.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS job_opening_pre_interview_question_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  settings_id TEXT NOT NULL,
  question_catalog_item_id TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, settings_id, question_catalog_item_id),
  UNIQUE (organization_id, settings_id, display_order),
  FOREIGN KEY (organization_id, settings_id)
    REFERENCES job_opening_pre_interview_settings (organization_id, id),
  FOREIGN KEY (organization_id, question_catalog_item_id)
    REFERENCES question_catalog_items (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_job_opening_pre_interview_question_settings_settings
  ON job_opening_pre_interview_question_settings (organization_id, settings_id, display_order);

-- ==========================================================================================
-- 3. pre_interviews -- instancia/tentativa (SPEC-021, secao 4.3). Pertence exclusivamente a
--    CandidateApplication (RN implicita SPEC-021 secao 4.3; ADR-0023).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_interviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  candidate_application_id TEXT NOT NULL,
  job_opening_id TEXT NOT NULL,
  job_opening_version_id TEXT NOT NULL,
  blueprint_version_id TEXT,
  previous_attempt_id TEXT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'available', 'in_progress', 'completed', 'cancelled', 'expired')
  ),
  created_source TEXT NOT NULL CHECK (
    created_source IN ('system_after_application', 'internal_user', 'administrative_retry')
  ),
  created_by_user_id TEXT REFERENCES users(id),
  available_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id TEXT REFERENCES users(id),
  cancellation_reason TEXT CHECK (
    cancellation_reason IS NULL OR char_length(cancellation_reason) <= 1000
  ),
  expired_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Plano Tecnico, correcao final, item 1: autoridade de serializacao de attempt_number e a
  -- linha da CandidateApplication (via findApplicationForUpdate), nunca um agregado desta
  -- propria tabela. UNIQUE abaixo e a defesa final do banco.
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, candidate_application_id, id),
  UNIQUE (organization_id, candidate_application_id, attempt_number),

  -- job_opening_id/job_opening_version_id copiados devem ser EXATAMENTE os ja imutaveis na
  -- CandidateApplication referenciada -- nunca uma combinacao escolhida a parte (Plano
  -- Tecnico, correcao final, item 20).
  FOREIGN KEY (organization_id, candidate_application_id, job_opening_id, job_opening_version_id)
    REFERENCES candidate_applications (organization_id, id, job_opening_id, job_opening_version_id),

  -- segunda barreira independente: a versao precisa pertencer exatamente a esta vaga (item 19).
  FOREIGN KEY (organization_id, job_opening_id, job_opening_version_id)
    REFERENCES job_opening_versions (organization_id, job_opening_id, id),

  -- Blueprint Version real (Fase 15): organization_blueprint_versions. Nullable -- SPEC-021
  -- secao 19 decide explicitamente que fica NULL quando nao ha Blueprint Version `active`
  -- resolvivel (item 21).
  FOREIGN KEY (organization_id, blueprint_version_id)
    REFERENCES organization_blueprint_versions (organization_id, id),

  -- previous_attempt_id precisa pertencer a MESMA CandidateApplication (item 16).
  FOREIGN KEY (organization_id, candidate_application_id, previous_attempt_id)
    REFERENCES pre_interviews (organization_id, candidate_application_id, id),

  -- nunca aponta para si mesma.
  CHECK (previous_attempt_id IS NULL OR previous_attempt_id <> id),

  CHECK (status <> 'available' OR available_at IS NOT NULL),
  CHECK (status <> 'in_progress' OR started_at IS NOT NULL),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (
    status <> 'cancelled'
    OR (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND cancellation_reason IS NOT NULL)
  ),
  CHECK (status <> 'expired' OR (expired_at IS NOT NULL AND expires_at IS NOT NULL)),

  -- autoria coerente com created_source (mesmo padrao da migration 0018).
  CHECK (
    (created_source = 'system_after_application' AND created_by_user_id IS NULL)
    OR (created_source IN ('internal_user', 'administrative_retry') AND created_by_user_id IS NOT NULL)
  )
);

-- Uma CandidateApplication nunca possui duas tentativas simultaneamente operacionais (SPEC-021
-- secao 23). draft entra na constraint porque e sempre transitorio, nunca commitado sozinho
-- fora da transacao de criacao (secao 5.1 / secao 12 do Plano Tecnico).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pre_interviews_one_operational
  ON pre_interviews (organization_id, candidate_application_id)
  WHERE status IN ('draft', 'available', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_pre_interviews_candidate_application
  ON pre_interviews (organization_id, candidate_application_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS idx_pre_interviews_organization_status
  ON pre_interviews (organization_id, status);

-- Imutabilidade fisica -- campos de contexto nunca mudam, em nenhum estado.
CREATE OR REPLACE FUNCTION prevent_pre_interview_parent_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
    OR NEW.candidate_application_id <> OLD.candidate_application_id
    OR NEW.job_opening_id <> OLD.job_opening_id
    OR NEW.job_opening_version_id <> OLD.job_opening_version_id
    OR NEW.blueprint_version_id IS DISTINCT FROM OLD.blueprint_version_id
    OR NEW.previous_attempt_id IS DISTINCT FROM OLD.previous_attempt_id
    OR NEW.attempt_number <> OLD.attempt_number
    OR NEW.created_source <> OLD.created_source
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'pre_interview_parent_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_interview_parent_immutable ON pre_interviews;
CREATE TRIGGER trg_pre_interview_parent_immutable
BEFORE UPDATE ON pre_interviews
FOR EACH ROW EXECUTE FUNCTION prevent_pre_interview_parent_change();

-- Estado final -> imutavel por completo (qualquer UPDATE, nao apenas das colunas de contexto).
CREATE OR REPLACE FUNCTION prevent_final_pre_interview_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('completed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'pre_interview_final_state_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_interview_final_immutable ON pre_interviews;
CREATE TRIGGER trg_pre_interview_final_immutable
BEFORE UPDATE ON pre_interviews
FOR EACH ROW EXECUTE FUNCTION prevent_final_pre_interview_mutation();

-- State machine fisica -- banco como defesa final (Service tambem valida, para mensagens de
-- dominio melhores). trg_pre_interview_final_immutable ja bloqueia UPDATE quando OLD.status ja
-- e final; este trigger valida as transicoes a partir de estados operacionais.
CREATE OR REPLACE FUNCTION enforce_pre_interview_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('available', 'cancelled'))
    OR (OLD.status = 'available' AND NEW.status IN ('in_progress', 'cancelled', 'expired'))
    OR (OLD.status = 'in_progress' AND NEW.status IN ('completed', 'cancelled', 'expired'))
  ) THEN
    RAISE EXCEPTION 'pre_interview_transition_invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_interview_transition ON pre_interviews;
CREATE TRIGGER trg_pre_interview_transition
BEFORE UPDATE ON pre_interviews
FOR EACH ROW EXECUTE FUNCTION enforce_pre_interview_transition();

-- Ordenacao de attempt_number na cadeia de previous_attempt_id -- CHECK nao pode ler outra
-- linha, por isso trigger (Plano Tecnico, correcao final, item 16).
CREATE OR REPLACE FUNCTION enforce_pre_interview_attempt_order()
RETURNS TRIGGER AS $$
DECLARE
  previous_attempt_number INTEGER;
BEGIN
  IF NEW.previous_attempt_id IS NOT NULL THEN
    SELECT attempt_number INTO previous_attempt_number
    FROM pre_interviews
    WHERE organization_id = NEW.organization_id AND id = NEW.previous_attempt_id;

    IF previous_attempt_number IS NULL OR previous_attempt_number >= NEW.attempt_number THEN
      RAISE EXCEPTION 'pre_interview_attempt_order_invalid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_interview_attempt_order ON pre_interviews;
CREATE TRIGGER trg_pre_interview_attempt_order
BEFORE INSERT ON pre_interviews
FOR EACH ROW EXECUTE FUNCTION enforce_pre_interview_attempt_order();

CREATE OR REPLACE FUNCTION prevent_pre_interview_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pre_interview_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_interview_no_delete ON pre_interviews;
CREATE TRIGGER trg_pre_interview_no_delete
BEFORE DELETE ON pre_interviews
FOR EACH ROW EXECUTE FUNCTION prevent_pre_interview_delete();

-- ==========================================================================================
-- 4. pre_interview_questions -- snapshot congelado por instancia (SPEC-021, secao 9.2/9.3).
--    Nunca editavel apos INSERT -- draft e sempre transitorio, nunca ha "roteiro" para ajustar
--    entre requisicoes (Plano Tecnico, correcao final, item 5/6).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_interview_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  pre_interview_id TEXT NOT NULL,
  question_catalog_item_id TEXT NOT NULL,
  snapshot_title TEXT NOT NULL CHECK (char_length(snapshot_title) BETWEEN 1 AND 200),
  snapshot_text TEXT NOT NULL CHECK (char_length(snapshot_text) BETWEEN 1 AND 4000),
  snapshot_type TEXT NOT NULL CHECK (
    snapshot_type IN (
      'open_text', 'long_text', 'single_choice', 'multiple_choice', 'yes_no',
      'numeric', 'scale', 'date', 'situational', 'behavioral', 'technical'
    )
  ),
  snapshot_category TEXT NOT NULL CHECK (
    snapshot_category IN (
      'general', 'technical', 'behavioral', 'situational', 'culture', 'leadership',
      'management', 'compliance', 'safety', 'screening', 'other'
    )
  ),
  snapshot_options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(snapshot_options) = 'array'),
  snapshot_settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot_settings) = 'object'),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  content_fingerprint TEXT NOT NULL CHECK (char_length(content_fingerprint) = 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, pre_interview_id, question_catalog_item_id),
  UNIQUE (organization_id, pre_interview_id, display_order),
  FOREIGN KEY (organization_id, pre_interview_id)
    REFERENCES pre_interviews (organization_id, id),
  FOREIGN KEY (organization_id, question_catalog_item_id)
    REFERENCES question_catalog_items (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_pre_interview_questions_pre_interview
  ON pre_interview_questions (organization_id, pre_interview_id, display_order);

CREATE OR REPLACE FUNCTION prevent_pre_interview_question_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pre_interview_question_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_interview_question_no_update ON pre_interview_questions;
CREATE TRIGGER trg_pre_interview_question_no_update
BEFORE UPDATE ON pre_interview_questions
FOR EACH ROW EXECUTE FUNCTION prevent_pre_interview_question_update();

DROP TRIGGER IF EXISTS trg_pre_interview_question_no_delete ON pre_interview_questions;
CREATE TRIGGER trg_pre_interview_question_no_delete
BEFORE DELETE ON pre_interview_questions
FOR EACH ROW EXECUTE FUNCTION prevent_pre_interview_delete();

-- ==========================================================================================
-- 5. pre_interview_responses -- respostas (SPEC-021, secao 10). `submitted` distingue
--    rascunho/parcial (secao 10.1) de submetida/final (secao 10.2).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_interview_responses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  pre_interview_id TEXT NOT NULL,
  pre_interview_question_id TEXT NOT NULL,
  response_value JSONB NOT NULL,
  submitted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, pre_interview_question_id),
  FOREIGN KEY (organization_id, pre_interview_id)
    REFERENCES pre_interviews (organization_id, id),
  FOREIGN KEY (organization_id, pre_interview_question_id)
    REFERENCES pre_interview_questions (organization_id, id),
  CHECK ((submitted AND submitted_at IS NOT NULL) OR (NOT submitted AND submitted_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_pre_interview_responses_pre_interview
  ON pre_interview_responses (organization_id, pre_interview_id);

DROP TRIGGER IF EXISTS trg_pre_interview_response_no_delete ON pre_interview_responses;
CREATE TRIGGER trg_pre_interview_response_no_delete
BEFORE DELETE ON pre_interview_responses
FOR EACH ROW EXECUTE FUNCTION prevent_pre_interview_delete();

-- Update permitido somente enquanto a instancia esta in_progress; bloqueado em qualquer estado
-- final (completed/cancelled/expired) -- mesma preferencia ja fixada no Plano Tecnico.
CREATE OR REPLACE FUNCTION prevent_final_pre_interview_response_mutation()
RETURNS TRIGGER AS $$
DECLARE
  current_status TEXT;
BEGIN
  SELECT status INTO current_status
  FROM pre_interviews
  WHERE organization_id = OLD.organization_id AND id = OLD.pre_interview_id;

  IF current_status IN ('completed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'pre_interview_response_final_state_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_interview_response_final_immutable ON pre_interview_responses;
CREATE TRIGGER trg_pre_interview_response_final_immutable
BEFORE UPDATE ON pre_interview_responses
FOR EACH ROW EXECUTE FUNCTION prevent_final_pre_interview_response_mutation();

-- ==========================================================================================
-- 6. pre_interview_access_tokens -- acesso publico do Candidate (SPEC-021, secao 25.1). Token
--    bruto nunca persistido -- apenas hash. Multiplos tokens `active` por instancia sao
--    permitidos (replay da candidatura publica emite token adicional, nunca revoga os
--    anteriores -- Plano Tecnico, correcao final, ponto 2).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_interview_access_tokens (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  pre_interview_id TEXT NOT NULL,
  token_hash TEXT NOT NULL CHECK (char_length(token_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (organization_id, id),
  UNIQUE (token_hash),
  FOREIGN KEY (organization_id, pre_interview_id)
    REFERENCES pre_interviews (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_pre_interview_access_tokens_pre_interview
  ON pre_interview_access_tokens (organization_id, pre_interview_id, status);

DROP TRIGGER IF EXISTS trg_pre_interview_access_token_no_delete ON pre_interview_access_tokens;
CREATE TRIGGER trg_pre_interview_access_token_no_delete
BEFORE DELETE ON pre_interview_access_tokens
FOR EACH ROW EXECUTE FUNCTION prevent_pre_interview_delete();

-- ==========================================================================================
-- 7. pre_interview_events -- historico imutavel (SPEC-021, secao 20/26). Distinto de
--    audit_events (auditoria de seguranca/compliance, ja existente em core) -- esta tabela e a
--    timeline de dominio, mesmo padrao ja praticado por interview_events.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS pre_interview_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  pre_interview_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'created', 'available', 'started', 'response_saved', 'submitted',
      'cancelled', 'expired', 'reopening_authorized', 'new_attempt_created',
      'access_token_rotated', 'additional_token_issued', 'settings_updated',
      'administrative_read'
    )
  ),
  status_before TEXT CHECK (
    status_before IS NULL
    OR status_before IN ('draft', 'available', 'in_progress', 'completed', 'cancelled', 'expired')
  ),
  status_after TEXT CHECK (
    status_after IS NULL
    OR status_after IN ('draft', 'available', 'in_progress', 'completed', 'cancelled', 'expired')
  ),
  actor_user_id TEXT REFERENCES users(id),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, pre_interview_id)
    REFERENCES pre_interviews (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_pre_interview_events_pre_interview
  ON pre_interview_events (organization_id, pre_interview_id, created_at ASC);

CREATE OR REPLACE FUNCTION prevent_pre_interview_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'pre_interview_event_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pre_interview_event_no_update ON pre_interview_events;
CREATE TRIGGER trg_pre_interview_event_no_update
BEFORE UPDATE ON pre_interview_events
FOR EACH ROW EXECUTE FUNCTION prevent_pre_interview_event_mutation();

DROP TRIGGER IF EXISTS trg_pre_interview_event_no_delete ON pre_interview_events;
CREATE TRIGGER trg_pre_interview_event_no_delete
BEFORE DELETE ON pre_interview_events
FOR EACH ROW EXECUTE FUNCTION prevent_pre_interview_event_mutation();
