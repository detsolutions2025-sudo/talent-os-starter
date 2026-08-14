-- Fase 21 hardening pos-revisao destrutiva.
-- A migration 0022 ja foi aplicada e permanece imutavel; este arquivo adiciona garantias
-- fisicas complementares sem reescrever o historico.

ALTER TABLE interviews
  ADD CONSTRAINT uq_interviews_org_application_id
  UNIQUE (organization_id, candidate_application_id, id);

ALTER TABLE interview_responses
  ADD CONSTRAINT uq_interview_responses_org_interview_id
  UNIQUE (organization_id, interview_id, id);

ALTER TABLE interview_evaluations
  ADD CONSTRAINT uq_interview_evaluations_org_interview_id
  UNIQUE (organization_id, interview_id, id);

ALTER TABLE behavioral_assessment_results
  ADD CONSTRAINT uq_behavioral_assessment_results_org_assessment_id
  UNIQUE (organization_id, behavioral_assessment_id, id);

ALTER TABLE candidate_dossier_sources
  ADD CONSTRAINT fk_candidate_dossier_sources_interview_application
  FOREIGN KEY (organization_id, candidate_application_id, interview_id)
  REFERENCES interviews (organization_id, candidate_application_id, id);

ALTER TABLE candidate_dossier_sources
  ADD CONSTRAINT fk_candidate_dossier_sources_interview_response_container
  FOREIGN KEY (organization_id, interview_id, interview_response_id)
  REFERENCES interview_responses (organization_id, interview_id, id);

ALTER TABLE candidate_dossier_sources
  ADD CONSTRAINT fk_candidate_dossier_sources_interview_evaluation_container
  FOREIGN KEY (organization_id, interview_id, interview_evaluation_id)
  REFERENCES interview_evaluations (organization_id, interview_id, id);

ALTER TABLE candidate_dossier_sources
  ADD CONSTRAINT fk_candidate_dossier_sources_behavioral_result_container
  FOREIGN KEY (organization_id, behavioral_assessment_id, behavioral_assessment_result_id)
  REFERENCES behavioral_assessment_results (organization_id, behavioral_assessment_id, id);

ALTER TABLE candidate_dossier_sources
  ADD CONSTRAINT fk_candidate_dossier_sources_pre_analysis_result_container
  FOREIGN KEY (organization_id, pre_analysis_result_id, pre_analysis_id)
  REFERENCES pre_analysis_results (organization_id, id, pre_analysis_id);

ALTER TABLE candidate_dossier_sources
  ADD CONSTRAINT fk_candidate_dossier_sources_pre_analysis_finding_container
  FOREIGN KEY (organization_id, pre_analysis_finding_id, pre_analysis_id)
  REFERENCES pre_analysis_findings (organization_id, id, pre_analysis_id);

