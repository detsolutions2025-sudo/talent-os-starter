import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevelopmentRetentionPanel } from "../../src/client/features/development/DevelopmentRetentionPanel";

const activeEmployment = {
  id: "employment-1",
  status: "active" as const,
  organizationPersonId: "person-1"
};

const plan = {
  id: "plan-1",
  employmentId: "employment-1",
  title: "Plano de crescimento",
  purpose: null,
  status: "active" as const,
  goals: [{ id: "goal-1", title: "Concluir certificação", status: "open" as const }],
  checkIns: [{ id: "checkin-1", summary: "Progredindo bem", submittedAt: "2026-01-10" }]
};

const concerns = [
  {
    id: "concern-1",
    category: "other_minimized",
    description: "Sobrecarga observada",
    status: "open" as const
  }
];

const actions = [
  {
    id: "action-1",
    actionType: "conversation",
    description: "Conversa 1:1 realizada",
    status: "open" as const
  }
];

function mockFetch() {
  return vi.fn((url: string) => {
    if (url.includes("/development-plans/plan-1")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(plan) } as Response);
    }
    if (url.includes("/development-plans")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: "plan-1", status: "active" }])
      } as Response);
    }
    if (url.includes("/retention-concerns")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(concerns) } as Response);
    }
    if (url.includes("/retention-actions")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(actions) } as Response);
    }
    if (url.includes("/employments")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([activeEmployment])
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

describe("DevelopmentRetentionPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing for a member", () => {
    const { container } = render(
      <DevelopmentRetentionPanel organizationId="org-1" role="member" headers={{}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("never fabricates a score, ranking or risk metric anywhere on screen", async () => {
    const { container } = render(
      <DevelopmentRetentionPanel organizationId="org-1" role="owner" headers={{}} />
    );

    await screen.findByText("employment-1");
    fireEvent.change(screen.getByLabelText("Employment"), {
      target: { value: "employment-1" }
    });

    await screen.findByText("Plano de crescimento");
    await screen.findByText("Sobrecarga observada");
    await screen.findByText("Conversa 1:1 realizada");

    // A tela explica em prosa que nao ha score/ranking/risco calculado (SPEC-017 s21) -- o que
    // esta reprovado e uma metrica fabricada de verdade (numero, badge, rotulo isolado).
    expect(screen.queryByText(/^score$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^ranking$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/flight risk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/potencial/i)).not.toBeInTheDocument();
    // 4 badges reais: status do plano, do goal, da concern e da action -- todos vindos de
    // dados existentes (nenhum rotulo extra de score/risco).
    expect(container.querySelectorAll(".ds-badge").length).toBe(4);
  });

  it("shows plan, goals, concerns and actions as real registered data, with explicit transitions", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(<DevelopmentRetentionPanel organizationId="org-1" role="owner" headers={{}} />);

    await screen.findByText("employment-1");
    fireEvent.change(screen.getByLabelText("Employment"), {
      target: { value: "employment-1" }
    });

    await screen.findByText("Concluir certificação");
    await screen.findByText("Conversa 1:1 realizada");

    fireEvent.click(screen.getByRole("button", { name: "Resolver" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/retention-concerns/concern-1/resolve"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
