-- Fase 21 (SPEC-024 v1.1) - Dossie Inteligente do Candidato.
-- Dossie materializado, versionado, imutavel e sem execucao de IA propria.

CREATE TABLE IF NOT EXISTS candidate_dossiers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  candidate_application_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  job_opening_id TEXT NOT NULL,
  job_opening_version_id TEXT NOT NULL,
  blueprint_version_id TEXT REFERENCES organization_blueprint_versions(id),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  previous_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status = 'generated'),
  generation_kind TEXT NOT NULL CHECK (generation_kind IN ('regular', 'final_record')),
  final_record_reason TEXT,
  presented_snapshot JSONB NOT NULL,
  snapshot_schema_version TEXT NOT NULL DEFAULT 'candidate_dossier_snapshot.v1'
    CHECK (snapshot_schema_version = 'candidate_dossier_snapshot.v1'),
  content_hash TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  generated_by_user_id TEXT NOT NULL REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, candidate_application_id, id),
  UNIQUE (organization_id, candidate_application_id, version_number),
  UNIQUE (organization_id, candidate_application_id, idempotency_key_hash),
  FOREIGN KEY (organization_id, candidate_application_id, candidate_id)
    REFERENCES candidate_applications (organization_id, id, candidate_id),
  FOREIGN KEY (organization_id, candidate_application_id, job_opening_id, job_opening_version_id)
    REFERENCES candidate_applications (organization_id, id, job_opening_id, job_opening_version_id),
  FOREIGN KEY (organization_id, blueprint_version_id)
    REFERENCES organization_blueprint_versions (organization_id, id),
  FOREIGN KEY (organization_id, candidate_application_id, previous_version_id)
    REFERENCES candidate_dossiers (organization_id, candidate_application_id, id),
  CHECK (
    (generation_kind = 'regular' AND final_record_reason IS NULL)
    OR
    (generation_kind = 'final_record' AND final_record_reason IS NOT NULL AND length(trim(final_record_reason)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_dossiers_one_final_record
  ON candidate_dossiers (organization_id, candidate_application_id)
  WHERE generation_kind = 'final_record';

CREATE INDEX IF NOT EXISTS idx_candidate_dossiers_application
  ON candidate_dossiers (organization_id, candidate_application_id, version_number DESC);

CREATE TABLE IF NOT EXISTS candidate_dossier_sources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  candidate_dossier_id TEXT NOT NULL,
  candidate_application_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'candidate_field',
      'job_opening_version',
      'blueprint_version',
      'pre_interview_response',
      'behavioral_assessment_result',
      'pre_analysis_result',
      'pre_analysis_finding',
      'interview_response',
      'interview_evaluation'
    )
  ),
  origin_kind TEXT NOT NULL CHECK (
    origin_kind IN ('declared_data', 'observed_evidence', 'instrument_result', 'human_evaluation', 'ai_inference')
  ),
  field_name TEXT,
  candidate_id TEXT,
  job_opening_id TEXT,
  job_opening_version_id TEXT,
  blueprint_version_id TEXT,
  pre_interview_id TEXT,
  pre_interview_response_id TEXT,
  behavioral_assessment_id TEXT,
  behavioral_assessment_result_id TEXT,
  pre_analysis_id TEXT,
  pre_analysis_result_id TEXT,
  pre_analysis_finding_id TEXT,
  interview_id TEXT,
  interview_response_id TEXT,
  interview_evaluation_id TEXT,
  snapshot_value JSONB,
  presented_value_snapshot JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  source_created_at TIMESTAMPTZ,
  authored_by_user_id TEXT REFERENCES users(id),
  authorship JSONB NOT NULL DEFAULT '{}'::jsonb,
  presented_order INTEGER NOT NULL CHECK (presented_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, candidate_dossier_id, id),
  UNIQUE (organization_id, candidate_dossier_id, presented_order),
  FOREIGN KEY (organization_id, candidate_dossier_id, candidate_application_id)
    REFERENCES candidate_dossiers (organization_id, id, candidate_application_id),
  FOREIGN KEY (organization_id, candidate_id)
    REFERENCES candidates (organization_id, id),
  FOREIGN KEY (organization_id, job_opening_version_id)
    REFERENCES job_opening_versions (organization_id, id),
  FOREIGN KEY (organization_id, blueprint_version_id)
    REFERENCES organization_blueprint_versions (organization_id, id),
  FOREIGN KEY (organization_id, pre_interview_id)
    REFERENCES pre_interviews (organization_id, id),
  FOREIGN KEY (organization_id, pre_interview_id, pre_interview_response_id)
    REFERENCES pre_interview_responses (organization_id, pre_interview_id, id),
  FOREIGN KEY (organization_id, behavioral_assessment_id)
    REFERENCES behavioral_assessments (organization_id, id),
  FOREIGN KEY (organization_id, behavioral_assessment_result_id)
    REFERENCES behavioral_assessment_results (organization_id, id),
  FOREIGN KEY (organization_id, pre_analysis_id)
    REFERENCES pre_analyses (organization_id, id),
  FOREIGN KEY (organization_id, pre_analysis_result_id)
    REFERENCES pre_analysis_results (organization_id, id),
  FOREIGN KEY (organization_id, pre_analysis_finding_id)
    REFERENCES pre_analysis_findings (organization_id, id),
  FOREIGN KEY (organization_id, interview_id)
    REFERENCES interviews (organization_id, id),
  FOREIGN KEY (organization_id, interview_response_id)
    REFERENCES interview_responses (organization_id, id),
  FOREIGN KEY (organization_id, interview_evaluation_id)
    REFERENCES interview_evaluations (organization_id, id),
  CHECK (
    (source_type = 'candidate_field' AND origin_kind = 'declared_data'
      AND candidate_id IS NOT NULL AND field_name IS NOT NULL)
    OR
    (source_type = 'job_opening_version' AND origin_kind = 'declared_data'
      AND job_opening_version_id IS NOT NULL)
    OR
    (source_type = 'blueprint_version' AND origin_kind = 'declared_data'
      AND blueprint_version_id IS NOT NULL)
    OR
    (source_type = 'pre_interview_response' AND origin_kind = 'declared_data'
      AND pre_interview_id IS NOT NULL AND pre_interview_response_id IS NOT NULL)
    OR
    (source_type = 'behavioral_assessment_result' AND origin_kind = 'instrument_result'
      AND behavioral_assessment_id IS NOT NULL AND behavioral_assessment_result_id IS NOT NULL)
    OR
    (source_type = 'pre_analysis_result' AND origin_kind = 'ai_inference'
      AND pre_analysis_id IS NOT NULL AND pre_analysis_result_id IS NOT NULL)
    OR
    (source_type = 'pre_analysis_finding' AND origin_kind = 'ai_inference'
      AND pre_analysis_id IS NOT NULL AND pre_analysis_result_id IS NOT NULL
      AND pre_analysis_finding_id IS NOT NULL)
    OR
    (source_type = 'interview_response' AND origin_kind = 'observed_evidence'
      AND interview_id IS NOT NULL AND interview_response_id IS NOT NULL)
    OR
    (source_type = 'interview_evaluation' AND origin_kind = 'human_evaluation'
      AND interview_id IS NOT NULL AND interview_evaluation_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_candidate_dossier_sources_dossier
  ON candidate_dossier_sources (organization_id, candidate_dossier_id, presented_order);

CREATE OR REPLACE FUNCTION prevent_candidate_dossier_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'candidate_dossier_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_dossier_no_update ON candidate_dossiers;
CREATE TRIGGER trg_candidate_dossier_no_update
BEFORE UPDATE ON candidate_dossiers
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_dossier_update();

DROP TRIGGER IF EXISTS trg_candidate_dossier_no_delete ON candidate_dossiers;
CREATE TRIGGER trg_candidate_dossier_no_delete
BEFORE DELETE ON candidate_dossiers
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_dossier_update();

DROP TRIGGER IF EXISTS trg_candidate_dossier_source_no_update ON candidate_dossier_sources;
CREATE TRIGGER trg_candidate_dossier_source_no_update
BEFORE UPDATE ON candidate_dossier_sources
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_dossier_update();

DROP TRIGGER IF EXISTS trg_candidate_dossier_source_no_delete ON candidate_dossier_sources;
CREATE TRIGGER trg_candidate_dossier_source_no_delete
BEFORE DELETE ON candidate_dossier_sources
FOR EACH ROW EXECUTE FUNCTION prevent_candidate_dossier_update();

CREATE OR REPLACE FUNCTION enforce_candidate_dossier_version_order()
RETURNS TRIGGER AS $$
DECLARE
  expected_version INTEGER;
  previous_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO expected_version
  FROM candidate_dossiers
  WHERE organization_id = NEW.organization_id
    AND candidate_application_id = NEW.candidate_application_id;

  IF NEW.version_number <> expected_version THEN
    RAISE EXCEPTION 'candidate_dossier_version_gap';
  END IF;

  IF NEW.version_number = 1 AND NEW.previous_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'candidate_dossier_first_version_has_previous';
  END IF;

  IF NEW.version_number > 1 THEN
    IF NEW.previous_version_id IS NULL THEN
      RAISE EXCEPTION 'candidate_dossier_previous_required';
    END IF;

    SELECT version_number INTO previous_version
    FROM candidate_dossiers
    WHERE organization_id = NEW.organization_id
      AND candidate_application_id = NEW.candidate_application_id
      AND id = NEW.previous_version_id;

    IF previous_version IS NULL OR previous_version <> NEW.version_number - 1 THEN
      RAISE EXCEPTION 'candidate_dossier_previous_not_immediate';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_dossier_version_order ON candidate_dossiers;
CREATE TRIGGER trg_candidate_dossier_version_order
BEFORE INSERT ON candidate_dossiers
FOR EACH ROW EXECUTE FUNCTION enforce_candidate_dossier_version_order();
