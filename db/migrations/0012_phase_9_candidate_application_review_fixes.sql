ALTER TABLE candidate_application_notes
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION prevent_candidate_application_note_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'candidate_application_note_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_application_note_no_update ON candidate_application_notes;
CREATE TRIGGER trg_candidate_application_note_no_update
BEFORE UPDATE ON candidate_application_notes
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_application_note_mutation();

DROP TRIGGER IF EXISTS trg_candidate_application_note_no_delete ON candidate_application_notes;
CREATE TRIGGER trg_candidate_application_note_no_delete
BEFORE DELETE ON candidate_application_notes
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_application_note_mutation();
