import { describe, expect, it } from "vitest";
import { blend, contrast, parseColor, type Rgba } from "./contrast";
import { decorColors } from "./dialogDecor";
import { THEMES } from "./themes";

// sRGB ↔ OKLCH, pour refaire le calcul CSS des teintes du décor (src/styles/vault.css, .dialog-motif).
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function toOklch([r, g, b]: Rgba): [number, number, number] {
  const [R, G, B] = [r, g, b].map((v) => lin(v / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), Math.atan2(bb, a)];
}

function fromOklch([L, C, h]: [number, number, number]): Rgba {
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(Math.min(1, Math.max(0, gam(v))) * 255));
  return [rgb[0]!, rgb[1]!, rgb[2]!, 1];
}

/** Teintes « --motif-a, b, c » : clarté et éclat bornés comme dans le CSS. */
const BOUNDS: readonly [number, number, number][] = [
  [0.6, 0.76, 0.2],
  [0.62, 0.78, 0.19],
  [0.64, 0.8, 0.18],
];

function motifTint(hex: string, i: number): Rgba {
  const [L, C, h] = toOklch(parseColor(hex));
  const [lo, hi, cmax] = BOUNDS[i]!;
  return fromOklch([Math.min(hi, Math.max(lo, L)), Math.min(C, cmax), h]);
}

const withAlpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], a];

describe("décor des fenêtres et lisibilité", () => {
  it("garde le texte lisible (4,5:1) là où le décor est le plus dense, dans les 31 thèmes", () => {
    const problems: string[] = [];
    for (const theme of THEMES) {
      const t = theme.tokens;
      const popover = parseColor(t.popoverSolid);
      decorColors(theme.swatches, t.accent).forEach((hex, i) => {
        const tint = motifTint(hex, i);
        // Coin en bas à droite, sans fondu : voile (20 % au plus) puis disque ou bulle pleine (15 % au plus).
        const veil = blend(withAlpha(tint, 0.2), popover);
        const densest = blend(withAlpha(tint, 0.15), veil);
        // Dans une fenêtre, le texte secondaire tire à 30 % vers le texte principal (.dialog).
        const soft = blend(withAlpha(parseColor(t.ink), 0.3), parseColor(t.soft));
        for (const [name, ink] of [["texte", parseColor(t.ink)], ["texte secondaire", soft]] as const) {
          const ratio = contrast(ink, densest);
          if (ratio < 4.5) problems.push(`${theme.id} : ${name} sur la teinte ${i + 1} du décor = ${ratio.toFixed(2)}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });
});