CREATE OR REPLACE FUNCTION enforce_candidate_dossier_source_exact_shape()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source_type = 'candidate_field' THEN
    IF NOT (
      NEW.origin_kind = 'declared_data'
      AND NEW.candidate_id IS NOT NULL
      AND NEW.field_name IS NOT NULL
      AND NEW.snapshot_value IS NOT NULL
      AND NEW.job_opening_id IS NULL
      AND NEW.job_opening_version_id IS NULL
      AND NEW.blueprint_version_id IS NULL
      AND NEW.pre_interview_id IS NULL
      AND NEW.pre_interview_response_id IS NULL
      AND NEW.behavioral_assessment_id IS NULL
      AND NEW.behavioral_assessment_result_id IS NULL
      AND NEW.pre_analysis_id IS NULL
      AND NEW.pre_analysis_result_id IS NULL
      AND NEW.pre_analysis_finding_id IS NULL
      AND NEW.interview_id IS NULL
      AND NEW.interview_response_id IS NULL
      AND NEW.interview_evaluation_id IS NULL
    ) THEN
      RAISE EXCEPTION 'candidate_dossier_source_shape_invalid';
    END IF;
  ELSIF NEW.source_type = 'job_opening_version' THEN
    IF NOT (
      NEW.origin_kind = 'declared_data'
      AND NEW.job_opening_version_id IS NOT NULL
      AND NEW.snapshot_value IS NULL
      AND NEW.field_name IS NULL
      AND NEW.candidate_id IS NULL
      AND NEW.job_opening_id IS NULL
      AND NEW.blueprint_version_id IS NULL
      AND NEW.pre_interview_id IS NULL
      AND NEW.pre_interview_response_id IS NULL
      AND NEW.behavioral_assessment_id IS NULL
      AND NEW.behavioral_assessment_result_id IS NULL
      AND NEW.pre_analysis_id IS NULL
      AND NEW.pre_analysis_result_id IS NULL
      AND NEW.pre_analysis_finding_id IS NULL
      AND NEW.interview_id IS NULL
      AND NEW.interview_response_id IS NULL
      AND NEW.interview_evaluation_id IS NULL
    ) THEN
      RAISE EXCEPTION 'candidate_dossier_source_shape_invalid';
    END IF;
  ELSIF NEW.source_type = 'blueprint_version' THEN
    IF NOT (
      NEW.origin_kind = 'declared_data'
      AND NEW.blueprint_version_id IS NOT NULL
      AND NEW.snapshot_value IS NULL
      AND NEW.field_name IS NULL
      AND NEW.candidate_id IS NULL
      AND NEW.job_opening_id IS NULL
      AND NEW.job_opening_version_id IS NULL
      AND NEW.pre_interview_id IS NULL
      AND NEW.pre_interview_response_id IS NULL
      AND NEW.behavioral_assessment_id IS NULL
      AND NEW.behavioral_assessment_result_id IS NULL
      AND NEW.pre_analysis_id IS NULL
      AND NEW.pre_analysis_result_id IS NULL
      AND NEW.pre_analysis_finding_id IS NULL
      AND NEW.interview_id IS NULL
      AND NEW.interview_response_id IS NULL
      AND NEW.interview_evaluation_id IS NULL
    ) THEN
      RAISE EXCEPTION 'candidate_dossier_source_shape_invalid';
    END IF;
  ELSIF NEW.source_type = 'pre_interview_response' THEN
    IF NOT (
      NEW.origin_kind = 'declared_data'
      AND NEW.pre_interview_id IS NOT NULL
      AND NEW.pre_interview_response_id IS NOT NULL
      AND NEW.snapshot_value IS NULL
      AND NEW.field_name IS NULL
      AND NEW.candidate_id IS NULL
      AND NEW.job_opening_id IS NULL
      AND NEW.job_opening_version_id IS NULL
      AND NEW.blueprint_version_id IS NULL
      AND NEW.behavioral_assessment_id IS NULL
      AND NEW.behavioral_assessment_result_id IS NULL
      AND NEW.pre_analysis_id IS NULL
      AND NEW.pre_analysis_result_id IS NULL
      AND NEW.pre_analysis_finding_id IS NULL
      AND NEW.interview_id IS NULL
      AND NEW.interview_response_id IS NULL
      AND NEW.interview_evaluation_id IS NULL
    ) THEN
      RAISE EXCEPTION 'candidate_dossier_source_shape_invalid';
    END IF;
  ELSIF NEW.source_type = 'behavioral_assessment_result' THEN
    IF NOT (
      NEW.origin_kind = 'instrument_result'
      AND NEW.behavioral_assessment_id IS NOT NULL
      AND NEW.behavioral_assessment_result_id IS NOT NULL
      AND NEW.snapshot_value IS NULL
      AND NEW.field_name IS NULL
      AND NEW.candidate_id IS NULL
      AND NEW.job_opening_id IS NULL
      AND NEW.job_opening_version_id IS NULL
      AND NEW.blueprint_version_id IS NULL
      AND NEW.pre_interview_id IS NULL
      AND NEW.pre_interview_response_id IS NULL
      AND NEW.pre_analysis_id IS NULL
      AND NEW.pre_analysis_result_id IS NULL
      AND NEW.pre_analysis_finding_id IS NULL
      AND NEW.interview_id IS NULL
      AND NEW.interview_response_id IS NULL
      AND NEW.interview_evaluation_id IS NULL
    ) THEN
      RAISE EXCEPTION 'candidate_dossier_source_shape_invalid';
    END IF;
  ELSIF NEW.source_type = 'pre_analysis_result' THEN
    IF NOT (
      NEW.origin_kind = 'ai_inference'
      AND NEW.pre_analysis_id IS NOT NULL
      AND NEW.pre_analysis_result_id IS NOT NULL
      AND NEW.snapshot_value IS NULL
      AND NEW.field_name IS NULL
      AND NEW.candidate_id IS NULL
      AND NEW.job_opening_id IS NULL
      AND NEW.job_opening_version_id IS NULL
      AND NEW.blueprint_version_id IS NULL
      AND NEW.pre_interview_id IS NULL
      AND NEW.pre_interview_response_id IS NULL
      AND NEW.behavioral_assessment_id IS NULL
      AND NEW.behavioral_assessment_result_id IS NULL
      AND NEW.pre_analysis_finding_id IS NULL
      AND NEW.interview_id IS NULL
      AND NEW.interview_response_id IS NULL
      AND NEW.interview_evaluation_id IS NULL
    ) THEN
      RAISE EXCEPTION 'candidate_dossier_source_shape_invalid';
    END IF;
  ELSIF NEW.source_type = 'pre_analysis_finding' THEN
    IF NOT (
      NEW.origin_kind = 'ai_inference'
      AND NEW.pre_analysis_id IS NOT NULL
      AND NEW.pre_analysis_result_id IS NOT NULL
      AND NEW.pre_analysis_finding_id IS NOT NULL
      AND NEW.snapshot_value IS NULL
      AND NEW.field_name IS NULL
      AND NEW.candidate_id IS NULL
      AND NEW.job_opening_id IS NULL
      AND NEW.job_opening_version_id IS NULL
      AND NEW.blueprint_version_id IS NULL
      AND NEW.pre_interview_id IS NULL
      AND NEW.pre_interview_response_id IS NULL
      AND NEW.behavioral_assessment_id IS NULL
      AND NEW.behavioral_assessment_result_id IS NULL
      AND NEW.interview_id IS NULL
      AND NEW.interview_response_id IS NULL
      AND NEW.interview_evaluation_id IS NULL
    ) THEN
      RAISE EXCEPTION 'candidate_dossier_source_shape_invalid';
    END IF;
  ELSIF NEW.source_type = 'interview_response' THEN
    IF NOT (
      NEW.origin_kind = 'observed_evidence'
      AND NEW.interview_id IS NOT NULL
      AND NEW.interview_response_id IS NOT NULL
      AND NEW.snapshot_value IS NULL
      AND NEW.field_name IS NULL
      AND NEW.candidate_id IS NULL
      AND NEW.job_opening_id IS NULL
      AND NEW.job_opening_version_id IS NULL
      AND NEW.blueprint_version_id IS NULL
      AND NEW.pre_interview_id IS NULL
      AND NEW.pre_interview_response_id IS NULL
      AND NEW.behavioral_assessment_id IS NULL
      AND NEW.behavioral_assessment_result_id IS NULL
      AND NEW.pre_analysis_id IS NULL
      AND NEW.pre_analysis_result_id IS NULL
      AND NEW.pre_analysis_finding_id IS NULL
      AND NEW.interview_evaluation_id IS NULL
    ) THEN
      RAISE EXCEPTION 'candidate_dossier_source_shape_invalid';
    END IF;
  ELSIF NEW.source_type = 'interview_evaluation' THEN
    IF NOT (
      NEW.origin_kind = 'human_evaluation'
      AND NEW.interview_id IS NOT NULL
      AND NEW.interview_evaluation_id IS NOT NULL
      AND NEW.snapshot_value IS NULL
      AND NEW.field_name IS NULL
      AND NEW.candidate_id IS NULL
      AND NEW.job_opening_id IS NULL
      AND NEW.job_opening_version_id IS NULL
      AND NEW.blueprint_version_id IS NULL
      AND NEW.pre_interview_id IS NULL
      AND NEW.pre_interview_response_id IS NULL
      AND NEW.behavioral_assessment_id IS NULL
      AND NEW.behavioral_assessment_result_id IS NULL
      AND NEW.pre_analysis_id IS NULL
      AND NEW.pre_analysis_result_id IS NULL
      AND NEW.pre_analysis_finding_id IS NULL
      AND NEW.interview_response_id IS NULL
    ) THEN
      RAISE EXCEPTION 'candidate_dossier_source_shape_invalid';
    END IF;
  ELSE
    RAISE EXCEPTION 'candidate_dossier_source_type_invalid';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidate_dossier_source_exact_shape ON candidate_dossier_sources;
CREATE TRIGGER trg_candidate_dossier_source_exact_shape
BEFORE INSERT ON candidate_dossier_sources
FOR EACH ROW EXECUTE FUNCTION enforce_candidate_dossier_source_exact_shape();
