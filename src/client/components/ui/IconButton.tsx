import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
  variant?: "ghost" | "secondary";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = "ghost", className, ...props },
  ref
) {
  const classes = ["ds-icon-btn", `ds-icon-btn--${variant}`, className].filter(Boolean).join(" ");

  return (
    <button
      ref={ref}
      type={props.type ?? "button"}
      className={classes}
      aria-label={label}
      {...props}
    >
      {icon}
    </button>
  );
});
