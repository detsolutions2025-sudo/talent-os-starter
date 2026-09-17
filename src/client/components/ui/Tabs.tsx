export type TabItem = {
  id: string;
  label: string;
};

export type TabsProps = {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  "aria-label": string;
};

// Grupo de abas controlado, simples (sem painel deslizante/animacao). Nasceu do padrao
// identico repetido em Competencias e Banco de Perguntas (Catalogo/Organizacao/Global).
export function Tabs({ items, activeId, onChange, "aria-label": ariaLabel }: TabsProps) {
  return (
    <div className="ds-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`ds-tab${isActive ? " ds-tab--active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
