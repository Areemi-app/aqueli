/** Choix d'une couleur : celle du thème, puis la palette commune (ordre du spectre, src/tasks/colors.ts). */
import type { CSSProperties } from "react";
import { TASK_COLORS } from "../tasks/colors";
import { tr } from "../i18n/i18n";

export function ColorChoices({ value, onChange, label }: { value: string | null; onChange: (color: string | null) => void; label: string }) {
  return (
    <div className="color-choices" role="radiogroup" aria-label={label}>
      <button type="button" role="radio" aria-checked={value === null} className="color-choice color-choice--theme" title={tr("Couleur du thème")} aria-label={tr("Couleur du thème")} onClick={() => onChange(null)} />
      {TASK_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          className="color-choice"
          title={c.label}
          aria-label={c.label}
          style={{ "--swatch": c.value } as CSSProperties}
          onClick={() => onChange(c.value)}
        />
      ))}
    </div>
  );
}
