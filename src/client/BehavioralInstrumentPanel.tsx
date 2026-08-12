import { useEffect, useState } from "react";

// Fase 19 (SPEC-022 v1.0) - Perfil Comportamental: administracao de instrumentos.
//
// Mesmo padrao de extracao ja usado por `PreInterviewPanel.tsx` (Fase 18): componente
// proprio, auto-contido, que busca seus proprios dados via `organizationId`/`role`/`headers`
// recebidos de `App.tsx`. Cobre owner/admin: instrumentos proprios da Organization (criacao,
// versoes, ativacao/arquivamento), habilitacao de instrumentos globais do catalogo da
// plataforma e preferencia por vaga. Nunca implementa DISC proprietario, nunca calcula nada
// no cliente, nunca chama IA (SPEC-022, secao 2).

type InstrumentScope = "platform" | "organization";
type InstrumentStatus = "active" | "inactive";
type VersionStatus = "draft" | "active" | "archived";
type ItemType = "open_text" | "single_choice" | "multiple_choice" | "yes_no" | "numeric" | "scale";
type VisibilityPolicy = "none" | "summary" | "full";

type Instrument = {
  id: string;
  scope: InstrumentScope;
  name: string;
  description: string | null;
  status: InstrumentStatus;
};

// `name` (nunca `label`) -- mesmo campo aceito por `validateInstrumentVersionInput`
// (src/server/behavioral-assessments/validation.ts): a dimensao do manifesto usa
// {code, name, description, required}, nunca "label" (esse campo pertence apenas a
// BehavioralAssessmentResultDimension, uma entidade diferente).
type DimensionDraft = { code: string; name: string; required: boolean };
type ItemDraft = {
  itemKey: string;
  itemType: ItemType;
  promptText: string;
  required: boolean;
  dimensionMapping: string;
};

type InstrumentVersion = {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  methodologyKey: string;
  calculationMethodVersion: string;
  dimensions: { code: string; name: string; required: boolean }[];
};

type OrganizationInstrumentSetting = { behavioralInstrumentId: string; enabled: boolean };

type JobOpeningOption = { id: string; title: string; status: string };

type JobOpeningSettings = {
  enabled: boolean;
  behavioralInstrumentId: string | null;
  behavioralInstrumentVersionId: string | null;
};

const itemTypeLabels: Record<ItemType, string> = {
  open_text: "Texto livre",
  single_choice: "Escolha unica",
  multiple_choice: "Escolha multipla",
  yes_no: "Sim/Nao",
  numeric: "Numerico",
  scale: "Escala"
};

