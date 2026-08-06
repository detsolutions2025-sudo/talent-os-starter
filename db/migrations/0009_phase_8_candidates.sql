CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 200),
  preferred_name TEXT CHECK (preferred_name IS NULL OR char_length(preferred_name) <= 100),
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  phone TEXT,
  secondary_phone TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  source TEXT NOT NULL CHECK (
    source IN (
      'career_page',
      'referral',
      'recruiter',
      'agency',
      'linkedin',
      'job_board',
      'event',
      'import',
      'manual',
      'other'
    )
  ),
  source_details TEXT,
  professional_summary TEXT CHECK (
    professional_summary IS NULL OR char_length(professional_summary) <= 10000
  ),
  location JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(location) = 'object'),
  experiences JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(experiences) = 'array'),
  education JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(education) = 'array'),
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(certifications) = 'array'),
  languages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(languages) = 'array'),
  professional_links JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(professional_links) = 'array'),
  declared_competencies JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(declared_competencies) = 'array'),
  availability JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(availability) = 'object'),
  work_authorization JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(work_authorization) = 'object'),
  salary_expectation JSONB,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inactivated_at TIMESTAMPTZ,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS idx_candidates_organization_id
  ON candidates (organization_id);

CREATE INDEX IF NOT EXISTS idx_candidates_status
  ON candidates (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_candidates_normalized_email
  ON candidates (organization_id, normalized_email);

CREATE TABLE IF NOT EXISTS candidate_consents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted', 'revoked', 'expired', 'pending')),
  consent_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, candidate_id)
    REFERENCES candidates (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_consents_candidate_id
  ON candidate_consents (organization_id, candidate_id, consent_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS candidate_internal_notes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, candidate_id)
    REFERENCES candidates (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_internal_notes_candidate_id
  ON candidate_internal_notes (organization_id, candidate_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_candidate_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'candidate_organization_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_organization_immutable ON candidates;
CREATE TRIGGER trg_candidate_organization_immutable
BEFORE UPDATE ON candidates
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_organization_change();

CREATE OR REPLACE FUNCTION prevent_candidate_child_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id OR NEW.candidate_id <> OLD.candidate_id THEN
    RAISE EXCEPTION 'candidate_child_parent_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_consent_parent_immutable ON candidate_consents;
CREATE TRIGGER trg_candidate_consent_parent_immutable
BEFORE UPDATE ON candidate_consents
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_child_organization_change();

DROP TRIGGER IF EXISTS trg_candidate_note_parent_immutable ON candidate_internal_notes;
CREATE TRIGGER trg_candidate_note_parent_immutable
BEFORE UPDATE ON candidate_internal_notes
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_child_organization_change();
