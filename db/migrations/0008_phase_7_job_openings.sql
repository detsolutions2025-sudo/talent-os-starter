CREATE TABLE IF NOT EXISTS job_openings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 150),
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paused', 'closed', 'cancelled')),
  organizational_unit_id TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  public_show_salary BOOLEAN NOT NULL DEFAULT FALSE,
  public_slug TEXT,
  public_published_at TIMESTAMPTZ,
  public_unpublished_at TIMESTAMPTZ,
  application_deadline TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, normalized_code),
  FOREIGN KEY (organization_id, organizational_unit_id)
    REFERENCES organizational_units (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_openings_public_slug
  ON job_openings (public_slug)
  WHERE public_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_openings_organization_id
  ON job_openings (organization_id);

CREATE INDEX IF NOT EXISTS idx_job_openings_status
  ON job_openings (status);

CREATE INDEX IF NOT EXISTS idx_job_openings_public
  ON job_openings (is_public, status, application_deadline);

CREATE TABLE IF NOT EXISTS job_opening_versions (
  id TEXT PRIMARY KEY,
  job_opening_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  version_number INTEGER,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  job_profile_version_id TEXT NOT NULL,
  public_title TEXT NOT NULL DEFAULT '' CHECK (char_length(public_title) <= 150),
  description TEXT NOT NULL DEFAULT '',
  responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(responsibilities) = 'array'),
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(requirements) = 'array'),
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(benefits) = 'array'),
  location JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(location) = 'object'),
  work_model TEXT NOT NULL CHECK (work_model IN ('onsite', 'hybrid', 'remote', 'flexible')),
  work_schedule JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(work_schedule) = 'object'),
  salary_range JSONB,
  positions_count INTEGER NOT NULL CHECK (positions_count BETWEEN 1 AND 1000),
  expected_start_date TIMESTAMPTZ,
  internal_instructions TEXT NOT NULL DEFAULT '',
  public_instructions TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  published_by_user_id TEXT REFERENCES users(id),
  discarded_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ,
  UNIQUE (organization_id, id),
  CHECK (
    (status = 'draft' AND version_number IS NULL)
    OR (status IN ('published', 'archived') AND version_number IS NOT NULL)
  ),
  FOREIGN KEY (organization_id, job_opening_id)
    REFERENCES job_openings (organization_id, id),
  FOREIGN KEY (organization_id, job_profile_version_id)
    REFERENCES job_profile_versions (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_opening_versions_number
  ON job_opening_versions (job_opening_id, version_number)
  WHERE version_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_opening_versions_published
  ON job_opening_versions (job_opening_id)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_opening_versions_active_draft
  ON job_opening_versions (job_opening_id)
  WHERE status = 'draft' AND discarded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_opening_versions_organization_id
  ON job_opening_versions (organization_id);

CREATE INDEX IF NOT EXISTS idx_job_opening_versions_job_opening_id
  ON job_opening_versions (job_opening_id);

CREATE TABLE IF NOT EXISTS job_opening_version_competencies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  job_opening_version_id TEXT NOT NULL,
  competency_catalog_item_id TEXT NOT NULL,
  expected_level INTEGER NOT NULL CHECK (expected_level BETWEEN 1 AND 5),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  weight NUMERIC NOT NULL CHECK (weight >= 0 AND weight <= 100),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (job_opening_version_id, competency_catalog_item_id),
  FOREIGN KEY (organization_id, job_opening_version_id)
    REFERENCES job_opening_versions (organization_id, id),
  FOREIGN KEY (organization_id, competency_catalog_item_id)
    REFERENCES competency_catalog_items (organization_id, id)
);

CREATE TABLE IF NOT EXISTS job_opening_version_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  job_opening_version_id TEXT NOT NULL,
  question_catalog_item_id TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  weight NUMERIC CHECK (weight >= 0 AND weight <= 100),
  context_settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_settings) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (job_opening_version_id, question_catalog_item_id),
  FOREIGN KEY (organization_id, job_opening_version_id)
    REFERENCES job_opening_versions (organization_id, id),
  FOREIGN KEY (organization_id, question_catalog_item_id)
    REFERENCES question_catalog_items (organization_id, id)
);

CREATE OR REPLACE FUNCTION prevent_job_opening_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'job_opening_organization_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_opening_organization_immutable ON job_openings;
CREATE TRIGGER trg_job_opening_organization_immutable
BEFORE UPDATE ON job_openings
FOR EACH ROW EXECUTE FUNCTION prevent_job_opening_organization_change();

