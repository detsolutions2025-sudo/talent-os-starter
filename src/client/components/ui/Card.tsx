import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
};

export function Card({ padded = true, className, children, ...props }: CardProps) {
  const classes = ["ds-card", padded ? "ds-card--padded" : "", className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { title: ReactNode; action?: ReactNode }) {
  const classes = ["ds-card__header", className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...props}>
      <h3 className="ds-card__title">{title}</h3>
      {action && <div className="ds-card__action">{action}</div>}
    </div>
  );
}
