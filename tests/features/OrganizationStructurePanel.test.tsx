import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrganizationStructurePanel } from "../../src/client/features/organization-structure/OrganizationStructurePanel";
import type { OrganizationalUnit, OrganizationalUnitDraft } from "../../src/client/App";

const emptyDraft: OrganizationalUnitDraft = {
  code: "",
  name: "",
  type: "department",
  parentId: "",
  managerName: "",
  managerEmail: "",
  description: "",
  displayOrder: 0
};

function makeUnit(overrides: Partial<OrganizationalUnit> = {}): OrganizationalUnit {
  return {
    id: "unit-1",
    code: "ENG",
    name: "Engenharia",
    type: "department",
    parentId: null,
    managerName: null,
    managerEmail: null,
    description: null,
    displayOrder: 0,
    status: "active",
    ...overrides
  };
}

function noop() {}

describe("OrganizationStructurePanel", () => {
  it("shows an empty state instead of an empty tree when no unit is loaded", () => {
    render(
      <OrganizationStructurePanel
        canManage={false}
        canChangeCode={false}
        unitTree={[]}
        activeUnits={[]}
        selectedUnitId=""
        unitDraft={emptyDraft}
        showInactive={false}
        onToggleShowInactive={noop}
        onSelectUnit={noop}
        onNewUnit={noop}
        onDraftChange={noop}
        onSave={noop}
        onMove={noop}
        onChangeStatus={noop}
      />
    );

    expect(screen.getByText("Nenhuma unidade carregada")).toBeInTheDocument();
  });

  it("renders the real hierarchy, including nested children", () => {
    const child = makeUnit({ id: "unit-2", code: "BE", name: "Backend", parentId: "unit-1" });
    const root = makeUnit({ children: [child] });

    render(
      <OrganizationStructurePanel
        canManage
        canChangeCode
        unitTree={[root]}
        activeUnits={[root, child]}
        selectedUnitId=""
        unitDraft={emptyDraft}
        showInactive={false}
        onToggleShowInactive={noop}
        onSelectUnit={noop}
        onNewUnit={noop}
        onDraftChange={noop}
        onSave={noop}
        onMove={noop}
        onChangeStatus={noop}
      />
    );

    expect(screen.getByText("Engenharia")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
  });

  it("calls onSelectUnit with the real unit when a row is clicked", () => {
    const onSelectUnit = vi.fn();
    const unit = makeUnit();

    render(
      <OrganizationStructurePanel
        canManage
        canChangeCode
        unitTree={[unit]}
        activeUnits={[unit]}
        selectedUnitId=""
        unitDraft={emptyDraft}
        showInactive={false}
        onToggleShowInactive={noop}
        onSelectUnit={onSelectUnit}
        onNewUnit={noop}
        onDraftChange={noop}
        onSave={noop}
        onMove={noop}
        onChangeStatus={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Engenharia/ }));
    expect(onSelectUnit).toHaveBeenCalledWith(unit);
  });

  it("uses onNewUnit for both new-root and new-child, matching the shared backend handler", () => {
    const onNewUnit = vi.fn();
    render(
      <OrganizationStructurePanel
        canManage
        canChangeCode
        unitTree={[]}
        activeUnits={[]}
        selectedUnitId="unit-1"
        unitDraft={emptyDraft}
        showInactive={false}
        onToggleShowInactive={noop}
        onSelectUnit={noop}
        onNewUnit={onNewUnit}
        onDraftChange={noop}
        onSave={noop}
        onMove={noop}
        onChangeStatus={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Nova raiz" }));
    expect(onNewUnit).toHaveBeenCalledWith("");

    fireEvent.click(screen.getByRole("button", { name: "Nova filha" }));
    expect(onNewUnit).toHaveBeenCalledWith("unit-1");
  });

  it("disables the code field when editing an existing unit without code-change permission", () => {
    render(
      <OrganizationStructurePanel
        canManage
        canChangeCode={false}
        unitTree={[]}
        activeUnits={[]}
        selectedUnitId="unit-1"
        unitDraft={emptyDraft}
        showInactive={false}
        onToggleShowInactive={noop}
        onSelectUnit={noop}
        onNewUnit={noop}
        onDraftChange={noop}
        onSave={noop}
        onMove={noop}
        onChangeStatus={noop}
      />
    );

    expect(screen.getByLabelText("Código")).toBeDisabled();
  });

  it("shows a limited-view empty state instead of the editor when the viewer cannot manage units", () => {
    render(
      <OrganizationStructurePanel
        canManage={false}
        canChangeCode={false}
        unitTree={[makeUnit()]}
        activeUnits={[makeUnit()]}
        selectedUnitId=""
        unitDraft={emptyDraft}
        showInactive={false}
        onToggleShowInactive={noop}
        onSelectUnit={noop}
        onNewUnit={noop}
        onDraftChange={noop}
        onSave={noop}
        onMove={noop}
        onChangeStatus={noop}
      />
    );

    expect(screen.getByText("Visualização limitada")).toBeInTheDocument();
    expect(screen.queryByLabelText("Código")).not.toBeInTheDocument();
  });
});
