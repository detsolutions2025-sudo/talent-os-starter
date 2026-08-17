-- Fase 24: OrganizationPerson e Employment (SPEC-025 v1.0).
--
-- Tres tabelas fisicas:
-- 1. organization_people
-- 2. employments
-- 3. employment_idempotency_keys
--
-- Sem Employee/Collaborator, sem events proprios, sem User/Membership automatico,
-- sem Onboarding employment_id e sem estruturas da Fase 25.

CREATE TABLE IF NOT EXISTS organization_people (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  preferred_name TEXT CHECK (preferred_name IS NULL OR char_length(preferred_name) <= 200),
  primary_email TEXT CHECK (
    primary_email IS NULL
    OR (char_length(primary_email) <= 320 AND primary_email = lower(primary_email))
  ),
  origin_candidate_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, origin_candidate_id)
    REFERENCES candidates (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_people_origin_candidate
  ON organization_people (organization_id, origin_candidate_id)
  WHERE origin_candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_people_organization
  ON organization_people (organization_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS employments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  organization_person_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'ended', 'cancelled')),
  origin_type TEXT NOT NULL CHECK (origin_type IN ('recruitment', 'administrative')),
  origin_reason TEXT NOT NULL CHECK (char_length(origin_reason) BETWEEN 1 AND 1000),
  origin_candidate_id TEXT,
  origin_candidate_application_id TEXT,
  origin_proposal_version_id TEXT,
  origin_job_opening_id TEXT,
  origin_job_opening_version_id TEXT,
  decision_at TIMESTAMPTZ,
  effective_start_date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  end_date DATE,
  ended_at TIMESTAMPTZ,
  end_reason TEXT CHECK (end_reason IS NULL OR char_length(end_reason) BETWEEN 1 AND 1000),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT CHECK (
    cancellation_reason IS NULL OR char_length(cancellation_reason) BETWEEN 1 AND 1000
  ),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  activated_by_user_id TEXT REFERENCES users(id),
  ended_by_user_id TEXT REFERENCES users(id),
  cancelled_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, organization_person_id)
    REFERENCES organization_people (organization_id, id),
  FOREIGN KEY (organization_id, origin_candidate_id)
    REFERENCES candidates (organization_id, id),
  FOREIGN KEY (organization_id, origin_candidate_application_id, origin_candidate_id)
    REFERENCES candidate_applications (organization_id, id, candidate_id),
  FOREIGN KEY (
    organization_id,
    origin_candidate_application_id,
    origin_job_opening_id,
    origin_job_opening_version_id
  )
    REFERENCES candidate_applications (
      organization_id,
      id,
      job_opening_id,
      job_opening_version_id
    ),
  FOREIGN KEY (organization_id, origin_candidate_application_id, origin_proposal_version_id)
    REFERENCES proposal_versions (organization_id, candidate_application_id, id),
  FOREIGN KEY (organization_id, origin_job_opening_id)
    REFERENCES job_openings (organization_id, id),
  FOREIGN KEY (organization_id, origin_job_opening_id, origin_job_opening_version_id)
    REFERENCES job_opening_versions (organization_id, job_opening_id, id),
  CONSTRAINT employments_origin_type_payload_check CHECK (
    (origin_type = 'recruitment'
      AND origin_candidate_id IS NOT NULL
      AND origin_candidate_application_id IS NOT NULL)
    OR
    (origin_type = 'administrative'
      AND origin_candidate_id IS NULL
      AND origin_candidate_application_id IS NULL
      AND origin_proposal_version_id IS NULL
      AND origin_job_opening_id IS NULL
      AND origin_job_opening_version_id IS NULL)
  ),
  CONSTRAINT employments_job_opening_pair_check CHECK (
    (origin_job_opening_id IS NULL AND origin_job_opening_version_id IS NULL)
    OR
    (origin_job_opening_id IS NOT NULL AND origin_job_opening_version_id IS NOT NULL)
  ),
  CONSTRAINT employments_status_lifecycle_check CHECK (
    (status = 'pending'
      AND started_at IS NULL
      AND activated_by_user_id IS NULL
      AND end_date IS NULL
      AND ended_at IS NULL
      AND ended_by_user_id IS NULL
      AND end_reason IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancellation_reason IS NULL)
    OR
    (status = 'active'
      AND started_at IS NOT NULL
      AND activated_by_user_id IS NOT NULL
      AND end_date IS NULL
      AND ended_at IS NULL
      AND ended_by_user_id IS NULL
      AND end_reason IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancellation_reason IS NULL)
    OR
    (status = 'ended'
      AND started_at IS NOT NULL
      AND activated_by_user_id IS NOT NULL
      AND end_date IS NOT NULL
      AND ended_at IS NOT NULL
      AND ended_by_user_id IS NOT NULL
      AND end_reason IS NOT NULL
      AND cancelled_at IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancellation_reason IS NULL
      AND end_date >= effective_start_date
      AND ended_at >= started_at)
    OR
    (status = 'cancelled'
      AND started_at IS NULL
      AND activated_by_user_id IS NULL
      AND end_date IS NULL
      AND ended_at IS NULL
      AND ended_by_user_id IS NULL
      AND end_reason IS NULL
      AND cancelled_at IS NOT NULL
      AND cancelled_by_user_id IS NOT NULL
      AND cancellation_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employments_one_non_final
  ON employments (organization_id, organization_person_id)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_employments_person
  ON employments (organization_id, organization_person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employments_status
  ON employments (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employments_recruitment_origin
  ON employments (organization_id, origin_candidate_application_id)
  WHERE origin_candidate_application_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS employment_idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation TEXT NOT NULL CHECK (
    operation IN (
      'create_person',
      'create_employment',
      'create_person_and_employment',
      'activate',
      'cancel',
      'end'
    )
  ),
  scope_id TEXT,
  key_hash TEXT NOT NULL CHECK (char_length(key_hash) = 64),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  result_resource_id TEXT,
  error_category TEXT CHECK (error_category IS NULL OR char_length(error_category) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  UNIQUE (organization_id, operation, scope_id, key_hash),
  CONSTRAINT employment_idempotency_keys_status_lifecycle_check CHECK (
    (status = 'completed' AND result_resource_id IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'failed' AND failed_at IS NOT NULL)
    OR (status = 'pending' AND completed_at IS NULL AND failed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_employment_idempotency_lookup
  ON employment_idempotency_keys (organization_id, operation, scope_id, key_hash);

CREATE OR REPLACE FUNCTION prevent_organization_person_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'organization_person_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_organization_person_invalid_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.organization_id <> NEW.organization_id
    OR OLD.origin_candidate_id IS DISTINCT FROM NEW.origin_candidate_id
    OR OLD.created_by_user_id <> NEW.created_by_user_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'organization_person_context_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_employment_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'employment_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_employment_insert_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'employment_insert_must_be_pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_employment_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.organization_id <> NEW.organization_id
    OR OLD.organization_person_id <> NEW.organization_person_id
    OR OLD.origin_type <> NEW.origin_type
    OR OLD.origin_candidate_id IS DISTINCT FROM NEW.origin_candidate_id
    OR OLD.origin_candidate_application_id IS DISTINCT FROM NEW.origin_candidate_application_id
    OR OLD.origin_proposal_version_id IS DISTINCT FROM NEW.origin_proposal_version_id
    OR OLD.origin_job_opening_id IS DISTINCT FROM NEW.origin_job_opening_id
    OR OLD.origin_job_opening_version_id IS DISTINCT FROM NEW.origin_job_opening_version_id
    OR OLD.created_by_user_id <> NEW.created_by_user_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'employment_context_immutable';
  END IF;

  IF OLD.status IN ('ended', 'cancelled') THEN
    RAISE EXCEPTION 'employment_final_immutable';
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('active', 'cancelled'))
    OR (OLD.status = 'active' AND NEW.status = 'ended')
  ) THEN
    RAISE EXCEPTION 'employment_invalid_status_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_employment_idempotency_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'employment_idempotency_key_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organization_person_no_delete ON organization_people;
CREATE TRIGGER trg_organization_person_no_delete
BEFORE DELETE ON organization_people
FOR EACH ROW EXECUTE FUNCTION prevent_organization_person_delete();

DROP TRIGGER IF EXISTS trg_organization_person_invalid_update ON organization_people;
CREATE TRIGGER trg_organization_person_invalid_update
BEFORE UPDATE ON organization_people
FOR EACH ROW EXECUTE FUNCTION prevent_organization_person_invalid_update();

DROP TRIGGER IF EXISTS trg_employment_no_delete ON employments;
CREATE TRIGGER trg_employment_no_delete
BEFORE DELETE ON employments
FOR EACH ROW EXECUTE FUNCTION prevent_employment_delete();

DROP TRIGGER IF EXISTS trg_employment_insert_rules ON employments;
CREATE TRIGGER trg_employment_insert_rules
BEFORE INSERT ON employments
FOR EACH ROW EXECUTE FUNCTION enforce_employment_insert_rules();

DROP TRIGGER IF EXISTS trg_employment_update_rules ON employments;
CREATE TRIGGER trg_employment_update_rules
BEFORE UPDATE ON employments
FOR EACH ROW EXECUTE FUNCTION enforce_employment_update_rules();

DROP TRIGGER IF EXISTS trg_employment_idempotency_no_delete ON employment_idempotency_keys;
CREATE TRIGGER trg_employment_idempotency_no_delete
BEFORE DELETE ON employment_idempotency_keys
FOR EACH ROW EXECUTE FUNCTION prevent_employment_idempotency_delete();

COMMENT ON TABLE organization_people IS 'Fase 24: identidade humana minima intra-Organization; sem lifecycle e sem dedupe por PII.';
COMMENT ON TABLE employments IS 'Fase 24: vinculo pos-contratacao historico; aggregate root para fases futuras.';
COMMENT ON TABLE employment_idempotency_keys IS 'Fase 24: idempotencia module-specific; nunca armazena chave bruta.';
