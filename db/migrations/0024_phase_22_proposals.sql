-- Fase 22: Propostas (SPEC-015 v1.0).
--
-- Cinco tabelas fisicas do modulo:
-- 1. proposals
-- 2. proposal_versions
-- 3. proposal_access_grants
-- 4. proposal_events
-- 5. proposal_idempotency_keys
--
-- Proposal e envelope sem status. ProposalVersion e a fonte de verdade do lifecycle.

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  candidate_application_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  job_opening_id TEXT NOT NULL,
  job_opening_version_id TEXT NOT NULL,
  current_version_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, candidate_application_id),
  UNIQUE (organization_id, id, current_version_id),
  FOREIGN KEY (organization_id, candidate_application_id, candidate_id)
    REFERENCES candidate_applications (organization_id, id, candidate_id),
  FOREIGN KEY (
    organization_id,
    candidate_application_id,
    job_opening_id,
    job_opening_version_id
  )
    REFERENCES candidate_applications (
      organization_id,
      id,
      job_opening_id,
      job_opening_version_id
    )
);

CREATE TABLE IF NOT EXISTS proposal_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  candidate_application_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  job_opening_id TEXT NOT NULL,
  job_opening_version_id TEXT NOT NULL,
  version_number INTEGER,
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'issued', 'accepted', 'declined', 'expired', 'cancelled', 'superseded')
  ),
  content_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content_snapshot) = 'object'),
  compensation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(compensation_snapshot) = 'object'),
  content_hash TEXT NOT NULL CHECK (char_length(content_hash) = 64),
  compensation_hash TEXT NOT NULL CHECK (char_length(compensation_hash) = 64),
  presentation_schema_version TEXT,
  presentation_hash TEXT CHECK (presentation_hash IS NULL OR char_length(presentation_hash) = 64),
  valid_until TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  issued_by_user_id TEXT REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  accepted_access_grant_id TEXT,
  acceptance_ip_hash TEXT CHECK (acceptance_ip_hash IS NULL OR char_length(acceptance_ip_hash) = 64),
  acceptance_user_agent_hash TEXT CHECK (
    acceptance_user_agent_hash IS NULL OR char_length(acceptance_user_agent_hash) = 64
  ),
  declined_at TIMESTAMPTZ,
  declined_access_grant_id TEXT,
  decline_ip_hash TEXT CHECK (decline_ip_hash IS NULL OR char_length(decline_ip_hash) = 64),
  decline_user_agent_hash TEXT CHECK (
    decline_user_agent_hash IS NULL OR char_length(decline_user_agent_hash) = 64
  ),
  decline_reason TEXT CHECK (decline_reason IS NULL OR char_length(decline_reason) <= 1000),
  expired_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id TEXT REFERENCES users(id),
  cancellation_reason TEXT CHECK (
    cancellation_reason IS NULL OR char_length(cancellation_reason) <= 1000
  ),
  superseded_at TIMESTAMPTZ,
  superseded_by_user_id TEXT REFERENCES users(id),
  superseded_by_version_id TEXT,
  discarded_at TIMESTAMPTZ,
  discarded_by_user_id TEXT REFERENCES users(id),
  discard_reason TEXT CHECK (discard_reason IS NULL OR char_length(discard_reason) <= 1000),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, proposal_id, id),
  UNIQUE (organization_id, candidate_application_id, id),
  UNIQUE (organization_id, proposal_id, version_number),
  FOREIGN KEY (organization_id, proposal_id)
    REFERENCES proposals (organization_id, id),
  FOREIGN KEY (organization_id, candidate_application_id, candidate_id)
    REFERENCES candidate_applications (organization_id, id, candidate_id),
  FOREIGN KEY (
    organization_id,
    candidate_application_id,
    job_opening_id,
    job_opening_version_id
  )
    REFERENCES candidate_applications (
      organization_id,
      id,
      job_opening_id,
      job_opening_version_id
    ),
  CHECK (
    (status = 'draft' AND version_number IS NULL AND issued_at IS NULL)
    OR (status <> 'draft' AND version_number IS NOT NULL AND issued_at IS NOT NULL)
  ),
  CHECK (
    (discarded_at IS NULL AND discarded_by_user_id IS NULL)
    OR (status = 'draft' AND discarded_at IS NOT NULL AND discarded_by_user_id IS NOT NULL)
  )
);

ALTER TABLE proposals
  ADD CONSTRAINT proposals_current_version_fkey
  FOREIGN KEY (organization_id, id, current_version_id)
    REFERENCES proposal_versions (organization_id, proposal_id, id)
    DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE IF NOT EXISTS proposal_access_grants (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  proposal_version_id TEXT NOT NULL,
  candidate_application_id TEXT NOT NULL,
  token_hash TEXT NOT NULL CHECK (char_length(token_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (token_hash),
  FOREIGN KEY (organization_id, proposal_id, proposal_version_id)
    REFERENCES proposal_versions (organization_id, proposal_id, id),
  FOREIGN KEY (organization_id, candidate_application_id, proposal_version_id)
    REFERENCES proposal_versions (organization_id, candidate_application_id, id),
  CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status <> 'revoked')
  )
);

