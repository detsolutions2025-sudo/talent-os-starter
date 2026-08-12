-- Fase 19 (SPEC-022 v1.0) - Perfil Comportamental.
--
-- Nenhum preambulo de ALTER TABLE aditivo e necessario aqui: os tres UNIQUE aditivos que esta
-- migration precisa reaproveitar (job_opening_versions, candidate_applications,
-- organization_blueprint_versions) ja foram adicionados pela migration 0019 (Fase 18) e
-- permanecem validos. `job_openings` ja possui `UNIQUE(organization_id, id)` desde a Fase 7.
--
-- 11 tabelas, na ordem de dependencia: behavioral_instruments, behavioral_instrument_versions,
-- behavioral_instrument_items, organization_behavioral_instrument_settings,
-- job_opening_behavioral_assessment_settings, behavioral_assessments,
-- behavioral_assessment_responses, behavioral_assessment_results,
-- behavioral_assessment_result_dimensions, behavioral_assessment_events,
-- behavioral_assessment_access_tokens.
--
-- Correcao final do Plano Tecnico (revisao destrutiva): toda integridade global/privado e de
-- coerencia instrumento-versao e FISICA (CHECK/UNIQUE/FOREIGN KEY composta/TRIGGER), nunca
-- apenas disciplina do repository. `methodology_key`/`calculation_method_version` pertencem
-- exclusivamente a `behavioral_instrument_versions` (nunca ao instrumento logico).

-- ==========================================================================================
-- 1. behavioral_instruments -- definicao logica do instrumento (global ou proprio).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS behavioral_instruments (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('platform', 'organization')),
  organization_id TEXT REFERENCES organizations(id),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 150),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- `scope` e o campo canonico de escopo -- nunca `organization_id IS NULL` sozinho.
  CHECK (
    (scope = 'platform' AND organization_id IS NULL)
    OR (scope = 'organization' AND organization_id IS NOT NULL)
  ),

  -- Habilitam FKs compostas discriminadas por escopo (itens 3, 5-7 do Plano Tecnico).
  UNIQUE (id, scope),
  UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_behavioral_instruments_scope_status
  ON behavioral_instruments (scope, status);
CREATE INDEX IF NOT EXISTS idx_behavioral_instruments_organization
  ON behavioral_instruments (organization_id);

-- Apenas Platform Admin cria/altera instrumento global; apenas owner/admin cria/altera
-- instrumento proprio -- autorizacao e responsabilidade do Service, nao desta migration.

CREATE OR REPLACE FUNCTION prevent_behavioral_instrument_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_instrument_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_instrument_no_delete ON behavioral_instruments;
CREATE TRIGGER trg_behavioral_instrument_no_delete
BEFORE DELETE ON behavioral_instruments
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_instrument_delete();

-- `scope`/`organization_id` nunca mudam depois de criado (mesmo principio de imutabilidade de
-- vinculo estrutural ja usado por toda a plataforma).
CREATE OR REPLACE FUNCTION prevent_behavioral_instrument_scope_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scope <> OLD.scope OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'behavioral_instrument_scope_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_instrument_scope_immutable ON behavioral_instruments;
CREATE TRIGGER trg_behavioral_instrument_scope_immutable
BEFORE UPDATE ON behavioral_instruments
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_instrument_scope_change();

