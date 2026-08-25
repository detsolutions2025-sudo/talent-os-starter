-- Fase 29 (correcao fisica complementar; ADR-0026, SPEC-028 v1.0 s16). Bootstrap do primeiro
-- tenant via convite (caminho B: e-mail do futuro owner AINDA NAO confirmado -- exige convite
-- assincrono + aceite, ja que nao ha sessao alguma no momento em que o Platform Admin aciona o
-- bootstrap).
--
-- Migration 0032 (ja aplicada e IMUTAVEL em `public`/DEV -- nunca editada por esta migration)
-- criou `invitations` sem espaco fisico para os dados da Organization pendente que o proprio
-- SPEC-028 s16 passo 3 ja previa como necessario ("aplicacao grava um convite de bootstrap ...
-- com um campo adicional conceitual para os dados da Organization pendente -- fisico exato fica
-- para o plano tecnico"). Gap fisico real, descoberto durante a implementacao (nao hipotetico):
-- sem essas colunas, o caminho B fica estruturalmente impossivel de representar -- o nome/slug da
-- Organization so existe no momento da criacao do convite, mas a Organization em si so pode ser
-- criada no aceite (SPEC-028 s16 passo 5, `CoreService.createOrganization`, mesma transacao ja
-- testada por `tests/phase1/*`), quando o convidado ja possui uma sessao verificada. Entre os dois
-- momentos, `organization_id` permanece NULO (distincao fisica entre bootstrap e convite normal,
-- ja fechada por 0032 e preservada aqui sem alteracao) -- nao ha lugar para guardar nome/slug.
--
-- Este e o menor delta aditivo suficiente: duas colunas para os dados pendentes (nome/slug) e uma
-- terceira para registrar QUAL Organization resultou do aceite -- necessaria porque o trigger de
-- 0032 (`enforce_invitation_update_rules`) ja proibe alterar `organization_id` apos a criacao do
-- convite; ele tem que continuar NULO para sempre num convite de bootstrap, mesmo depois do
-- aceite (e exatamente essa imutabilidade, ja fechada por 0032, que impede reaproveitar
-- `organization_id` para registrar o resultado). Sem uma terceira coluna, um replay idempotente
-- do aceite (SPEC-028 s15 "convite reutilizado") nao teria como localizar a Organization ja
-- criada, nem a auditoria/prova de "no maximo uma Organization por convite" (secao 13 do prompt
-- desta tarefa) teria uma consulta direta e confiavel.
--
-- Zero ALTER em users/memberships/organizations/access_grants/auth_identities/platform_admins.
-- Zero coluna nova em invitation_idempotency_keys -- a tabela ja suporta `operation='bootstrap'`
-- desde a 0032 (CHECK ja incluia esse valor); so nao estava sendo exercitada pelo caminho B
-- ainda. Zero DML de backfill: nenhuma linha de bootstrap pode existir hoje em `invitations` --
-- o caminho B sempre recusou a requisicao (409 `bootstrap_invite_path_blocked_pending_schema`)
-- ANTES de qualquer escrita, e o caminho A nunca cria linha em `invitations`.

-- Dados pendentes da Organization (SPEC-028 s16 passo 3). Preenchidos SOMENTE quando
-- `organization_id` e NULO (convite de bootstrap); NULOS em todo convite normal -- CHECK abaixo
-- fecha os dois sentidos, nunca permitindo payload hibrido (mesmo padrao de
-- `invitations_bootstrap_payload_check`, 0032, agora estendido aos dois campos novos).
ALTER TABLE invitations ADD COLUMN organization_name TEXT;
ALTER TABLE invitations ADD COLUMN organization_slug TEXT;

-- Organization efetivamente criada no aceite de um convite de bootstrap (SPEC-028 s16 passo 5).
-- Nunca preenchida antes do aceite; imutavel depois de preenchida (mesmo padrao de proveniencia
-- ja usado por `resolved_user_id`, exceto que este campo nasce vazio e so pode transicionar
-- exatamente uma vez, na mesma UPDATE que marca o convite `accepted`).
ALTER TABLE invitations ADD COLUMN bootstrap_organization_id TEXT REFERENCES organizations(id);

ALTER TABLE invitations ADD CONSTRAINT invitations_bootstrap_pending_org_payload_check CHECK (
  (organization_id IS NULL AND organization_name IS NOT NULL AND organization_slug IS NOT NULL)
  OR
  (organization_id IS NOT NULL AND organization_name IS NULL AND organization_slug IS NULL)
);

-- `bootstrap_organization_id` e exclusivo de convite de bootstrap (organization_id NULO) --
-- nunca preenchido em convite normal, onde a Organization ja existia desde antes do convite.
ALTER TABLE invitations ADD CONSTRAINT invitations_bootstrap_organization_id_scope_check CHECK (
  bootstrap_organization_id IS NULL OR organization_id IS NULL
);

-- `bootstrap_organization_id` so pode existir apos o aceite (mesmo momento de `accepted_at`/
-- `accepted_by_user_id`, ja fechado pelo CHECK `invitations_status_lifecycle_check` de 0032) --
-- nunca antes.
ALTER TABLE invitations ADD CONSTRAINT invitations_bootstrap_organization_requires_accepted_check
CHECK (bootstrap_organization_id IS NULL OR status = 'accepted');

-- No maximo um convite de bootstrap aponta para uma dada Organization (prova fisica direta do
-- invariante "no maximo uma Organization por convite" exigido pela secao 13 desta tarefa) --
-- defesa em profundidade complementar ao fato de que cada Organization nasce com um id novo
-- (`nextId`), nunca reaproveitado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_bootstrap_organization_unique
  ON invitations (bootstrap_organization_id)
  WHERE bootstrap_organization_id IS NOT NULL;

-- CREATE OR REPLACE da MESMA funcao ja criada por 0032 (nunca editando o arquivo 0032) --
-- estende a imutabilidade de proveniencia aos dois campos novos (organization_name/slug, mesmo
-- tratamento ja dado a email/role/created_by_user_id/created_at) e fecha a regra de quando
-- `bootstrap_organization_id` pode nascer: exatamente na mesma UPDATE que transiciona
-- pending -> accepted, nunca antes, nunca mudar depois de ja preenchido.
CREATE OR REPLACE FUNCTION enforce_invitation_update_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.email <> NEW.email
    OR OLD.role <> NEW.role
    OR OLD.created_by_user_id <> NEW.created_by_user_id
    OR OLD.created_at <> NEW.created_at
    OR OLD.organization_name IS DISTINCT FROM NEW.organization_name
    OR OLD.organization_slug IS DISTINCT FROM NEW.organization_slug THEN
    RAISE EXCEPTION 'invitation_provenance_immutable';
  END IF;

  IF OLD.bootstrap_organization_id IS NOT NULL
    AND OLD.bootstrap_organization_id IS DISTINCT FROM NEW.bootstrap_organization_id THEN
    RAISE EXCEPTION 'invitation_bootstrap_organization_immutable';
  END IF;

  IF NEW.bootstrap_organization_id IS NOT NULL AND OLD.bootstrap_organization_id IS NULL THEN
    IF NOT (OLD.status = 'pending' AND NEW.status = 'accepted') THEN
      RAISE EXCEPTION 'invitation_bootstrap_organization_requires_accept_transition';
    END IF;
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

COMMENT ON COLUMN invitations.organization_name IS 'Fase 29 (0033): nome pendente da Organization, somente em convite de bootstrap (organization_id NULO); imutavel apos a criacao do convite.';
COMMENT ON COLUMN invitations.organization_slug IS 'Fase 29 (0033): slug pendente da Organization, somente em convite de bootstrap; imutavel apos a criacao do convite.';
COMMENT ON COLUMN invitations.bootstrap_organization_id IS 'Fase 29 (0033): Organization efetivamente criada no aceite de um convite de bootstrap; nunca preenchida antes do aceite, imutavel depois.';
