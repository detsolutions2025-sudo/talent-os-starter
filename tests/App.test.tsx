import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/client/App";

describe("App", () => {
  it("renders the phase three multi-company screen", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "DoF — Gente & Seleção" })).toBeInTheDocument();
    expect(screen.getByText("Fase 3")).toBeInTheDocument();
    expect(screen.getByText("Organization atual")).toBeInTheDocument();
  });
});
