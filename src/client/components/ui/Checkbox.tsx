import { forwardRef, useId, type InputHTMLAttributes } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, className, ...props },
  ref
) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <label className="ds-checkbox" htmlFor={checkboxId}>
      <input
        ref={ref}
        id={checkboxId}
        type="checkbox"
        className={["ds-checkbox__input", className].filter(Boolean).join(" ")}
        {...props}
      />
      <span className="ds-checkbox__label">{label}</span>
    </label>
  );
});