-- ==========================================================================================
-- 2. behavioral_instrument_versions -- manifesto formal versionado (mirror de
--    organization_blueprint_versions, Fase 15/ADR-0022). `methodology_key` e
--    `calculation_method_version` vivem EXCLUSIVAMENTE aqui (correcao final vinculante).
--
--    Sem `organization_id` proprio: o escopo/tenant e sempre derivado, de forma inequivoca,
--    pela FK simples e nunca-nula a `behavioral_instruments` (Plano Tecnico, correcao final,
--    item 2) -- duplicar a coluna aqui nao traria nenhuma defesa adicional, porque o pai ja
--    tem seu proprio escopo fisicamente validado.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS behavioral_instrument_versions (
  id TEXT PRIMARY KEY,
  behavioral_instrument_id TEXT NOT NULL REFERENCES behavioral_instruments(id),
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  methodology_key TEXT NOT NULL CHECK (char_length(methodology_key) BETWEEN 1 AND 100),
  calculation_method_version TEXT NOT NULL CHECK (char_length(calculation_method_version) BETWEEN 1 AND 50),
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dimensions) = 'array'),
  instructions TEXT,
  candidate_result_visibility TEXT NOT NULL DEFAULT 'none'
    CHECK (candidate_result_visibility IN ('none', 'summary', 'full')),
  raw_response_owner_visibility TEXT NOT NULL DEFAULT 'visible'
    CHECK (raw_response_owner_visibility IN ('visible', 'restricted')),
  created_by_user_id TEXT REFERENCES users(id),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (behavioral_instrument_id, version_number),
  -- Habilita FK composta a partir de behavioral_assessments/settings (coerencia instrumento-versao).
  UNIQUE (behavioral_instrument_id, id),

  CHECK (status <> 'active' OR published_at IS NOT NULL),
  CHECK (status <> 'archived' OR archived_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_behavioral_instrument_versions_one_active
  ON behavioral_instrument_versions (behavioral_instrument_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_behavioral_instrument_versions_one_draft
  ON behavioral_instrument_versions (behavioral_instrument_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_behavioral_instrument_versions_instrument_status
  ON behavioral_instrument_versions (behavioral_instrument_id, status);

CREATE OR REPLACE FUNCTION prevent_behavioral_instrument_version_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_instrument_version_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_instrument_version_no_delete ON behavioral_instrument_versions;
CREATE TRIGGER trg_behavioral_instrument_version_no_delete
BEFORE DELETE ON behavioral_instrument_versions
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_instrument_version_delete();

-- `active` e imutavel em todo o conteudo, exceto a propria transicao para `archived`.
-- `archived` e terminal (nenhum UPDATE, nem mesmo re-arquivar). `draft` permanece livre para
-- edicao (fase de preparacao, antes de qualquer aplicacao poder existir -- item 18).
CREATE OR REPLACE FUNCTION prevent_behavioral_instrument_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'behavioral_instrument_version_final_state_immutable';
  END IF;

  IF OLD.status = 'active' THEN
    IF NEW.status <> 'archived' THEN
      RAISE EXCEPTION 'behavioral_instrument_version_active_immutable';
    END IF;
    IF NEW.behavioral_instrument_id <> OLD.behavioral_instrument_id
      OR NEW.version_number <> OLD.version_number
      OR NEW.methodology_key <> OLD.methodology_key
      OR NEW.calculation_method_version <> OLD.calculation_method_version
      OR NEW.dimensions IS DISTINCT FROM OLD.dimensions
      OR NEW.instructions IS DISTINCT FROM OLD.instructions
      OR NEW.candidate_result_visibility <> OLD.candidate_result_visibility
      OR NEW.raw_response_owner_visibility <> OLD.raw_response_owner_visibility
      OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'behavioral_instrument_version_active_immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_instrument_version_immutable ON behavioral_instrument_versions;
CREATE TRIGGER trg_behavioral_instrument_version_immutable
BEFORE UPDATE ON behavioral_instrument_versions
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_instrument_version_mutation();

-- ==========================================================================================
-- 3. behavioral_instrument_items -- itens cativos de UMA versao (nunca reutilizaveis entre
--    instrumentos/versoes -- Plano Tecnico, correcao final, item 2/6). So existem para
--    instrumentos aplicados internamente; `external_import` nunca possui itens.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS behavioral_instrument_items (
  id TEXT PRIMARY KEY,
  behavioral_instrument_version_id TEXT NOT NULL REFERENCES behavioral_instrument_versions(id),
  item_key TEXT NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 100),
  item_type TEXT NOT NULL CHECK (
    item_type IN ('open_text', 'single_choice', 'multiple_choice', 'yes_no', 'numeric', 'scale')
  ),
  prompt_text TEXT,
  external_item_reference TEXT,
  dimension_mapping JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dimension_mapping) = 'array'),
  scoring_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scoring_metadata) = 'object'),
  options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (behavioral_instrument_version_id, item_key),
  -- Habilita FK composta a partir de behavioral_assessment_responses (item/versao coerentes).
  UNIQUE (id, behavioral_instrument_version_id),

  -- Conteudo local ou apenas referencia externa (licenciamento) -- nunca os dois ausentes.
  CHECK (prompt_text IS NOT NULL OR external_item_reference IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_behavioral_instrument_items_version
  ON behavioral_instrument_items (behavioral_instrument_version_id, display_order);

CREATE OR REPLACE FUNCTION prevent_behavioral_instrument_item_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_instrument_item_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_instrument_item_no_delete ON behavioral_instrument_items;
CREATE TRIGGER trg_behavioral_instrument_item_no_delete
BEFORE DELETE ON behavioral_instrument_items
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_instrument_item_delete();

-- Item e imutavel assim que a versao-pai sai de `draft` (mesmo instante em que a versao
-- tambem se torna imutavel) -- consulta a linha-pai, mesmo padrao ja usado por
-- `enforce_pre_interview_attempt_order` (Fase 18) para checagem cross-row em trigger.
CREATE OR REPLACE FUNCTION prevent_behavioral_instrument_item_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_version_status TEXT;
BEGIN
  SELECT status INTO v_version_status
  FROM behavioral_instrument_versions
  WHERE id = COALESCE(NEW.behavioral_instrument_version_id, OLD.behavioral_instrument_version_id);

  IF v_version_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'behavioral_instrument_item_immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_instrument_item_immutable ON behavioral_instrument_items;
CREATE TRIGGER trg_behavioral_instrument_item_immutable
BEFORE UPDATE ON behavioral_instrument_items
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_instrument_item_mutation();

-- ==========================================================================================
-- 4. organization_behavioral_instrument_settings -- habilitacao de instrumento GLOBAL por
--    Organization (mirror exato de organization_ai_feature_settings, Fase 11/ADR-0017).
--    A FK composta contra (id, scope) torna FISICAMENTE impossivel referenciar aqui um
--    instrumento privado de qualquer Organization (Plano Tecnico, correcao final, item 3).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS organization_behavioral_instrument_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  behavioral_instrument_id TEXT NOT NULL,
  behavioral_instrument_scope TEXT NOT NULL DEFAULT 'platform' CHECK (behavioral_instrument_scope = 'platform'),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, behavioral_instrument_id),
  FOREIGN KEY (behavioral_instrument_id, behavioral_instrument_scope)
    REFERENCES behavioral_instruments (id, scope)
);

