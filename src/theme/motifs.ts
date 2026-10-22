/**
 * Motifs du décor de chaque thème (galerie Themes.dc.html) : tracés dans une grille 24 × 24,
 * peints de la couleur « --aq-motif » du thème (au trait pour les flocons).
 */
import type { ThemeMotif } from "./themes";

export const MOTIF_PATHS: Record<ThemeMotif, string> = {
  bulles: "M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0z",
  etoiles: "M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z",
  feuilles: "M5 19C5 10 11 5 20 4c-1 9-6 15-15 15z M5 19l8-8",
  flocons: "M12 2v20 M3.3 7l17.4 10 M3.3 17L20.7 7 M10 3.5l2 2 2-2 M10 20.5l2-2 2 2",
  petales: "M12 2c3.5 3 3.5 8 0 11c-3.5-3-3.5-8 0-11z M12 13c2 3 6 4 9 3c-2-3-6-4-9-3z",
  coeurs: "M12 21s-7-4.5-9.3-9A5 5 0 0 1 12 6.5 5 5 0 0 1 21.3 12C19 16.5 12 21 12 21z",
  oeufs: "M12 3c4 0 6.5 6 6.5 10a6.5 6.5 0 0 1-13 0C5.5 9 8 3 12 3z",
  chauvesouris:
    "M1 9c2.5-1 5-0.5 6 1.5c1-2 3-3 5-3s4 1 5 3c1-2 3.5-2.5 6-1.5c-2.5 1.5-3.5 4-3.5 6.5c-1.5-1.5-4-1.5-5 0c-1-1.5-3.5-1.5-5 0c-1-1.5-3.5-1.5-5 0C4.5 13 3.5 10.5 1 9z",
};

/** Motifs dessinés en plus des bulles, dans le décor de la fenêtre. */
export function hasShapes(motif: ThemeMotif): boolean {
  return motif !== "bulles" && motif !== "etoiles";
}
