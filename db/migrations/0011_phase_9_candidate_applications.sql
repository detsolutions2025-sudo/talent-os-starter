CREATE TABLE IF NOT EXISTS candidate_applications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  candidate_id TEXT NOT NULL,
  job_opening_id TEXT NOT NULL,
  job_opening_version_id TEXT NOT NULL,
  application_status TEXT NOT NULL CHECK (
    application_status IN ('active', 'withdrawn', 'rejected', 'hired', 'cancelled')
  ),
  current_stage TEXT NOT NULL CHECK (
    current_stage IN ('applied', 'screening', 'interview', 'assessment', 'offer', 'completed')
  ),
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 1 AND 100),
  applied_at TIMESTAMPTZ NOT NULL,
  finalized_at TIMESTAMPTZ,
  finalized_by_user_id TEXT REFERENCES users(id),
  finalization_reason TEXT CHECK (
    finalization_reason IS NULL OR char_length(finalization_reason) <= 1000
  ),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, candidate_id)
    REFERENCES candidates (organization_id, id),
  FOREIGN KEY (organization_id, job_opening_id)
    REFERENCES job_openings (organization_id, id),
  FOREIGN KEY (organization_id, job_opening_version_id)
    REFERENCES job_opening_versions (organization_id, id),
  CHECK (
    (application_status = 'active' AND finalized_at IS NULL AND finalized_by_user_id IS NULL)
    OR (application_status <> 'active' AND finalized_at IS NOT NULL AND finalized_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_applications_one_active
  ON candidate_applications (organization_id, candidate_id, job_opening_id)
  WHERE application_status = 'active';

CREATE INDEX IF NOT EXISTS idx_candidate_applications_organization_status
  ON candidate_applications (organization_id, application_status, current_stage);

CREATE INDEX IF NOT EXISTS idx_candidate_applications_candidate
  ON candidate_applications (organization_id, candidate_id);

CREATE INDEX IF NOT EXISTS idx_candidate_applications_job_opening
  ON candidate_applications (organization_id, job_opening_id);

CREATE TABLE IF NOT EXISTS candidate_application_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  candidate_application_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'application_created',
      'stage_changed',
      'withdrawn',
      'rejected',
      'hired',
      'cancelled',
      'note_added'
    )
  ),
  stage_before TEXT CHECK (
    stage_before IS NULL
    OR stage_before IN ('applied', 'screening', 'interview', 'assessment', 'offer', 'completed')
  ),
  stage_after TEXT CHECK (
    stage_after IS NULL
    OR stage_after IN ('applied', 'screening', 'interview', 'assessment', 'offer', 'completed')
  ),
  status_before TEXT CHECK (
    status_before IS NULL
    OR status_before IN ('active', 'withdrawn', 'rejected', 'hired', 'cancelled')
  ),
  status_after TEXT CHECK (
    status_after IS NULL
    OR status_after IN ('active', 'withdrawn', 'rejected', 'hired', 'cancelled')
  ),
  actor_user_id TEXT REFERENCES users(id),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, candidate_application_id)
    REFERENCES candidate_applications (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_application_events_application
  ON candidate_application_events (organization_id, candidate_application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS candidate_application_notes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  candidate_application_id TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, candidate_application_id)
    REFERENCES candidate_applications (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_application_notes_application
  ON candidate_application_notes (organization_id, candidate_application_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_candidate_application_parent_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
    OR NEW.candidate_id <> OLD.candidate_id
    OR NEW.job_opening_id <> OLD.job_opening_id
    OR NEW.job_opening_version_id <> OLD.job_opening_version_id THEN
    RAISE EXCEPTION 'candidate_application_parent_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_application_parent_immutable ON candidate_applications;
CREATE TRIGGER trg_candidate_application_parent_immutable
BEFORE UPDATE ON candidate_applications
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_application_parent_change();

CREATE OR REPLACE FUNCTION prevent_candidate_application_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'candidate_application_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_application_no_delete ON candidate_applications;
CREATE TRIGGER trg_candidate_application_no_delete
BEFORE DELETE ON candidate_applications
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_application_delete();

CREATE OR REPLACE FUNCTION prevent_candidate_application_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'candidate_application_event_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_application_event_no_update ON candidate_application_events;
CREATE TRIGGER trg_candidate_application_event_no_update
BEFORE UPDATE ON candidate_application_events
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_application_event_mutation();

DROP TRIGGER IF EXISTS trg_candidate_application_event_no_delete ON candidate_application_events;
CREATE TRIGGER trg_candidate_application_event_no_delete
BEFORE DELETE ON candidate_application_events
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_application_event_mutation();

CREATE OR REPLACE FUNCTION prevent_candidate_application_note_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'candidate_application_note_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_application_note_no_delete ON candidate_application_notes;
CREATE TRIGGER trg_candidate_application_note_no_delete
BEFORE DELETE ON candidate_application_notes
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_application_note_delete();
