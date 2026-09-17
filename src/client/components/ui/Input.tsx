import { forwardRef, useId, type InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  const field = (
    <input
      ref={ref}
      id={inputId}
      className={["ds-input", error ? "ds-input--error" : "", className].filter(Boolean).join(" ")}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      {...props}
    />
  );

  if (!label) return field;

  return (
    <label className="ds-field" htmlFor={inputId}>
      <span className="ds-field__label">{label}</span>
      {field}
      {hint && !error && (
        <span className="ds-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="ds-field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </label>
  );
});
