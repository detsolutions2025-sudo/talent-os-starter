CREATE TABLE IF NOT EXISTS organizational_units (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'board',
      'directorate',
      'department',
      'division',
      'branch',
      'office',
      'team',
      'squad',
      'unit',
      'other'
    )
  ),
  parent_id TEXT,
  manager_name TEXT,
  manager_email TEXT,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  updated_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inactivated_at TIMESTAMPTZ,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, parent_id)
    REFERENCES organizational_units (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizational_units_code_ci
  ON organizational_units (organization_id, LOWER(code));

CREATE INDEX IF NOT EXISTS idx_organizational_units_organization_id
  ON organizational_units (organization_id);

CREATE INDEX IF NOT EXISTS idx_organizational_units_parent_id
  ON organizational_units (parent_id);

CREATE INDEX IF NOT EXISTS idx_organizational_units_status
  ON organizational_units (status);

CREATE INDEX IF NOT EXISTS idx_organizational_units_type
  ON organizational_units (type);

CREATE INDEX IF NOT EXISTS idx_organizational_units_display_order
  ON organizational_units (display_order);

CREATE OR REPLACE FUNCTION prevent_organizational_unit_organization_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'organizational_unit_organization_immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizational_unit_organization_immutable
  ON organizational_units;

CREATE TRIGGER trg_organizational_unit_organization_immutable
BEFORE UPDATE ON organizational_units
FOR EACH ROW
EXECUTE FUNCTION prevent_organizational_unit_organization_change();
