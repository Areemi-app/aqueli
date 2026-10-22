import { useId } from "react";

interface OrbProps {
  /** Couleur de la sphère (couleur du module ou variable de thème). */
  color: string;
  icon: string;
  size?: number;
}

/**
 * Sphère de verre brillante avec une icône blanche : illustration des états vides,
 * dans l'esprit du logo Aqueli (reflet arqué en haut à gauche, liseré lumineux).
 */
export function Orb({ color, icon, size = 120 }: OrbProps) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className="orb"
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      style={{ color }}
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="38%" cy="30%" r="75%">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.55 }} />
          <stop offset="0.55" style={{ stopColor: color, stopOpacity: 0.9 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 1 }} />
        </radialGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="orb-shine-top" />
          <stop offset="1" className="orb-shine-bottom" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill={`url(#${id}-body)`} className="orb-body" />
      <circle cx="60" cy="60" r="53" fill="none" className="orb-rim" strokeWidth="2" />
      <path d="M22 50 C 24 28, 46 12, 70 14 C 52 18, 34 30, 28 52 Z" fill={`url(#${id}-shine)`} />
      <g transform="translate(36 36) scale(2)" className="orb-icon">
        <path d={icon} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
