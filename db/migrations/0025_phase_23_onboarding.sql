-- Fase 23: Onboarding (SPEC-016 v1.0).
--
-- Tres tabelas fisicas:
-- 1. onboardings
-- 2. onboarding_tasks
-- 3. onboarding_idempotency_keys
--
-- Sem templates, sem events proprios, sem documentos e sem Employee/Collaborator.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'memberships_organization_id_id_key'
      AND t.relname = 'memberships'
      AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE memberships
      ADD CONSTRAINT memberships_organization_id_id_key UNIQUE (organization_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS onboardings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  candidate_application_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  expected_person_start_date DATE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ,
  started_by_user_id TEXT REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  completed_by_user_id TEXT REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id TEXT REFERENCES users(id),
  cancellation_reason TEXT CHECK (
    cancellation_reason IS NULL OR char_length(cancellation_reason) <= 1000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, candidate_application_id),
  FOREIGN KEY (organization_id, candidate_application_id, candidate_id)
    REFERENCES candidate_applications (organization_id, id, candidate_id),
  FOREIGN KEY (organization_id, candidate_id)
    REFERENCES candidates (organization_id, id),
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

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  onboarding_id TEXT NOT NULL,
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
    cancellation_reason IS NULL OR char_length(cancellation_reason) <= 1000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, onboarding_id)
    REFERENCES onboardings (organization_id, id),
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

CREATE TABLE IF NOT EXISTS onboarding_idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation TEXT NOT NULL CHECK (operation IN ('create', 'start', 'cancel', 'complete')),
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

CREATE INDEX IF NOT EXISTS idx_onboardings_application
  ON onboardings (organization_id, candidate_application_id);

CREATE INDEX IF NOT EXISTS idx_onboardings_status
  ON onboardings (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_onboarding
  ON onboarding_tasks (organization_id, onboarding_id, display_order NULLS LAST, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_assignee
  ON onboarding_tasks (organization_id, assignee_membership_id, status)
  WHERE assignee_membership_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_idempotency_lookup
  ON onboarding_idempotency_keys (organization_id, operation, scope_id, key_hash);

CREATE OR REPLACE FUNCTION prevent_onboarding_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'onboarding_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_onboarding_task_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'onboarding_task_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_onboarding_idempotency_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'onboarding_idempotency_key_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_onboarding_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.organization_id <> NEW.organization_id
    OR OLD.candidate_application_id <> NEW.candidate_application_id
    OR OLD.candidate_id <> NEW.candidate_id
    OR OLD.created_by_user_id <> NEW.created_by_user_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'onboarding_parent_immutable';
  END IF;

  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'onboarding_final_immutable';
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('in_progress', 'cancelled'))
    OR (OLD.status = 'in_progress' AND NEW.status IN ('completed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'onboarding_invalid_status_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_onboarding_task_write_rules()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status
    INTO parent_status
    FROM onboardings
    WHERE organization_id = NEW.organization_id
      AND id = NEW.onboarding_id;

  IF parent_status IS NULL THEN
    RAISE EXCEPTION 'onboarding_parent_not_found';
  END IF;

  IF parent_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'onboarding_parent_final';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF parent_status = 'in_progress' AND NEW.creation_reason IS NULL THEN
      RAISE EXCEPTION 'onboarding_task_creation_reason_required';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.organization_id <> NEW.organization_id
    OR OLD.onboarding_id <> NEW.onboarding_id
    OR OLD.created_by_user_id <> NEW.created_by_user_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'onboarding_task_parent_immutable';
  END IF;

  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'onboarding_task_final_immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    OLD.status = 'open' AND NEW.status IN ('completed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'onboarding_task_invalid_status_transition';
  END IF;

  IF NEW.status = 'completed'
    AND NEW.completed_by_membership_id IS NOT NULL
    AND NEW.completed_by_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'onboarding_task_completion_author_ambiguous';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_no_delete ON onboardings;
CREATE TRIGGER trg_onboarding_no_delete
BEFORE DELETE ON onboardings
FOR EACH ROW EXECUTE FUNCTION prevent_onboarding_delete();

DROP TRIGGER IF EXISTS trg_onboarding_task_no_delete ON onboarding_tasks;
CREATE TRIGGER trg_onboarding_task_no_delete
BEFORE DELETE ON onboarding_tasks
FOR EACH ROW EXECUTE FUNCTION prevent_onboarding_task_delete();

DROP TRIGGER IF EXISTS trg_onboarding_idempotency_no_delete ON onboarding_idempotency_keys;
CREATE TRIGGER trg_onboarding_idempotency_no_delete
BEFORE DELETE ON onboarding_idempotency_keys
FOR EACH ROW EXECUTE FUNCTION prevent_onboarding_idempotency_delete();

DROP TRIGGER IF EXISTS trg_onboarding_update_rules ON onboardings;
CREATE TRIGGER trg_onboarding_update_rules
BEFORE UPDATE ON onboardings
FOR EACH ROW EXECUTE FUNCTION enforce_onboarding_update_rules();

DROP TRIGGER IF EXISTS trg_onboarding_task_insert_rules ON onboarding_tasks;
CREATE TRIGGER trg_onboarding_task_insert_rules
BEFORE INSERT ON onboarding_tasks
FOR EACH ROW EXECUTE FUNCTION enforce_onboarding_task_write_rules();

DROP TRIGGER IF EXISTS trg_onboarding_task_update_rules ON onboarding_tasks;
CREATE TRIGGER trg_onboarding_task_update_rules
BEFORE UPDATE ON onboarding_tasks
FOR EACH ROW EXECUTE FUNCTION enforce_onboarding_task_write_rules();

COMMENT ON TABLE onboardings IS 'Fase 23: checklist interno de preparacao de entrada; sem PII duplicada.';
COMMENT ON TABLE onboarding_tasks IS 'Fase 23: tarefas materializadas do checklist; sem templates/events proprios.';
COMMENT ON TABLE onboarding_idempotency_keys IS 'Fase 23: idempotencia module-specific; nunca armazena chave bruta.';
