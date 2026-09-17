import { useShellContext } from "../layout/shell-context";
import { IconButton } from "../ui/IconButton";
import { MenuIcon, UserIcon } from "../ui/icons";

export type OrganizationOption = {
  id: string;
  name: string;
};

export type TopbarProps = {
  title: string;
  organizations: OrganizationOption[];
  selectedOrganizationId: string;
  onSelectOrganization: (organizationId: string) => void;
  currentUserId: string;
  currentRole?: string;
};

export function Topbar({
  title,
  organizations,
  selectedOrganizationId,
  onSelectOrganization,
  currentUserId,
  currentRole
}: TopbarProps) {
  const { mobileNavOpen, toggleMobileNav } = useShellContext();

  return (
    <header className="ds-topbar">
      <div className="ds-topbar__left">
        <IconButton
          className="ds-topbar__menu-btn"
          icon={<MenuIcon size={20} />}
          label={mobileNavOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileNavOpen}
          aria-controls="primary-navigation"
          onClick={toggleMobileNav}
        />
        <span className="ds-topbar__title">{title}</span>
      </div>

      <div className="ds-topbar__right">
        <label className="ds-topbar__org">
          <span className="ds-topbar__org-label">Organization atual</span>
          <select
            className="ds-select ds-topbar__org-select"
            value={selectedOrganizationId}
            onChange={(event) => onSelectOrganization(event.target.value)}
          >
            <option value="">Selecione</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>

        <div className="ds-topbar__user" title={currentUserId}>
          <UserIcon size={16} />
          <span className="ds-topbar__user-id">{currentUserId}</span>
          {currentRole && <span className="ds-badge ds-badge--primary">{currentRole}</span>}
        </div>
      </div>
    </header>
  );
}
