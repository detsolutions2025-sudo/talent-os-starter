-- Fase 23: hardening destrutivo de lifecycle fisico do Onboarding.
--
-- Corrige lacunas deixadas pela 0025 sem reescrever a migration ja aplicada:
-- 1. inserts fisicos de onboardings devem nascer em draft;
-- 2. inserts fisicos de tasks devem nascer em open;
-- 3. cancelamento direto a partir de draft nao pode preencher started_*;
-- 4. started_* fica imutavel depois que o onboarding saiu de draft;
-- 5. completion de task nunca pode ter autoria ambigua, inclusive por INSERT direto.

CREATE OR REPLACE FUNCTION enforce_onboarding_insert_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'onboarding_insert_must_be_draft';
  END IF;

  RETURN NEW;
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

  IF OLD.status = 'draft'
    AND NEW.status = 'cancelled'
    AND (NEW.started_at IS NOT NULL OR NEW.started_by_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'onboarding_cancelled_from_draft_cannot_be_started';
  END IF;

  IF OLD.status = 'in_progress'
    AND (
      OLD.started_at IS DISTINCT FROM NEW.started_at
      OR OLD.started_by_user_id IS DISTINCT FROM NEW.started_by_user_id
    ) THEN
    RAISE EXCEPTION 'onboarding_started_fields_immutable';
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

  IF NEW.status = 'completed'
    AND NEW.completed_by_membership_id IS NOT NULL
    AND NEW.completed_by_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'onboarding_task_completion_author_ambiguous';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' THEN
      RAISE EXCEPTION 'onboarding_task_insert_must_be_open';
    END IF;
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'onboarding_tasks'
      AND c.conname = 'onboarding_tasks_single_completion_author'
  ) THEN
    ALTER TABLE onboarding_tasks
      ADD CONSTRAINT onboarding_tasks_single_completion_author CHECK (
        NOT (
          completed_by_membership_id IS NOT NULL
          AND completed_by_user_id IS NOT NULL
        )
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_onboarding_insert_rules ON onboardings;
CREATE TRIGGER trg_onboarding_insert_rules
BEFORE INSERT ON onboardings
FOR EACH ROW EXECUTE FUNCTION enforce_onboarding_insert_rules();

