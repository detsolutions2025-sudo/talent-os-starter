import type { ReactNode } from "react";
import { AlertTriangleIcon } from "./icons";

export type ErrorStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function ErrorState({ title, description, action }: ErrorStateProps) {
  return (
    <div className="ds-error-state" role="alert">
      <span className="ds-error-state__icon">
        <AlertTriangleIcon />
      </span>
      <p className="ds-error-state__title">{title}</p>
      {description && <p className="ds-error-state__description">{description}</p>}
      {action && <div className="ds-error-state__action">{action}</div>}
    </div>
  );
}
