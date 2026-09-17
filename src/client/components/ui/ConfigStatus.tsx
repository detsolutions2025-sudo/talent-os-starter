import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "./Badge";

export type ConfigStatusProps = {
  label: string;
  tone?: BadgeTone;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

// Resumo compacto de uma versao/estado publicavel (rascunho, publicado, ativo, arquivado).
// Nasceu do padrao repetido em DNA, Cargos e Blueprint: um badge de status + descricao
// opcional + acoes. Nao assume um vocabulario fixo de status -- cada feature decide o
// tom/label, ja que "publicado"/"ativo"/"arquivado" tem vocabularios diferentes por dominio.
export function ConfigStatus({
  label,
  tone = "neutral",
  meta,
  description,
  actions
}: ConfigStatusProps) {
  return (
    <div className="ds-config-status">
      <div className="ds-config-status__header">
        <Badge tone={tone}>{label}</Badge>
        {meta && <span className="ds-config-status__meta">{meta}</span>}
      </div>
      {description && <div className="ds-config-status__description">{description}</div>}
      {actions && <div className="ds-config-status__actions">{actions}</div>}
    </div>
  );
}
