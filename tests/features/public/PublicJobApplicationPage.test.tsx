import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicJobApplicationPage } from "../../../src/client/features/public/PublicJobApplicationPage";

const jobOpening = {
  slug: "engenheiro-dados",
  title: "Engenheiro de Dados",
  description: "Vaga para atuar no time de dados.",
  responsibilities: [{ text: "Manter pipelines de dados", displayOrder: 1 }],
  requirements: [{ text: "Experiência com SQL", displayOrder: 1 }],
  benefits: [],
  location: { country: "Brasil", region: "SP", city: "São Paulo", publicAddress: "", note: "" },
  workModel: "hybrid" as const,
  workSchedule: { weeklyHours: 40, description: "Segunda a sexta", shift: "" },
  salaryRange: null,
  positionsCount: 1,
  expectedStartDate: null,
  publicInstructions: "",
  applicationDeadline: null,
  isPubliclyAvailable: true
};

function mockFetch(overrides: { onSubmit?: () => Response | Promise<Response> } = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/applications") && init?.method === "POST") {
      return Promise.resolve(
        overrides.onSubmit
          ? overrides.onSubmit()
          : ({ ok: true, json: () => Promise.resolve({ status: "received" }) } as Response)
      );
    }
    if (String(url).includes("/api/public/job-openings/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(jobOpening) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Nome completo"), {
    target: { value: "Maria Silva" }
  });
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "maria@example.com" }
  });
}

describe("PublicJobApplicationPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders only the real fields returned by the API, never fabricated ones", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<PublicJobApplicationPage slug={jobOpening.slug} />);

    expect(await screen.findByText("Engenheiro de Dados")).toBeInTheDocument();
    expect(screen.getByText("Vaga para atuar no time de dados.")).toBeInTheDocument();
    expect(screen.getByText("Manter pipelines de dados")).toBeInTheDocument();
    expect(screen.getByText("Experiência com SQL")).toBeInTheDocument();
    // Sem beneficios reais -- a secao nao deve ser inventada.
    expect(screen.queryByText("Benefícios")).not.toBeInTheDocument();
    // Sem salaryRange -- nao fabrica remuneracao.
    expect(screen.queryByText("Remuneração")).not.toBeInTheDocument();
  });

  it("shows a generic error state for a 404/expired job opening, without a blank screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response))
    );
    render(<PublicJobApplicationPage slug="vaga-inexistente" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta vaga não está mais disponível."
    );
  });

  it("blocks submission without consent and never sends the request", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicJobApplicationPage slug={jobOpening.slug} />);
    await screen.findByText("Engenheiro de Dados");

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Enviar candidatura" }));

    expect(await screen.findByText(/aceitar o uso dos seus dados/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/applications"),
      expect.anything()
    );
  });

  it("submits with consent, disables the button while submitting, and shows success without leaking internal ids", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<PublicJobApplicationPage slug={jobOpening.slug} />);
    await screen.findByText("Engenheiro de Dados");

    fillRequiredFields();
    fireEvent.click(screen.getByLabelText(/Autorizo o uso dos meus dados/));
    fireEvent.click(screen.getByRole("button", { name: "Enviar candidatura" }));

    expect(screen.getByRole("button", { name: /Enviando/ })).toBeDisabled();

    const heading = await screen.findByText("Candidatura recebida");
    expect(heading).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/candidateApplicationId/i);
  });

  it("maps a known server error code to a safe message, never exposing internals", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        onSubmit: () =>
          ({
            ok: false,
            json: () => Promise.resolve({ error: { code: "public_application_rate_limited" } })
          }) as unknown as Response
      })
    );
    render(<PublicJobApplicationPage slug={jobOpening.slug} />);
    await screen.findByText("Engenheiro de Dados");

    fillRequiredFields();
    fireEvent.click(screen.getByLabelText(/Autorizo o uso dos meus dados/));
    fireEvent.click(screen.getByRole("button", { name: "Enviar candidatura" }));

    expect(await screen.findByText(/Muitas tentativas em pouco tempo/)).toBeInTheDocument();
  });
});
