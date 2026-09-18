import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicProposalPage } from "../../../src/client/features/public/PublicProposalPage";

const proposal = {
  proposalVersionId: "internal-version-id-should-not-leak",
  status: "issued",
  content: { text: "Proposta para atuar como Engenheiro de Dados." },
  compensation: { salary: 8000, currency: "BRL", periodicity: "monthly" },
  validUntil: "2026-12-31T00:00:00.000Z",
  presentationHash: "internal-hash-should-not-render"
};

function mockFetch(decision?: Partial<typeof proposal>) {
  return vi.fn((url: string) => {
    if (String(url).endsWith("/current")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(proposal) } as Response);
    }
    if (String(url).endsWith("/accept")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...proposal, status: "accepted", ...decision })
      } as Response);
    }
    if (String(url).endsWith("/decline")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...proposal, status: "declined", ...decision })
      } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe("PublicProposalPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = "";
  });

  it("shows the unavailable message when there is no access token, without a blank screen", async () => {
    window.location.hash = "";
    vi.stubGlobal("fetch", vi.fn());
    render(<PublicProposalPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não está mais disponível/);
  });

  it("reads the token from the URL fragment, strips it, and never renders internal identifiers", async () => {
    window.location.hash = "#access=secret-token";
    vi.stubGlobal("fetch", mockFetch());
    render(<PublicProposalPage />);

    expect(
      await screen.findByText("Proposta para atuar como Engenheiro de Dados.")
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(document.body.textContent).not.toMatch(/internal-version-id-should-not-leak/);
    expect(document.body.textContent).not.toMatch(/internal-hash-should-not-render/);
  });

  it("accepts the proposal and shows a final confirmation state", async () => {
    window.location.hash = "#access=secret-token";
    vi.stubGlobal("fetch", mockFetch());
    render(<PublicProposalPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Aceitar proposta" }));

    expect(await screen.findByText("Proposta aceita")).toBeInTheDocument();
  });

  it("declines the proposal with a reason and shows a final confirmation state", async () => {
    window.location.hash = "#access=secret-token";
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicProposalPage />);

    await screen.findByText("Proposta para atuar como Engenheiro de Dados.");
    fireEvent.change(screen.getByLabelText("Motivo da recusa (opcional)"), {
      target: { value: "Aceitei outra oferta." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Recusar proposta" }));

    expect(await screen.findByText("Proposta recusada")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/proposals/decline",
      expect.objectContaining({
        body: JSON.stringify({ declineReason: "Aceitei outra oferta." })
      })
    );
  });
});
