import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlueprintPanel } from "../../src/client/features/blueprint/BlueprintPanel";

const status = {
  draft: {
    id: "draft-1",
    versionNumber: 2,
    status: "draft",
    createdSource: "user",
    activatedAt: null,
    manifest: []
  },
  active: null,
  progress: { applicableSteps: 5, completedSteps: 3 }
};

const readinessIncomplete = {
  status: "incomplete",
  checks: [],
  pendingRequired: ["dna_published"],
  pendingOptional: [],
  blockingReasons: []
};

function mockFetch(readiness: typeof readinessIncomplete) {
  return vi.fn((url: string) => {
    if (url.includes("/readiness")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(readiness) } as Response);
    }
    if (url.includes("/history")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(status) } as Response);
  });
}

describe("BlueprintPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch(readinessIncomplete));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing for a member (read restricted to owner/admin)", () => {
    const { container } = render(
      <BlueprintPanel organizationId="org-1" role="member" headers={{}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows real pendências pointing to the actual configuration module, not fabricated text", async () => {
    render(<BlueprintPanel organizationId="org-1" role="owner" headers={{}} />);

    expect(await screen.findByText("Configure o DNA Organizacional")).toBeInTheDocument();
  });

  it("disables activation until readiness is really ready (human confirms only when unblocked)", async () => {
    render(<BlueprintPanel organizationId="org-1" role="owner" headers={{}} />);

    const activateButton = await screen.findByRole("button", { name: "Ativar Blueprint" });
    expect(activateButton).toBeDisabled();
  });

  it("enables activation once readiness reports ready, and only calls activate on explicit click", async () => {
    const fetchMock = mockFetch({ ...readinessIncomplete, status: "ready", pendingRequired: [] });
    vi.stubGlobal("fetch", fetchMock);

    render(<BlueprintPanel organizationId="org-1" role="owner" headers={{}} />);

    const activateButton = await screen.findByRole("button", { name: "Ativar Blueprint" });
    expect(activateButton).toBeEnabled();

    fireEvent.click(activateButton);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/blueprint/draft/activate"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("never claims AI participation: readiness is deterministic and shows no AI badge/text", async () => {
    render(<BlueprintPanel organizationId="org-1" role="owner" headers={{}} />);

    await screen.findByText("Configure o DNA Organizacional");
    expect(screen.queryByText(/assistido por ia/i)).not.toBeInTheDocument();
  });
});
