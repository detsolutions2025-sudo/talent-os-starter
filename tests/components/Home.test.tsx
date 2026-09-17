import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Home } from "../../src/client/components/dashboard/Home";
import { NAV_GROUPS } from "../../src/client/components/navigation/nav-config";

const baseStats = {
  membershipsCount: 0,
  jobOpeningsCount: 0,
  candidatesCount: 0,
  applicationsCount: 0,
  interviewsCount: 0
};

describe("Home", () => {
  it("shows an empty state instead of fabricated numbers when no organization is accessible", () => {
    render(
      <Home
        organization={null}
        organizationsCount={0}
        stats={baseStats}
        dnaStatus={{ published: false }}
        groups={NAV_GROUPS}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhuma organização acessível")).toBeInTheDocument();
    expect(screen.queryByText("Membros ativos")).not.toBeInTheDocument();
  });

  it("shows an empty state prompting selection when organizations exist but none is selected", () => {
    render(
      <Home
        organization={null}
        organizationsCount={2}
        stats={baseStats}
        dnaStatus={{ published: false }}
        groups={NAV_GROUPS}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText("Nenhuma organização selecionada")).toBeInTheDocument();
  });

  it("renders real counts from state, never fabricated metrics", () => {
    render(
      <Home
        organization={{ name: "Acme", slug: "acme", status: "active" }}
        organizationsCount={1}
        stats={{ ...baseStats, jobOpeningsCount: 3, candidatesCount: 7 }}
        dnaStatus={{ published: true, versionNumber: 2 }}
        currentRole="admin"
        groups={NAV_GROUPS}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Publicado v2")).toBeInTheDocument();
  });

  it("navigates to the first item of a group when its shortcut is opened", () => {
    const onNavigate = vi.fn();
    render(
      <Home
        organization={{ name: "Acme", slug: "acme", status: "active" }}
        organizationsCount={1}
        stats={baseStats}
        dnaStatus={{ published: false }}
        groups={NAV_GROUPS}
        onNavigate={onNavigate}
      />
    );

    const [firstShortcut] = screen.getAllByRole("button", { name: "Abrir" });
    fireEvent.click(firstShortcut);

    expect(onNavigate).toHaveBeenCalledWith(NAV_GROUPS[0].items[0].id);
  });
});
