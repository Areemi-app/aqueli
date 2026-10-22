import { useState, type KeyboardEvent, type Ref } from "react";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { tr } from "../i18n/i18n";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Identifiant du message d'erreur ou d'aide lié au champ. */
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/** Champ de mot de passe : bouton « œil » pour l'afficher, alerte si Verr. Maj. est activé. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  disabled,
  invalid,
  describedBy,
  inputRef,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const capsId = `${id}-verr-maj`;
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="field-box" data-invalid={invalid || undefined}>
        <input
          ref={inputRef}
          id={id}
          className="field-input field-input--secret"
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          onBlur={() => setCapsLock(false)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, capsLock ? capsId : undefined].filter(Boolean).join(" ") || undefined}
        />
        <button
          type="button"
          className="field-eye"
          aria-label={visible ? tr("Masquer le mot de passe") : tr("Afficher le mot de passe")}
          aria-pressed={visible}
          title={visible ? tr("Masquer") : tr("Afficher")}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon d={visible ? ICONS.eyeOff : ICONS.eye} size={18} />
        </button>
      </div>
      {capsLock && (
        <p id={capsId} className="field-note field-note--warn">
          <Icon d={ICONS.warning} size={13} stroke={2.4} />
          {tr("Le verrouillage des majuscules est activé.")}
        </p>
      )}
    </div>
  );
}
