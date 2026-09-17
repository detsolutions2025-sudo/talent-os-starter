import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OffboardingPanel } from "../../src/client/features/offboarding/OffboardingPanel";

const offboardingList = [
  {
    id: "offboarding-1",
    employmentId: "employment-1",
    status: "in_progress" as const,
    exitCategory: "voluntary_resignation",
    expectedLastDay: "2026-03-01",
    progress: { numerator: 1, denominator: 4, percent: 25 },
    tasks: [
      {
        id: "task-1",
        title: "Revogar crachá físico",
        description: null,
        isRequired: true,
        status: "open" as const,
        assigneeMembershipId: null,
        dueAt: null,
        cancellationReason: null
      }
    ]
  }
];

function mockFetch() {
  return vi.fn((url: string) => {
    if (url.includes("/employments") && !url.includes("offboardings")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: "employment-1", status: "active" }])
      } as Response);
    }
    if (url.includes("/offboardings")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(offboardingList)
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

describe("OffboardingPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never suggests that completing Offboarding revokes access automatically", () => {
    render(<OffboardingPanel organizationId="org-1" role="owner" headers={{}} memberships={[]} />);

    expect(screen.getByText(/não revoga acesso automaticamente/i)).toBeInTheDocument();
    expect(screen.queryByText(/revogar acesso/i)).not.toBeInTheDocument();
  });

  it("highlights an open required task blocking completion", async () => {
    render(<OffboardingPanel organizationId="org-1" role="owner" headers={{}} memberships={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Carregar Employments elegíveis" }));
    fireEvent.change(await screen.findByLabelText("Employment para offboarding"), {
      target: { value: "employment-1" }
    });

    expect(await screen.findByText("Revogar crachá físico")).toBeInTheDocument();
    expect(screen.getByText("obrigatória")).toBeInTheDocument();
  });

  it("only allows creating Offboarding for an eligible (active/ended) Employment", async () => {
    render(<OffboardingPanel organizationId="org-1" role="owner" headers={{}} memberships={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Carregar Employments elegíveis" }));
    expect(await screen.findByText("employment-1 - active")).toBeInTheDocument();
  });
});
