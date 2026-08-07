CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  candidate_application_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  type TEXT NOT NULL CHECK (
    type IN (
      'screening',
      'behavioral',
      'technical',
      'cultural',
      'leadership',
      'management',
      'panel',
      'final',
      'other'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show')
  ),
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 100),
  location_type TEXT NOT NULL CHECK (location_type IN ('onsite', 'video', 'phone', 'other')),
  location_details TEXT CHECK (location_details IS NULL OR char_length(location_details) <= 2000),
  interviewer_instructions TEXT CHECK (
    interviewer_instructions IS NULL OR char_length(interviewer_instructions) <= 4000
  ),
  candidate_instructions TEXT CHECK (
    candidate_instructions IS NULL OR char_length(candidate_instructions) <= 4000
  ),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id TEXT REFERENCES users(id),
  cancellation_reason TEXT CHECK (
    cancellation_reason IS NULL OR char_length(cancellation_reason) <= 1000
  ),
  no_show_at TIMESTAMPTZ,
  no_show_by_user_id TEXT REFERENCES users(id),
  no_show_reason TEXT CHECK (no_show_reason IS NULL OR char_length(no_show_reason) <= 1000),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, candidate_application_id)
    REFERENCES candidate_applications (organization_id, id),
  CHECK (
    status <> 'scheduled'
    OR (scheduled_start_at IS NOT NULL AND scheduled_end_at IS NOT NULL AND scheduled_end_at > scheduled_start_at)
  ),
  CHECK (status <> 'in_progress' OR started_at IS NOT NULL),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (
    status <> 'cancelled'
    OR (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND cancellation_reason IS NOT NULL)
  ),
  CHECK (
    status <> 'no_show'
    OR (no_show_at IS NOT NULL AND no_show_by_user_id IS NOT NULL AND no_show_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_interviews_organization_status
  ON interviews (organization_id, status, scheduled_start_at DESC);

CREATE INDEX IF NOT EXISTS idx_interviews_candidate_application
  ON interviews (organization_id, candidate_application_id);

CREATE TABLE IF NOT EXISTS interview_participants (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  interview_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('lead', 'interviewer', 'observer')),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, interview_id, user_id),
  FOREIGN KEY (organization_id, interview_id)
    REFERENCES interviews (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_interview_participants_interview
  ON interview_participants (organization_id, interview_id, status, role);

CREATE INDEX IF NOT EXISTS idx_interview_participants_user
  ON interview_participants (organization_id, user_id, status);

CREATE TABLE IF NOT EXISTS interview_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  interview_id TEXT NOT NULL,
  question_catalog_item_id TEXT NOT NULL,
  snapshot_title TEXT NOT NULL CHECK (char_length(snapshot_title) BETWEEN 1 AND 200),
  snapshot_text TEXT NOT NULL CHECK (char_length(snapshot_text) BETWEEN 1 AND 4000),
  snapshot_type TEXT NOT NULL CHECK (
    snapshot_type IN (
      'open_text',
      'long_text',
      'single_choice',
      'multiple_choice',
      'yes_no',
      'numeric',
      'scale',
      'date',
      'situational',
      'behavioral',
      'technical'
    )
  ),
  snapshot_options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(snapshot_options) = 'array'),
  snapshot_settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot_settings) = 'object'),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  contextual_weight INTEGER CHECK (contextual_weight IS NULL OR contextual_weight BETWEEN 0 AND 100),
  contextual_competency_catalog_item_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, interview_id, question_catalog_item_id),
  UNIQUE (organization_id, interview_id, display_order),
  FOREIGN KEY (organization_id, interview_id)
    REFERENCES interviews (organization_id, id),
  FOREIGN KEY (organization_id, question_catalog_item_id)
    REFERENCES question_catalog_items (organization_id, id),
  FOREIGN KEY (organization_id, contextual_competency_catalog_item_id)
    REFERENCES competency_catalog_items (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_interview_questions_interview
  ON interview_questions (organization_id, interview_id, display_order);

CREATE TABLE IF NOT EXISTS interview_responses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  interview_id TEXT NOT NULL,
  interview_question_id TEXT NOT NULL,
  response_value JSONB NOT NULL,
  interviewer_observation TEXT CHECK (
    interviewer_observation IS NULL OR char_length(interviewer_observation) <= 4000
  ),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, interview_question_id),
  FOREIGN KEY (organization_id, interview_id)
    REFERENCES interviews (organization_id, id),
  FOREIGN KEY (organization_id, interview_question_id)
    REFERENCES interview_questions (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_interview_responses_interview
  ON interview_responses (organization_id, interview_id);

CREATE TABLE IF NOT EXISTS interview_evaluations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  interview_id TEXT NOT NULL,
  evaluator_user_id TEXT NOT NULL REFERENCES users(id),
  recommendation TEXT NOT NULL CHECK (
    recommendation IN ('strong_no', 'no', 'neutral', 'yes', 'strong_yes')
  ),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 4000),
  strengths TEXT NOT NULL DEFAULT '' CHECK (char_length(strengths) <= 4000),
  attention_points TEXT NOT NULL DEFAULT '' CHECK (char_length(attention_points) <= 4000),
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, interview_id, evaluator_user_id),
  FOREIGN KEY (organization_id, interview_id)
    REFERENCES interviews (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_interview_evaluations_interview
  ON interview_evaluations (organization_id, interview_id);

CREATE TABLE IF NOT EXISTS interview_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  interview_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'interview_created',
      'draft_updated',
      'scheduled',
      'rescheduled',
      'participant_added',
      'participant_removed',
      'participant_inactivated',
      'question_added',
      'question_removed',
      'question_reordered',
      'started',
      'response_created',
      'response_updated',
      'evaluation_created',
      'evaluation_updated',
      'completed',
      'cancelled',
      'no_show',
      'access_denied',
      'administrative_read'
    )
  ),
  status_before TEXT CHECK (
    status_before IS NULL
    OR status_before IN ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show')
  ),
  status_after TEXT CHECK (
    status_after IS NULL
    OR status_after IN ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show')
  ),
  actor_user_id TEXT REFERENCES users(id),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, interview_id)
    REFERENCES interviews (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_interview_events_interview
  ON interview_events (organization_id, interview_id, created_at ASC);

CREATE OR REPLACE FUNCTION prevent_interview_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'interview_organization_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interview_organization_immutable ON interviews;
CREATE TRIGGER trg_interview_organization_immutable
BEFORE UPDATE ON interviews
FOR EACH ROW EXECUTE FUNCTION prevent_interview_organization_change();

DROP TRIGGER IF EXISTS trg_interview_participant_organization_immutable ON interview_participants;
CREATE TRIGGER trg_interview_participant_organization_immutable
BEFORE UPDATE ON interview_participants
FOR EACH ROW EXECUTE FUNCTION prevent_interview_organization_change();

DROP TRIGGER IF EXISTS trg_interview_question_organization_immutable ON interview_questions;
CREATE TRIGGER trg_interview_question_organization_immutable
BEFORE UPDATE ON interview_questions
FOR EACH ROW EXECUTE FUNCTION prevent_interview_organization_change();

DROP TRIGGER IF EXISTS trg_interview_response_organization_immutable ON interview_responses;
CREATE TRIGGER trg_interview_response_organization_immutable
BEFORE UPDATE ON interview_responses
FOR EACH ROW EXECUTE FUNCTION prevent_interview_organization_change();

DROP TRIGGER IF EXISTS trg_interview_evaluation_organization_immutable ON interview_evaluations;
CREATE TRIGGER trg_interview_evaluation_organization_immutable
BEFORE UPDATE ON interview_evaluations
FOR EACH ROW EXECUTE FUNCTION prevent_interview_organization_change();

CREATE OR REPLACE FUNCTION prevent_interview_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'interview_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interview_no_delete ON interviews;
CREATE TRIGGER trg_interview_no_delete
BEFORE DELETE ON interviews
FOR EACH ROW EXECUTE FUNCTION prevent_interview_delete();

DROP TRIGGER IF EXISTS trg_interview_participant_no_delete ON interview_participants;
CREATE TRIGGER trg_interview_participant_no_delete
BEFORE DELETE ON interview_participants
FOR EACH ROW EXECUTE FUNCTION prevent_interview_delete();

DROP TRIGGER IF EXISTS trg_interview_question_no_delete ON interview_questions;
CREATE TRIGGER trg_interview_question_no_delete
BEFORE DELETE ON interview_questions
FOR EACH ROW EXECUTE FUNCTION prevent_interview_delete();

DROP TRIGGER IF EXISTS trg_interview_response_no_delete ON interview_responses;
CREATE TRIGGER trg_interview_response_no_delete
BEFORE DELETE ON interview_responses
FOR EACH ROW EXECUTE FUNCTION prevent_interview_delete();

DROP TRIGGER IF EXISTS trg_interview_evaluation_no_delete ON interview_evaluations;
CREATE TRIGGER trg_interview_evaluation_no_delete
BEFORE DELETE ON interview_evaluations
FOR EACH ROW EXECUTE FUNCTION prevent_interview_delete();

CREATE OR REPLACE FUNCTION prevent_interview_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'interview_event_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interview_event_no_update ON interview_events;
CREATE TRIGGER trg_interview_event_no_update
BEFORE UPDATE ON interview_events
FOR EACH ROW EXECUTE FUNCTION prevent_interview_event_mutation();

DROP TRIGGER IF EXISTS trg_interview_event_no_delete ON interview_events;
CREATE TRIGGER trg_interview_event_no_delete
BEFORE DELETE ON interview_events
FOR EACH ROW EXECUTE FUNCTION prevent_interview_event_mutation();

CREATE OR REPLACE FUNCTION prevent_completed_interview_operational_mutation()
RETURNS TRIGGER AS $$
DECLARE
  current_status TEXT;
BEGIN
  SELECT status INTO current_status
  FROM interviews
  WHERE organization_id = OLD.organization_id
    AND id = OLD.interview_id;

  IF current_status IN ('completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'interview_final_state_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interview_response_final_immutable ON interview_responses;
CREATE TRIGGER trg_interview_response_final_immutable
BEFORE UPDATE ON interview_responses
FOR EACH ROW EXECUTE FUNCTION prevent_completed_interview_operational_mutation();

DROP TRIGGER IF EXISTS trg_interview_evaluation_final_immutable ON interview_evaluations;
CREATE TRIGGER trg_interview_evaluation_final_immutable
BEFORE UPDATE ON interview_evaluations
FOR EACH ROW EXECUTE FUNCTION prevent_completed_interview_operational_mutation();
