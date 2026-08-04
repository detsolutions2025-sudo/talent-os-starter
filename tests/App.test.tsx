import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/client/App";

describe("App", () => {
  it("renders the phase zero landing screen", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Talent OS" })).toBeInTheDocument();
    expect(screen.getByText("Fase 0")).toBeInTheDocument();
    expect(screen.getByText("SQLite de desenvolvimento")).toBeInTheDocument();
  });
});
