-- Phase 11: AI infrastructure (ADR-0016, ADR-0017, ADR-0018, ADR-0019, SPEC-014 v1.0).
--
-- Implements only the central AI infrastructure. No AI Feature (evaluation, matching,
-- ranking, interview summary, etc.) is implemented here, and no real provider or Secret
-- Manager is wired by this migration -- see the accompanying application code
-- (src/server/ai/**) for the FakeProviderAdapter / InMemorySecretManager boundary.

-- ---------------------------------------------------------------------------------------
-- organization_ai_settings (ADR-0016)
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_ai_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  platform_ai_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  organization_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- organization_ai_enabled is the Organization's persisted preference. It is never forced to
-- false by a platform-level change; the effective state (platform_ai_allowed AND
-- organization_ai_enabled) is computed by the domain (AIPolicyService), not by the database.

-- ---------------------------------------------------------------------------------------
-- ai_feature_catalog (ADR-0017, ADR-0019) -- global, platform-owned
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_feature_catalog (
  feature_key TEXT PRIMARY KEY CHECK (feature_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  feature_available_on_platform BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_allowed_on_platform BOOLEAN NOT NULL DEFAULT FALSE,
  required_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(required_capabilities) = 'object'),
  -- Which prompt_key this Feature uses (ADR-0019 "Prompt por Feature": "Cada Feature
  -- referencia explicitamente um prompt_key"). Nullable: a Feature can exist in the catalog
  -- before a prompt has been authored for it; not a hard FK because prompt_key alone is not
  -- unique in ai_prompt_registry (versions share it) -- validated in the application layer.
  default_prompt_key TEXT CHECK (default_prompt_key IS NULL OR default_prompt_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------------------
-- organization_ai_feature_settings (ADR-0017, ADR-0019)
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_ai_feature_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  feature_key TEXT NOT NULL REFERENCES ai_feature_catalog(feature_key),
  organization_feature_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_org_ai_feature_settings_org
  ON organization_ai_feature_settings (organization_id);

-- ---------------------------------------------------------------------------------------
-- ai_provider_catalog -- global, platform-owned, provider-agnostic
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_provider_catalog (
  provider_key TEXT PRIMARY KEY CHECK (provider_key ~ '^[a-z][a-z0-9_-]{1,49}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capabilities) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------------------
-- organization_ai_provider_configs (ADR-0018)
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_ai_provider_configs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL REFERENCES ai_provider_catalog(provider_key),
  credential_mode TEXT NOT NULL CHECK (
    credential_mode IN ('disabled', 'platform_managed', 'customer_managed')
  ),
  status TEXT NOT NULL CHECK (status IN ('configured', 'invalid', 'revoked', 'error')),
  -- secret_reference is an opaque pointer into the SecretManager. The credential itself is
  -- never stored here, in any form. No format-specific constraint is applied to this column;
  -- the guarantee that it never holds a real secret is architectural (see src/server/ai/secrets
  -- and src/server/ai/provider-config-service.ts), not a regex on this table.
  secret_reference TEXT,
  masked_identifier TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Nullable: this row can be written by a Platform Admin actor (platform_managed), whose
  -- Actor.userId is optional by design (Platform Admin is not a Membership role -- ADR-0003).
  configured_by_user_id TEXT REFERENCES users(id),
  last_validated_at TIMESTAMPTZ,
  last_validation_status TEXT CHECK (
    last_validation_status IS NULL
    OR last_validation_status IN ('valid', 'invalid', 'revoked', 'error', 'unknown')
  ),
  revoked_at TIMESTAMPTZ,
  configured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  CHECK (
    credential_mode <> 'customer_managed'
    OR status <> 'configured'
    OR secret_reference IS NOT NULL
  )
);

-- At most one ACTIVE config per Organization + provider. Historical (is_active = false) rows
-- may coexist freely and are never physically deleted.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_provider_config_active
  ON organization_ai_provider_configs (organization_id, provider)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_org
  ON organization_ai_provider_configs (organization_id, is_active);

-- ---------------------------------------------------------------------------------------
-- ai_model_registry -- global, platform-owned
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_model_registry (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL REFERENCES ai_provider_catalog(provider_key),
  model_key TEXT NOT NULL,
  provider_model_identifier TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capabilities) = 'object'),
  context_window INTEGER CHECK (context_window IS NULL OR context_window > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, model_key)
);

-- ---------------------------------------------------------------------------------------
-- ai_prompt_registry -- global, platform-owned, versioned, immutable once published
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_prompt_registry (
  id TEXT PRIMARY KEY,
  prompt_key TEXT NOT NULL CHECK (prompt_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
  version INTEGER NOT NULL CHECK (version >= 1),
  feature_key TEXT NOT NULL REFERENCES ai_feature_catalog(feature_key),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  template TEXT NOT NULL CHECK (char_length(template) BETWEEN 1 AND 20000),
  input_schema JSONB NOT NULL CHECK (jsonb_typeof(input_schema) = 'object'),
  output_schema JSONB NOT NULL CHECK (jsonb_typeof(output_schema) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  -- Nullable for the same reason as organization_ai_provider_configs.configured_by_user_id:
  -- only Platform Admin writes here, and Platform Admin's Actor.userId is optional.
  created_by_user_id TEXT REFERENCES users(id),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prompt_key, version)
);

-- At most one published version per prompt_key. This is a defense-in-depth backstop; the
-- primary mechanism is the atomic "archive old, publish new" transaction in
-- AIPromptRegistryService.publish().
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_prompt_published
  ON ai_prompt_registry (prompt_key)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_ai_prompt_registry_key
  ON ai_prompt_registry (prompt_key, version DESC);

-- ---------------------------------------------------------------------------------------
-- ai_provider_routing_policies (ADR-0019) -- no fallback column, by explicit decision
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_provider_routing_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  feature_key TEXT NOT NULL REFERENCES ai_feature_catalog(feature_key),
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (provider, model_key) REFERENCES ai_model_registry (provider, model_key)
);

-- Duplicate priority within the same Organization + Feature is impossible at the database
-- level for active routes -- not just validated in the application.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_routing_priority_active
  ON ai_provider_routing_policies (organization_id, feature_key, priority)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ai_routing_policies_lookup
  ON ai_provider_routing_policies (organization_id, feature_key, status, priority);

-- ---------------------------------------------------------------------------------------
-- ai_executions (ADR-0019)
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_executions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  feature_key TEXT NOT NULL REFERENCES ai_feature_catalog(feature_key),
  provider TEXT NOT NULL,
  model_key TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  credential_mode TEXT NOT NULL CHECK (
    credential_mode IN ('disabled', 'platform_managed', 'customer_managed')
  ),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key TEXT,
  correlation_id TEXT NOT NULL,
  requested_by_user_id TEXT REFERENCES users(id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  estimated_cost NUMERIC(14, 6) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  error_category TEXT CHECK (
    error_category IS NULL OR error_category IN (
      'authentication_error', 'quota_exceeded', 'rate_limited', 'timeout',
      'provider_unavailable', 'network_error', 'invalid_response',
      'configuration_error', 'policy_denied', 'content_blocked', 'unknown_error'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- AI Execution never stores full prompt/response content by design: there is no column for
  -- it, deliberately, so no application-level filtering is relied upon to keep it out.
  UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ai_executions_org_feature
  ON ai_executions (organization_id, feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_executions_correlation
  ON ai_executions (correlation_id);

-- Idempotent replay: at most one non-terminal-failed execution per Organization + Feature +
-- idempotency_key. failed/cancelled rows are excluded so a new attempt with the same key is
-- allowed after a failure.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_execution_idempotency
  ON ai_executions (organization_id, feature_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('pending', 'running', 'succeeded');

-- ---------------------------------------------------------------------------------------
-- Triggers: organization_id immutability
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_ai_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'ai_organization_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_ai_feature_settings_org_immutable ON organization_ai_feature_settings;
CREATE TRIGGER trg_org_ai_feature_settings_org_immutable
BEFORE UPDATE ON organization_ai_feature_settings
FOR EACH ROW EXECUTE FUNCTION prevent_ai_organization_change();

DROP TRIGGER IF EXISTS trg_ai_provider_configs_org_immutable ON organization_ai_provider_configs;
CREATE TRIGGER trg_ai_provider_configs_org_immutable
BEFORE UPDATE ON organization_ai_provider_configs
FOR EACH ROW EXECUTE FUNCTION prevent_ai_organization_change();

DROP TRIGGER IF EXISTS trg_ai_routing_policies_org_immutable ON ai_provider_routing_policies;
CREATE TRIGGER trg_ai_routing_policies_org_immutable
BEFORE UPDATE ON ai_provider_routing_policies
FOR EACH ROW EXECUTE FUNCTION prevent_ai_organization_change();

DROP TRIGGER IF EXISTS trg_ai_executions_org_immutable ON ai_executions;
CREATE TRIGGER trg_ai_executions_org_immutable
BEFORE UPDATE ON ai_executions
FOR EACH ROW EXECUTE FUNCTION prevent_ai_organization_change();

-- ---------------------------------------------------------------------------------------
-- Triggers: no physical delete on historical/audit-relevant tables
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_ai_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ai_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_provider_configs_no_delete ON organization_ai_provider_configs;
CREATE TRIGGER trg_ai_provider_configs_no_delete
BEFORE DELETE ON organization_ai_provider_configs
FOR EACH ROW EXECUTE FUNCTION prevent_ai_delete();

DROP TRIGGER IF EXISTS trg_ai_prompt_registry_no_delete ON ai_prompt_registry;
CREATE TRIGGER trg_ai_prompt_registry_no_delete
BEFORE DELETE ON ai_prompt_registry
FOR EACH ROW EXECUTE FUNCTION prevent_ai_delete();

DROP TRIGGER IF EXISTS trg_ai_routing_policies_no_delete ON ai_provider_routing_policies;
CREATE TRIGGER trg_ai_routing_policies_no_delete
BEFORE DELETE ON ai_provider_routing_policies
FOR EACH ROW EXECUTE FUNCTION prevent_ai_delete();

DROP TRIGGER IF EXISTS trg_ai_executions_no_delete ON ai_executions;
CREATE TRIGGER trg_ai_executions_no_delete
BEFORE DELETE ON ai_executions
FOR EACH ROW EXECUTE FUNCTION prevent_ai_delete();

-- ---------------------------------------------------------------------------------------
-- Trigger: published prompt content is immutable (a new version must be created instead)
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_ai_prompt_content_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.published_at IS NOT NULL AND (
    NEW.template IS DISTINCT FROM OLD.template
    OR NEW.input_schema IS DISTINCT FROM OLD.input_schema
    OR NEW.output_schema IS DISTINCT FROM OLD.output_schema
  ) THEN
    RAISE EXCEPTION 'ai_prompt_published_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_prompt_content_immutable ON ai_prompt_registry;
CREATE TRIGGER trg_ai_prompt_content_immutable
BEFORE UPDATE ON ai_prompt_registry
FOR EACH ROW EXECUTE FUNCTION prevent_ai_prompt_content_mutation();