ALTER TABLE proposal_versions
  ADD CONSTRAINT proposal_versions_accepted_grant_fkey
  FOREIGN KEY (organization_id, accepted_access_grant_id)
    REFERENCES proposal_access_grants (organization_id, id)
    DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE proposal_versions
  ADD CONSTRAINT proposal_versions_declined_grant_fkey
  FOREIGN KEY (organization_id, declined_access_grant_id)
    REFERENCES proposal_access_grants (organization_id, id)
    DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE IF NOT EXISTS proposal_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  proposal_version_id TEXT,
  candidate_application_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'draft_created',
      'draft_updated',
      'draft_discarded',
      'issued',
      'access_grant_rotated',
      'accepted',
      'declined',
      'expired',
      'cancelled',
      'superseded'
    )
  ),
  actor_user_id TEXT REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, proposal_id)
    REFERENCES proposals (organization_id, id),
  FOREIGN KEY (organization_id, proposal_id, proposal_version_id)
    REFERENCES proposal_versions (organization_id, proposal_id, id),
  FOREIGN KEY (organization_id, candidate_application_id)
    REFERENCES candidate_applications (organization_id, id)
);

CREATE TABLE IF NOT EXISTS proposal_idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation TEXT NOT NULL CHECK (
    operation IN ('issue', 'supersede', 'accept', 'decline', 'cancel', 'rotate_grant')
  ),
  scope_id TEXT NOT NULL,
  key_hash TEXT NOT NULL CHECK (char_length(key_hash) = 64),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  result_resource_id TEXT,
  error_category TEXT CHECK (error_category IS NULL OR char_length(error_category) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  UNIQUE (organization_id, operation, scope_id, key_hash),
  CHECK (
    (status = 'completed' AND result_resource_id IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'failed' AND failed_at IS NOT NULL)
    OR (status = 'pending' AND completed_at IS NULL AND failed_at IS NULL)
  )
);

ALTER TABLE candidate_application_events
  ADD COLUMN proposal_version_id TEXT;

ALTER TABLE candidate_application_events
  ADD CONSTRAINT candidate_application_events_proposal_version_hired_check CHECK (
    proposal_version_id IS NULL OR event_type = 'hired'
  );

ALTER TABLE candidate_application_events
  ADD CONSTRAINT candidate_application_events_proposal_version_fkey
  FOREIGN KEY (organization_id, candidate_application_id, proposal_version_id)
    REFERENCES proposal_versions (organization_id, candidate_application_id, id);

CREATE INDEX IF NOT EXISTS idx_proposals_application
  ON proposals (organization_id, candidate_application_id);

CREATE INDEX IF NOT EXISTS idx_proposal_versions_proposal
  ON proposal_versions (organization_id, proposal_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_versions_one_active_draft
  ON proposal_versions (organization_id, proposal_id)
  WHERE status = 'draft' AND discarded_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_versions_one_issued_candidate_application
  ON proposal_versions (organization_id, candidate_application_id)
  WHERE status = 'issued';

CREATE INDEX IF NOT EXISTS idx_proposal_access_grants_version
  ON proposal_access_grants (organization_id, proposal_version_id, status);

CREATE INDEX IF NOT EXISTS idx_proposal_events_proposal
  ON proposal_events (organization_id, proposal_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_proposal_idempotency_lookup
  ON proposal_idempotency_keys (organization_id, operation, scope_id, key_hash);

CREATE INDEX IF NOT EXISTS idx_candidate_application_events_proposal_version
  ON candidate_application_events (organization_id, proposal_version_id)
  WHERE proposal_version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_proposal_parent_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
    OR NEW.candidate_application_id <> OLD.candidate_application_id
    OR NEW.candidate_id <> OLD.candidate_id
    OR NEW.job_opening_id <> OLD.job_opening_id
    OR NEW.job_opening_version_id <> OLD.job_opening_version_id
    OR NEW.created_by_user_id <> OLD.created_by_user_id
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'proposal_context_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_parent_immutable ON proposals;
CREATE TRIGGER trg_proposal_parent_immutable
BEFORE UPDATE ON proposals
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_parent_change();

CREATE OR REPLACE FUNCTION prevent_proposal_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'proposal_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_no_delete ON proposals;
CREATE TRIGGER trg_proposal_no_delete
BEFORE DELETE ON proposals
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_delete();

CREATE OR REPLACE FUNCTION prevent_proposal_version_invalid_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
    OR NEW.proposal_id <> OLD.proposal_id
    OR NEW.candidate_application_id <> OLD.candidate_application_id
    OR NEW.candidate_id <> OLD.candidate_id
    OR NEW.job_opening_id <> OLD.job_opening_id
    OR NEW.job_opening_version_id <> OLD.job_opening_version_id
    OR NEW.created_by_user_id <> OLD.created_by_user_id
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'proposal_version_context_immutable';
  END IF;

  IF NEW.version_number IS DISTINCT FROM OLD.version_number
    AND NOT (OLD.status = 'draft' AND NEW.status = 'issued') THEN
    RAISE EXCEPTION 'proposal_version_number_immutable';
  END IF;

  IF OLD.discarded_at IS NOT NULL THEN
    RAISE EXCEPTION 'proposal_version_discarded_immutable';
  END IF;

  IF OLD.status <> NEW.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status = 'issued')
      OR (OLD.status = 'issued' AND NEW.status IN ('accepted', 'declined', 'expired', 'cancelled', 'superseded'))
    ) THEN
      RAISE EXCEPTION 'proposal_version_invalid_transition';
    END IF;
  END IF;

  IF OLD.status <> 'draft'
    AND (
      NEW.content_snapshot <> OLD.content_snapshot
      OR NEW.compensation_snapshot <> OLD.compensation_snapshot
      OR NEW.content_hash <> OLD.content_hash
      OR NEW.compensation_hash <> OLD.compensation_hash
      OR NEW.presentation_schema_version IS DISTINCT FROM OLD.presentation_schema_version
      OR NEW.presentation_hash IS DISTINCT FROM OLD.presentation_hash
      OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
    ) THEN
    RAISE EXCEPTION 'proposal_version_issued_content_immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_version_invalid_update ON proposal_versions;
