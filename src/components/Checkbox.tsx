import type { CSSProperties } from "react";
import { Icon } from "./Icon";
import { ICONS } from "./icons";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Couleur de la pastille cochée (calendriers), sinon le dégradé du thème. */
  color?: string;
  disabled?: boolean;
  /** Mention discrète après le libellé (« Bientôt disponible »). */
  note?: string;
}

/** Case à cocher « bulle » : cercle fin, puis pastille dégradée avec halo une fois cochée. */
export function Checkbox({ checked, onChange, label, color, disabled, note }: CheckboxProps) {
  return (
    <label
      className="checkbox"
      data-color={color ? true : undefined}
      data-disabled={disabled || undefined}
      style={color ? ({ "--check-color": color } as CSSProperties) : undefined}
    >
      <input
        type="checkbox"
        className="checkbox-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="checkbox-bubble" aria-hidden="true">
        {checked && <Icon d={ICONS.check} size={12} stroke={3.5} />}
      </span>
      {note ? (
        <span className="checkbox-text">
          <span className="checkbox-label">{label}</span>
          <span className="checkbox-note">{note}</span>
        </span>
      ) : (
        <span className="checkbox-label">{label}</span>
      )}
    </label>
  );
}
