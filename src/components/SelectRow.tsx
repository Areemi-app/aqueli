import { useId } from "react";
import { Select, type SelectOption } from "./Select";

export { Select, type SelectOption } from "./Select";

interface SelectRowProps<T extends string> {
  label: string;
  description?: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Ligne de réglage avec une liste déroulante. */
export function SelectRow<T extends string>({ label, description, value, options, onChange, disabled }: SelectRowProps<T>) {
  const id = useId();
  return (
    <div className="setting-row" data-disabled={disabled || undefined}>
      <div className="setting-text">
        <label htmlFor={id} className="setting-label">
          {label}
        </label>
        {description && <span className="setting-desc">{description}</span>}
      </div>
      <Select id={id} value={value} options={options} onChange={onChange} disabled={disabled} />
    </div>
  );
}
