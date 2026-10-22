import { tr } from "../i18n/i18n";
/**
 * Couleurs proposées pour les tâches, dans l'ordre du spectre (du rouge au rose), puis
 * deux teintes neutres. Affichées en 3 rangées de 7 avec la pastille « thème ».
 */
export const TASK_COLORS: readonly { value: string; label: string }[] = [
  { value: "#e04848", label: tr("Rouge") },
  { value: "#f0664a", label: tr("Corail") },
  { value: "#e0671f", label: tr("Orange") },
  { value: "#e89a1c", label: tr("Ambre") },
  { value: "#e6c019", label: tr("Jaune") },
  { value: "#a6c21a", label: tr("Anis") },
  { value: "#6cc24a", label: tr("Vert pomme") },
  { value: "#2fae4a", label: tr("Vert") },
  { value: "#1f9a6e", label: tr("Émeraude") },
  { value: "#16a3a3", label: tr("Turquoise") },
  { value: "#14b4d4", label: tr("Cyan") },
  { value: "#0a9fd8", label: tr("Bleu ciel") },
  { value: "#2d6ff0", label: tr("Bleu") },
  { value: "#4f5bd5", label: tr("Indigo") },
  { value: "#7a5ce6", label: tr("Violet") },
  { value: "#9b4fd0", label: tr("Pourpre") },
  { value: "#c2479a", label: tr("Prune") },
  { value: "#e0508a", label: tr("Rose") },
  { value: "#64788c", label: tr("Ardoise") },
  { value: "#a0703c", label: tr("Brun") },
];

/** Teinte (0 à 360°) d'une couleur « #rrggbb ». */
export function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
