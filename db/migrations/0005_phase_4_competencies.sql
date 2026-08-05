CREATE TABLE IF NOT EXISTS global_competencies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'technical',
      'behavioral',
      'leadership',
      'management',
      'tools',
      'languages',
      'compliance',
      'safety',
      'other'
    )
  ),
  definition TEXT NOT NULL DEFAULT '',
  positive_evidences JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(positive_evidences) = 'array'),
  negative_evidences JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(negative_evidences) = 'array'),
  practical_examples JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(practical_examples) = 'array'),
  proficiency_levels JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(proficiency_levels) = 'array'),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'deprecated')),
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_code)
);

CREATE INDEX IF NOT EXISTS idx_global_competencies_category
  ON global_competencies (category);

CREATE INDEX IF NOT EXISTS idx_global_competencies_status
  ON global_competencies (status);

CREATE TABLE IF NOT EXISTS organization_competencies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'technical',
      'behavioral',
      'leadership',
      'management',
      'tools',
      'languages',
      'compliance',
      'safety',
      'other'
    )
  ),
  definition TEXT NOT NULL DEFAULT '',
  positive_evidences JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(positive_evidences) = 'array'),
  negative_evidences JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(negative_evidences) = 'array'),
  practical_examples JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(practical_examples) = 'array'),
  proficiency_levels JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(proficiency_levels) = 'array'),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, normalized_code)
);

CREATE INDEX IF NOT EXISTS idx_organization_competencies_organization_id
  ON organization_competencies (organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_competencies_category
  ON organization_competencies (category);

CREATE INDEX IF NOT EXISTS idx_organization_competencies_status
  ON organization_competencies (status);

CREATE TABLE IF NOT EXISTS organization_adopted_competencies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  global_competency_id TEXT NOT NULL REFERENCES global_competencies(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  adopted_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, global_competency_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_adopted_competencies_organization_id
  ON organization_adopted_competencies (organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_adopted_competencies_global_competency_id
  ON organization_adopted_competencies (global_competency_id);

CREATE INDEX IF NOT EXISTS idx_organization_adopted_competencies_status
  ON organization_adopted_competencies (status);

CREATE TABLE IF NOT EXISTS competency_catalog_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  origin TEXT NOT NULL CHECK (origin IN ('global', 'organization')),
  global_competency_id TEXT REFERENCES global_competencies(id),
  organization_competency_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (origin = 'global' AND global_competency_id IS NOT NULL AND organization_competency_id IS NULL)
    OR
    (
      origin = 'organization'
      AND organization_competency_id IS NOT NULL
      AND global_competency_id IS NULL
    )
  ),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, organization_competency_id)
    REFERENCES organization_competencies (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_competency_catalog_items_global_unique
  ON competency_catalog_items (organization_id, global_competency_id)
  WHERE origin = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_competency_catalog_items_organization_unique
  ON competency_catalog_items (organization_id, organization_competency_id)
  WHERE origin = 'organization';

CREATE INDEX IF NOT EXISTS idx_competency_catalog_items_organization_id
  ON competency_catalog_items (organization_id);

CREATE INDEX IF NOT EXISTS idx_competency_catalog_items_origin
  ON competency_catalog_items (origin);

CREATE INDEX IF NOT EXISTS idx_competency_catalog_items_status
  ON competency_catalog_items (status);

CREATE INDEX IF NOT EXISTS idx_competency_catalog_items_global_competency_id
  ON competency_catalog_items (global_competency_id);

CREATE INDEX IF NOT EXISTS idx_competency_catalog_items_organization_competency_id
  ON competency_catalog_items (organization_competency_id);

CREATE OR REPLACE FUNCTION prevent_competency_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'competency_organization_immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organization_competency_organization_immutable
  ON organization_competencies;

CREATE TRIGGER trg_organization_competency_organization_immutable
BEFORE UPDATE ON organization_competencies
FOR EACH ROW
EXECUTE FUNCTION prevent_competency_organization_change();

DROP TRIGGER IF EXISTS trg_adopted_competency_organization_immutable
  ON organization_adopted_competencies;

CREATE TRIGGER trg_adopted_competency_organization_immutable
BEFORE UPDATE ON organization_adopted_competencies
FOR EACH ROW
EXECUTE FUNCTION prevent_competency_organization_change();

DROP TRIGGER IF EXISTS trg_competency_catalog_item_organization_immutable
  ON competency_catalog_items;

CREATE TRIGGER trg_competency_catalog_item_organization_immutable
BEFORE UPDATE ON competency_catalog_items
FOR EACH ROW
EXECUTE FUNCTION prevent_competency_organization_change();