CREATE TRIGGER trg_proposal_version_invalid_update
BEFORE UPDATE ON proposal_versions
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_version_invalid_update();

CREATE OR REPLACE FUNCTION prevent_proposal_version_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'proposal_version_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_version_no_delete ON proposal_versions;
CREATE TRIGGER trg_proposal_version_no_delete
BEFORE DELETE ON proposal_versions
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_version_delete();

CREATE OR REPLACE FUNCTION prevent_proposal_access_grant_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'proposal_access_grant_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_access_grant_no_delete ON proposal_access_grants;
CREATE TRIGGER trg_proposal_access_grant_no_delete
BEFORE DELETE ON proposal_access_grants
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_access_grant_delete();

CREATE OR REPLACE FUNCTION prevent_proposal_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'proposal_event_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_event_no_update ON proposal_events;
CREATE TRIGGER trg_proposal_event_no_update
BEFORE UPDATE ON proposal_events
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_event_mutation();

DROP TRIGGER IF EXISTS trg_proposal_event_no_delete ON proposal_events;
CREATE TRIGGER trg_proposal_event_no_delete
BEFORE DELETE ON proposal_events
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_event_mutation();

CREATE OR REPLACE FUNCTION prevent_proposal_idempotency_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'proposal_idempotency_key_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_idempotency_no_delete ON proposal_idempotency_keys;
CREATE TRIGGER trg_proposal_idempotency_no_delete
BEFORE DELETE ON proposal_idempotency_keys
FOR EACH ROW EXECUTE FUNCTION prevent_proposal_idempotency_delete();

CREATE OR REPLACE FUNCTION enforce_proposal_current_version_terminal()
RETURNS TRIGGER AS $$
DECLARE
  current_status TEXT;
BEGIN
  IF OLD.current_version_id IS NOT NULL
    AND NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
    SELECT status INTO current_status
    FROM proposal_versions
    WHERE organization_id = OLD.organization_id
      AND proposal_id = OLD.id
      AND id = OLD.current_version_id;

    IF current_status NOT IN ('issued', 'superseded') THEN
      RAISE EXCEPTION 'proposal_current_version_terminal_cannot_move';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_current_version_terminal ON proposals;
CREATE TRIGGER trg_proposal_current_version_terminal
BEFORE UPDATE OF current_version_id ON proposals
FOR EACH ROW EXECUTE FUNCTION enforce_proposal_current_version_terminal();

COMMENT ON TABLE proposals IS 'Fase 22: envelope de proposta, sem status de negocio.';
COMMENT ON TABLE proposal_versions IS 'Fase 22: versoes imutaveis emitidas e lifecycle da proposta.';
COMMENT ON TABLE proposal_access_grants IS 'Fase 22: grants publicos hash-only para ProposalVersion.';
COMMENT ON TABLE proposal_events IS 'Fase 22: timeline funcional minimizada do modulo Propostas.';
COMMENT ON TABLE proposal_idempotency_keys IS 'Fase 22: idempotencia module-specific; nunca armazena chave bruta.';
