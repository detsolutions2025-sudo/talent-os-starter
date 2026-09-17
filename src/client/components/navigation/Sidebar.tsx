import type { MouseEvent } from "react";
import type { NavGroup } from "./nav-config";
import { useShellContext } from "../layout/shell-context";
import { AiBadge } from "../ui/AiBadge";
import { HomeIcon, CloseIcon } from "../ui/icons";

export type SidebarProps = {
  groups: NavGroup[];
  activeSection: "overview" | "workspace";
  activeAnchorId: string | null;
  onSelectOverview: () => void;
  onSelectAnchor: (anchorId: string) => void;
};

export function Sidebar({
  groups,
  activeSection,
  activeAnchorId,
  onSelectOverview,
  onSelectAnchor
}: SidebarProps) {
  const { mobileNavOpen, closeMobileNav } = useShellContext();

  function handleAnchorClick(event: MouseEvent<HTMLAnchorElement>, anchorId: string) {
    event.preventDefault();
    onSelectAnchor(anchorId);
    closeMobileNav();
  }

  function handleOverviewClick() {
    onSelectOverview();
    closeMobileNav();
  }

  return (
    <aside className={`ds-sidebar${mobileNavOpen ? " ds-sidebar--open" : ""}`}>
      <div className="ds-sidebar__brand">
        <span className="ds-sidebar__brand-mark">DoF</span>
        <span className="ds-sidebar__brand-sub">Gente &amp; Seleção</span>
        <button
          type="button"
          className="ds-sidebar__close"
          aria-label="Fechar menu"
          onClick={closeMobileNav}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <nav id="primary-navigation" className="ds-sidebar__nav" aria-label="Navegação principal">
        <button
          type="button"
          className={`ds-nav-link ds-nav-link--top${
            activeSection === "overview" ? " ds-nav-link--active" : ""
          }`}
          aria-current={activeSection === "overview" ? "page" : undefined}
          onClick={handleOverviewClick}
        >
          <HomeIcon size={17} />
          Visão Geral
        </button>

        {groups.map((group) => (
          <details key={group.id} className="ds-nav-group" open>
            <summary className="ds-nav-group__toggle">{group.label}</summary>
            <ul className="ds-nav-group__list">
              {group.items.map((item) => {
                const isActive = activeSection === "workspace" && activeAnchorId === item.id;
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`ds-nav-link${isActive ? " ds-nav-link--active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={(event) => handleAnchorClick(event, item.id)}
                    >
                      <span>{item.label}</span>
                      {item.ai && <AiBadge label="IA" />}
                    </a>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </nav>

      <p className="ds-sidebar__footer">por DocFounder</p>
    </aside>
  );
}
