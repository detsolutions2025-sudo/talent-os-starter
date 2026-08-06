CREATE OR REPLACE FUNCTION prevent_candidate_physical_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'candidate physical deletion is not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_no_delete ON candidates;
CREATE TRIGGER trg_candidate_no_delete
BEFORE DELETE ON candidates
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_physical_delete();

DROP TRIGGER IF EXISTS trg_candidate_consent_no_delete ON candidate_consents;
CREATE TRIGGER trg_candidate_consent_no_delete
BEFORE DELETE ON candidate_consents
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_physical_delete();

DROP TRIGGER IF EXISTS trg_candidate_note_no_delete ON candidate_internal_notes;
CREATE TRIGGER trg_candidate_note_no_delete
BEFORE DELETE ON candidate_internal_notes
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_physical_delete();
