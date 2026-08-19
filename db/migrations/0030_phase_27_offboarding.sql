-- Fase 27: Offboarding (SPEC-026 v1.0).
--
-- Tres tabelas fisicas:
-- 1. offboardings
-- 2. offboarding_tasks
-- 3. offboarding_idempotency_keys
--
-- Aggregate proprio pendurado em Employment (SPEC-025 s3.2 ja antecipa Offboarding como
-- capacidade futura apoiada em Employment). employment_id e NOT NULL desde o inicio -- ao
-- contrario de onboardings.employment_id (Fase 26), Offboarding nasce depois de Employment ja
-- existir, sem passivo historico a preservar (SPEC-026 s6).
--
-- Zero alteracao em employments: nenhuma coluna, constraint ou trigger nesta migration toca a
-- tabela `employments`. Diferente da Fase 25 (trg_reconcile_development_plans_on_employment_end),
-- Offboarding nao precisa fechar-se quando Employment termina, porque `ended` e um dos dois
-- estados elegiveis para toda a operacao funcional de Offboarding (SPEC-026 s8/s9) -- a
-- validacao de elegibilidade de Employment (active/ended) e feita por leitura (FOR SHARE) dentro
-- da transacao de aplicacao e reforcada, em profundidade, por uma trigger em `offboardings` que
-- LE `employments` (nunca escreve nela).

CREATE TABLE IF NOT EXISTS offboardings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  employment_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  exit_category TEXT CHECK (
    exit_category IS NULL
    OR exit_category IN (
      'voluntary_resignation',
      'involuntary_termination',
      'end_of_contract',
      'mutual_agreement',
      'other_minimized'
    )
  ),
  expected_last_day DATE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ,
  started_by_user_id TEXT REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  completed_by_user_id TEXT REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id TEXT REFERENCES users(id),
  cancellation_reason TEXT CHECK (
    cancellation_reason IS NULL OR char_length(cancellation_reason) BETWEEN 1 AND 1000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, employment_id)
    REFERENCES employments (organization_id, id),
  CHECK (
    (status = 'draft'
      AND started_at IS NULL
      AND started_by_user_id IS NULL
      AND completed_at IS NULL
      AND completed_by_user_id IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancellation_reason IS NULL)
    OR
    (status = 'in_progress'
      AND started_at IS NOT NULL
      AND started_by_user_id IS NOT NULL
      AND completed_at IS NULL
      AND completed_by_user_id IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancellation_reason IS NULL)
    OR
    (status = 'completed'
      AND started_at IS NOT NULL
      AND started_by_user_id IS NOT NULL
      AND completed_at IS NOT NULL
      AND completed_by_user_id IS NOT NULL
      AND cancelled_at IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancellation_reason IS NULL)
    OR
    (status = 'cancelled'
      AND completed_at IS NULL
      AND completed_by_user_id IS NULL
      AND cancelled_at IS NOT NULL
      AND cancelled_by_user_id IS NOT NULL
      AND cancellation_reason IS NOT NULL)
  )
);

