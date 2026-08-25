-- Fase 29: Autenticacao Real / Supabase Auth (SPEC-028 v1.0, ADR-0026).
--
-- Quatro tabelas fisicas, todas aditivas:
-- 1. auth_identities          -- ponte User <-> identidade externa do provider (global, 1:1 nesta Fase)
-- 2. platform_admins          -- allow-list interna de Platform Admin (JWT nunca decide isso sozinho)
-- 3. invitations               -- convite/bootstrap do primeiro tenant
-- 4. invitation_idempotency_keys -- idempotencia module-specific de criar convite/bootstrap
--
-- Zero ALTER em users/memberships/organizations/access_grants (ADR-0026, SPEC-028 s41/s42).
-- `Membership` continua, sozinha, fonte de verdade de autorizacao -- `authorize()` nunca consulta
-- nenhuma destas tabelas. `Actor` (core/types.ts) permanece sem alteracao de forma.

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  provider TEXT NOT NULL CHECK (provider = 'supabase'),
  external_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_id)
);
-- UNIQUE (user_id) acima ja cria indice fisico para lookup por user_id; nenhum indice adicional
-- necessario. Lookup principal em producao e por (provider, external_id) -- ja coberto pelo UNIQUE.

CREATE OR REPLACE FUNCTION prevent_auth_identity_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'auth_identity_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

-- SPEC-028 s6: identidade nasce completa e nunca troca de dono -- user_id/provider/external_id/
-- created_at sao proveniencia imutavel, mesmo padrao ja usado por employments/offboardings/
-- access_grants (0027/0030/0031).
CREATE OR REPLACE FUNCTION enforce_auth_identity_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.user_id <> NEW.user_id
    OR OLD.provider <> NEW.provider
    OR OLD.external_id <> NEW.external_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'auth_identity_immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auth_identity_no_delete ON auth_identities;
CREATE TRIGGER trg_auth_identity_no_delete
BEFORE DELETE ON auth_identities
FOR EACH ROW EXECUTE FUNCTION prevent_auth_identity_delete();

DROP TRIGGER IF EXISTS trg_auth_identity_update_rules ON auth_identities;
CREATE TRIGGER trg_auth_identity_update_rules
BEFORE UPDATE ON auth_identities
FOR EACH ROW EXECUTE FUNCTION enforce_auth_identity_update_rules();

