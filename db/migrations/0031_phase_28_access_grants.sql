-- Fase 28: Ciclo de Vida de Acesso Pos-Contratacao / AccessGrant (SPEC-027 v1.0, ADR-0025).
--
-- Duas tabelas fisicas:
-- 1. access_grants
-- 2. access_grant_idempotency_keys
--
-- AccessGrant e proveniencia/governanca sobre um Membership ja existente -- nunca uma segunda
-- fonte de verdade de autorizacao. `Membership.status` continua sendo, sozinho, suficiente para
-- `authorize()` (SPEC-027 s21). Zero alteracao de dominio/comportamento em `users`,
-- `memberships`, `organization_people`, `employments` ou `offboardings` (ADR-0025, esclarecimento
-- de 2026-08-20).
--
-- Hardening fisico auxiliar de `memberships` (ADR-0025, esclarecimento de 2026-08-20): a FK
-- composta tenant-safe `(organization_id, membership_id) -> memberships(organization_id, id)`
-- exige `UNIQUE (organization_id, id)` em `memberships`. Confirmado por inspecao fisica: essa
-- constraint JA EXISTE desde a Fase 23 (`memberships_organization_id_id_key`,
-- `db/migrations/0025_phase_23_onboarding.sql`, adicionada para a FK de `onboardings`). O bloco
-- abaixo e puramente defensivo/idempotente -- mesmo padrao ja usado em 0025/0026/0029 -- e nao
-- deve alterar nada em um banco onde a Fase 23 ja rodou. Nenhum dado, lifecycle, RBAC ou
-- comportamento de `Membership` e alterado por este bloco.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'memberships_organization_id_id_key'
      AND t.relname = 'memberships'
      AND n.nspname = current_schema()
  ) THEN
    ALTER TABLE memberships
      ADD CONSTRAINT memberships_organization_id_id_key UNIQUE (organization_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS access_grants (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  organization_person_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  employment_id TEXT,
  provenance_type TEXT NOT NULL CHECK (provenance_type IN ('employment', 'administrative')),
  grant_reason TEXT CHECK (grant_reason IS NULL OR char_length(grant_reason) BETWEEN 1 AND 1000),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id TEXT REFERENCES users(id),
  revocation_reason_category TEXT CHECK (
    revocation_reason_category IS NULL
    OR revocation_reason_category IN (
      'employment_ended',
      'role_change',
      'security_concern',
      'administrative_correction',
      'other_minimized'
    )
  ),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, organization_person_id)
    REFERENCES organization_people (organization_id, id),
  FOREIGN KEY (organization_id, membership_id)
    REFERENCES memberships (organization_id, id),
  FOREIGN KEY (organization_id, employment_id)
    REFERENCES employments (organization_id, id),
  CONSTRAINT access_grants_provenance_payload_check CHECK (
    (provenance_type = 'employment'
      AND employment_id IS NOT NULL
      AND grant_reason IS NULL)
    OR
    (provenance_type = 'administrative'
      AND employment_id IS NULL
      AND grant_reason IS NOT NULL)
  ),
  CONSTRAINT access_grants_status_lifecycle_check CHECK (
    (status = 'active'
      AND revoked_at IS NULL
      AND revoked_by_user_id IS NULL
      AND revocation_reason_category IS NULL)
    OR
    (status = 'revoked'
      AND revoked_at IS NOT NULL
      AND revoked_by_user_id IS NOT NULL
      AND revocation_reason_category IS NOT NULL)
  )
);

