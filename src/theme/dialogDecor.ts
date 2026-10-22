/**
 * Décor des fenêtres (src/components/DialogMotif.tsx) dans la direction artistique de chaque
 * thème : ses trois teintes viennent des pastilles d'identité du thème (galerie des thèmes), et
 * ses motifs de l'univers du thème (bulles et vagues pour l'eau, constellation pour la nuit…).
 */
import type { ThemeDef, ThemeMotif } from "./themes";

export const DIALOG_MOTIFS = ["traits", "globe", "bulles", "vagues", "rayons", "constellation", "ondes"] as const;
export type DialogMotifKind = (typeof DIALOG_MOTIFS)[number];

/** Motifs de fenêtre selon le décor du thème. */
const BY_THEME_MOTIF: Record<ThemeMotif, readonly DialogMotifKind[]> = {
  bulles: ["bulles", "vagues", "ondes"],
  etoiles: ["constellation", "globe", "traits"],
  feuilles: ["vagues", "rayons", "traits"],
  flocons: ["constellation", "ondes", "traits"],
  petales: ["bulles", "rayons", "vagues"],
  coeurs: ["bulles", "rayons", "ondes"],
  oeufs: ["rayons", "bulles", "vagues"],
  chauvesouris: ["constellation", "traits", "globe"],
};

/** Motifs proposés par un thème (la famille Signature garde son eau et son verre). */
export function dialogMotifsFor(theme: Pick<ThemeDef, "motif" | "skin">): readonly DialogMotifKind[] {
  if (theme.skin === "signature") return ["vagues", "bulles", "ondes"];
  return BY_THEME_MOTIF[theme.motif] ?? DIALOG_MOTIFS;
}

/** Motif d'une fenêtre : tiré de son titre parmi ceux du thème (le même à chaque ouverture). */
export function motifFor(title: string, motifs: readonly DialogMotifKind[] = DIALOG_MOTIFS): DialogMotifKind {
  let hash = 7;
  for (const ch of title) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return motifs[hash % motifs.length] ?? "traits";
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Éclat d'une couleur : saturée et ni trop claire ni trop sombre (0 à 1). */
function vividness(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return -1;
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  return sat * (1 - Math.abs(light - 0.55));
}

/**
 * Trois teintes du décor, prises dans les pastilles du thème : les plus éclatantes, dans l'ordre
 * des pastilles (la première suit le coin, les autres s'en éloignent). Un thème aux pastilles
 * neutres (Ardoise, Onyx) garde ses gris.
 */
export function decorColors(swatches: readonly string[], accent: string): [string, string, string] {
  const usable = swatches.filter((s) => hexToRgb(s));
  const ranked = [...usable].sort((a, b) => vividness(b) - vividness(a)).slice(0, 3);
  const ordered = usable.filter((s) => ranked.includes(s));
  const out = [...ordered];
  while (out.length < 3) out.push(out[out.length - 1] ?? accent);
  return [out[0]!, out[1]!, out[2]!];
}
