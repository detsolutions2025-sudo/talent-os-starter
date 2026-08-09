-- Fase 15 - Blueprint Organizacional / Implantacao Guiada - correcao pos-revisao final.
-- SPEC-018; Plano Tecnico Revisado.
--
-- A migration 0016 ja foi aplicada e e tratada como historica (nunca editada). Esta migration
-- corretiva fecha uma lacuna encontrada na revisao final: a trigger de integridade
-- cross-Organization do Manifest (`prevent_blueprint_manifest_item_cross_organization`, criada
-- em 0016) verificava que `component_ref_id` (o Job Profile) pertence a mesma Organization do
-- Blueprint, mas nao verificava que `component_version_id` (o Job Profile Version) realmente
-- pertence AQUELE `component_ref_id` especifico -- permitindo, em tese, um bug futuro na
-- aplicacao associar corretamente o Job Profile mas incorretamente uma versao de OUTRO Job
-- Profile da MESMA Organization ao item de manifesto.
--
-- `CREATE OR REPLACE FUNCTION` sobre uma funcao ja existente e uma operacao aditiva desta nova
-- migration -- nao e uma edicao do arquivo 0016.

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

  -- Coerencia interna Job Profile <-> Job Profile Version (revisao final, item 8/13): nao
  -- basta o Job Profile pertencer a Organization correta -- a versao referenciada precisa
  -- pertencer especificamente aquele Job Profile, nunca a outro Job Profile da mesma
  -- Organization.
  IF NEW.component_type = 'job_profile' AND NEW.component_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM job_profile_versions
      WHERE id = NEW.component_version_id
        AND job_profile_id = NEW.component_ref_id
    ) THEN
      RAISE EXCEPTION 'blueprint_manifest_item_job_profile_version_mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
