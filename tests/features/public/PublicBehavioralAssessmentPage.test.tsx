import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicBehavioralAssessmentPage } from "../../../src/client/features/public/PublicBehavioralAssessmentPage";

const item = {
  id: "i1",
  type: "yes_no" as const,
  promptText: "Você prefere trabalhar em equipe?",
  options: null,
  required: true,
  displayOrder: 1
};

function availableView() {
  return {
    status: "available" as const,
    expiresAt: null,
    items: [item],
    responses: [],
    progress: { answered: 0, total: 1, requiredAnswered: 0, requiredTotal: 1 },
    result: null
  };
}

// Mock com estado: reflete a mesma transicao disponivel -> em andamento -> concluido que o
// backend real faria, para que a pagina avance de estagio como aconteceria de verdade.
function mockFetch(submitResult?: unknown) {
  let status: "available" | "in_progress" = "available";
  return vi.fn((url: string) => {
    if (String(url).endsWith("/current")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...availableView(), status })
      } as Response);
    }
    if (String(url).endsWith("/start")) {
      status = "in_progress";
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    if (String(url).endsWith("/submit")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(submitResult ?? availableView())
      } as Response);
    }
    if (String(url).includes("/responses/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe("PublicBehavioralAssessmentPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = "";
  });

  it("shows the unavailable message when there is no access token", async () => {
    window.location.hash = "";
    vi.stubGlobal("fetch", vi.fn());
    render(<PublicBehavioralAssessmentPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não está mais disponível/);
  });

  it("only renders a result summary/dimensions when the backend actually provides them", async () => {
    window.location.hash = "#access=secret-token";
    vi.stubGlobal(
      "fetch",
      mockFetch({
        ...availableView(),
        status: "completed",
        result: {
          summaryText: "Perfil analítico e colaborativo.",
          dimensions: [
            {
              code: "cooperation",
              label: "Cooperação",
              displayValue: "Alta",
              interpretationText: null
            }
          ]
        }
      })
    );
    render(<PublicBehavioralAssessmentPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Iniciar" }));
    await screen.findByText(/Item 0 de 1 respondido/);
    fireEvent.click(screen.getByRole("button", { name: "Enviar Perfil Comportamental" }));

    expect(await screen.findByText("Perfil analítico e colaborativo.")).toBeInTheDocument();
    expect(screen.getByText("Cooperação")).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
  });

  it("does not fabricate a result block when the backend returns none", async () => {
    window.location.hash = "#access=secret-token";
    vi.stubGlobal("fetch", mockFetch({ ...availableView(), status: "completed", result: null }));
    render(<PublicBehavioralAssessmentPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Iniciar" }));
    await screen.findByText(/Item 0 de 1 respondido/);
    fireEvent.click(screen.getByRole("button", { name: "Enviar Perfil Comportamental" }));

    expect(await screen.findByText("Perfil Comportamental enviado")).toBeInTheDocument();
    expect(screen.queryByText("Seu resultado")).not.toBeInTheDocument();
  });
});