-- SPEC-026 s14.1: no maximo um Offboarding nao-final (draft/in_progress) por Employment. Indice
-- parcial -- linhas completed/cancelled ficam fora do indice, entao um novo Offboarding para o
-- mesmo Employment e sempre permitido depois que o anterior atinge estado final.
CREATE UNIQUE INDEX IF NOT EXISTS idx_offboardings_one_non_final
  ON offboardings (organization_id, employment_id)
  WHERE status IN ('draft', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_offboardings_employment
  ON offboardings (organization_id, employment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offboardings_status
  ON offboardings (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS offboarding_tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  offboarding_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'cancelled')),
  assignee_membership_id TEXT,
  due_at TIMESTAMPTZ,
  display_order INTEGER,
  creation_reason TEXT CHECK (creation_reason IS NULL OR char_length(creation_reason) <= 1000),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  completed_by_membership_id TEXT,
  completed_by_user_id TEXT REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id TEXT REFERENCES users(id),
  cancellation_reason TEXT CHECK (
    cancellation_reason IS NULL OR char_length(cancellation_reason) BETWEEN 1 AND 1000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, offboarding_id)
    REFERENCES offboardings (organization_id, id),
  FOREIGN KEY (organization_id, assignee_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, completed_by_membership_id)
    REFERENCES memberships (organization_id, id),
  CHECK (
    (status = 'open'
      AND completed_at IS NULL
      AND completed_by_membership_id IS NULL
      AND completed_by_user_id IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancellation_reason IS NULL)
    OR
    (status = 'completed'
      AND completed_at IS NOT NULL
      AND (
        completed_by_membership_id IS NOT NULL
        OR completed_by_user_id IS NOT NULL
      )
      AND cancelled_at IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancellation_reason IS NULL)
    OR
    (status = 'cancelled'
      AND completed_at IS NULL
      AND completed_by_membership_id IS NULL
      AND completed_by_user_id IS NULL
      AND cancelled_at IS NOT NULL
      AND cancelled_by_user_id IS NOT NULL
      AND cancellation_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_offboarding
  ON offboarding_tasks (organization_id, offboarding_id, display_order NULLS LAST, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_assignee
  ON offboarding_tasks (organization_id, assignee_membership_id, status)
  WHERE assignee_membership_id IS NOT NULL;

-- SPEC-026 s23: as 8 operacoes mutaveis exigem Idempotency-Key -- diferente do precedente de
-- Onboarding (Fase 23), que nao exige chave para as 4 operacoes de task. Aqui, add_task, assign,
-- task_complete e task_cancel tambem sao operacoes idempotentes de primeira classe.
CREATE TABLE IF NOT EXISTS offboarding_idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation TEXT NOT NULL CHECK (
    operation IN (
      'create',
      'start',
      'add_task',
      'assign',
      'task_complete',
      'task_cancel',
      'complete',
      'cancel'
    )
  ),
  scope_id TEXT,
  key_hash TEXT NOT NULL CHECK (char_length(key_hash) = 64),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  result_resource_id TEXT,
  failure_category TEXT CHECK (failure_category IS NULL OR char_length(failure_category) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  UNIQUE (organization_id, operation, scope_id, key_hash),
  CHECK (
    (status = 'completed' AND result_resource_id IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'failed' AND failed_at IS NOT NULL)
    OR (status = 'pending' AND completed_at IS NULL AND failed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_offboarding_idempotency_lookup
  ON offboarding_idempotency_keys (organization_id, operation, scope_id, key_hash);

CREATE OR REPLACE FUNCTION prevent_offboarding_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'offboarding_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_offboarding_task_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'offboarding_task_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_offboarding_idempotency_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'offboarding_idempotency_key_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

-- SPEC-026 s8: CREATE Offboarding exige Employment `active` ou `ended` -- nunca `pending` nem
-- `cancelled`. Esta trigger LE `employments` (defesa em profundidade, alem da revalidacao em
-- aplicacao); ela nunca ESCREVE em `employments` e nao e instalada em `employments`.
CREATE OR REPLACE FUNCTION enforce_offboarding_insert_rules()
RETURNS TRIGGER AS $$
DECLARE
  employment_status TEXT;
BEGIN
  IF NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'offboarding_insert_must_be_draft';
  END IF;

  SELECT status
    INTO employment_status
    FROM employments
    WHERE organization_id = NEW.organization_id
      AND id = NEW.employment_id;

  IF employment_status IS NULL THEN
    RAISE EXCEPTION 'offboarding_employment_not_found';
  END IF;

  IF employment_status NOT IN ('active', 'ended') THEN
    RAISE EXCEPTION 'offboarding_employment_not_eligible';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_offboarding_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.organization_id <> NEW.organization_id
    OR OLD.employment_id <> NEW.employment_id
    OR OLD.created_by_user_id <> NEW.created_by_user_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'offboarding_parent_immutable';
  END IF;

  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'offboarding_final_immutable';
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('in_progress', 'cancelled'))
    OR (OLD.status = 'in_progress' AND NEW.status IN ('completed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'offboarding_invalid_status_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_offboarding_task_write_rules()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status
    INTO parent_status
    FROM offboardings
    WHERE organization_id = NEW.organization_id
      AND id = NEW.offboarding_id;

  IF parent_status IS NULL THEN
    RAISE EXCEPTION 'offboarding_parent_not_found';
  END IF;

  IF parent_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'offboarding_parent_final';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF parent_status = 'in_progress' AND NEW.creation_reason IS NULL THEN
      RAISE EXCEPTION 'offboarding_task_creation_reason_required';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.organization_id <> NEW.organization_id
    OR OLD.offboarding_id <> NEW.offboarding_id
    OR OLD.created_by_user_id <> NEW.created_by_user_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'offboarding_task_parent_immutable';
  END IF;

  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'offboarding_task_final_immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    OLD.status = 'open' AND NEW.status IN ('completed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'offboarding_task_invalid_status_transition';
  END IF;

  IF NEW.status = 'completed'
    AND NEW.completed_by_membership_id IS NOT NULL
    AND NEW.completed_by_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'offboarding_task_completion_author_ambiguous';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_offboarding_no_delete ON offboardings;
CREATE TRIGGER trg_offboarding_no_delete
BEFORE DELETE ON offboardings
FOR EACH ROW EXECUTE FUNCTION prevent_offboarding_delete();

DROP TRIGGER IF EXISTS trg_offboarding_task_no_delete ON offboarding_tasks;
CREATE TRIGGER trg_offboarding_task_no_delete
BEFORE DELETE ON offboarding_tasks
FOR EACH ROW EXECUTE FUNCTION prevent_offboarding_task_delete();

DROP TRIGGER IF EXISTS trg_offboarding_idempotency_no_delete ON offboarding_idempotency_keys;
CREATE TRIGGER trg_offboarding_idempotency_no_delete
BEFORE DELETE ON offboarding_idempotency_keys
FOR EACH ROW EXECUTE FUNCTION prevent_offboarding_idempotency_delete();

DROP TRIGGER IF EXISTS trg_offboarding_insert_rules ON offboardings;
CREATE TRIGGER trg_offboarding_insert_rules
BEFORE INSERT ON offboardings
FOR EACH ROW EXECUTE FUNCTION enforce_offboarding_insert_rules();

DROP TRIGGER IF EXISTS trg_offboarding_update_rules ON offboardings;
CREATE TRIGGER trg_offboarding_update_rules
BEFORE UPDATE ON offboardings
FOR EACH ROW EXECUTE FUNCTION enforce_offboarding_update_rules();

DROP TRIGGER IF EXISTS trg_offboarding_task_insert_rules ON offboarding_tasks;
CREATE TRIGGER trg_offboarding_task_insert_rules
BEFORE INSERT ON offboarding_tasks
FOR EACH ROW EXECUTE FUNCTION enforce_offboarding_task_write_rules();

DROP TRIGGER IF EXISTS trg_offboarding_task_update_rules ON offboarding_tasks;
CREATE TRIGGER trg_offboarding_task_update_rules
BEFORE UPDATE ON offboarding_tasks
FOR EACH ROW EXECUTE FUNCTION enforce_offboarding_task_write_rules();

COMMENT ON TABLE offboardings IS 'Fase 27: processo operacional de saida; aggregate proprio pendurado em Employment; zero mutacao de User/Membership.';
COMMENT ON TABLE offboarding_tasks IS 'Fase 27: tarefas materializadas do processo de saida; sem templates/events proprios.';
COMMENT ON TABLE offboarding_idempotency_keys IS 'Fase 27: idempotencia module-specific cobrindo as 8 operacoes mutaveis; nunca armazena chave bruta.';
