-- Fase 15 - Blueprint Organizacional / Implantacao Guiada
-- ADR-0020, ADR-0021, ADR-0022, ADR-0023; SPEC-018 v1.0.
--
-- Blueprint Version e um manifesto agregado e imutavel do contexto organizacional vigente
-- (ADR-0022, "Versao do Blueprint"); nunca uma copia integral dos modulos que o compoem
-- (SPEC-018, RN-048/RN-049). Esta migration cria as duas tabelas conceituais definidas pela
-- SPEC-018 (secao 24, "Banco conceitual") e o backfill de Organizations existentes (secao 22).

-- ---------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_blueprint_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  created_by_user_id TEXT REFERENCES users(id),
  created_source TEXT NOT NULL DEFAULT 'user' CHECK (created_source IN ('user', 'migration_backfill')),
  activated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  activation_readiness_snapshot JSONB,
  UNIQUE (organization_id, version_number),
  CHECK (status <> 'active' OR activated_at IS NOT NULL),
  CHECK (status <> 'active' OR activated_by_user_id IS NOT NULL),
  CHECK (status <> 'archived' OR archived_at IS NOT NULL)
);

-- RN-010 / RN-014: no maximo uma Blueprint Version `active` por Organization.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_blueprint_versions_one_active
  ON organization_blueprint_versions (organization_id)
  WHERE status = 'active';

