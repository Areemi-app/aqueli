/**
 * Texte lisible sur une couleur choisie par la personne (événements pleins du calendrier) :
 * blanc si le contraste atteint 4,5:1 (niveau AA), sinon foncé.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative (WCAG 2) d'une couleur « #rrggbb ». */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function inkOn(hex: string): "light" | "dark" {
  return 1.05 / (luminance(hex) + 0.05) >= 4.5 ? "light" : "dark";
}
