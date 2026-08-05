CREATE TABLE IF NOT EXISTS job_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inactivated_at TIMESTAMPTZ,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, normalized_code)
);

CREATE INDEX IF NOT EXISTS idx_job_profiles_organization_id
  ON job_profiles (organization_id);

CREATE INDEX IF NOT EXISTS idx_job_profiles_status
  ON job_profiles (status);

CREATE INDEX IF NOT EXISTS idx_job_profiles_name
  ON job_profiles (name);

CREATE TABLE IF NOT EXISTS job_profile_versions (
  id TEXT PRIMARY KEY,
  job_profile_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  version_number INTEGER,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  title TEXT NOT NULL DEFAULT '',
  mission TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(responsibilities) = 'array'),
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(requirements) = 'array'),
  education JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(education) = 'object'),
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(certifications) = 'array'),
  languages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(languages) = 'array'),
  tools JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tools) = 'array'),
  work_model TEXT NOT NULL CHECK (work_model IN ('onsite', 'hybrid', 'remote', 'flexible')),
  work_schedule JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(work_schedule) = 'object'),
  travel_requirement TEXT NOT NULL CHECK (travel_requirement IN ('none', 'occasional', 'frequent')),
  salary_range JSONB,
  notes TEXT NOT NULL DEFAULT '',
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
  FOREIGN KEY (organization_id, job_profile_id)
    REFERENCES job_profiles (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_profile_versions_number
  ON job_profile_versions (job_profile_id, version_number)
  WHERE version_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_profile_versions_published
  ON job_profile_versions (job_profile_id)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_profile_versions_active_draft
  ON job_profile_versions (job_profile_id)
  WHERE status = 'draft' AND discarded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_profile_versions_organization_id
  ON job_profile_versions (organization_id);

CREATE INDEX IF NOT EXISTS idx_job_profile_versions_job_profile_id
  ON job_profile_versions (job_profile_id);

CREATE INDEX IF NOT EXISTS idx_job_profile_versions_status
  ON job_profile_versions (status);

CREATE INDEX IF NOT EXISTS idx_job_profile_versions_discarded_at
  ON job_profile_versions (discarded_at);

CREATE TABLE IF NOT EXISTS job_profile_version_competencies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  job_profile_version_id TEXT NOT NULL,
  competency_catalog_item_id TEXT NOT NULL,
  expected_level INTEGER NOT NULL CHECK (expected_level BETWEEN 1 AND 5),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (job_profile_version_id, competency_catalog_item_id),
  FOREIGN KEY (organization_id, job_profile_version_id)
    REFERENCES job_profile_versions (organization_id, id),
  FOREIGN KEY (organization_id, competency_catalog_item_id)
    REFERENCES competency_catalog_items (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_job_profile_version_competencies_organization_id
  ON job_profile_version_competencies (organization_id);

CREATE INDEX IF NOT EXISTS idx_job_profile_version_competencies_version_id
  ON job_profile_version_competencies (job_profile_version_id);

CREATE INDEX IF NOT EXISTS idx_job_profile_version_competencies_catalog_item_id
  ON job_profile_version_competencies (competency_catalog_item_id);

CREATE INDEX IF NOT EXISTS idx_job_profile_version_competencies_display_order
  ON job_profile_version_competencies (display_order);

CREATE OR REPLACE FUNCTION prevent_job_profile_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'job_profile_organization_immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_profile_organization_immutable
  ON job_profiles;

CREATE TRIGGER trg_job_profile_organization_immutable
BEFORE UPDATE ON job_profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_job_profile_organization_change();

CREATE OR REPLACE FUNCTION prevent_job_profile_version_immutable_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'job_profile_version_organization_immutable';
  END IF;

  IF NEW.job_profile_id <> OLD.job_profile_id THEN
    RAISE EXCEPTION 'job_profile_version_profile_immutable';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'job_profile_version_immutable';
  END IF;

  IF OLD.status = 'published' THEN
    IF NOT (
      NEW.status = 'archived'
      AND NEW.id = OLD.id
      AND NEW.job_profile_id = OLD.job_profile_id
      AND NEW.organization_id = OLD.organization_id
      AND NEW.version_number = OLD.version_number
      AND NEW.title = OLD.title
      AND NEW.mission = OLD.mission
      AND NEW.summary = OLD.summary
      AND NEW.responsibilities = OLD.responsibilities
      AND NEW.requirements = OLD.requirements
      AND NEW.education = OLD.education
      AND NEW.certifications = OLD.certifications
      AND NEW.languages = OLD.languages
      AND NEW.tools = OLD.tools
      AND NEW.work_model = OLD.work_model
      AND NEW.work_schedule = OLD.work_schedule
      AND NEW.travel_requirement = OLD.travel_requirement
      AND NEW.salary_range IS NOT DISTINCT FROM OLD.salary_range
      AND NEW.notes = OLD.notes
      AND NEW.created_by_user_id = OLD.created_by_user_id
      AND NEW.published_by_user_id IS NOT DISTINCT FROM OLD.published_by_user_id
      AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
      AND NEW.discarded_at IS NOT DISTINCT FROM OLD.discarded_at
      AND NEW.discarded_by_user_id IS NOT DISTINCT FROM OLD.discarded_by_user_id
    ) THEN
      RAISE EXCEPTION 'job_profile_version_immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_profile_version_immutable
  ON job_profile_versions;

CREATE TRIGGER trg_job_profile_version_immutable
BEFORE UPDATE ON job_profile_versions
FOR EACH ROW
EXECUTE FUNCTION prevent_job_profile_version_immutable_change();

CREATE OR REPLACE FUNCTION prevent_published_or_archived_job_profile_version_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('published', 'archived') THEN
    RAISE EXCEPTION 'job_profile_version_immutable';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_profile_version_delete_immutable
  ON job_profile_versions;

CREATE TRIGGER trg_job_profile_version_delete_immutable
BEFORE DELETE ON job_profile_versions
FOR EACH ROW
EXECUTE FUNCTION prevent_published_or_archived_job_profile_version_delete();

CREATE OR REPLACE FUNCTION prevent_job_profile_version_competency_immutable_change()
RETURNS TRIGGER AS $$
DECLARE
  version_status TEXT;
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'job_profile_version_competency_organization_immutable';
  END IF;

  IF NEW.job_profile_version_id <> OLD.job_profile_version_id THEN
    RAISE EXCEPTION 'job_profile_version_competency_version_immutable';
  END IF;

  SELECT status INTO version_status
  FROM job_profile_versions
  WHERE id = OLD.job_profile_version_id;

  IF version_status IN ('published', 'archived') THEN
    RAISE EXCEPTION 'job_profile_version_competency_immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_profile_version_competency_immutable
  ON job_profile_version_competencies;

CREATE TRIGGER trg_job_profile_version_competency_immutable
BEFORE UPDATE ON job_profile_version_competencies
FOR EACH ROW
EXECUTE FUNCTION prevent_job_profile_version_competency_immutable_change();

CREATE OR REPLACE FUNCTION prevent_job_profile_version_competency_immutable_delete()
RETURNS TRIGGER AS $$
DECLARE
  version_status TEXT;
BEGIN
  SELECT status INTO version_status
  FROM job_profile_versions
  WHERE id = OLD.job_profile_version_id;

  IF version_status IN ('published', 'archived') THEN
    RAISE EXCEPTION 'job_profile_version_competency_immutable';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_profile_version_competency_delete_immutable
  ON job_profile_version_competencies;

CREATE TRIGGER trg_job_profile_version_competency_delete_immutable
BEFORE DELETE ON job_profile_version_competencies
FOR EACH ROW
EXECUTE FUNCTION prevent_job_profile_version_competency_immutable_delete();
