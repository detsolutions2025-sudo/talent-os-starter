import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/client/App";

describe("App", () => {
  it("renders the phase one multi-company screen", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Talent OS" })).toBeInTheDocument();
    expect(screen.getByText("Fase 1")).toBeInTheDocument();
    expect(screen.getByText("Organization atual")).toBeInTheDocument();
  });
});
