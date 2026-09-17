import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessGrantPanel } from "../../src/client/features/access/AccessGrantPanel";

const memberships = [
  {
    id: "membership-1",
    role: "member" as const,
    status: "active" as const,
    user: { name: "Diego Alves", email: "diego@example.com" }
  }
];

const grants = [
  {
    id: "grant-1",
    organizationPersonId: "person-1",
    membershipId: "membership-1",
    employmentId: "employment-1",
    provenanceType: "employment" as const,
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    revokedAt: null
  },
  {
    id: "grant-2",
    organizationPersonId: "person-2",
    membershipId: "membership-1",
    employmentId: null,
    provenanceType: "administrative" as const,
    status: "revoked" as const,
    createdAt: "2025-12-01T00:00:00.000Z",
    revokedAt: "2025-12-15T00:00:00.000Z"
  }
];

function mockFetch() {
  return vi.fn((url: string) => {
    if (url.includes("/access-grants")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(grants) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

describe("AccessGrantPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing for a member (SPEC-027 s22, CA-017)", () => {
    const { container } = render(
      <AccessGrantPanel organizationId="org-1" role="member" headers={{}} memberships={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("only shows Revogar for an active grant, never for an already revoked one", async () => {
    render(
      <AccessGrantPanel
        organizationId="org-1"
        role="owner"
        headers={{}}
        memberships={memberships}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Carregar AccessGrants" }));

    await waitFor(() => expect(screen.getAllByText(/acesso ativo|revogado/)).toHaveLength(2));
    expect(screen.getAllByRole("button", { name: "Revogar" })).toHaveLength(1);
  });

  it("never offers a way to reopen/reactivate a revoked grant", async () => {
    render(
      <AccessGrantPanel
        organizationId="org-1"
        role="owner"
        headers={{}}
        memberships={memberships}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Carregar AccessGrants" }));
    await screen.findByText("revogado");

    expect(screen.queryByText(/reativar/i)).not.toBeInTheDocument();
  });

  it("grants access only through the explicit Conceder action, never automatically", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AccessGrantPanel
        organizationId="org-1"
        role="owner"
        headers={{}}
        memberships={memberships}
      />
    );

    fireEvent.change(screen.getByLabelText("OrganizationPerson ID"), {
      target: { value: "person-1" }
    });
    fireEvent.change(screen.getByLabelText("Membership"), {
      target: { value: "membership-1" }
    });
    fireEvent.change(screen.getByLabelText("Motivo administrativo"), {
      target: { value: "Acesso administrativo explicito." }
    });

    fireEvent.click(screen.getByRole("button", { name: "Conceder AccessGrant" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/access-grants"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
