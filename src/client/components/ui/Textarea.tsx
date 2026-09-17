import { forwardRef, useId, type TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className, ...props },
  ref
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;

  const field = (
    <textarea
      ref={ref}
      id={textareaId}
      className={["ds-textarea", error ? "ds-textarea--error" : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      {...props}
    />
  );

  if (!label) return field;

  return (
    <label className="ds-field" htmlFor={textareaId}>
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
