import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicPreInterviewPage } from "../../../src/client/features/public/PublicPreInterviewPage";

const question = {
  id: "q1",
  title: "Fale sobre sua experiência",
  text: "Descreva um projeto relevante.",
  type: "open_text" as const,
  options: [],
  required: true,
  displayOrder: 1
};

function availableView() {
  return {
    status: "available" as const,
    expiresAt: null,
    questions: [question],
    responses: [],
    progress: { answered: 0, total: 1, requiredAnswered: 0, requiredTotal: 1 }
  };
}

function answeringView() {
  return {
    status: "in_progress" as const,
    expiresAt: null,
    questions: [question],
    responses: [],
    progress: { answered: 0, total: 1, requiredAnswered: 0, requiredTotal: 1 }
  };
}

function mockFetch(view: ReturnType<typeof availableView> | ReturnType<typeof answeringView>) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/start")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    if (String(url).endsWith("/submit")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    if (String(url).includes("/responses/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    if (String(url).endsWith("/current")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(view) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url} ${init?.method}`));
  });
}

describe("PublicPreInterviewPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = "";
  });

  it("shows the unavailable message and never a blank screen when there is no access token", async () => {
    window.location.hash = "";
    vi.stubGlobal("fetch", vi.fn());
    render(<PublicPreInterviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não está mais disponível/);
  });

  it("reads the token from the URL fragment and strips it from the visible address bar", async () => {
    window.location.hash = "#access=secret-token";
    vi.stubGlobal("fetch", mockFetch(availableView()));
    render(<PublicPreInterviewPage />);

    await screen.findByText("Pré-Entrevista Estruturada");
    expect(window.location.hash).toBe("");
  });

  it("goes from intro to answering and submits, showing the final state", async () => {
    window.location.hash = "#access=secret-token";
    const fetchMock = mockFetch(availableView());
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicPreInterviewPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Iniciar" }));

    fetchMock.mockImplementation(((url: string) => {
      if (String(url).endsWith("/current")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(answeringView())
        } as Response);
      }
      if (String(url).endsWith("/submit")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      }
      if (String(url).includes("/responses/")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as typeof fetch);

    await screen.findByText(/Pergunta 0 de 1/);
    fireEvent.click(screen.getByRole("button", { name: "Enviar Pré-Entrevista" }));

    expect(await screen.findByText("Pré-Entrevista enviada")).toBeInTheDocument();
  });

  it("shows a required-field message instead of a generic one when the server rejects missing answers", async () => {
    window.location.hash = "#access=secret-token";
    const fetchMock = mockFetch(answeringView());
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicPreInterviewPage />);

    await screen.findByText(/Pergunta 0 de 1/);
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: { code: "pre_interview_required_response_missing" } })
      } as Response)
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar Pré-Entrevista" }));

    expect(
      await screen.findByText("Responda todas as perguntas obrigatórias antes de enviar.")
    ).toBeInTheDocument();
  });
});
