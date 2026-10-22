import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import { ENERGIES, MOODS } from "./journal";
import { tr } from "../i18n/i18n";

/** Bouche de chaque humeur, de la plus difficile à la meilleure. */
const MOUTHS = ["M8 16.6Q12 13.2 16 16.6", "M8.5 15.8Q12 14.2 15.5 15.8", "M8.5 15.2H15.5", "M8.5 14.6Q12 16.6 15.5 14.6", "M8 14Q12 18.2 16 14"];

/** Visage d'une humeur, dans une bulle de sa couleur. */
export function MoodFace({ value, size = 34 }: { value: number; size?: number }) {
  const mood = MOODS.find((m) => m.value === value) ?? MOODS[2];
  return (
    <svg className="mood-face" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ "--mood": mood.color } as CSSProperties}>
      <circle cx="12" cy="12" r="11" className="mood-face-bubble" />
      <ellipse cx="9" cy="6.5" rx="4.5" ry="2.4" className="mood-face-gloss" />
      <circle cx="9" cy="10.4" r="1.25" className="mood-face-eye" />
      <circle cx="15" cy="10.4" r="1.25" className="mood-face-eye" />
      <path d={MOUTHS[value - 1] ?? MOUTHS[2]} className="mood-face-mouth" />
    </svg>
  );
}

/** Flèches gauche/droite dans un groupe de boutons radio. */
function arrows(e: KeyboardEvent<HTMLDivElement>, value: number | null, onChange: (v: number) => void, refs: (HTMLButtonElement | null)[]) {
  const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const next = Math.min(5, Math.max(1, (value ?? 3) + (value === null ? 0 : step)));
  onChange(next);
  refs[next - 1]?.focus();
}

interface PickerProps {
  value: number | null;
  /** Même valeur : la retire. */
  onChange: (value: number | null) => void;
}

/** Humeur du jour : cinq bulles ; un second clic sur la même la retire. */
export function MoodPicker({ value, onChange }: PickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="mood-picker" role="radiogroup" aria-label={tr("Humeur")} onKeyDown={(e) => arrows(e, value, onChange, refs.current)}>
      {MOODS.map((m, i) => (
        <button
          key={m.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          tabIndex={value === m.value || (value === null && i === 2) ? 0 : -1}
          className="mood-option"
          title={m.label}
          onClick={() => onChange(value === m.value ? null : m.value)}
        >
          <MoodFace value={m.value} />
          <span className="mood-label">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Énergie du jour : cinq barres de hauteur croissante. */
export function EnergyPicker({ value, onChange }: PickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = ENERGIES.find((e) => e.value === value);
  return (
    <div className="energy-picker">
      <div className="energy-bars" role="radiogroup" aria-label={tr("Énergie")} onKeyDown={(e) => arrows(e, value, onChange, refs.current)}>
        {ENERGIES.map((level, i) => (
          <button
            key={level.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === level.value}
            aria-label={level.label}
            title={level.label}
            tabIndex={value === level.value || (value === null && i === 2) ? 0 : -1}
            className="energy-bar"
            data-on={value !== null && level.value <= value ? "" : undefined}
            style={{ "--h": `${30 + i * 17}%` } as CSSProperties}
            onClick={() => onChange(value === level.value ? null : level.value)}
          >
            <span />
          </button>
        ))}
      </div>
      <span className="energy-label">{current ? current.label : tr("Non renseignée")}</span>
    </div>
  );
}
