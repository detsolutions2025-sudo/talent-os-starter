import type { ReactNode } from "react";

export type SectionHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

// Cabecalho de secao (h2) para blocos dentro de uma pagina que ja tem seu proprio h1
// (PageHeader). Usado pelos modulos migrados na Wave 1 (Vagas, Candidatos, Processo
// Seletivo, Entrevistas) para nao duplicar headings de nivel 1 na mesma tela.
export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <div className="ds-section-header">
      <div className="ds-section-header__text">
        <h2 className="ds-section-header__title">{title}</h2>
        {description && <p className="ds-section-header__description">{description}</p>}
      </div>
      {actions && <div className="ds-section-header__actions">{actions}</div>}
    </div>
  );
}
