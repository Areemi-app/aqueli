import { useId } from "react";

interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Petite mention sous la description (ex. « Activé par un paramètre de Windows »). */
  note?: string;
  disabled?: boolean;
}

/** Ligne de réglage avec un interrupteur « gel ». */
export function SwitchRow({ label, description, checked, onChange, note, disabled }: SwitchRowProps) {
  const id = useId();
  return (
    <div className="setting-row" data-disabled={disabled || undefined}>
      <div className="setting-text">
        <span id={`${id}-label`} className="setting-label">
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="setting-desc">
            {description}
          </span>
        )}
        {note && <span className="setting-note">{note}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}
