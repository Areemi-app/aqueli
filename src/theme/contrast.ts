/**
 * Contraste des couleurs (règles WCAG) : vérifie qu'un thème reste lisible. Les panneaux sont
 * en verre : leur couleur est posée sur chaque teinte du ciel, et le contraste est mesuré sur
 * le résultat. Fonctions pures, utilisées par les tests des thèmes.
 */

export type Rgba = [number, number, number, number];

/** « #rrggbb » ou « rgba(r,g,b,a) » (« rgb(r,g,b) »). */
export function parseColor(color: string): Rgba {
  const c = color.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (fn) {
    const [r = 0, g = 0, b = 0, a = 1] = fn[1]!.split(",").map((v) => Number(v.trim()));
    return [r, g, b, a];
  }
  throw new Error(`Couleur illisible : ${color}`);
}

const COLOR = /#[0-9a-f]{6}\b|rgba?\([^)]*\)/gi;

/** Couleurs citées dans une valeur CSS, dans l'ordre. */
export function colorsIn(value: string): string[] {
  return value.match(COLOR) ?? [];
}

/** Dernière couleur d'une valeur CSS (la teinte de fond d'un dégradé suivi d'une couleur). */
export function lastColor(value: string): string {
  const all = colorsIn(value);
  const last = all[all.length - 1];
  if (!last) throw new Error(`Aucune couleur : ${value}`);
  return last;
}

/** Teintes du dernier dégradé linéaire d'un ciel (le fond, sous les halos). */
export function skyStops(sky: string): string[] {
  const index = sky.lastIndexOf("linear-gradient(");
  return colorsIn(index >= 0 ? sky.slice(index) : sky).filter((c) => parseColor(c)[3] === 1);
}

/** `top` posé sur `bottom` (opaque). */
export function blend(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(c: Rgba): number {
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}

/** Rapport de contraste, de 1 à 21. */
export function contrast(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Moyenne de deux couleurs opaques (milieu d'un dégradé). */
export function middle(a: Rgba, b: Rgba): Rgba {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 1];
}

/** Contraste minimal du texte (WCAG AA, texte courant) et des éléments d'interface. */
export const TEXT_MIN = 4.5;
export const UI_MIN = 3;

/** Couleurs d'un thème dont dépend la lisibilité. */
export interface ReadabilityTokens {
  card: string;
  ink: string;
  soft: string;
  accent: string;
  danger: string;
  gain: string;
  gel: string;
  onAccent: string;
}

export interface ReadabilityProblem {
  /** « ink », « soft », « accent », « danger », « gain », ou « gel-bas » / « gel-milieu » (texte des boutons). */
  name: string;
  ratio: number;
  /** Fond sous le panneau (nul pour les boutons). */
  backdrop: Rgba | null;
}

/**
 * Ce qui manque de contraste : le texte posé sur les panneaux de verre, eux-mêmes posés sur
 * chacun des fonds (teintes du ciel, d'un paysage ou d'un fond d'écran), et le texte des boutons.
 */
export function readabilityProblems(t: ReadabilityTokens, backdrops: readonly Rgba[]): ReadabilityProblem[] {
  const out: ReadabilityProblem[] = [];
  const panel = parseColor(lastColor(t.card));
  for (const backdrop of backdrops) {
    const bg = blend(panel, backdrop);
    for (const name of ["ink", "soft", "accent", "danger", "gain"] as const) {
      const ratio = contrast(parseColor(t[name]), bg);
      if (ratio < TEXT_MIN) out.push({ name, ratio, backdrop });
    }
  }
  const gel = colorsIn(t.gel.slice(t.gel.lastIndexOf("linear-gradient("))).map(parseColor);
  const [top, bottom] = [gel[0]!, gel[gel.length - 1]!];
  const white = parseColor(t.onAccent);
  const onBottom = contrast(white, bottom);
  const onMiddle = contrast(white, middle(top, bottom));
  if (onBottom < TEXT_MIN) out.push({ name: "gel-bas", ratio: onBottom, backdrop: null });
  if (onMiddle < UI_MIN) out.push({ name: "gel-milieu", ratio: onMiddle, backdrop: null });
  return out;
}
