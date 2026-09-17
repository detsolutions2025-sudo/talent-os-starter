import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "./icons";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, id, className, children, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  const field = (
    <span className="ds-select-wrap">
      <select
        ref={ref}
        id={selectId}
        className={["ds-select", error ? "ds-select--error" : "", className]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="ds-select-wrap__icon" />
    </span>
  );

  if (!label) return field;

  return (
    <label className="ds-field" htmlFor={selectId}>
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
