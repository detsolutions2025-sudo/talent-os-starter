import type { HTMLAttributes } from "react";
import { SparkleIcon } from "./icons";

export type AiBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  label?: string;
};

// Padrao visual discreto para distinguir conteudo assistido por IA de informacao humana
// registrada (Design System v1, item 9). Usar apenas onde o backend de fato aciona o AI
// Gateway -- nunca como decoracao generica.
export function AiBadge({ label = "Assistido por IA", className, ...props }: AiBadgeProps) {
  const classes = ["ds-ai-badge", className].filter(Boolean).join(" ");
  return (
    <span className={classes} {...props}>
      <SparkleIcon size={12} />
      {label}
    </span>
  );
}
