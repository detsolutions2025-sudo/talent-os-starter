import { afterEach, describe, expect, it, vi } from "vitest";
import { installCredentialedFetch } from "../../src/client/apiClient";

describe("installCredentialedFetch", () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    window.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("adds credentials only to same-origin requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    window.fetch = fetchMock as unknown as typeof window.fetch;

    installCredentialedFetch();

    await fetch("/api/me");
    await fetch(`${window.location.origin}/api/me`);
    await fetch("https://hxsybwibajgmberzwwyv.supabase.co/auth/v1/token?grant_type=password");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/me", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${window.location.origin}/api/me`, {
      credentials: "include"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://hxsybwibajgmberzwwyv.supabase.co/auth/v1/token?grant_type=password",
      {}
    );
  });

  it("preserves explicit credentials from the caller", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    window.fetch = fetchMock as unknown as typeof window.fetch;

    installCredentialedFetch();

    await fetch("/api/me", { credentials: "omit" });

    expect(fetchMock).toHaveBeenCalledWith("/api/me", { credentials: "omit" });
  });
});
