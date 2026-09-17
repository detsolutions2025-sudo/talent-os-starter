import type { OrganizationalUnit, OrganizationalUnitDraft } from "../../App";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Checkbox } from "../../components/ui/Checkbox";
import { EmptyState } from "../../components/ui/EmptyState";
import { FormSection } from "../../components/ui/FormSection";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { UnitTree } from "./UnitTree";

export type OrganizationStructurePanelProps = {
  canManage: boolean;
  canChangeCode: boolean;
  unitTree: OrganizationalUnit[];
  activeUnits: OrganizationalUnit[];
  selectedUnitId: string;
  unitDraft: OrganizationalUnitDraft;
  showInactive: boolean;
  onToggleShowInactive: (value: boolean) => void;
  onSelectUnit: (unit: OrganizationalUnit) => void;
  onNewUnit: (parentId: string) => void;
  onDraftChange: (patch: Partial<OrganizationalUnitDraft>) => void;
  onSave: () => void;
  onMove: () => void;
  onChangeStatus: (action: "inactivate" | "reactivate") => void;
};

const UNIT_TYPES: OrganizationalUnit["type"][] = [
  "board",
  "directorate",
  "department",
  "division",
  "branch",
  "office",
  "team",
  "squad",
  "unit",
  "other"
];

export function OrganizationStructurePanel({
  canManage,
  canChangeCode,
  unitTree,
  activeUnits,
  selectedUnitId,
  unitDraft,
  showInactive,
  onToggleShowInactive,
  onSelectUnit,
  onNewUnit,
  onDraftChange,
  onSave,
  onMove,
  onChangeStatus
}: OrganizationStructurePanelProps) {
  return (
    <div className="ds-feature">
      <SectionHeader
        title="Estrutura Organizacional"
        description="Hierarquia real de unidades organizacionais, com edição controlada pela unidade selecionada."
        actions={
          canManage && (
            <>
              <Button variant="secondary" size="sm" onClick={() => onNewUnit("")}>
                Nova raiz
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNewUnit(selectedUnitId)}
                disabled={!selectedUnitId}
              >
                Nova filha
              </Button>
            </>
          )
        }
      />

      <Checkbox
        label="Mostrar unidades inativas"
        checked={showInactive}
        onChange={(event) => onToggleShowInactive(event.target.checked)}
      />

      <div className={`ds-feature__layout${canManage ? "" : " ds-feature__layout--single"}`}>
        <div className="ds-feature__main">
          <Card>
            {unitTree.length === 0 ? (
              <EmptyState title="Nenhuma unidade carregada" />
            ) : (
              <UnitTree
                units={unitTree}
                showInactive={showInactive}
                selectedUnitId={selectedUnitId}
                onSelect={onSelectUnit}
              />
            )}
          </Card>
        </div>

        {canManage ? (
          <div className="ds-feature__aside">
            <Card>
              <FormSection
                title={selectedUnitId ? "Editar unidade" : "Criar unidade"}
                actions={
                  <>
                    <Button variant="secondary" onClick={onSave}>
                      Salvar
                    </Button>
                    <Button variant="secondary" onClick={onMove} disabled={!selectedUnitId}>
                      Mover
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => onChangeStatus("inactivate")}
                      disabled={!selectedUnitId}
                    >
                      Inativar
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => onChangeStatus("reactivate")}
                      disabled={!selectedUnitId}
                    >
                      Reativar
                    </Button>
                  </>
                }
              >
                <Input
                  label="Código"
                  placeholder="Código"
                  value={unitDraft.code}
                  disabled={Boolean(selectedUnitId) && !canChangeCode}
                  onChange={(event) => onDraftChange({ code: event.target.value })}
                />
                <Input
                  label="Nome"
                  placeholder="Nome"
                  value={unitDraft.name}
                  onChange={(event) => onDraftChange({ name: event.target.value })}
                />
                <Select
                  label="Tipo"
                  value={unitDraft.type}
                  onChange={(event) =>
                    onDraftChange({ type: event.target.value as OrganizationalUnit["type"] })
                  }
                >
                  {UNIT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Unidade pai"
                  value={unitDraft.parentId}
                  onChange={(event) => onDraftChange({ parentId: event.target.value })}
                >
                  <option value="">Raiz</option>
                  {activeUnits
                    .filter((unit) => unit.id !== selectedUnitId)
                    .map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.code} - {unit.name}
                      </option>
                    ))}
                </Select>
                <Input
                  label="Gestor"
                  placeholder="Gestor"
                  value={unitDraft.managerName}
                  onChange={(event) => onDraftChange({ managerName: event.target.value })}
                />
                <Input
                  label="E-mail do gestor"
                  placeholder="Email do gestor"
                  value={unitDraft.managerEmail}
                  onChange={(event) => onDraftChange({ managerEmail: event.target.value })}
                />
                <Input
                  label="Descrição"
                  placeholder="Descrição"
                  value={unitDraft.description}
                  onChange={(event) => onDraftChange({ description: event.target.value })}
                />
                <Input
                  label="Ordem de exibição"
                  type="number"
                  min="0"
                  value={unitDraft.displayOrder}
                  onChange={(event) => onDraftChange({ displayOrder: Number(event.target.value) })}
                />
              </FormSection>
            </Card>
          </div>
        ) : (
          <div className="ds-feature__aside">
            <EmptyState
              title="Visualização limitada"
              description="Apenas unidades ativas ficam visíveis para o seu papel atual."
            />
          </div>
        )}
      </div>
    </div>
  );
}
