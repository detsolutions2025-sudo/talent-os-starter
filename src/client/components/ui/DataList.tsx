import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export type DataListProps<T> = {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
};

// Lista de registros em cards (nao uma <table>): os quatro modulos da Wave 1 ja
// apresentavam listas de cards (nao tabelas largas), entao esta e a forma que se
// adapta a mobile sem precisar de estrategia de colapso de colunas.
export function DataList<T>({
  items,
  keyExtractor,
  renderItem,
  emptyTitle,
  emptyDescription
}: DataListProps<T>) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="ds-data-list">
      {items.map((item) => (
        <li key={keyExtractor(item)} className="ds-data-list__item">
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}

export type DataListItemProps = {
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  onSelect?: () => void;
  selected?: boolean;
};

export function DataListItem({
  title,
  status,
  meta,
  actions,
  onSelect,
  selected
}: DataListItemProps) {
  const main = (
    <div className="ds-data-list__main">
      <div className="ds-data-list__title-row">
        <strong className="ds-data-list__title">{title}</strong>
        {status}
      </div>
      {meta && <div className="ds-data-list__meta">{meta}</div>}
    </div>
  );

  return (
    <div className={`ds-data-list__row${selected ? " ds-data-list__row--selected" : ""}`}>
      {onSelect ? (
        <button
          type="button"
          className="ds-data-list__select"
          aria-current={selected ? "true" : undefined}
          onClick={onSelect}
        >
          {main}
        </button>
      ) : (
        main
      )}
      {actions && <div className="ds-data-list__actions">{actions}</div>}
    </div>
  );
}
