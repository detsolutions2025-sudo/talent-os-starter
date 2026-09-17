import { useEffect, useState, type ReactNode } from "react";
import { ShellContext, type ShellContextValue } from "./shell-context";

export type AppShellProps = {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
};

// Estrutura raiz do Design System v1: Sidebar + Topbar + MainContent. Responsivo -- em telas
// estreitas a Sidebar vira um drawer sobreposto controlado por este componente (ShellContext),
// nao apenas escondido pelo breakpoint legado de 720px.
export function AppShell({ sidebar, topbar, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  const contextValue: ShellContextValue = {
    mobileNavOpen,
    openMobileNav: () => setMobileNavOpen(true),
    closeMobileNav: () => setMobileNavOpen(false),
    toggleMobileNav: () => setMobileNavOpen((open) => !open)
  };

  return (
    <ShellContext.Provider value={contextValue}>
      <div className={`ds-shell${mobileNavOpen ? " ds-shell--nav-open" : ""}`}>
        {sidebar}
        {mobileNavOpen && (
          <button
            type="button"
            className="ds-shell__overlay"
            aria-label="Fechar menu de navegação"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <div className="ds-shell__body">
          {topbar}
          <main className="ds-shell__main" id="main-content">
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
