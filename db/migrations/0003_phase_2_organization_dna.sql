CREATE TABLE IF NOT EXISTS organization_dna_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  version_number INTEGER,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  mission TEXT NOT NULL DEFAULT '',
  vision TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  values_content JSONB NOT NULL DEFAULT '[]'::jsonb,
  competencies_content JSONB NOT NULL DEFAULT '[]'::jsonb,
  culture_content TEXT NOT NULL DEFAULT '',
  leadership_style_content TEXT NOT NULL DEFAULT '',
  work_environment_content TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT NOT NULL REFERENCES users(id),
  published_by_user_id TEXT REFERENCES users(id),
  discarded_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ,
  CHECK (
    (status = 'draft' AND version_number IS NULL)
    OR (status IN ('published', 'archived') AND version_number IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_dna_versions_number
  ON organization_dna_versions (organization_id, version_number)
  WHERE version_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_dna_versions_published
  ON organization_dna_versions (organization_id)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_dna_versions_active_draft
  ON organization_dna_versions (organization_id)
  WHERE status = 'draft' AND discarded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_organization_dna_versions_organization_id
  ON organization_dna_versions (organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_dna_versions_status
  ON organization_dna_versions (status);

CREATE INDEX IF NOT EXISTS idx_organization_dna_versions_organization_status
  ON organization_dna_versions (organization_id, status);