CREATE OR REPLACE FUNCTION prevent_job_opening_version_immutable_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id OR NEW.job_opening_id <> OLD.job_opening_id THEN
    RAISE EXCEPTION 'job_opening_version_parent_immutable';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'job_opening_version_immutable';
  END IF;

  IF OLD.status = 'published' THEN
    IF NOT (
      NEW.status = 'archived'
      AND NEW.id = OLD.id
      AND NEW.job_opening_id = OLD.job_opening_id
      AND NEW.organization_id = OLD.organization_id
      AND NEW.version_number = OLD.version_number
      AND NEW.job_profile_version_id = OLD.job_profile_version_id
      AND NEW.public_title = OLD.public_title
      AND NEW.description = OLD.description
      AND NEW.responsibilities = OLD.responsibilities
      AND NEW.requirements = OLD.requirements
      AND NEW.benefits = OLD.benefits
      AND NEW.location = OLD.location
      AND NEW.work_model = OLD.work_model
      AND NEW.work_schedule = OLD.work_schedule
      AND NEW.salary_range IS NOT DISTINCT FROM OLD.salary_range
      AND NEW.positions_count = OLD.positions_count
      AND NEW.expected_start_date IS NOT DISTINCT FROM OLD.expected_start_date
      AND NEW.internal_instructions = OLD.internal_instructions
      AND NEW.public_instructions = OLD.public_instructions
      AND NEW.created_by_user_id = OLD.created_by_user_id
      AND NEW.published_by_user_id IS NOT DISTINCT FROM OLD.published_by_user_id
      AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
      AND NEW.discarded_at IS NOT DISTINCT FROM OLD.discarded_at
      AND NEW.discarded_by_user_id IS NOT DISTINCT FROM OLD.discarded_by_user_id
    ) THEN
      RAISE EXCEPTION 'job_opening_version_immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_opening_version_immutable ON job_opening_versions;
CREATE TRIGGER trg_job_opening_version_immutable
BEFORE UPDATE ON job_opening_versions
FOR EACH ROW EXECUTE FUNCTION prevent_job_opening_version_immutable_change();

CREATE OR REPLACE FUNCTION prevent_job_opening_version_child_immutable_change()
RETURNS TRIGGER AS $$
DECLARE
  version_status TEXT;
BEGIN
  IF NEW.organization_id <> OLD.organization_id OR NEW.job_opening_version_id <> OLD.job_opening_version_id THEN
    RAISE EXCEPTION 'job_opening_version_child_parent_immutable';
  END IF;

  SELECT status INTO version_status FROM job_opening_versions WHERE id = OLD.job_opening_version_id;
  IF version_status IN ('published', 'archived') THEN
    RAISE EXCEPTION 'job_opening_version_child_immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_job_opening_version_child_immutable_delete()
RETURNS TRIGGER AS $$
DECLARE
  version_status TEXT;
BEGIN
  SELECT status INTO version_status FROM job_opening_versions WHERE id = OLD.job_opening_version_id;
  IF version_status IN ('published', 'archived') THEN
    RAISE EXCEPTION 'job_opening_version_child_immutable';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_opening_version_competency_immutable ON job_opening_version_competencies;
CREATE TRIGGER trg_job_opening_version_competency_immutable
BEFORE UPDATE ON job_opening_version_competencies
FOR EACH ROW EXECUTE FUNCTION prevent_job_opening_version_child_immutable_change();

DROP TRIGGER IF EXISTS trg_job_opening_version_competency_delete_immutable ON job_opening_version_competencies;
CREATE TRIGGER trg_job_opening_version_competency_delete_immutable
BEFORE DELETE ON job_opening_version_competencies
FOR EACH ROW EXECUTE FUNCTION prevent_job_opening_version_child_immutable_delete();

DROP TRIGGER IF EXISTS trg_job_opening_version_question_immutable ON job_opening_version_questions;
CREATE TRIGGER trg_job_opening_version_question_immutable
BEFORE UPDATE ON job_opening_version_questions
FOR EACH ROW EXECUTE FUNCTION prevent_job_opening_version_child_immutable_change();

DROP TRIGGER IF EXISTS trg_job_opening_version_question_delete_immutable ON job_opening_version_questions;
CREATE TRIGGER trg_job_opening_version_question_delete_immutable
BEFORE DELETE ON job_opening_version_questions
FOR EACH ROW EXECUTE FUNCTION prevent_job_opening_version_child_immutable_delete();
