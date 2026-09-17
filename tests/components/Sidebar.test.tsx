import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../../src/client/components/layout/AppShell";
import { Sidebar } from "../../src/client/components/navigation/Sidebar";
import type { NavGroup } from "../../src/client/components/navigation/nav-config";

const groups: NavGroup[] = [
  {
    id: "recrutamento",
    label: "Recrutamento",
    items: [
      { id: "panel-job-openings", label: "Vagas" },
      { id: "panel-pre-analysis", label: "Pré-Análise", ai: true }
    ]
  }
];

function renderSidebar(props: Partial<ComponentProps<typeof Sidebar>> = {}) {
  const onSelectOverview = vi.fn();
  const onSelectAnchor = vi.fn();

  render(
    <AppShell
      sidebar={
        <Sidebar
          groups={groups}
          activeSection="overview"
          activeAnchorId={null}
          onSelectOverview={onSelectOverview}
          onSelectAnchor={onSelectAnchor}
          {...props}
        />
      }
      topbar={<span>topbar</span>}
    >
      <p>conteudo</p>
    </AppShell>
  );

  return { onSelectOverview, onSelectAnchor };
}

describe("Sidebar", () => {
  it("renders every group and item from the nav config, with an AI badge on AI-assisted modules", () => {
    renderSidebar();

    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(nav).getByText("Recrutamento")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /Vagas/ })).toBeInTheDocument();

    const aiLink = within(nav).getByRole("link", { name: /Pré-Análise/ });
    expect(within(aiLink).getByText("IA")).toBeInTheDocument();
  });

  it("marks Visão Geral as the active item when activeSection is overview", () => {
    renderSidebar({ activeSection: "overview" });

    expect(screen.getByRole("button", { name: /Visão Geral/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks the matching item as active when activeSection is workspace", () => {
    renderSidebar({ activeSection: "workspace", activeAnchorId: "panel-job-openings" });

    expect(screen.getByRole("link", { name: /Vagas/ })).toHaveAttribute("aria-current", "page");
  });

  it("calls onSelectOverview and onSelectAnchor when items are clicked", () => {
    const { onSelectOverview, onSelectAnchor } = renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /Visão Geral/ }));
    expect(onSelectOverview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("link", { name: /Vagas/ }));
    expect(onSelectAnchor).toHaveBeenCalledWith("panel-job-openings");
  });
});
