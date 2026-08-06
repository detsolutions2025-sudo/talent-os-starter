CREATE TABLE IF NOT EXISTS global_questions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  title TEXT NOT NULL,
  question_text TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (
    type IN (
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
  category TEXT NOT NULL CHECK (
    category IN (
      'general',
      'technical',
      'behavioral',
      'situational',
      'culture',
      'leadership',
      'management',
      'compliance',
      'safety',
      'screening',
      'other'
    )
  ),
  instructions TEXT NOT NULL DEFAULT '',
  options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'deprecated')),
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_code)
);

CREATE INDEX IF NOT EXISTS idx_global_questions_type
  ON global_questions (type);

CREATE INDEX IF NOT EXISTS idx_global_questions_category
  ON global_questions (category);

CREATE INDEX IF NOT EXISTS idx_global_questions_status
  ON global_questions (status);

CREATE TABLE IF NOT EXISTS organization_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  title TEXT NOT NULL,
  question_text TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (
    type IN (
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
  category TEXT NOT NULL CHECK (
    category IN (
      'general',
      'technical',
      'behavioral',
      'situational',
      'culture',
      'leadership',
      'management',
      'compliance',
      'safety',
      'screening',
      'other'
    )
  ),
  instructions TEXT NOT NULL DEFAULT '',
  options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  competency_catalog_item_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, normalized_code),
  FOREIGN KEY (organization_id, competency_catalog_item_id)
    REFERENCES competency_catalog_items (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_organization_questions_organization_id
  ON organization_questions (organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_questions_type
  ON organization_questions (type);

CREATE INDEX IF NOT EXISTS idx_organization_questions_category
  ON organization_questions (category);

CREATE INDEX IF NOT EXISTS idx_organization_questions_status
  ON organization_questions (status);

CREATE INDEX IF NOT EXISTS idx_organization_questions_competency_catalog_item_id
  ON organization_questions (competency_catalog_item_id);

CREATE TABLE IF NOT EXISTS organization_adopted_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  global_question_id TEXT NOT NULL REFERENCES global_questions(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  adopted_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, global_question_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_adopted_questions_organization_id
  ON organization_adopted_questions (organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_adopted_questions_global_question_id
  ON organization_adopted_questions (global_question_id);

CREATE INDEX IF NOT EXISTS idx_organization_adopted_questions_status
  ON organization_adopted_questions (status);

CREATE TABLE IF NOT EXISTS question_catalog_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  origin TEXT NOT NULL CHECK (origin IN ('global', 'organization')),
  global_question_id TEXT REFERENCES global_questions(id),
  organization_question_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (origin = 'global' AND global_question_id IS NOT NULL AND organization_question_id IS NULL)
    OR
    (
      origin = 'organization'
      AND organization_question_id IS NOT NULL
      AND global_question_id IS NULL
    )
  ),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, organization_question_id)
    REFERENCES organization_questions (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_question_catalog_items_global_unique
  ON question_catalog_items (organization_id, global_question_id)
  WHERE origin = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_question_catalog_items_organization_unique
  ON question_catalog_items (organization_id, organization_question_id)
  WHERE origin = 'organization';

CREATE INDEX IF NOT EXISTS idx_question_catalog_items_organization_id
  ON question_catalog_items (organization_id);

CREATE INDEX IF NOT EXISTS idx_question_catalog_items_origin
  ON question_catalog_items (origin);

CREATE INDEX IF NOT EXISTS idx_question_catalog_items_status
  ON question_catalog_items (status);

CREATE INDEX IF NOT EXISTS idx_question_catalog_items_global_question_id
  ON question_catalog_items (global_question_id);

CREATE INDEX IF NOT EXISTS idx_question_catalog_items_organization_question_id
  ON question_catalog_items (organization_question_id);

CREATE OR REPLACE FUNCTION prevent_question_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'question_organization_immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organization_question_organization_immutable
  ON organization_questions;

CREATE TRIGGER trg_organization_question_organization_immutable
BEFORE UPDATE ON organization_questions
FOR EACH ROW
EXECUTE FUNCTION prevent_question_organization_change();

DROP TRIGGER IF EXISTS trg_adopted_question_organization_immutable
  ON organization_adopted_questions;

CREATE TRIGGER trg_adopted_question_organization_immutable
BEFORE UPDATE ON organization_adopted_questions
FOR EACH ROW
EXECUTE FUNCTION prevent_question_organization_change();

DROP TRIGGER IF EXISTS trg_question_catalog_item_organization_immutable
  ON question_catalog_items;

CREATE TRIGGER trg_question_catalog_item_organization_immutable
BEFORE UPDATE ON question_catalog_items
FOR EACH ROW
EXECUTE FUNCTION prevent_question_organization_change();
