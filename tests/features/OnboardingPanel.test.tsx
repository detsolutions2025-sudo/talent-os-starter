import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingPanel } from "../../src/client/features/onboarding/OnboardingPanel";

const application = {
  id: "application-1",
  candidateId: "candidate-1",
  candidate: { fullName: "Carla Nunes" },
  applicationStatus: "hired"
};

const onboarding = {
  id: "onboarding-1",
  candidateApplicationId: "application-1",
  status: "in_progress" as const,
  expectedPersonStartDate: "2026-02-01",
  employmentId: null,
  progress: { numerator: 3, denominator: 5, percent: 60 },
  tasks: [
    {
      id: "task-1",
      title: "Assinar contrato",
      description: null,
      isRequired: true,
      status: "open" as const,
      assigneeMembershipId: null,
      dueAt: null,
      cancellationReason: null
    },
    {
      id: "task-2",
      title: "Configurar acesso ao e-mail",
      description: null,
      isRequired: false,
      status: "completed" as const,
      assigneeMembershipId: null,
      dueAt: null,
      cancellationReason: null
    }
  ]
};

function mockFetch() {
  return vi.fn((url: string) => {
    if (url.includes("/onboarding")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(onboarding) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

describe("OnboardingPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows real task progress as a fraction, not as an invented score", async () => {
    render(
      <OnboardingPanel
        organizationId="org-1"
        role="owner"
        headers={{}}
        applications={[application]}
        memberships={[]}
      />
    );

    fireEvent.change(screen.getByLabelText("Candidatura hired"), {
      target: { value: "application-1" }
    });

    expect(await screen.findByText("3 de 5 concluídas")).toBeInTheDocument();
  });

  it("marks only open+required tasks as obrigatória, not completed ones", async () => {
    render(
      <OnboardingPanel
        organizationId="org-1"
        role="owner"
        headers={{}}
        applications={[application]}
        memberships={[]}
      />
    );

    fireEvent.change(screen.getByLabelText("Candidatura hired"), {
      target: { value: "application-1" }
    });

    await screen.findByText("Assinar contrato");
    const requiredBadges = screen.getAllByText("obrigatória");
    expect(requiredBadges).toHaveLength(1);
  });

  it("lets anyone complete an open task, but only owner/admin can cancel it", async () => {
    render(
      <OnboardingPanel
        organizationId="org-1"
        role="member"
        headers={{}}
        applications={[application]}
        memberships={[]}
      />
    );

    fireEvent.change(screen.getByLabelText("Candidatura hired"), {
      target: { value: "application-1" }
    });

    await screen.findByText("Assinar contrato");
    expect(screen.getByRole("button", { name: "Concluir tarefa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar tarefa" })).not.toBeInTheDocument();
  });

  it("links an existing Employment only through the explicit vínculo action", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OnboardingPanel
        organizationId="org-1"
        role="owner"
        headers={{}}
        applications={[application]}
        memberships={[]}
      />
    );

    fireEvent.change(screen.getByLabelText("Candidatura hired"), {
      target: { value: "application-1" }
    });
    await screen.findByText("Assinar contrato");

    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/employments")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: "employment-9", status: "active" }])
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(onboarding) } as Response);
    });

    fireEvent.click(screen.getByRole("button", { name: "Carregar Employments elegíveis" }));
    expect(await screen.findByText("employment-9 - active")).toBeInTheDocument();
  });
});
