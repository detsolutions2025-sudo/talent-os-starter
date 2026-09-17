import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/client/App";

describe("App", () => {
  it("renders the DoF app shell with Visão Geral as the initial view", async () => {
    render(<App />);

    // Aguarda o efeito inicial (GET /api/organizations) assentar antes do teste terminar, para
    // nao vazar um reject pendente para o proximo teste do arquivo.
    await screen.findByText("DoF");

    expect(screen.getByText("Gente & Seleção")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Visão Geral" })).toBeInTheDocument();
    expect(screen.getByText("Organization atual")).toBeInTheDocument();
  });

  it("preserves the existing workspace content when navigating via the sidebar", async () => {
    render(<App />);
    await screen.findByText("DoF");

    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    fireEvent.click(within(nav).getByRole("link", { name: "DNA Organizacional" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Espaço de Trabalho" })
    ).toBeInTheDocument();
    // Sem uma Organization selecionada (nenhum backend real neste teste), os paineis de modulo
    // permanecem condicionais -- o painel sempre presente do espaco de trabalho legado continua
    // funcionando dentro do novo shell, o que e a garantia que este teste protege.
    expect(screen.getByText("Usuario temporario")).toBeInTheDocument();
  });
});
