import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmploymentPanel } from "../../src/client/features/employment/EmploymentPanel";

const people = [
  {
    id: "person-1",
    displayName: "Ana Souza",
    preferredName: null,
    primaryEmail: "ana@example.com",
    originCandidateId: "candidate-1"
  }
];

const employments = [
  {
    id: "employment-1",
    organizationPersonId: "person-1",
    status: "pending" as const,
    originType: "recruitment" as const,
    originCandidateApplicationId: "application-1",
    effectiveStartDate: "2026-01-01",
    startedAt: null,
    endDate: null,
    originReason: "Contratacao via recrutamento."
  }
];

function mockFetch() {
  return vi.fn((url: string) => {
    if (url.includes("/organization-people")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(people) } as Response);
    }
    if (url.includes("/employments")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(employments) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

describe("EmploymentPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing for a member (leitura restrita a owner/admin, SPEC-025 s20)", () => {
    const { container } = render(
      <EmploymentPanel organizationId="org-1" role="member" headers={{}} applications={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Pessoas (identidade) and Vínculos (Employment) as two distinct sections, not fused", async () => {
    const { container } = render(
      <EmploymentPanel organizationId="org-1" role="owner" headers={{}} applications={[]} />
    );

    expect((await screen.findAllByText("Ana Souza")).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Pessoas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vínculos (Employment)" })).toBeInTheDocument();

    const peopleSection = container.querySelector("#panel-people");
    const employmentSection = container.querySelector("#panel-employment");
    expect(peopleSection).not.toBeNull();
    expect(employmentSection).not.toBeNull();
    // A pessoa aparece no bloco de identidade, e o vinculo (Employment) referencia a mesma
    // pessoa por nome no bloco de vinculos -- sem duplicar o fetch de organization-people.
    expect(peopleSection?.textContent).toContain("Ana Souza");
    expect(employmentSection?.textContent).toContain("Ana Souza");
    expect(employmentSection?.textContent).toContain("pending");
  });

  it("only creates a recruitment Employment on explicit click, never automatically", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmploymentPanel
        organizationId="org-1"
        role="owner"
        headers={{}}
        applications={[
          {
            id: "application-1",
            candidateId: "candidate-1",
            candidate: { fullName: "Bruno Lima" },
            applicationStatus: "hired"
          }
        ]}
      />
    );

    await screen.findAllByText("Ana Souza");
    fetchMock.mockClear();

    fireEvent.change(screen.getByLabelText("Candidatura hired"), {
      target: { value: "application-1" }
    });
    fireEvent.change(screen.getByLabelText("Data efetiva de início"), {
      target: { value: "2026-02-01" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar Employment" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/employments"),
        expect.objectContaining({ method: "POST" })
      );
    });
    const [, requestInit] = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/employments")
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(requestInit.body as string)).toMatchObject({ originType: "recruitment" });
  });
});