-- SPEC-028 s21: allow-list interna de Platform Admin -- nunca claim do JWT, nunca header
-- client-controlled. Global (nao e Membership, nao pertence a nenhuma Organization -- SPEC-004
-- s3). Interface de administracao fica fora do escopo desta Fase (SPEC-028 s21); a tabela em si e
-- pre-requisito fisico para SupabaseActorProvider resolver o atributo. Primeiro Platform Admin e
-- inserido por processo operacional manual, fora do fluxo HTTP desta Fase.
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  granted_by_user_id TEXT REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id TEXT REFERENCES users(id),
  CONSTRAINT platform_admins_status_lifecycle_check CHECK (
    (status = 'active' AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR
    (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_status ON platform_admins(status);

CREATE OR REPLACE FUNCTION prevent_platform_admin_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'platform_admin_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

-- Proveniencia da concessao (quem/quando concedeu) e imutavel; apenas o par status/revoked_*
-- pode transicionar, nos dois sentidos (revogar e reconceder), sempre com bookkeeping consistente
-- (ja garantido pelo CHECK de lifecycle acima).
CREATE OR REPLACE FUNCTION enforce_platform_admin_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.user_id <> NEW.user_id
    OR OLD.granted_by_user_id IS DISTINCT FROM NEW.granted_by_user_id
    OR OLD.granted_at <> NEW.granted_at THEN
    RAISE EXCEPTION 'platform_admin_provenance_immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_admin_no_delete ON platform_admins;
CREATE TRIGGER trg_platform_admin_no_delete
BEFORE DELETE ON platform_admins
FOR EACH ROW EXECUTE FUNCTION prevent_platform_admin_delete();

DROP TRIGGER IF EXISTS trg_platform_admin_update_rules ON platform_admins;
CREATE TRIGGER trg_platform_admin_update_rules
BEFORE UPDATE ON platform_admins
FOR EACH ROW EXECUTE FUNCTION enforce_platform_admin_update_rules();

-- SPEC-028 s15/s16: convite normal (organization_id preenchido, role admin|member) e convite de
-- bootstrap do primeiro tenant (organization_id NULO, role owner). Membership NUNCA e criado no
-- convite -- somente no aceite (fora desta migration, camada de aplicacao).
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  resolved_user_id TEXT REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id TEXT REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invitations_bootstrap_payload_check CHECK (
    (organization_id IS NULL AND role = 'owner')
    OR
    (organization_id IS NOT NULL AND role IN ('admin', 'member'))
  ),
  CONSTRAINT invitations_status_lifecycle_check CHECK (
    (status = 'accepted' AND accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL
      AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL)
    OR
    (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL
      AND accepted_at IS NULL AND accepted_by_user_id IS NULL)
    OR
    (status IN ('pending', 'expired')
      AND accepted_at IS NULL AND accepted_by_user_id IS NULL
      AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL)
  )
);

-- SPEC-028 s15: no maximo um convite `pending` por (organization_id, email). NULL nunca e igual a
-- NULL em indice unico do Postgres -- um unico indice sobre organization_id nullable NAO protegeria
-- o caso de bootstrap (organization_id NULO para todos). Dois indices parciais, um por regime,
-- fecham os dois casos corretamente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_one_pending_per_org_email
  ON invitations (organization_id, email)
  WHERE status = 'pending' AND organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_one_pending_bootstrap_per_email
  ON invitations (email)
  WHERE status = 'pending' AND organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_organization
  ON invitations (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invitations_resolved_user
  ON invitations (resolved_user_id)
  WHERE resolved_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_status_expiry
  ON invitations (status, expires_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION prevent_invitation_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'invitation_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

-- SPEC-028 s15: role e proveniencia (organization_id, email, created_by_user_id, created_at) sao
-- imutaveis apos a criacao -- mesmo padrao de enforce_employment_update_rules (0027). Transicao de
-- status permitida apenas pending -> {accepted, expired, cancelled}; nunca o inverso, nunca entre
-- estados finais.
CREATE OR REPLACE FUNCTION enforce_invitation_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.email <> NEW.email
    OR OLD.role <> NEW.role
    OR OLD.created_by_user_id <> NEW.created_by_user_id
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'invitation_provenance_immutable';
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation_final_immutable';
  END IF;

  IF NEW.status NOT IN ('accepted', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'invitation_invalid_status_transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invitation_no_delete ON invitations;
CREATE TRIGGER trg_invitation_no_delete
BEFORE DELETE ON invitations
FOR EACH ROW EXECUTE FUNCTION prevent_invitation_delete();

DROP TRIGGER IF EXISTS trg_invitation_update_rules ON invitations;
CREATE TRIGGER trg_invitation_update_rules
BEFORE UPDATE ON invitations
FOR EACH ROW EXECUTE FUNCTION enforce_invitation_update_rules();

-- SPEC-028 s26: criar convite (inclusive bootstrap) exige Idempotency-Key -- mesmo padrao
-- module-specific ja maduro em access_grant_idempotency_keys (0031). Chave bruta nunca persistida,
-- apenas hash SHA-256.
CREATE TABLE IF NOT EXISTS invitation_idempotency_keys (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  operation TEXT NOT NULL CHECK (operation IN ('invite', 'bootstrap')),
  key_hash TEXT NOT NULL CHECK (char_length(key_hash) = 64),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  result_resource_id TEXT,
  failure_category TEXT CHECK (failure_category IS NULL OR char_length(failure_category) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  CONSTRAINT invitation_idempotency_keys_status_lifecycle_check CHECK (
    (status = 'completed' AND result_resource_id IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'failed' AND failed_at IS NOT NULL)
    OR (status = 'pending' AND completed_at IS NULL AND failed_at IS NULL)
  )
);

-- Mesma armadilha de NULL do indice de invitations acima: organization_id e NULO em bootstrap, e
-- NULL nunca colide com NULL em indice unico -- dois indices parciais, um por regime.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitation_idempotency_org
  ON invitation_idempotency_keys (organization_id, operation, key_hash)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitation_idempotency_bootstrap
  ON invitation_idempotency_keys (operation, key_hash)
  WHERE organization_id IS NULL;

CREATE OR REPLACE FUNCTION prevent_invitation_idempotency_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'invitation_idempotency_key_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invitation_idempotency_no_delete ON invitation_idempotency_keys;
CREATE TRIGGER trg_invitation_idempotency_no_delete
BEFORE DELETE ON invitation_idempotency_keys
FOR EACH ROW EXECUTE FUNCTION prevent_invitation_idempotency_delete();

COMMENT ON TABLE auth_identities IS 'Fase 29: ponte User <-> identidade externa do Supabase Auth; global, nunca tenant-scoped; nunca fonte de autorizacao.';
COMMENT ON TABLE platform_admins IS 'Fase 29: allow-list interna de Platform Admin; nunca resolvida por claim do JWT ou header client-controlled.';
COMMENT ON TABLE invitations IS 'Fase 29: convite/bootstrap do primeiro tenant; nunca cria Membership antes do aceite.';
COMMENT ON TABLE invitation_idempotency_keys IS 'Fase 29: idempotencia module-specific cobrindo criacao de convite/bootstrap; nunca armazena chave bruta.';