-- SPEC-027 s7: no maximo um AccessGrant `active` por Membership, a qualquer momento -- mesmo
-- padrao ja fisicamente comprovado por `idx_employments_one_non_final` (0027) e
-- `idx_offboardings_one_non_final` (0030). Historico `revoked` e ilimitado (fora do indice).
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_grants_one_active_per_membership
  ON access_grants (organization_id, membership_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_access_grants_person
  ON access_grants (organization_id, organization_person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_grants_membership
  ON access_grants (organization_id, membership_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_grants_employment
  ON access_grants (organization_id, employment_id, created_at DESC)
  WHERE employment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_access_grants_status
  ON access_grants (organization_id, status, created_at DESC);

-- SPEC-027 s25: grant e revoke exigem Idempotency-Key -- mesmo padrao module-specific ja maduro
-- em employment_idempotency_keys (0027) e offboarding_idempotency_keys (0030).
CREATE TABLE IF NOT EXISTS access_grant_idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation TEXT NOT NULL CHECK (operation IN ('grant', 'revoke')),
  scope_id TEXT,
  key_hash TEXT NOT NULL CHECK (char_length(key_hash) = 64),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  result_resource_id TEXT,
  failure_category TEXT CHECK (failure_category IS NULL OR char_length(failure_category) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  UNIQUE (organization_id, operation, scope_id, key_hash),
  CONSTRAINT access_grant_idempotency_keys_status_lifecycle_check CHECK (
    (status = 'completed' AND result_resource_id IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'failed' AND failed_at IS NOT NULL)
    OR (status = 'pending' AND completed_at IS NULL AND failed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_access_grant_idempotency_lookup
  ON access_grant_idempotency_keys (organization_id, operation, scope_id, key_hash);

CREATE OR REPLACE FUNCTION prevent_access_grant_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'access_grant_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_access_grant_idempotency_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'access_grant_idempotency_key_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

-- SPEC-027 s11/s12: nasce sempre `active`. SPEC-027 s9: quando `employment_id` informado, deve
-- pertencer a mesma OrganizationPerson/Organization e estar em estado elegivel (active/ended) --
-- esta trigger LE `employments` (defesa em profundidade, alem da revalidacao em aplicacao); ela
-- nunca ESCREVE em `employments` e nao e instalada em `employments`, mesmo padrao ja usado por
-- `enforce_offboarding_insert_rules` (0030).
CREATE OR REPLACE FUNCTION enforce_access_grant_insert_rules()
RETURNS TRIGGER AS $$
DECLARE
  employment_org TEXT;
  employment_person TEXT;
  employment_status TEXT;
BEGIN
  IF NEW.status <> 'active' THEN
    RAISE EXCEPTION 'access_grant_insert_must_be_active';
  END IF;

  IF NEW.employment_id IS NOT NULL THEN
    SELECT organization_id, organization_person_id, status
      INTO employment_org, employment_person, employment_status
      FROM employments
      WHERE id = NEW.employment_id;

    IF employment_org IS NULL THEN
      RAISE EXCEPTION 'access_grant_employment_not_found';
    END IF;

    IF employment_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'access_grant_employment_organization_mismatch';
    END IF;

    IF employment_person <> NEW.organization_person_id THEN
      RAISE EXCEPTION 'access_grant_employment_person_mismatch';
    END IF;

    IF employment_status NOT IN ('active', 'ended') THEN
      RAISE EXCEPTION 'access_grant_employment_not_eligible';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- SPEC-027 s11/s34: `active -> revoked` e a unica transicao valida; `revoked` e final; toda
-- proveniencia (organization_person_id, membership_id, employment_id, provenance_type,
-- grant_reason) e imutavel apos a criacao -- mesmo padrao ja usado por
-- `enforce_employment_update_rules` (0027) e `enforce_offboarding_update_rules` (0030).
CREATE OR REPLACE FUNCTION enforce_access_grant_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.organization_id <> NEW.organization_id
    OR OLD.organization_person_id <> NEW.organization_person_id
    OR OLD.membership_id <> NEW.membership_id
    OR OLD.employment_id IS DISTINCT FROM NEW.employment_id
    OR OLD.provenance_type <> NEW.provenance_type
    OR OLD.grant_reason IS DISTINCT FROM NEW.grant_reason
    OR OLD.created_by_user_id <> NEW.created_by_user_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'access_grant_provenance_immutable';
  END IF;

  IF OLD.status = 'revoked' THEN
    RAISE EXCEPTION 'access_grant_final_immutable';
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (OLD.status = 'active' AND NEW.status = 'revoked') THEN
    RAISE EXCEPTION 'access_grant_invalid_status_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_access_grant_no_delete ON access_grants;
CREATE TRIGGER trg_access_grant_no_delete
BEFORE DELETE ON access_grants
FOR EACH ROW EXECUTE FUNCTION prevent_access_grant_delete();

DROP TRIGGER IF EXISTS trg_access_grant_insert_rules ON access_grants;
CREATE TRIGGER trg_access_grant_insert_rules
BEFORE INSERT ON access_grants
FOR EACH ROW EXECUTE FUNCTION enforce_access_grant_insert_rules();

DROP TRIGGER IF EXISTS trg_access_grant_update_rules ON access_grants;
CREATE TRIGGER trg_access_grant_update_rules
BEFORE UPDATE ON access_grants
FOR EACH ROW EXECUTE FUNCTION enforce_access_grant_update_rules();

DROP TRIGGER IF EXISTS trg_access_grant_idempotency_no_delete ON access_grant_idempotency_keys;
CREATE TRIGGER trg_access_grant_idempotency_no_delete
BEFORE DELETE ON access_grant_idempotency_keys
FOR EACH ROW EXECUTE FUNCTION prevent_access_grant_idempotency_delete();

COMMENT ON TABLE access_grants IS 'Fase 28: proveniencia/governanca de acesso pos-contratacao sobre um Membership existente; nunca fonte de autorizacao tecnica.';
COMMENT ON TABLE access_grant_idempotency_keys IS 'Fase 28: idempotencia module-specific cobrindo grant/revoke; nunca armazena chave bruta.';
