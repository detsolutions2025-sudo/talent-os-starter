export type SpinnerProps = {
  size?: number;
  label?: string;
  className?: string;
};

export function Spinner({ size = 18, label = "Carregando", className }: SpinnerProps) {
  return (
    <span
      className={["ds-spinner", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    />
  );
}
