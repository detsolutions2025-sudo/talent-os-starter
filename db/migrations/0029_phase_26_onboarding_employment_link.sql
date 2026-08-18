-- Fase 26: integracao aditiva Onboarding -> Employment (SPEC-016 v1.1).
--
-- Unico delta fisico: uma coluna nullable em `onboardings`, um FK tenant-safe,
-- um indice unico parcial (cardinalidade 0..1 reversa) e a extensao das
-- triggers ja existentes desde a Fase 23 (insert/update rules).
--
-- Sem tabela nova. Sem alteracao de lifecycle de Employment. Sem backfill.

ALTER TABLE onboardings
  ADD COLUMN employment_id TEXT NULL;

ALTER TABLE onboardings
  ADD CONSTRAINT onboardings_organization_id_employment_id_fkey
  FOREIGN KEY (organization_id, employment_id)
  REFERENCES employments (organization_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboardings_employment_link
  ON onboardings (organization_id, employment_id)
  WHERE employment_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'onboarding_idempotency_keys_operation_check'
      AND t.relname = 'onboarding_idempotency_keys'
      AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE onboarding_idempotency_keys
      DROP CONSTRAINT onboarding_idempotency_keys_operation_check;
  END IF;

  ALTER TABLE onboarding_idempotency_keys
    ADD CONSTRAINT onboarding_idempotency_keys_operation_check
    CHECK (operation IN ('create', 'start', 'cancel', 'complete', 'link_employment'));
END $$;

CREATE OR REPLACE FUNCTION enforce_onboarding_insert_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'onboarding_insert_must_be_draft';
  END IF;

  IF NEW.employment_id IS NOT NULL THEN
    RAISE EXCEPTION 'onboarding_employment_link_not_allowed_on_insert';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_onboarding_update_rules()
RETURNS TRIGGER AS $$
DECLARE
  employment_status TEXT;
  employment_person_id TEXT;
  employment_origin_application_id TEXT;
  person_origin_candidate_id TEXT;
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

  -- Fase 26 (SPEC-016 v1.1 s47, s51): validacao de employment_id ocorre
  -- ANTES do atalho "mesmo status" abaixo, porque a operacao de vinculo
  -- tipicamente nao muda o status do Onboarding (permanece draft/in_progress).
  IF NEW.employment_id IS DISTINCT FROM OLD.employment_id THEN
    IF OLD.employment_id IS NOT NULL THEN
      -- write-once: um employment_id ja definido nunca troca nem volta a NULL.
      RAISE EXCEPTION 'onboarding_employment_link_immutable';
    END IF;

    IF NEW.employment_id IS NOT NULL THEN
      SELECT status, organization_person_id, origin_candidate_application_id
        INTO employment_status, employment_person_id, employment_origin_application_id
        FROM employments
        WHERE organization_id = NEW.organization_id
          AND id = NEW.employment_id
        FOR SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'onboarding_employment_not_found';
      END IF;

      IF employment_status NOT IN ('pending', 'active') THEN
        RAISE EXCEPTION 'onboarding_employment_not_eligible';
      END IF;

      IF employment_origin_application_id IS DISTINCT FROM NEW.candidate_application_id THEN
        SELECT origin_candidate_id
          INTO person_origin_candidate_id
          FROM organization_people
          WHERE organization_id = NEW.organization_id
            AND id = employment_person_id;

        IF NOT FOUND OR person_origin_candidate_id IS DISTINCT FROM NEW.candidate_id THEN
          RAISE EXCEPTION 'onboarding_employment_incompatible_provenance';
        END IF;
      END IF;
    END IF;
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

COMMENT ON COLUMN onboardings.employment_id IS 'Fase 26: vinculo tardio, explicito e imutavel a Employment; nullable para preservar historico (SPEC-016 v1.1).';
