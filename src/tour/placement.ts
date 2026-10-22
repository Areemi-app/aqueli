/** Place la bulle d'une visite près de l'élément éclairé, sans sortir de la fenêtre. Fonction pure. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Side = "bottom" | "top" | "right" | "left" | "center";

const MARGIN = 12;
const GAP = 14;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Côté où la bulle tient : dessous, dessus, à droite, à gauche, sinon au centre. */
export function placeBubble(target: Box | null, bubble: { width: number; height: number }, view: { width: number; height: number }): { left: number; top: number; side: Side } {
  const center = { left: (view.width - bubble.width) / 2, top: (view.height - bubble.height) / 2, side: "center" as const };
  if (!target) return { ...center, left: Math.max(MARGIN, center.left), top: Math.max(MARGIN, center.top) };
  const fitsX = (left: number) => clamp(left, MARGIN, Math.max(MARGIN, view.width - bubble.width - MARGIN));
  const fitsY = (top: number) => clamp(top, MARGIN, Math.max(MARGIN, view.height - bubble.height - MARGIN));
  const below = target.top + target.height + GAP;
  const above = target.top - GAP - bubble.height;
  const right = target.left + target.width + GAP;
  const left = target.left - GAP - bubble.width;
  const centeredX = target.left + target.width / 2 - bubble.width / 2;
  const centeredY = target.top + target.height / 2 - bubble.height / 2;
  if (below + bubble.height <= view.height - MARGIN) return { left: fitsX(centeredX), top: below, side: "bottom" };
  if (above >= MARGIN) return { left: fitsX(centeredX), top: above, side: "top" };
  if (right + bubble.width <= view.width - MARGIN) return { left: right, top: fitsY(centeredY), side: "right" };
  if (left >= MARGIN) return { left, top: fitsY(centeredY), side: "left" };
  // Élément trop grand (une colonne entière) : la bulle se pose dessus, en bas.
  return { left: fitsX(centeredX), top: fitsY(target.top + target.height - bubble.height - GAP), side: "center" };
}