CREATE INDEX IF NOT EXISTS idx_org_behavioral_instrument_settings_org
  ON organization_behavioral_instrument_settings (organization_id);

-- ==========================================================================================
-- 5. job_opening_behavioral_assessment_settings -- preferencia corrente da vaga (instrumento
--    + versao a usar quando owner/admin criar uma aplicacao). NUNCA dispara aplicacao sozinha
--    (SPEC-022, secao 4.12/9.1). Sem tabela filha de selecao de itens -- o instrumento formal
--    ja define seus proprios itens, imutaveis por versao.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS job_opening_behavioral_assessment_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  job_opening_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  behavioral_instrument_id TEXT,
  behavioral_instrument_scope TEXT CHECK (behavioral_instrument_scope IN ('platform', 'organization')),
  behavioral_instrument_version_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, job_opening_id),
  FOREIGN KEY (organization_id, job_opening_id) REFERENCES job_openings (organization_id, id),
  FOREIGN KEY (behavioral_instrument_id, behavioral_instrument_version_id)
    REFERENCES behavioral_instrument_versions (behavioral_instrument_id, id),
  FOREIGN KEY (behavioral_instrument_id, behavioral_instrument_scope)
    REFERENCES behavioral_instruments (id, scope),

  CHECK (
    (enabled = FALSE)
    OR (enabled = TRUE AND behavioral_instrument_id IS NOT NULL AND behavioral_instrument_version_id IS NOT NULL)
  )
);

