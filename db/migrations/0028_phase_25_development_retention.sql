-- Fase 25: Desenvolvimento e Retencao (SPEC-017 v1.0).
--
-- Seis tabelas fisicas:
-- 1. development_plans
-- 2. development_goals
-- 3. development_checkins
-- 4. retention_concerns
-- 5. retention_actions
-- 6. development_retention_idempotency_keys
--
-- Employment e o aggregate root operacional obrigatorio. Sem Performance, sem
-- score/ranking/risk, sem IA, sem eventos proprios (audit_events + timestamps
-- de estado sao suficientes), sem estruturas da Fase 26+.

CREATE TABLE IF NOT EXISTS development_plans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  employment_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  purpose TEXT CHECK (purpose IS NULL OR char_length(purpose) <= 1000),
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'active', 'completed', 'cancelled', 'closed_due_to_employment_end')
  ),
  -- Autorizacao de member (SPEC-017 s15/s36): a matriz RBAC diz "Somente se explicitamente
  -- autorizado no plano" para goal/check-in -- a autorizacao vive no Plan, nao por Goal. Um
  -- member so pode agir em goal/check-in deste plano se for exatamente este assignee.
  assignee_membership_id TEXT,
  created_by_membership_id TEXT NOT NULL,
  activated_by_membership_id TEXT,
  completed_by_membership_id TEXT,
  cancelled_by_membership_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, employment_id, id),
  FOREIGN KEY (organization_id, employment_id)
    REFERENCES employments (organization_id, id),
  FOREIGN KEY (organization_id, assignee_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, activated_by_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, completed_by_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, cancelled_by_membership_id)
    REFERENCES memberships (organization_id, id),
  CONSTRAINT development_plans_status_lifecycle_check CHECK (
    (status = 'draft'
      AND activated_at IS NULL AND activated_by_membership_id IS NULL
      AND completed_at IS NULL AND completed_by_membership_id IS NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL
      AND cancel_reason IS NULL)
    OR
    (status = 'active'
      AND activated_at IS NOT NULL AND activated_by_membership_id IS NOT NULL
      AND completed_at IS NULL AND completed_by_membership_id IS NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL
      AND cancel_reason IS NULL)
    OR
    (status = 'completed'
      AND activated_at IS NOT NULL AND activated_by_membership_id IS NOT NULL
      AND completed_at IS NOT NULL AND completed_by_membership_id IS NOT NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL
      AND cancel_reason IS NULL)
    OR
    (status = 'cancelled'
      AND completed_at IS NULL AND completed_by_membership_id IS NULL
      AND cancelled_at IS NOT NULL AND cancelled_by_membership_id IS NOT NULL
      AND cancel_reason IS NOT NULL)
    OR
    (status = 'closed_due_to_employment_end'
      AND completed_at IS NULL AND completed_by_membership_id IS NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL
      AND cancel_reason IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_development_plans_one_non_final
  ON development_plans (organization_id, employment_id)
  WHERE status IN ('draft', 'active');

CREATE INDEX IF NOT EXISTS idx_development_plans_employment
  ON development_plans (organization_id, employment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_development_plans_status
  ON development_plans (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS development_goals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  employment_id TEXT NOT NULL,
  development_plan_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  due_date DATE,
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'cancelled')),
  created_by_membership_id TEXT NOT NULL,
  completed_by_membership_id TEXT,
  cancelled_by_membership_id TEXT,
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, employment_id, development_plan_id)
    REFERENCES development_plans (organization_id, employment_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, completed_by_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, cancelled_by_membership_id)
    REFERENCES memberships (organization_id, id),
  CONSTRAINT development_goals_status_lifecycle_check CHECK (
    (status = 'open'
      AND completed_at IS NULL AND completed_by_membership_id IS NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL
      AND cancel_reason IS NULL)
    OR
    (status = 'completed'
      AND completed_at IS NOT NULL AND completed_by_membership_id IS NOT NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL
      AND cancel_reason IS NULL)
    OR
    (status = 'cancelled'
      AND completed_at IS NULL AND completed_by_membership_id IS NULL
      AND cancelled_at IS NOT NULL AND cancelled_by_membership_id IS NOT NULL
      AND cancel_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_development_goals_plan
  ON development_goals (organization_id, development_plan_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_development_plans_assignee
  ON development_plans (organization_id, assignee_membership_id, status)
  WHERE assignee_membership_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS development_checkins (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  employment_id TEXT NOT NULL,
  development_plan_id TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 2000),
  visibility TEXT NOT NULL CHECK (visibility IN ('owner_admin_only', 'owner_admin_and_assignee')),
  submitted_by_membership_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, employment_id, development_plan_id)
    REFERENCES development_plans (organization_id, employment_id, id),
  FOREIGN KEY (organization_id, submitted_by_membership_id)
    REFERENCES memberships (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_development_checkins_plan
  ON development_checkins (organization_id, development_plan_id, submitted_at ASC);

CREATE TABLE IF NOT EXISTS retention_concerns (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  employment_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (
    source IN (
      'person_explicit_statement',
      'human_observation',
      'development_check_in',
      'administrative_decision'
    )
  ),
  category TEXT NOT NULL CHECK (
    category IN (
      'career_growth',
      'work_context',
      'management_attention',
      'role_fit',
      'other_minimized'
    )
  ),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'cancelled')),
  visibility TEXT NOT NULL CHECK (visibility IN ('owner_admin_only', 'owner_admin_and_assignee')),
  created_by_membership_id TEXT NOT NULL,
  resolved_by_membership_id TEXT,
  cancelled_by_membership_id TEXT,
  resolution_summary TEXT CHECK (resolution_summary IS NULL OR char_length(resolution_summary) <= 1000),
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, employment_id, id),
  FOREIGN KEY (organization_id, employment_id)
    REFERENCES employments (organization_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, resolved_by_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, cancelled_by_membership_id)
    REFERENCES memberships (organization_id, id),
  CONSTRAINT retention_concerns_status_lifecycle_check CHECK (
    (status = 'open'
      AND resolved_at IS NULL AND resolved_by_membership_id IS NULL AND resolution_summary IS NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL AND cancel_reason IS NULL)
    OR
    (status = 'resolved'
      AND resolved_at IS NOT NULL AND resolved_by_membership_id IS NOT NULL
      AND resolution_summary IS NOT NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL AND cancel_reason IS NULL)
    OR
    (status = 'cancelled'
      AND resolved_at IS NULL AND resolved_by_membership_id IS NULL AND resolution_summary IS NULL
      AND cancelled_at IS NOT NULL AND cancelled_by_membership_id IS NOT NULL
      AND cancel_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_retention_concerns_employment
  ON retention_concerns (organization_id, employment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retention_concerns_status
  ON retention_concerns (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS retention_actions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  employment_id TEXT NOT NULL,
  retention_concern_id TEXT,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'conversation',
      'follow_up',
      'role_context_review',
      'development_alignment',
      'administrative_support',
      'other_minimized'
    )
  ),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'cancelled')),
  created_by_membership_id TEXT NOT NULL,
  completed_by_membership_id TEXT,
  cancelled_by_membership_id TEXT,
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, employment_id)
    REFERENCES employments (organization_id, id),
  FOREIGN KEY (organization_id, employment_id, retention_concern_id)
    REFERENCES retention_concerns (organization_id, employment_id, id),
  FOREIGN KEY (organization_id, created_by_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, completed_by_membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, cancelled_by_membership_id)
    REFERENCES memberships (organization_id, id),
  CONSTRAINT retention_actions_status_lifecycle_check CHECK (
    (status = 'open'
      AND completed_at IS NULL AND completed_by_membership_id IS NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL
      AND cancel_reason IS NULL)
    OR
    (status = 'completed'
      AND completed_at IS NOT NULL AND completed_by_membership_id IS NOT NULL
      AND cancelled_at IS NULL AND cancelled_by_membership_id IS NULL
      AND cancel_reason IS NULL)
    OR
    (status = 'cancelled'
      AND completed_at IS NULL AND completed_by_membership_id IS NULL
      AND cancelled_at IS NOT NULL AND cancelled_by_membership_id IS NOT NULL
      AND cancel_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_retention_actions_employment
  ON retention_actions (organization_id, employment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retention_actions_concern
  ON retention_actions (organization_id, retention_concern_id)
  WHERE retention_concern_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS development_retention_idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation TEXT NOT NULL CHECK (
    operation IN (
      'create_plan',
      'activate_plan',
      'complete_plan',
      'cancel_plan',
      'create_goal',
      'complete_goal',
      'cancel_goal',
      'create_checkin',
      'create_concern',
      'resolve_concern',
      'cancel_concern',
      'create_action',
      'complete_action',
      'cancel_action'
    )
  ),
  scope_id TEXT,
  key_hash TEXT NOT NULL CHECK (char_length(key_hash) = 64),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  result_resource_id TEXT,
  error_category TEXT CHECK (error_category IS NULL OR char_length(error_category) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  UNIQUE (organization_id, operation, scope_id, key_hash),
  CONSTRAINT development_retention_idempotency_keys_status_lifecycle_check CHECK (
    (status = 'completed' AND result_resource_id IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'failed' AND failed_at IS NOT NULL)
    OR (status = 'pending' AND completed_at IS NULL AND failed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_development_retention_idempotency_lookup
  ON development_retention_idempotency_keys (organization_id, operation, scope_id, key_hash);

-- -----------------------------------------------------------------------------------------
-- No-delete
-- -----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_development_plan_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'development_plan_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_development_goal_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'development_goal_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_development_checkin_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'development_checkin_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_development_checkin_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'development_checkin_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_retention_concern_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'retention_concern_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_retention_action_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'retention_action_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_development_retention_idempotency_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'development_retention_idempotency_key_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------------------
-- DevelopmentPlan: insert/update rules
-- -----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_development_plan_insert_rules()
RETURNS TRIGGER AS $$
DECLARE
  employment_status TEXT;
BEGIN
  IF NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'development_plan_insert_must_be_draft';
  END IF;

  SELECT status INTO employment_status
    FROM employments
    WHERE organization_id = NEW.organization_id AND id = NEW.employment_id;

  IF employment_status IS NULL THEN
    RAISE EXCEPTION 'development_plan_employment_not_found';
  END IF;

  IF employment_status <> 'active' THEN
    RAISE EXCEPTION 'development_plan_employment_not_active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_development_plan_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.organization_id <> NEW.organization_id
    OR OLD.employment_id <> NEW.employment_id
    OR OLD.created_by_membership_id <> NEW.created_by_membership_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'development_plan_context_immutable';
  END IF;

  IF OLD.status IN ('completed', 'cancelled', 'closed_due_to_employment_end') THEN
    RAISE EXCEPTION 'development_plan_final_immutable';
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('active', 'cancelled', 'closed_due_to_employment_end'))
    OR (OLD.status = 'active' AND NEW.status IN ('completed', 'cancelled', 'closed_due_to_employment_end'))
  ) THEN
    RAISE EXCEPTION 'development_plan_invalid_status_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------------------
-- DevelopmentGoal: parent (plan) must not be final; standard lifecycle otherwise
-- -----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_development_goal_write_rules()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status
    FROM development_plans
    WHERE organization_id = NEW.organization_id AND id = NEW.development_plan_id;

  IF parent_status IS NULL THEN
    RAISE EXCEPTION 'development_goal_parent_not_found';
  END IF;

  IF parent_status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'development_goal_parent_final';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' THEN
      RAISE EXCEPTION 'development_goal_insert_must_be_open';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.organization_id <> NEW.organization_id
    OR OLD.employment_id <> NEW.employment_id
    OR OLD.development_plan_id <> NEW.development_plan_id
    OR OLD.created_by_membership_id <> NEW.created_by_membership_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'development_goal_context_immutable';
  END IF;

  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'development_goal_final_immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    OLD.status = 'open' AND NEW.status IN ('completed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'development_goal_invalid_status_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------------------
-- DevelopmentCheckIn: parent (plan) must be active at insert time; fully immutable after
-- -----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_development_checkin_insert_rules()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status
    FROM development_plans
    WHERE organization_id = NEW.organization_id AND id = NEW.development_plan_id;

  IF parent_status IS NULL THEN
    RAISE EXCEPTION 'development_checkin_parent_not_found';
  END IF;

  IF parent_status <> 'active' THEN
    RAISE EXCEPTION 'development_checkin_parent_not_active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------------------
-- RetentionConcern: insert requires Employment active; standard lifecycle otherwise
-- -----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_retention_concern_insert_rules()
RETURNS TRIGGER AS $$
DECLARE
  employment_status TEXT;
BEGIN
  IF NEW.status <> 'open' THEN
    RAISE EXCEPTION 'retention_concern_insert_must_be_open';
  END IF;

  SELECT status INTO employment_status
    FROM employments
    WHERE organization_id = NEW.organization_id AND id = NEW.employment_id;

  IF employment_status IS NULL THEN
    RAISE EXCEPTION 'retention_concern_employment_not_found';
  END IF;

  IF employment_status <> 'active' THEN
    RAISE EXCEPTION 'retention_concern_employment_not_active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_retention_concern_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.organization_id <> NEW.organization_id
    OR OLD.employment_id <> NEW.employment_id
    OR OLD.source <> NEW.source
    OR OLD.created_by_membership_id <> NEW.created_by_membership_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'retention_concern_context_immutable';
  END IF;

  IF OLD.status IN ('resolved', 'cancelled') THEN
    RAISE EXCEPTION 'retention_concern_final_immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    OLD.status = 'open' AND NEW.status IN ('resolved', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'retention_concern_invalid_status_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------------------
-- RetentionAction: with concern, parent concern must not be final; without concern,
-- Employment must be active. Standard lifecycle otherwise.
-- -----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_retention_action_write_rules()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
  employment_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' THEN
      RAISE EXCEPTION 'retention_action_insert_must_be_open';
    END IF;

    IF NEW.retention_concern_id IS NOT NULL THEN
      SELECT status INTO parent_status
        FROM retention_concerns
        WHERE organization_id = NEW.organization_id AND id = NEW.retention_concern_id;

      IF parent_status IS NULL THEN
        RAISE EXCEPTION 'retention_action_concern_not_found';
      END IF;

      IF parent_status <> 'open' THEN
        RAISE EXCEPTION 'retention_action_concern_final';
      END IF;
    ELSE
      SELECT status INTO employment_status
        FROM employments
        WHERE organization_id = NEW.organization_id AND id = NEW.employment_id;

      IF employment_status IS NULL THEN
        RAISE EXCEPTION 'retention_action_employment_not_found';
      END IF;

      IF employment_status <> 'active' THEN
        RAISE EXCEPTION 'retention_action_employment_not_active';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.organization_id <> NEW.organization_id
    OR OLD.employment_id <> NEW.employment_id
    OR OLD.retention_concern_id IS DISTINCT FROM NEW.retention_concern_id
    OR OLD.action_type <> NEW.action_type
    OR OLD.created_by_membership_id <> NEW.created_by_membership_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'retention_action_context_immutable';
  END IF;

  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'retention_action_final_immutable';
  END IF;

  IF OLD.status <> NEW.status AND NOT (
    OLD.status = 'open' AND NEW.status IN ('completed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'retention_action_invalid_status_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------------------
-- Employment end reconciliation: DevelopmentPlan nao final vira closed_due_to_employment_end
-- na MESMA transacao do end() de Employment (Fase 24). A trigger pertence a esta migration
-- (Fase 25) e apenas reage; nunca escreve em employments nem controla seu lifecycle.
-- -----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reconcile_development_plans_on_employment_end()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE development_plans
    SET status = 'closed_due_to_employment_end', updated_at = NOW()
    WHERE organization_id = NEW.organization_id
      AND employment_id = NEW.id
      AND status IN ('draft', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_development_plan_no_delete ON development_plans;
CREATE TRIGGER trg_development_plan_no_delete
BEFORE DELETE ON development_plans
FOR EACH ROW EXECUTE FUNCTION prevent_development_plan_delete();

DROP TRIGGER IF EXISTS trg_development_plan_insert_rules ON development_plans;
CREATE TRIGGER trg_development_plan_insert_rules
BEFORE INSERT ON development_plans
FOR EACH ROW EXECUTE FUNCTION enforce_development_plan_insert_rules();

DROP TRIGGER IF EXISTS trg_development_plan_update_rules ON development_plans;
CREATE TRIGGER trg_development_plan_update_rules
BEFORE UPDATE ON development_plans
FOR EACH ROW EXECUTE FUNCTION enforce_development_plan_update_rules();

DROP TRIGGER IF EXISTS trg_development_goal_no_delete ON development_goals;
CREATE TRIGGER trg_development_goal_no_delete
BEFORE DELETE ON development_goals
FOR EACH ROW EXECUTE FUNCTION prevent_development_goal_delete();

DROP TRIGGER IF EXISTS trg_development_goal_insert_rules ON development_goals;
CREATE TRIGGER trg_development_goal_insert_rules
BEFORE INSERT ON development_goals
FOR EACH ROW EXECUTE FUNCTION enforce_development_goal_write_rules();

DROP TRIGGER IF EXISTS trg_development_goal_update_rules ON development_goals;
CREATE TRIGGER trg_development_goal_update_rules
BEFORE UPDATE ON development_goals
FOR EACH ROW EXECUTE FUNCTION enforce_development_goal_write_rules();

DROP TRIGGER IF EXISTS trg_development_checkin_no_delete ON development_checkins;
CREATE TRIGGER trg_development_checkin_no_delete
BEFORE DELETE ON development_checkins
FOR EACH ROW EXECUTE FUNCTION prevent_development_checkin_delete();

DROP TRIGGER IF EXISTS trg_development_checkin_no_update ON development_checkins;
CREATE TRIGGER trg_development_checkin_no_update
BEFORE UPDATE ON development_checkins
FOR EACH ROW EXECUTE FUNCTION prevent_development_checkin_update();

DROP TRIGGER IF EXISTS trg_development_checkin_insert_rules ON development_checkins;
CREATE TRIGGER trg_development_checkin_insert_rules
BEFORE INSERT ON development_checkins
FOR EACH ROW EXECUTE FUNCTION enforce_development_checkin_insert_rules();

DROP TRIGGER IF EXISTS trg_retention_concern_no_delete ON retention_concerns;
CREATE TRIGGER trg_retention_concern_no_delete
BEFORE DELETE ON retention_concerns
FOR EACH ROW EXECUTE FUNCTION prevent_retention_concern_delete();

DROP TRIGGER IF EXISTS trg_retention_concern_insert_rules ON retention_concerns;
CREATE TRIGGER trg_retention_concern_insert_rules
BEFORE INSERT ON retention_concerns
FOR EACH ROW EXECUTE FUNCTION enforce_retention_concern_insert_rules();

DROP TRIGGER IF EXISTS trg_retention_concern_update_rules ON retention_concerns;
CREATE TRIGGER trg_retention_concern_update_rules
BEFORE UPDATE ON retention_concerns
FOR EACH ROW EXECUTE FUNCTION enforce_retention_concern_update_rules();

DROP TRIGGER IF EXISTS trg_retention_action_no_delete ON retention_actions;
CREATE TRIGGER trg_retention_action_no_delete
BEFORE DELETE ON retention_actions
FOR EACH ROW EXECUTE FUNCTION prevent_retention_action_delete();

DROP TRIGGER IF EXISTS trg_retention_action_write_rules ON retention_actions;
CREATE TRIGGER trg_retention_action_write_rules
BEFORE INSERT OR UPDATE ON retention_actions
FOR EACH ROW EXECUTE FUNCTION enforce_retention_action_write_rules();

DROP TRIGGER IF EXISTS trg_development_retention_idempotency_no_delete ON development_retention_idempotency_keys;
CREATE TRIGGER trg_development_retention_idempotency_no_delete
BEFORE DELETE ON development_retention_idempotency_keys
FOR EACH ROW EXECUTE FUNCTION prevent_development_retention_idempotency_delete();

DROP TRIGGER IF EXISTS trg_reconcile_development_plans_on_employment_end ON employments;
CREATE TRIGGER trg_reconcile_development_plans_on_employment_end
AFTER UPDATE OF status ON employments
FOR EACH ROW
WHEN (NEW.status = 'ended' AND OLD.status IN ('pending', 'active'))
EXECUTE FUNCTION reconcile_development_plans_on_employment_end();

COMMENT ON TABLE development_plans IS 'Fase 25: plano de desenvolvimento vinculado a Employment; fecha automaticamente quando Employment termina.';
COMMENT ON TABLE development_goals IS 'Fase 25: objetivos de um DevelopmentPlan; sem KPI/score/rating.';
COMMENT ON TABLE development_checkins IS 'Fase 25: registro imutavel de acompanhamento; sem edicao apos submissao.';
COMMENT ON TABLE retention_concerns IS 'Fase 25: preocupacao de retencao registrada por ator humano; nunca automatica.';
COMMENT ON TABLE retention_actions IS 'Fase 25: acao humana de retencao; pode existir sem RetentionConcern.';
COMMENT ON TABLE development_retention_idempotency_keys IS 'Fase 25: idempotencia module-specific; nunca armazena chave bruta.';
