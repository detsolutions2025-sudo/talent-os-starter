import type { ReactNode } from "react";
import { InboxIcon } from "./icons";

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="ds-empty-state">
      <span className="ds-empty-state__icon">{icon ?? <InboxIcon />}</span>
      <p className="ds-empty-state__title">{title}</p>
      {description && <p className="ds-empty-state__description">{description}</p>}
      {action && <div className="ds-empty-state__action">{action}</div>}
    </div>
  );
}