-- RN-011: no maximo uma Blueprint Version `draft` por Organization, nesta primeira arquitetura.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_blueprint_versions_one_draft
  ON organization_blueprint_versions (organization_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_org_blueprint_versions_org_status
  ON organization_blueprint_versions (organization_id, status);

CREATE TABLE IF NOT EXISTS organization_blueprint_manifest_items (
  id TEXT PRIMARY KEY,
  blueprint_version_id TEXT NOT NULL REFERENCES organization_blueprint_versions(id),
  component_type TEXT NOT NULL CHECK (component_type IN (
    'dna',
    'job_profile',
    'organizational_unit',
    'competency_catalog_item',
    'question_catalog_item',
    'ai_feature_settings',
    'ai_provider_settings'
  )),
  component_ref_id TEXT,
  component_version_id TEXT,
  snapshot_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (blueprint_version_id, component_type, component_ref_id)
);

CREATE INDEX IF NOT EXISTS idx_org_blueprint_manifest_items_version
  ON organization_blueprint_manifest_items (blueprint_version_id);

-- ---------------------------------------------------------------------------------------
-- Triggers: organization_id immutability (SPEC-018 RN-004 equivalent for the blueprint)
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_blueprint_version_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'blueprint_version_organization_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_blueprint_versions_org_immutable ON organization_blueprint_versions;
CREATE TRIGGER trg_org_blueprint_versions_org_immutable
BEFORE UPDATE ON organization_blueprint_versions
FOR EACH ROW EXECUTE FUNCTION prevent_blueprint_version_organization_change();

-- ---------------------------------------------------------------------------------------
-- Triggers: active/archived immutability (SPEC-018 secao 18, "Imutabilidade no PostgreSQL")
--
-- draft: livre. active: so a transicao controlada active -> archived (arquivamento pela
-- proxima ativacao), e somente status/archived_at/updated_at podem mudar nela. archived:
-- nenhum UPDATE, em nenhuma circunstancia.
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_blueprint_version_locked_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'active' THEN
    IF NEW.status = 'archived'
      AND NEW.id = OLD.id
      AND NEW.organization_id = OLD.organization_id
      AND NEW.version_number = OLD.version_number
      AND NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id
      AND NEW.created_source = OLD.created_source
      AND NEW.activated_by_user_id IS NOT DISTINCT FROM OLD.activated_by_user_id
      AND NEW.created_at = OLD.created_at
      AND NEW.activated_at IS NOT DISTINCT FROM OLD.activated_at
      AND NEW.activation_readiness_snapshot IS NOT DISTINCT FROM OLD.activation_readiness_snapshot
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'blueprint_version_active_immutable';
  END IF;

  -- OLD.status = 'archived'
  RAISE EXCEPTION 'blueprint_version_archived_immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_blueprint_versions_locked_mutation ON organization_blueprint_versions;
CREATE TRIGGER trg_org_blueprint_versions_locked_mutation
BEFORE UPDATE ON organization_blueprint_versions
FOR EACH ROW EXECUTE FUNCTION prevent_blueprint_version_locked_mutation();

-- ---------------------------------------------------------------------------------------
-- Triggers: no physical delete of Blueprint Version rows (SPEC-018 secao 19, "Anti-DELETE")
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_blueprint_version_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'blueprint_version_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_blueprint_versions_no_delete ON organization_blueprint_versions;
CREATE TRIGGER trg_org_blueprint_versions_no_delete
BEFORE DELETE ON organization_blueprint_versions
FOR EACH ROW EXECUTE FUNCTION prevent_blueprint_version_delete();

-- ---------------------------------------------------------------------------------------
-- Triggers: manifest items are immutable once their parent version is active/archived
-- (SPEC-018 secao 19, "Manifest historico"). While the parent is still `draft`, items may be
-- freely inserted/updated/deleted -- this is how blueprints/service.ts rebuilds the manifest
-- during activation, strictly before flipping the parent version's status to `active`.
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_blueprint_manifest_item_delete_when_locked()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status
    FROM organization_blueprint_versions
    WHERE id = OLD.blueprint_version_id;

  IF parent_status IN ('active', 'archived') THEN
    RAISE EXCEPTION 'blueprint_manifest_item_locked';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_blueprint_manifest_items_no_delete_when_locked
  ON organization_blueprint_manifest_items;
CREATE TRIGGER trg_org_blueprint_manifest_items_no_delete_when_locked
BEFORE DELETE ON organization_blueprint_manifest_items
FOR EACH ROW EXECUTE FUNCTION prevent_blueprint_manifest_item_delete_when_locked();

CREATE OR REPLACE FUNCTION prevent_blueprint_manifest_item_update_when_locked()
RETURNS TRIGGER AS $$
DECLARE
  parent_status TEXT;
BEGIN
  IF NEW.blueprint_version_id IS DISTINCT FROM OLD.blueprint_version_id THEN
    RAISE EXCEPTION 'blueprint_manifest_item_version_reassignment_forbidden';
  END IF;

  SELECT status INTO parent_status
    FROM organization_blueprint_versions
    WHERE id = OLD.blueprint_version_id;

  IF parent_status IN ('active', 'archived') THEN
    RAISE EXCEPTION 'blueprint_manifest_item_locked';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_blueprint_manifest_items_no_update_when_locked
  ON organization_blueprint_manifest_items;
CREATE TRIGGER trg_org_blueprint_manifest_items_no_update_when_locked
BEFORE UPDATE ON organization_blueprint_manifest_items
FOR EACH ROW EXECUTE FUNCTION prevent_blueprint_manifest_item_update_when_locked();

-- ---------------------------------------------------------------------------------------
-- Trigger: cross-Organization manifest reference (SPEC-018 secao 20)
--
-- Defense in depth: the Service already resolves component_ref_id/component_version_id
-- entirely from queries already filtered by organization_id (no ID ever comes from the
-- client). This trigger covers a future application bug that would try to write a wrong
-- reference. ai_feature_settings/ai_provider_settings use a natural key (feature_key /
-- provider), never a surrogate id exclusive to one Organization, so they are structurally
-- safe already and are not looked up by row here.
-- ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_blueprint_manifest_item_cross_organization()
RETURNS TRIGGER AS $$
DECLARE
  blueprint_org_id TEXT;
  component_org_id TEXT;
BEGIN
  SELECT organization_id INTO blueprint_org_id
    FROM organization_blueprint_versions
    WHERE id = NEW.blueprint_version_id;

  IF blueprint_org_id IS NULL THEN
    RAISE EXCEPTION 'blueprint_manifest_item_version_not_found';
  END IF;

  component_org_id := CASE NEW.component_type
    WHEN 'dna' THEN (
      SELECT organization_id FROM organization_dna_versions WHERE id = NEW.component_version_id
    )
    WHEN 'job_profile' THEN (
      SELECT organization_id FROM job_profiles WHERE id = NEW.component_ref_id
    )
    WHEN 'organizational_unit' THEN (
      SELECT organization_id FROM organizational_units WHERE id = NEW.component_ref_id
    )
    WHEN 'competency_catalog_item' THEN (
      SELECT organization_id FROM competency_catalog_items WHERE id = NEW.component_ref_id
    )
    WHEN 'question_catalog_item' THEN (
      SELECT organization_id FROM question_catalog_items WHERE id = NEW.component_ref_id
    )
    ELSE blueprint_org_id
  END;

  IF component_org_id IS DISTINCT FROM blueprint_org_id THEN
    RAISE EXCEPTION 'blueprint_manifest_item_cross_organization';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_blueprint_manifest_items_no_cross_organization
  ON organization_blueprint_manifest_items;
CREATE TRIGGER trg_org_blueprint_manifest_items_no_cross_organization
BEFORE INSERT OR UPDATE ON organization_blueprint_manifest_items
FOR EACH ROW EXECUTE FUNCTION prevent_blueprint_manifest_item_cross_organization();

-- ---------------------------------------------------------------------------------------
-- Backfill (SPEC-018 secao 22; runs inside this same migration transaction -- see
-- src/server/migrations.ts, which wraps the whole file in one BEGIN/COMMIT -- so the
-- invariant "every Organization has exactly one Blueprint Version draft" is established
-- atomically with the tables themselves, with no deploy window without it).
--
-- Idempotent (WHERE NOT EXISTS), though schema_migrations already prevents re-running this
-- file. Never marks a backfilled version `active`: no pre-existing Organization has actually
-- gone through Etapa 10 (Ativacao) with a validated readiness, so marking one `active` would
-- be a false statement about an activation that never happened.
-- ---------------------------------------------------------------------------------------

INSERT INTO organization_blueprint_versions (
  id, organization_id, version_number, status,
  created_by_user_id, created_source,
  created_at, updated_at
)
SELECT
  'bpv_backfill_' || o.id,
  o.id,
  1,
  'draft',
  NULL,
  'migration_backfill',
  NOW(),
  NOW()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM organization_blueprint_versions v WHERE v.organization_id = o.id
);
