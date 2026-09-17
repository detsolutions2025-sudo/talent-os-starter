import type { OrganizationalUnit } from "../../App";

export type UnitTreeProps = {
  units: OrganizationalUnit[];
  showInactive: boolean;
  selectedUnitId: string;
  onSelect: (unit: OrganizationalUnit) => void;
};

// Renderizador recursivo da hierarquia real de unidades (sem drag-and-drop, sem reparent por
// arrastar -- o modelo atual so permite mover via formulario, preservado em OrganizationStructurePanel).
export function UnitTree({ units, showInactive, selectedUnitId, onSelect }: UnitTreeProps) {
  const visibleUnits = units.filter((unit) => showInactive || unit.status === "active");

  return (
    <ul className="ds-unit-tree">
      {visibleUnits.map((unit) => (
        <li key={unit.id}>
          <button
            type="button"
            className={`ds-unit-row${unit.id === selectedUnitId ? " ds-unit-row--active" : ""}`}
            aria-current={unit.id === selectedUnitId ? "true" : undefined}
            onClick={() => onSelect(unit)}
          >
            <strong>{unit.name}</strong>
            <small>
              {unit.code} · {unit.type} · {unit.status}
            </small>
          </button>
          {unit.children && unit.children.length > 0 && (
            <UnitTree
              units={unit.children}
              showInactive={showInactive}
              selectedUnitId={selectedUnitId}
              onSelect={onSelect}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
