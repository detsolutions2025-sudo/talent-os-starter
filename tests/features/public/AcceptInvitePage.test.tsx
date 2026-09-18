import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AcceptInvitePage } from "../../../src/client/features/public/AcceptInvitePage";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../../../src/client/supabaseClient", () => ({
  supabase: { auth: { getSession } }
}));

describe("AcceptInvitePage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getSession.mockReset();
    window.history.pushState({}, "", "/accept-invite");
  });

  it("shows an error, never a blank screen, when the invitation id is missing from the URL", async () => {
    window.history.pushState({}, "", "/accept-invite");
    render(<AcceptInvitePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Link de convite inválido.");
  });

  it("bridges the Supabase session, accepts the invitation, and shows a link to the platform", async () => {
    window.history.pushState({}, "", "/accept-invite?invitation=invitation-1");
    getSession.mockResolvedValue({
      data: { session: { access_token: "at", refresh_token: "rt" } }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url) === "/api/auth/session") {
          return Promise.resolve({ ok: true } as Response);
        }
        if (String(url).endsWith("/accept")) {
          return Promise.resolve({ ok: true } as Response);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      })
    );

    render(<AcceptInvitePage />);

    expect(await screen.findByText("Convite aceito")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para a plataforma" })).toHaveAttribute("href", "/");
  });

  it("shows a safe message, not a stack trace, when accepting the invitation fails", async () => {
    window.history.pushState({}, "", "/accept-invite?invitation=invitation-1");
    getSession.mockResolvedValue({
      data: { session: { access_token: "at", refresh_token: "rt" } }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url) === "/api/auth/session") {
          return Promise.resolve({ ok: true } as Response);
        }
        return Promise.resolve({ ok: false } as Response);
      })
    );

    render(<AcceptInvitePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível aceitar o convite. Ele pode ter expirado ou já ter sido usado."
    );
  });
});
