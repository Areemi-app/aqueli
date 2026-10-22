import type { Strength } from "../vault/password";

/** Jauge de solidité en 4 segments ; l'information est aussi écrite en toutes lettres. */
export function StrengthMeter({ strength, id }: { strength: Strength; id: string }) {
  const level = strength.score === 0 ? "vide" : strength.score <= 1 ? "faible" : strength.score === 2 ? "moyen" : "bon";
  return (
    <div className="strength" id={id} aria-live="polite">
      <div className="strength-bars" data-level={level} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="strength-bar" data-on={i <= strength.score || undefined} />
        ))}
      </div>
      <p className="strength-text">
        {strength.label && <strong className="strength-label">{strength.label}. </strong>}
        {strength.hint}
      </p>
    </div>
  );
}
