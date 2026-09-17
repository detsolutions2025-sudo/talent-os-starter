import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompetenciesPanel } from "../../src/client/features/competencies/CompetenciesPanel";
import type { CompetencyDraft } from "../../src/client/App";

const emptyDraft: CompetencyDraft = { code: "", name: "", category: "technical", definition: "" };

function noop() {}

describe("CompetenciesPanel", () => {
  it("shows the catalog tab by default with real unified catalog items", () => {
    render(
      <CompetenciesPanel
        canManage
        activeTab="catalog"
        onTabChange={noop}
        catalogItems={[
          {
            competencyCatalogItemId: "cat-1",
            origin: "organization",
            code: "COM-01",
            name: "Comunicação",
            category: "behavioral",
            status: "active",
            sourceStatus: "active",
            globalStatus: null,
            editable: true,
            deprecated: false
          }
        ]}
        organizationCompetencies={[]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={noop}
        globalCompetencies={[]}
        availableGlobalCompetencies={[]}
        globalDraft={emptyDraft}
        onGlobalDraftChange={noop}
        onCreateGlobal={noop}
        onAdoptGlobal={noop}
      />
    );

    expect(screen.getByText("Comunicação")).toBeInTheDocument();
  });

  it("switches tabs via onTabChange when a tab is clicked", () => {
    const onTabChange = vi.fn();
    render(
      <CompetenciesPanel
        canManage
        activeTab="catalog"
        onTabChange={onTabChange}
        catalogItems={[]}
        organizationCompetencies={[]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={noop}
        globalCompetencies={[]}
        availableGlobalCompetencies={[]}
        globalDraft={emptyDraft}
        onGlobalDraftChange={noop}
        onCreateGlobal={noop}
        onAdoptGlobal={noop}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Biblioteca Global" }));
    expect(onTabChange).toHaveBeenCalledWith("global");
  });

  it("toggles organization competency status with the real activate/inactivate action", () => {
    const onChangeOrganizationStatus = vi.fn();
    render(
      <CompetenciesPanel
        canManage
        activeTab="organization"
        onTabChange={noop}
        catalogItems={[]}
        organizationCompetencies={[
          {
            id: "org-1",
            code: "LID-01",
            name: "Liderança",
            category: "leadership",
            definition: "",
            status: "active"
          }
        ]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={onChangeOrganizationStatus}
        globalCompetencies={[]}
        availableGlobalCompetencies={[]}
        globalDraft={emptyDraft}
        onGlobalDraftChange={noop}
        onCreateGlobal={noop}
        onAdoptGlobal={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Inativar" }));
    expect(onChangeOrganizationStatus).toHaveBeenCalledWith("org-1", "inactivate");
  });

  it("allows adopting an available global competency", () => {
    const onAdoptGlobal = vi.fn();
    render(
      <CompetenciesPanel
        canManage
        activeTab="global"
        onTabChange={noop}
        catalogItems={[]}
        organizationCompetencies={[]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={noop}
        globalCompetencies={[]}
        availableGlobalCompetencies={[
          {
            id: "glob-1",
            code: "NEG-01",
            name: "Negociação",
            category: "behavioral",
            definition: "",
            status: "active"
          }
        ]}
        globalDraft={emptyDraft}
        onGlobalDraftChange={noop}
        onCreateGlobal={noop}
        onAdoptGlobal={onAdoptGlobal}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Adotar" }));
    expect(onAdoptGlobal).toHaveBeenCalledWith("glob-1");
  });

  it("shows the global-competency creation form even when the viewer cannot manage the organization catalog", () => {
    render(
      <CompetenciesPanel
        canManage={false}
        activeTab="global"
        onTabChange={noop}
        catalogItems={[]}
        organizationCompetencies={[]}
        organizationDraft={emptyDraft}
        onOrganizationDraftChange={noop}
        onCreateOrganization={noop}
        onChangeOrganizationStatus={noop}
        globalCompetencies={[]}
        availableGlobalCompetencies={[]}
        globalDraft={emptyDraft}
        onGlobalDraftChange={noop}
        onCreateGlobal={noop}
        onAdoptGlobal={noop}
      />
    );

    expect(screen.getByRole("button", { name: "Criar global" })).toBeInTheDocument();
  });
});