-- ==========================================================================================
-- 6. behavioral_assessments -- aplicacao concreta (instancia/tentativa). Nucleo da Fase 19.
--
--    Coerencia instrumento/versao/escopo/Organization e TOTALMENTE fisica (Plano Tecnico,
--    correcao final, itens 5-7): quatro restricoes combinadas tornam impossivel, no proprio
--    PostgreSQL, (a) combinar instrument_id de um instrumento com version_id de outro, ou
--    (b) aplicar instrumento privado de uma Organization dentro de CandidateApplication de
--    outra.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS behavioral_assessments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  candidate_application_id TEXT NOT NULL,
  job_opening_id TEXT NOT NULL,
  job_opening_version_id TEXT NOT NULL,
  blueprint_version_id TEXT,

  behavioral_instrument_id TEXT NOT NULL,
  behavioral_instrument_scope TEXT NOT NULL CHECK (behavioral_instrument_scope IN ('platform', 'organization')),
  behavioral_instrument_owner_organization_id TEXT,
  behavioral_instrument_version_id TEXT NOT NULL,

  origin_type TEXT NOT NULL CHECK (origin_type IN ('internal_application', 'external_import')),
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  previous_attempt_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'available', 'in_progress', 'completed', 'cancelled', 'expired')
  ),

  candidate_consent_id TEXT NOT NULL,

  created_source TEXT NOT NULL DEFAULT 'internal_user' CHECK (created_source = 'internal_user'),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),

  available_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id TEXT REFERENCES users(id),
  cancellation_reason TEXT CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) <= 1000),
  expired_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  external_provider TEXT,
  external_reference_id TEXT,
  applied_at_external TIMESTAMPTZ,
  completed_at_external TIMESTAMPTZ,
  imported_at TIMESTAMPTZ,
  imported_by_user_id TEXT REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, id),
  UNIQUE (id, behavioral_instrument_version_id),
  UNIQUE (organization_id, candidate_application_id, behavioral_instrument_id, id),
  UNIQUE (organization_id, candidate_application_id, behavioral_instrument_id, attempt_number),

  FOREIGN KEY (organization_id, candidate_application_id, job_opening_id, job_opening_version_id)
    REFERENCES candidate_applications (organization_id, id, job_opening_id, job_opening_version_id),
  FOREIGN KEY (organization_id, job_opening_id, job_opening_version_id)
    REFERENCES job_opening_versions (organization_id, job_opening_id, id),
  FOREIGN KEY (organization_id, blueprint_version_id)
    REFERENCES organization_blueprint_versions (organization_id, id),

  -- Instrumento <-> versao coerentes (item 6/7).
  FOREIGN KEY (behavioral_instrument_id, behavioral_instrument_version_id)
    REFERENCES behavioral_instrument_versions (behavioral_instrument_id, id),
  -- `scope` armazenado e sempre o escopo real do instrumento (nunca um valor forjado).
  FOREIGN KEY (behavioral_instrument_id, behavioral_instrument_scope)
    REFERENCES behavioral_instruments (id, scope),
  -- Quando privado, o "dono" armazenado e sempre o organization_id REAL do instrumento.
  FOREIGN KEY (behavioral_instrument_id, behavioral_instrument_owner_organization_id)
    REFERENCES behavioral_instruments (id, organization_id),
  -- ...e esse dono precisa ser exatamente a Organization desta propria aplicacao.
  CHECK (
    (behavioral_instrument_scope = 'platform' AND behavioral_instrument_owner_organization_id IS NULL)
    OR (behavioral_instrument_scope = 'organization' AND behavioral_instrument_owner_organization_id = organization_id)
  ),

  FOREIGN KEY (organization_id, candidate_application_id, behavioral_instrument_id, previous_attempt_id)
    REFERENCES behavioral_assessments (organization_id, candidate_application_id, behavioral_instrument_id, id),
  CHECK (previous_attempt_id IS NULL OR previous_attempt_id <> id),

  CHECK (status <> 'available' OR available_at IS NOT NULL),
  CHECK (status <> 'in_progress' OR started_at IS NOT NULL),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (
    status <> 'cancelled'
    OR (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND cancellation_reason IS NOT NULL)
  ),
  CHECK (status <> 'expired' OR (expired_at IS NOT NULL AND expires_at IS NOT NULL)),

  -- external_import nunca finge disponibilizacao/inicio internos (Plano Tecnico, item 34).
  CHECK (origin_type <> 'external_import' OR (available_at IS NULL AND started_at IS NULL)),

  -- Proveniencia externa completa quando origin_type=external_import, totalmente ausente
  -- quando internal_application.
  CHECK (
    origin_type <> 'external_import'
    OR (
      external_provider IS NOT NULL AND applied_at_external IS NOT NULL
      AND completed_at_external IS NOT NULL AND imported_at IS NOT NULL AND imported_by_user_id IS NOT NULL
    )
  ),
  CHECK (
    origin_type = 'external_import'
    OR (
      external_provider IS NULL AND external_reference_id IS NULL AND applied_at_external IS NULL
      AND completed_at_external IS NULL AND imported_at IS NULL AND imported_by_user_id IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_behavioral_assessments_one_operational
  ON behavioral_assessments (organization_id, candidate_application_id, behavioral_instrument_id)
  WHERE status IN ('draft', 'available', 'in_progress');

-- Reimportacao idempotente quando o provedor fornece identificador externo estavel (Plano
-- Tecnico, item 35) -- ausencia de identificador e limitacao registrada, nunca resolvida por
-- hash fragil do payload.
CREATE UNIQUE INDEX IF NOT EXISTS uq_behavioral_assessments_external_reference
  ON behavioral_assessments (organization_id, behavioral_instrument_id, external_provider, external_reference_id)
  WHERE origin_type = 'external_import' AND external_reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_behavioral_assessments_candidate_application
  ON behavioral_assessments (organization_id, candidate_application_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_behavioral_assessments_organization_status
  ON behavioral_assessments (organization_id, status);

CREATE OR REPLACE FUNCTION prevent_behavioral_assessment_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_assessment_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_no_delete ON behavioral_assessments;
CREATE TRIGGER trg_behavioral_assessment_no_delete
BEFORE DELETE ON behavioral_assessments
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_delete();

-- Campos de contexto imutaveis mesmo em estado operacional.
CREATE OR REPLACE FUNCTION prevent_behavioral_assessment_parent_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
    OR NEW.candidate_application_id <> OLD.candidate_application_id
    OR NEW.job_opening_id <> OLD.job_opening_id
    OR NEW.job_opening_version_id <> OLD.job_opening_version_id
    OR NEW.blueprint_version_id IS DISTINCT FROM OLD.blueprint_version_id
    OR NEW.behavioral_instrument_id <> OLD.behavioral_instrument_id
    OR NEW.behavioral_instrument_scope <> OLD.behavioral_instrument_scope
    OR NEW.behavioral_instrument_owner_organization_id IS DISTINCT FROM OLD.behavioral_instrument_owner_organization_id
    OR NEW.behavioral_instrument_version_id <> OLD.behavioral_instrument_version_id
    OR NEW.origin_type <> OLD.origin_type
    OR NEW.attempt_number <> OLD.attempt_number
    OR NEW.previous_attempt_id IS DISTINCT FROM OLD.previous_attempt_id
    OR NEW.candidate_consent_id <> OLD.candidate_consent_id
    OR NEW.created_source <> OLD.created_source
    OR NEW.created_by_user_id <> OLD.created_by_user_id THEN
    RAISE EXCEPTION 'behavioral_assessment_parent_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_parent_immutable ON behavioral_assessments;
CREATE TRIGGER trg_behavioral_assessment_parent_immutable
BEFORE UPDATE ON behavioral_assessments
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_parent_change();

-- Estado final -> imutavel por completo. Precisa disparar ANTES do trigger de transicao
-- (ordem alfabetica de nome de trigger: "final_immutable" < "transition").
CREATE OR REPLACE FUNCTION prevent_final_behavioral_assessment_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('completed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'behavioral_assessment_final_state_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_final_immutable ON behavioral_assessments;
CREATE TRIGGER trg_behavioral_assessment_final_immutable
BEFORE UPDATE ON behavioral_assessments
FOR EACH ROW EXECUTE FUNCTION prevent_final_behavioral_assessment_mutation();

-- State machine fisica. `internal_application` segue a matriz da SPEC-021 adaptada (draft ->
-- available -> in_progress -> completed/cancelled/expired). `external_import` nasce
-- diretamente em `completed` a partir de `draft`, na mesma operacao atomica (SPEC-022, secao
-- 7.2) -- unica transicao adicional liberada, e apenas para esse origin_type.
CREATE OR REPLACE FUNCTION enforce_behavioral_assessment_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'available' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'completed' AND NEW.origin_type = 'external_import' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'available' AND NEW.status IN ('in_progress', 'cancelled', 'expired') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'in_progress' AND NEW.status IN ('completed', 'cancelled', 'expired') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'behavioral_assessment_transition_invalid';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_transition ON behavioral_assessments;
CREATE TRIGGER trg_behavioral_assessment_transition
BEFORE UPDATE ON behavioral_assessments
FOR EACH ROW EXECUTE FUNCTION enforce_behavioral_assessment_transition();

CREATE OR REPLACE FUNCTION enforce_behavioral_assessment_attempt_order()
RETURNS TRIGGER AS $$
DECLARE
  previous_attempt_number INTEGER;
BEGIN
  IF NEW.previous_attempt_id IS NOT NULL THEN
    SELECT attempt_number INTO previous_attempt_number
    FROM behavioral_assessments
    WHERE organization_id = NEW.organization_id AND id = NEW.previous_attempt_id;

    IF previous_attempt_number IS NULL OR previous_attempt_number >= NEW.attempt_number THEN
      RAISE EXCEPTION 'behavioral_assessment_attempt_order_invalid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_attempt_order ON behavioral_assessments;
CREATE TRIGGER trg_behavioral_assessment_attempt_order
BEFORE INSERT ON behavioral_assessments
FOR EACH ROW EXECUTE FUNCTION enforce_behavioral_assessment_attempt_order();

-- Regra efetiva de utilizacao do instrumento (Plano Tecnico, correcao final, itens 3/5/17):
-- instrumento ativo + versao ativa sempre exigidos; quando global, a Organization precisa te-lo
-- habilitado explicitamente. O caso privado ja e garantido pelas FKs/CHECK acima. Nunca afeta
-- linha ja existente (so BEFORE INSERT) -- historico permanece valido mesmo apos
-- inativacao/arquivamento posteriores.
CREATE OR REPLACE FUNCTION enforce_behavioral_assessment_instrument_availability()
RETURNS TRIGGER AS $$
DECLARE
  v_instrument_status TEXT;
  v_version_status TEXT;
  v_enabled BOOLEAN;
BEGIN
  SELECT status INTO v_instrument_status FROM behavioral_instruments WHERE id = NEW.behavioral_instrument_id;
  SELECT status INTO v_version_status FROM behavioral_instrument_versions WHERE id = NEW.behavioral_instrument_version_id;

  IF v_instrument_status IS DISTINCT FROM 'active' OR v_version_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'behavioral_assessment_instrument_not_active';
  END IF;

  IF NEW.behavioral_instrument_scope = 'platform' THEN
    SELECT enabled INTO v_enabled
    FROM organization_behavioral_instrument_settings
    WHERE organization_id = NEW.organization_id AND behavioral_instrument_id = NEW.behavioral_instrument_id;

    IF v_enabled IS NOT TRUE THEN
      RAISE EXCEPTION 'behavioral_assessment_instrument_not_enabled';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_instrument_availability ON behavioral_assessments;
CREATE TRIGGER trg_behavioral_assessment_instrument_availability
BEFORE INSERT ON behavioral_assessments
FOR EACH ROW EXECUTE FUNCTION enforce_behavioral_assessment_instrument_availability();

-- ==========================================================================================
-- 7. behavioral_assessment_responses -- respostas do Candidate (so internal_application).
--    Item/versao sempre coerentes com a propria aplicacao (achado adicional da correcao
--    final, mesma classe de defesa dos itens 6/7).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS behavioral_assessment_responses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  behavioral_assessment_id TEXT NOT NULL,
  behavioral_instrument_version_id TEXT NOT NULL,
  behavioral_instrument_item_id TEXT NOT NULL,
  response_value JSONB NOT NULL,
  submitted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,

  UNIQUE (organization_id, behavioral_assessment_id, behavioral_instrument_item_id),

  FOREIGN KEY (organization_id, behavioral_assessment_id)
    REFERENCES behavioral_assessments (organization_id, id),
  -- A resposta so pode usar um item da MESMA versao congelada na aplicacao.
  FOREIGN KEY (behavioral_assessment_id, behavioral_instrument_version_id)
    REFERENCES behavioral_assessments (id, behavioral_instrument_version_id),
  FOREIGN KEY (behavioral_instrument_item_id, behavioral_instrument_version_id)
    REFERENCES behavioral_instrument_items (id, behavioral_instrument_version_id),

  CHECK ((submitted AND submitted_at IS NOT NULL) OR (NOT submitted AND submitted_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_behavioral_assessment_responses_assessment
  ON behavioral_assessment_responses (organization_id, behavioral_assessment_id);

CREATE OR REPLACE FUNCTION prevent_behavioral_assessment_response_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_assessment_response_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_response_no_delete ON behavioral_assessment_responses;
CREATE TRIGGER trg_behavioral_assessment_response_no_delete
BEFORE DELETE ON behavioral_assessment_responses
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_response_delete();

CREATE OR REPLACE FUNCTION prevent_final_behavioral_assessment_response_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.submitted THEN
    RAISE EXCEPTION 'behavioral_assessment_response_final_state_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_response_final_immutable ON behavioral_assessment_responses;
CREATE TRIGGER trg_behavioral_assessment_response_final_immutable
BEFORE UPDATE ON behavioral_assessment_responses
FOR EACH ROW EXECUTE FUNCTION prevent_final_behavioral_assessment_response_mutation();

-- ==========================================================================================
-- 8. behavioral_assessment_results -- um resultado por aplicacao concluida (calculado ou
--    importado). Politica de resumo validada fisicamente contra a versao (item 14-16).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS behavioral_assessment_results (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  behavioral_assessment_id TEXT NOT NULL UNIQUE,
  behavioral_instrument_version_id TEXT NOT NULL,
  calculation_method_version TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('calculated', 'imported')),
  summary_text TEXT CHECK (summary_text IS NULL OR char_length(summary_text) BETWEEN 1 AND 4000),
  calculated_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, behavioral_assessment_id)
    REFERENCES behavioral_assessments (organization_id, id),
  -- A versao do resultado precisa ser exatamente a mesma congelada na aplicacao.
  FOREIGN KEY (behavioral_assessment_id, behavioral_instrument_version_id)
    REFERENCES behavioral_assessments (id, behavioral_instrument_version_id),

  CHECK (
    (origin = 'calculated' AND calculated_at IS NOT NULL AND imported_at IS NULL)
    OR (origin = 'imported' AND imported_at IS NOT NULL AND calculated_at IS NULL)
  )
);

-- Politica de visibilidade `summary` exige `summary_text` -- valido para os dois `origin`
-- (calculado ou importado), porque ambos passam pelo mesmo INSERT.
CREATE OR REPLACE FUNCTION enforce_behavioral_assessment_result_summary_policy()
RETURNS TRIGGER AS $$
DECLARE
  v_visibility TEXT;
BEGIN
  SELECT candidate_result_visibility INTO v_visibility
  FROM behavioral_instrument_versions
  WHERE id = NEW.behavioral_instrument_version_id;

  IF v_visibility = 'summary' AND (NEW.summary_text IS NULL OR length(trim(NEW.summary_text)) = 0) THEN
    RAISE EXCEPTION 'behavioral_assessment_result_summary_required';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_result_summary_policy ON behavioral_assessment_results;
CREATE TRIGGER trg_behavioral_assessment_result_summary_policy
BEFORE INSERT ON behavioral_assessment_results
FOR EACH ROW EXECUTE FUNCTION enforce_behavioral_assessment_result_summary_policy();

CREATE OR REPLACE FUNCTION prevent_behavioral_assessment_result_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_assessment_result_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_result_no_update ON behavioral_assessment_results;
CREATE TRIGGER trg_behavioral_assessment_result_no_update
BEFORE UPDATE ON behavioral_assessment_results
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_result_mutation();

CREATE OR REPLACE FUNCTION prevent_behavioral_assessment_result_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_assessment_result_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_result_no_delete ON behavioral_assessment_results;
CREATE TRIGGER trg_behavioral_assessment_result_no_delete
BEFORE DELETE ON behavioral_assessment_results
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_result_delete();

-- ==========================================================================================
-- 9. behavioral_assessment_result_dimensions -- um valor por dimensao avaliada. Nunca
--    total_score/overall_score/fit_score/rank/recommendation/decision (Plano Tecnico, item
--    31) -- ausencia estrutural, nunca coluna proibida.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS behavioral_assessment_result_dimensions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  behavioral_assessment_result_id TEXT NOT NULL,
  dimension_code TEXT NOT NULL CHECK (char_length(dimension_code) BETWEEN 1 AND 100),
  label TEXT,
  raw_value JSONB,
  display_value TEXT,
  unit TEXT,
  range_min NUMERIC,
  range_max NUMERIC,
  interpretation_text TEXT CHECK (interpretation_text IS NULL OR char_length(interpretation_text) <= 2000),
  display_order INTEGER NOT NULL DEFAULT 0,

  UNIQUE (behavioral_assessment_result_id, dimension_code),

  FOREIGN KEY (organization_id, behavioral_assessment_result_id)
    REFERENCES behavioral_assessment_results (organization_id, id)
);

-- Cada dimension_code precisa existir no manifesto (`dimensions` JSONB) da versao usada pelo
-- resultado -- nunca uma dimensao inventada pelo calculador ou pelo payload externo.
CREATE OR REPLACE FUNCTION enforce_behavioral_assessment_result_dimension_manifest()
RETURNS TRIGGER AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM behavioral_assessment_results r
    JOIN behavioral_instrument_versions v ON v.id = r.behavioral_instrument_version_id
    WHERE r.id = NEW.behavioral_assessment_result_id
      AND v.dimensions @> jsonb_build_array(jsonb_build_object('code', NEW.dimension_code))
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'behavioral_assessment_result_dimension_not_in_manifest';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_result_dimension_manifest ON behavioral_assessment_result_dimensions;
CREATE TRIGGER trg_behavioral_assessment_result_dimension_manifest
BEFORE INSERT ON behavioral_assessment_result_dimensions
FOR EACH ROW EXECUTE FUNCTION enforce_behavioral_assessment_result_dimension_manifest();

-- Toda dimensao marcada `required: true` no manifesto precisa ter uma linha correspondente ao
-- final da transacao -- checagem de conjunto, so decidivel apos todas as linhas do resultado
-- terem sido inseridas; por isso constraint trigger DEFERRABLE INITIALLY DEFERRED (dispara no
-- COMMIT, nao a cada INSERT individual).
CREATE OR REPLACE FUNCTION enforce_behavioral_assessment_required_dimensions()
RETURNS TRIGGER AS $$
DECLARE
  v_missing BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM behavioral_instrument_versions v
    JOIN behavioral_assessment_results r ON r.behavioral_instrument_version_id = v.id
    CROSS JOIN LATERAL jsonb_array_elements(v.dimensions) AS dim
    WHERE r.id = NEW.behavioral_assessment_result_id
      AND (dim->>'required')::boolean IS TRUE
      AND NOT EXISTS (
        SELECT 1 FROM behavioral_assessment_result_dimensions d
        WHERE d.behavioral_assessment_result_id = r.id AND d.dimension_code = dim->>'code'
      )
  ) INTO v_missing;

  IF v_missing THEN
    RAISE EXCEPTION 'behavioral_assessment_required_dimension_missing';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_required_dimensions ON behavioral_assessment_result_dimensions;
CREATE CONSTRAINT TRIGGER trg_behavioral_assessment_required_dimensions
AFTER INSERT ON behavioral_assessment_result_dimensions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_behavioral_assessment_required_dimensions();

CREATE OR REPLACE FUNCTION prevent_behavioral_assessment_result_dimension_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_assessment_result_dimension_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_result_dimension_no_update ON behavioral_assessment_result_dimensions;
CREATE TRIGGER trg_behavioral_assessment_result_dimension_no_update
BEFORE UPDATE ON behavioral_assessment_result_dimensions
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_result_dimension_mutation();

DROP TRIGGER IF EXISTS trg_behavioral_assessment_result_dimension_no_delete ON behavioral_assessment_result_dimensions;
CREATE TRIGGER trg_behavioral_assessment_result_dimension_no_delete
BEFORE DELETE ON behavioral_assessment_result_dimensions
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_result_dimension_mutation();

-- ==========================================================================================
-- 10. behavioral_assessment_events -- timeline de dominio imutavel (distinta do audit log
--     geral -- Plano Tecnico, item 47).
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS behavioral_assessment_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  behavioral_assessment_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'created', 'available', 'started', 'response_saved', 'submitted', 'calculation_completed',
      'cancelled', 'expired', 'reopening_authorized', 'external_result_imported'
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
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (organization_id, behavioral_assessment_id)
    REFERENCES behavioral_assessments (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_behavioral_assessment_events_assessment
  ON behavioral_assessment_events (organization_id, behavioral_assessment_id, created_at);

CREATE OR REPLACE FUNCTION prevent_behavioral_assessment_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_assessment_event_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_event_no_update ON behavioral_assessment_events;
CREATE TRIGGER trg_behavioral_assessment_event_no_update
BEFORE UPDATE ON behavioral_assessment_events
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_event_mutation();

DROP TRIGGER IF EXISTS trg_behavioral_assessment_event_no_delete ON behavioral_assessment_events;
CREATE TRIGGER trg_behavioral_assessment_event_no_delete
BEFORE DELETE ON behavioral_assessment_events
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_event_mutation();

-- ==========================================================================================
-- 11. behavioral_assessment_access_tokens -- tokens opacos de acesso publico do Candidate
--     (so internal_application). Mesmos invariantes ja validados pela Fase 18: hash-only,
--     multiplos tokens simultaneos permitidos, revogacao explicita, sem exclusao fisica.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS behavioral_assessment_access_tokens (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  behavioral_assessment_id TEXT NOT NULL,
  token_hash TEXT NOT NULL CHECK (char_length(token_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,

  UNIQUE (token_hash),

  FOREIGN KEY (organization_id, behavioral_assessment_id)
    REFERENCES behavioral_assessments (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_behavioral_assessment_access_tokens_assessment
  ON behavioral_assessment_access_tokens (organization_id, behavioral_assessment_id);

CREATE OR REPLACE FUNCTION prevent_behavioral_assessment_access_token_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'behavioral_assessment_access_token_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_behavioral_assessment_access_token_no_delete ON behavioral_assessment_access_tokens;
CREATE TRIGGER trg_behavioral_assessment_access_token_no_delete
BEFORE DELETE ON behavioral_assessment_access_tokens
FOR EACH ROW EXECUTE FUNCTION prevent_behavioral_assessment_access_token_delete();