export function BehavioralInstrumentPanel({
  organizationId,
  role,
  headers
}: {
  organizationId: string;
  role: "owner" | "admin" | "member" | undefined;
  headers: Record<string, string>;
}) {
  const canManage = role === "owner" || role === "admin";

  const [ownInstruments, setOwnInstruments] = useState<Instrument[]>([]);
  const [newInstrumentName, setNewInstrumentName] = useState("");
  const [newInstrumentDescription, setNewInstrumentDescription] = useState("");

  const [selectedInstrumentId, setSelectedInstrumentId] = useState("");
  const [versions, setVersions] = useState<InstrumentVersion[]>([]);
  const [methodologyKey, setMethodologyKey] = useState("");
  const [calculationMethodVersion, setCalculationMethodVersion] = useState("");
  const [candidateResultVisibility, setCandidateResultVisibility] =
    useState<VisibilityPolicy>("summary");
  const [rawResponseOwnerVisibility, setRawResponseOwnerVisibility] =
    useState<VisibilityPolicy>("full");
  const [dimensions, setDimensions] = useState<DimensionDraft[]>([]);
  const [newDimensionCode, setNewDimensionCode] = useState("");
  const [newDimensionLabel, setNewDimensionLabel] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [newItemKey, setNewItemKey] = useState("");
  const [newItemType, setNewItemType] = useState<ItemType>("scale");
  const [newItemPrompt, setNewItemPrompt] = useState("");
  const [newItemDimensions, setNewItemDimensions] = useState("");

  const [platformCatalog, setPlatformCatalog] = useState<Instrument[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrganizationInstrumentSetting[]>([]);

  const [jobOpenings, setJobOpenings] = useState<JobOpeningOption[]>([]);
  const [selectedJobOpeningId, setSelectedJobOpeningId] = useState("");
  const [jobOpeningSettings, setJobOpeningSettings] = useState<JobOpeningSettings | null>(null);

  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!organizationId || !canManage) {
      setOwnInstruments([]);
      setPlatformCatalog([]);
      setOrgSettings([]);
      setJobOpenings([]);
      return;
    }
    reloadInstruments();
    loadCatalogAndSettings();
    fetch(`/api/organizations/${organizationId}/job-openings`, { headers })
      .then(async (response) => {
        setJobOpenings(response.ok ? ((await response.json()) as JobOpeningOption[]) : []);
      })
      .catch(() => setJobOpenings([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, canManage]);

  useEffect(() => {
    if (!selectedInstrumentId) {
      setVersions([]);
      return;
    }
    loadVersions(selectedInstrumentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstrumentId]);

  useEffect(() => {
    if (!selectedJobOpeningId) {
      setJobOpeningSettings(null);
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/job-openings/${selectedJobOpeningId}/behavioral-assessment-settings`,
      {
        headers
      }
    )
      .then(async (response) => {
        setJobOpeningSettings(response.ok ? ((await response.json()) as JobOpeningSettings) : null);
      })
      .catch(() => setJobOpeningSettings(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobOpeningId]);

  function reloadInstruments() {
    fetch(`/api/organizations/${organizationId}/behavioral-instruments`, { headers })
      .then(async (response) => {
        const all = response.ok ? ((await response.json()) as Instrument[]) : [];
        setOwnInstruments(all.filter((instrument) => instrument.scope === "organization"));
      })
      .catch(() => setOwnInstruments([]));
  }

  function loadCatalogAndSettings() {
    fetch(`/api/organizations/${organizationId}/behavioral-instruments/platform-catalog`, {
      headers
    })
      .then(async (response) => {
        setPlatformCatalog(response.ok ? ((await response.json()) as Instrument[]) : []);
      })
      .catch(() => setPlatformCatalog([]));
    fetch(`/api/organizations/${organizationId}/behavioral-instrument-settings`, { headers })
      .then(async (response) => {
        setOrgSettings(
          response.ok ? ((await response.json()) as OrganizationInstrumentSetting[]) : []
        );
      })
      .catch(() => setOrgSettings([]));
  }

  function loadVersions(instrumentId: string) {
    fetch(`/api/organizations/${organizationId}/behavioral-instruments/${instrumentId}/versions`, {
      headers
    })
      .then(async (response) => {
        setVersions(response.ok ? ((await response.json()) as InstrumentVersion[]) : []);
      })
      .catch(() => setVersions([]));
  }

  function createInstrument() {
    if (!newInstrumentName.trim()) {
      setMessage("Informe o nome do instrumento.");
      return;
    }
    fetch(`/api/organizations/${organizationId}/behavioral-instruments`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        name: newInstrumentName.trim(),
        description: newInstrumentDescription.trim() || null
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel criar o instrumento.");
        }
        setNewInstrumentName("");
        setNewInstrumentDescription("");
        setMessage("Instrumento criado.");
        reloadInstruments();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function addDimension() {
    if (!newDimensionCode.trim()) {
      setMessage("Informe o codigo da dimensao.");
      return;
    }
    setDimensions((current) => [
      ...current,
      {
        code: newDimensionCode.trim(),
        name: newDimensionLabel.trim() || newDimensionCode.trim(),
        required: true
      }
    ]);
    setNewDimensionCode("");
    setNewDimensionLabel("");
  }

  function removeDimension(code: string) {
    setDimensions((current) => current.filter((dimension) => dimension.code !== code));
  }

  function addItem() {
    if (!newItemKey.trim() || !newItemPrompt.trim()) {
      setMessage("Informe a chave e o texto do item.");
      return;
    }
    setItems((current) => [
      ...current,
      {
        itemKey: newItemKey.trim(),
        itemType: newItemType,
        promptText: newItemPrompt.trim(),
        required: true,
        dimensionMapping: newItemDimensions.trim()
      }
    ]);
    setNewItemKey("");
    setNewItemPrompt("");
    setNewItemDimensions("");
  }

  function removeItem(itemKey: string) {
    setItems((current) => current.filter((item) => item.itemKey !== itemKey));
  }

  function createDraftVersion() {
    if (!selectedInstrumentId) {
      setMessage("Selecione um instrumento proprio.");
      return;
    }
    if (!methodologyKey.trim() || !calculationMethodVersion.trim()) {
      setMessage("Informe methodologyKey e calculationMethodVersion.");
      return;
    }
    if (dimensions.length === 0 || items.length === 0) {
      setMessage("A versao precisa de ao menos uma dimensao e um item.");
      return;
    }
    fetch(
      `/api/organizations/${organizationId}/behavioral-instruments/${selectedInstrumentId}/versions`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          methodologyKey: methodologyKey.trim(),
          calculationMethodVersion: calculationMethodVersion.trim(),
          candidateResultVisibility,
          rawResponseOwnerVisibility,
          dimensions: dimensions.map((dimension) => ({
            code: dimension.code,
            name: dimension.name,
            required: dimension.required
          })),
          items: items.map((item, index) => ({
            itemKey: item.itemKey,
            itemType: item.itemType,
            promptText: item.promptText,
            required: item.required,
            displayOrder: index,
            dimensionMapping: item.dimensionMapping
              ? item.dimensionMapping
                  .split(",")
                  .map((code) => code.trim())
                  .filter(Boolean)
              : []
          }))
        })
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            "Nao foi possivel criar a versao rascunho (verifique se ja nao existe um rascunho aberto)."
          );
        }
        setDimensions([]);
        setItems([]);
        setMethodologyKey("");
        setCalculationMethodVersion("");
        setMessage("Versao rascunho criada.");
        loadVersions(selectedInstrumentId);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function activateVersion(versionId: string) {
    fetch(
      `/api/organizations/${organizationId}/behavioral-instruments/${selectedInstrumentId}/versions/${versionId}/activate`,
      { method: "POST", headers }
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: string };
          } | null;
          throw new Error(
            body?.error?.code === "behavioral_instrument_version_calculator_missing"
              ? "Nenhum calculador registrado para esta metodologia/versao -- a versao nao pode ser ativada."
              : "Nao foi possivel ativar esta versao."
          );
        }
        setMessage("Versao ativada.");
        loadVersions(selectedInstrumentId);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function archiveVersion(versionId: string) {
    fetch(
      `/api/organizations/${organizationId}/behavioral-instruments/${selectedInstrumentId}/versions/${versionId}/archive`,
      { method: "POST", headers }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel arquivar esta versao.");
        }
        setMessage("Versao arquivada.");
        loadVersions(selectedInstrumentId);
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function toggleGlobalInstrument(instrumentId: string, currentlyEnabled: boolean) {
    fetch(`/api/organizations/${organizationId}/behavioral-instrument-settings/${instrumentId}`, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ enabled: !currentlyEnabled })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Nao foi possivel atualizar a disponibilidade deste instrumento.");
        }
        setMessage("Disponibilidade atualizada.");
        loadCatalogAndSettings();
      })
      .catch((error: Error) => setMessage(error.message));
  }

  function saveJobOpeningSettings(next: JobOpeningSettings) {
    fetch(
      `/api/organizations/${organizationId}/job-openings/${selectedJobOpeningId}/behavioral-assessment-settings`,
      {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(next)
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            "Nao foi possivel salvar a preferencia de Perfil Comportamental da vaga."
          );
        }
        setJobOpeningSettings((await response.json()) as JobOpeningSettings);
        setMessage("Preferencia da vaga salva.");
      })
      .catch((error: Error) => setMessage(error.message));
  }

  if (!organizationId || !canManage) {
    return null;
  }

  return (
    <div
      className="panel behavioral-instrument-panel"
      aria-label="Perfil Comportamental - Instrumentos"
    >
      <span>Perfil Comportamental - Instrumentos</span>

      <div className="panel">
        <span>Instrumentos proprios da Organization</span>
        <label htmlFor="bi-new-name">
          Nome
          <input
            id="bi-new-name"
            type="text"
            value={newInstrumentName}
            onChange={(event) => setNewInstrumentName(event.target.value)}
          />
        </label>
        <label htmlFor="bi-new-description">
          Descricao
          <input
            id="bi-new-description"
            type="text"
            value={newInstrumentDescription}
            onChange={(event) => setNewInstrumentDescription(event.target.value)}
          />
        </label>
        <button type="button" onClick={createInstrument}>
          Criar instrumento proprio
        </button>

        <label htmlFor="bi-select-instrument">
          Instrumento
          <select
            id="bi-select-instrument"
            value={selectedInstrumentId}
            onChange={(event) => setSelectedInstrumentId(event.target.value)}
          >
            <option value="">Selecione um instrumento</option>
            {ownInstruments.map((instrument) => (
              <option key={instrument.id} value={instrument.id}>
                {instrument.name} ({instrument.status})
              </option>
            ))}
          </select>
        </label>

        {selectedInstrumentId && (
          <>
            <ul>
              {versions.map((version) => (
                <li key={version.id}>
                  v{version.versionNumber} - {version.status} - {version.methodologyKey}::
                  {version.calculationMethodVersion} - {version.dimensions.length} dimensao(oes)
                  {version.status === "draft" && (
                    <button type="button" onClick={() => activateVersion(version.id)}>
                      Ativar
                    </button>
                  )}
                  {version.status === "active" && (
                    <button type="button" onClick={() => archiveVersion(version.id)}>
                      Arquivar
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="panel">
              <span>Nova versao rascunho</span>
              <label htmlFor="bi-methodology-key">
                methodologyKey
                <input
                  id="bi-methodology-key"
                  type="text"
                  value={methodologyKey}
                  onChange={(event) => setMethodologyKey(event.target.value)}
                />
              </label>
              <label htmlFor="bi-calculation-version">
                calculationMethodVersion
                <input
                  id="bi-calculation-version"
                  type="text"
                  value={calculationMethodVersion}
                  onChange={(event) => setCalculationMethodVersion(event.target.value)}
                />
              </label>
              <label htmlFor="bi-candidate-visibility">
                Visibilidade do resultado para o Candidate
                <select
                  id="bi-candidate-visibility"
                  value={candidateResultVisibility}
                  onChange={(event) =>
                    setCandidateResultVisibility(event.target.value as VisibilityPolicy)
                  }
                >
                  <option value="none">Nenhuma</option>
                  <option value="summary">Somente resumo</option>
                  <option value="full">Completa</option>
                </select>
              </label>
              <label htmlFor="bi-raw-visibility">
                Visibilidade das respostas brutas para owner/admin
                <select
                  id="bi-raw-visibility"
                  value={rawResponseOwnerVisibility}
                  onChange={(event) =>
                    setRawResponseOwnerVisibility(event.target.value as VisibilityPolicy)
                  }
                >
                  <option value="none">Nenhuma</option>
                  <option value="summary">Somente resumo</option>
                  <option value="full">Completa</option>
                </select>
              </label>

              <div>
                <span>Dimensoes</span>
                <ul>
                  {dimensions.map((dimension) => (
                    <li key={dimension.code}>
                      {dimension.code} - {dimension.name}
                      <button type="button" onClick={() => removeDimension(dimension.code)}>
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
                <label htmlFor="bi-dimension-code">
                  Codigo
                  <input
                    id="bi-dimension-code"
                    type="text"
                    value={newDimensionCode}
                    onChange={(event) => setNewDimensionCode(event.target.value)}
                  />
                </label>
                <label htmlFor="bi-dimension-label">
                  Rotulo
                  <input
                    id="bi-dimension-label"
                    type="text"
                    value={newDimensionLabel}
                    onChange={(event) => setNewDimensionLabel(event.target.value)}
                  />
                </label>
                <button type="button" onClick={addDimension}>
                  Adicionar dimensao
                </button>
              </div>

              <div>
                <span>Itens</span>
                <ul>
                  {items.map((item) => (
                    <li key={item.itemKey}>
                      {item.itemKey} - {itemTypeLabels[item.itemType]} - {item.promptText}
                      <button type="button" onClick={() => removeItem(item.itemKey)}>
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
                <label htmlFor="bi-item-key">
                  Chave do item
                  <input
                    id="bi-item-key"
                    type="text"
                    value={newItemKey}
                    onChange={(event) => setNewItemKey(event.target.value)}
                  />
                </label>
                <label htmlFor="bi-item-type">
                  Tipo
                  <select
                    id="bi-item-type"
                    value={newItemType}
                    onChange={(event) => setNewItemType(event.target.value as ItemType)}
                  >
                    {Object.entries(itemTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="bi-item-prompt">
                  Texto do item
                  <input
                    id="bi-item-prompt"
                    type="text"
                    value={newItemPrompt}
                    onChange={(event) => setNewItemPrompt(event.target.value)}
                  />
                </label>
                <label htmlFor="bi-item-dimensions">
                  Dimensoes mapeadas (codigos separados por virgula)
                  <input
                    id="bi-item-dimensions"
                    type="text"
                    value={newItemDimensions}
                    onChange={(event) => setNewItemDimensions(event.target.value)}
                  />
                </label>
                <button type="button" onClick={addItem}>
                  Adicionar item
                </button>
              </div>

              <button type="button" onClick={createDraftVersion}>
                Criar versao rascunho
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <span>Catalogo global (Platform Admin)</span>
        <ul>
          {platformCatalog.map((instrument) => {
            const enabled =
              orgSettings.find((setting) => setting.behavioralInstrumentId === instrument.id)
                ?.enabled ?? false;
            return (
              <li key={instrument.id}>
                {instrument.name} - {enabled ? "Habilitado" : "Desabilitado"}
                <button
                  type="button"
                  onClick={() => toggleGlobalInstrument(instrument.id, enabled)}
                >
                  {enabled ? "Desabilitar" : "Habilitar"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="panel">
        <span>Preferencia por vaga</span>
        <label htmlFor="bi-job-opening">
          Vaga
          <select
            id="bi-job-opening"
            value={selectedJobOpeningId}
            onChange={(event) => setSelectedJobOpeningId(event.target.value)}
          >
            <option value="">Selecione uma vaga</option>
            {jobOpenings.map((opening) => (
              <option key={opening.id} value={opening.id}>
                {opening.title} ({opening.status})
              </option>
            ))}
          </select>
        </label>

        {jobOpeningSettings && (
          <>
            <p>
              Status: <strong>{jobOpeningSettings.enabled ? "Habilitada" : "Desabilitada"}</strong>
            </p>
            <button
              type="button"
              onClick={() =>
                saveJobOpeningSettings({
                  ...jobOpeningSettings,
                  enabled: !jobOpeningSettings.enabled
                })
              }
            >
              {jobOpeningSettings.enabled ? "Desabilitar" : "Habilitar"}
            </button>
          </>
        )}
      </div>

      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
