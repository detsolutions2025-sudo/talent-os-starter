import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../../src/client/components/layout/AppShell";
import { useShellContext } from "../../src/client/components/layout/shell-context";

function MenuButton() {
  const { mobileNavOpen, toggleMobileNav } = useShellContext();
  return (
    <button type="button" aria-expanded={mobileNavOpen} onClick={toggleMobileNav}>
      menu
    </button>
  );
}

function renderShell() {
  return render(
    <AppShell sidebar={<MenuButton />} topbar={<span>topbar</span>}>
      <p>conteudo</p>
    </AppShell>
  );
}

describe("AppShell", () => {
  it("renders sidebar, topbar and children inside a main landmark", () => {
    renderShell();

    expect(screen.getByRole("main")).toHaveTextContent("conteudo");
    expect(screen.getByText("topbar")).toBeInTheDocument();
  });

  it("opens the mobile nav and closes it again on Escape", () => {
    renderShell();

    const toggle = screen.getByRole("button", { name: "menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the mobile nav when the overlay is clicked", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar menu de navegação" }));

    expect(screen.getByRole("button", { name: "menu" })).toHaveAttribute("aria-expanded", "false");
  });
});
