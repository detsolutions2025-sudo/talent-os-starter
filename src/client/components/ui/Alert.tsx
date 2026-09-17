import type { HTMLAttributes } from "react";
import { AlertTriangleIcon, CheckCircleIcon } from "./icons";

export type AlertTone = "info" | "success" | "warning" | "danger";

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
};

const toneIcon: Record<AlertTone, JSX.Element> = {
  info: <AlertTriangleIcon size={16} />,
  success: <CheckCircleIcon size={16} />,
  warning: <AlertTriangleIcon size={16} />,
  danger: <AlertTriangleIcon size={16} />
};

export function Alert({ tone = "info", className, children, ...props }: AlertProps) {
  const classes = ["ds-alert", `ds-alert--${tone}`, className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="status" {...props}>
      <span className="ds-alert__icon">{toneIcon[tone]}</span>
      <span className="ds-alert__body">{children}</span>
    </div>
  );
}
