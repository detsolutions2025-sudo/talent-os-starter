import type { ReactNode } from "react";

export type FormSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

// Agrupa um conjunto de campos (Input/Select/Textarea/Checkbox) sob um titulo (h3) e uma
// acao final -- substitui os antigos blocos "job-profile-form" sem hierarquia visual.
export function FormSection({ title, description, children, actions }: FormSectionProps) {
  return (
    <div className="ds-form-section">
      <div className="ds-form-section__header">
        <h3 className="ds-form-section__title">{title}</h3>
        {description && <p className="ds-form-section__description">{description}</p>}
      </div>
      <div className="ds-form-section__fields">{children}</div>
      {actions && <div className="ds-form-section__actions">{actions}</div>}
    </div>
  );
}
