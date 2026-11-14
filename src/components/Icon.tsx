import { ICONS } from "./icons";

/** Icônes qui montrent un sens de lecture (flèches, chevrons, listes, annuler) : retournées de droite
 * à gauche, en arabe (base.css). Les horloges, la lecture du Focus et les symboles restent tels quels. */
const MIRRORED = new Set<string>([
  ICONS.chevronRight,
  ICONS.arrowLeft,
  ICONS.arrowRight,
  ICONS.sidebar,
  ICONS.undo,
  ICONS.redo,
  ICONS.subtasks,
  ICONS.listBullet,
  ICONS.listOrdered,
  ICONS.listCheck,
  ICONS.enter,
]);

interface IconProps {
  d: string;
  size?: number;
  stroke?: number;
  filled?: boolean;
  /** Grille de dessin : 24 pour les icônes, 12 pour les boutons de fenêtre. */
  grid?: 12 | 24;
  className?: string;
}

/** Icône vectorielle décorative : elle prend la couleur du texte qui l'entoure. */
export function Icon({ d, size = 16, stroke = 2, filled = false, grid = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${grid} ${grid}`}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-mirror={MIRRORED.has(d) || undefined}
    >
      <path d={d} />
    </svg>
  );
}
