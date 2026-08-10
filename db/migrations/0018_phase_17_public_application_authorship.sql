-- Fase 17: Candidatura Publica (SPEC-020 v1.1).
--
-- Formaliza fisicamente a autoria dual ja aprovada, em nivel documental, pela SPEC-011 v1.2
-- (Candidate, CandidateConsent) e pela SPEC-012 v1.1 (CandidateApplication): todo registro
-- criado pelo fluxo publico nao possui User autenticado responsavel, e essa ausencia e
-- representada por uma origem explicita (`creation_origin` / `source`), nunca por um ator
-- inventado.
--
-- `created_by_user_id` passa a ser NULLABLE nas tres tabelas abaixo. Antes desta migration a
-- coluna era NOT NULL em todas -- ou seja, 100% dos registros historicos ja possuem
-- `created_by_user_id` preenchido. Isso permite que `creation_origin`/`source` sejam
-- retroativamente coerentes com `internal_user` (Candidate) ou com qualquer valor diferente de
-- `public_application`/`public_portal` (CandidateConsent/CandidateApplication) sem nenhuma
-- UPDATE explicita: o DEFAULT usado no ADD COLUMN abaixo ja cobre todas as linhas existentes, e
-- nenhuma linha historica pode ter sido criada pelo fluxo publico (que nao existia).

-- ==========================================================================================
-- candidates -- SPEC-011 v1.2, secao 4.1.1, RN-054 a RN-060.
-- ==========================================================================================

ALTER TABLE candidates
  ALTER COLUMN created_by_user_id DROP NOT NULL;

ALTER TABLE candidates
  ADD COLUMN creation_origin TEXT NOT NULL DEFAULT 'internal_user'
    CHECK (creation_origin IN ('internal_user', 'public_application'));

ALTER TABLE candidates
  ADD CONSTRAINT candidates_creation_origin_authorship_check CHECK (
    (creation_origin = 'internal_user' AND created_by_user_id IS NOT NULL)
    OR (creation_origin = 'public_application' AND created_by_user_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_candidates_creation_origin
  ON candidates (organization_id, creation_origin);

-- ==========================================================================================
-- candidate_consents -- SPEC-011 v1.2, secao 8.14.1, RN-061 a RN-065.
--
-- Nenhuma coluna nova: `source`, ja existente desde a migration 0009, e reutilizado como a
-- unica origem rastreavel. O valor canonico reservado para manifestacao publica direta e
-- `public_application` -- o mesmo token usado por `candidates.creation_origin`.
-- ==========================================================================================

ALTER TABLE candidate_consents
  ALTER COLUMN created_by_user_id DROP NOT NULL;

ALTER TABLE candidate_consents
  ADD CONSTRAINT candidate_consents_authorship_check CHECK (
    (source = 'public_application' AND created_by_user_id IS NULL)
    OR (source <> 'public_application' AND created_by_user_id IS NOT NULL)
  );

-- ==========================================================================================
-- candidate_applications -- SPEC-012 v1.1, secao 4.1.1, RN-074 a RN-080.
--
-- `source` continua sendo texto livre com CHECK de tamanho (nunca foi um enum fisico nesta
-- tabela) -- `public_portal` e apenas o valor canonico reservado para a criacao publica,
-- validado na camada de aplicacao, nao no banco.
-- ==========================================================================================

ALTER TABLE candidate_applications
  ALTER COLUMN created_by_user_id DROP NOT NULL;

ALTER TABLE candidate_applications
  ADD CONSTRAINT candidate_applications_authorship_check CHECK (
    (source = 'public_portal' AND created_by_user_id IS NULL)
    OR (source <> 'public_portal' AND created_by_user_id IS NOT NULL)
  );

-- ==========================================================================================
-- public_application_submissions -- Plano Tecnico da Fase 17: persistencia de idempotencia da
-- candidatura publica. Nunca armazena body, e-mail, telefone, Consent completo ou curriculo --
-- apenas o hash da Idempotency-Key (cabecalho HTTP, nunca a chave bruta) e um fingerprint
-- derivado, tambem em hash, usado somente para detectar reuso indevido da mesma chave com um
-- payload semanticamente diferente.
-- ==========================================================================================

CREATE TABLE IF NOT EXISTS public_application_submissions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  job_opening_id TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL CHECK (char_length(idempotency_key_hash) = 64),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  candidate_application_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  UNIQUE (organization_id, job_opening_id, idempotency_key_hash),
  FOREIGN KEY (organization_id, job_opening_id)
    REFERENCES job_openings (organization_id, id),
  FOREIGN KEY (organization_id, candidate_application_id)
    REFERENCES candidate_applications (organization_id, id),
  CHECK (
    (status = 'completed' AND candidate_application_id IS NOT NULL AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND candidate_application_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_public_application_submissions_lookup
  ON public_application_submissions (organization_id, job_opening_id, idempotency_key_hash);

CREATE OR REPLACE FUNCTION prevent_public_application_submission_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'public_application_submission_no_physical_delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_public_application_submission_no_delete ON public_application_submissions;
CREATE TRIGGER trg_public_application_submission_no_delete
BEFORE DELETE ON public_application_submissions
FOR EACH ROW EXECUTE FUNCTION prevent_public_application_submission_delete();
