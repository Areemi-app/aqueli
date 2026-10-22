import { describe, expect, it } from "vitest";
import { blend, colorsIn, contrast, parseColor, readabilityProblems, skyStops } from "./contrast";
import { THEMES, type ThemeDef } from "./themes";

const hexOf = (c: number[]) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Problèmes de lisibilité d'un thème, pour les afficher tous à la fois. */
function problems(theme: ThemeDef): string[] {
  const t = theme.tokens;
  const backdrops = skyStops(t.sky).map(parseColor);
  return readabilityProblems(t, backdrops).map((p) =>
    p.backdrop
      ? `${theme.id} : ${p.name} sur panneau (ciel ${hexOf(p.backdrop)}) = ${p.ratio.toFixed(2)}`
      : `${theme.id} : texte des boutons (${p.name}) = ${p.ratio.toFixed(2)}`,
  );
}

describe("contraste des thèmes", () => {
  it("mesure un contraste comme les règles WCAG", () => {
    expect(contrast(parseColor("#000000"), parseColor("#ffffff"))).toBeCloseTo(21, 5);
    expect(contrast(parseColor("#777777"), parseColor("#ffffff"))).toBeCloseTo(4.48, 2);
    expect(blend(parseColor("rgba(255,255,255,0.5)"), parseColor("#000000"))).toEqual([127.5, 127.5, 127.5, 1]);
    expect(skyStops("radial-gradient(rgba(255,255,255,0.7), rgba(255,255,255,0)), linear-gradient(180deg, #3aaee9 0%, #8fd8fa 40%)")).toEqual([
      "#3aaee9",
      "#8fd8fa",
    ]);
  });

  it("les 31 thèmes restent lisibles : texte sur les panneaux, texte des boutons", () => {
    expect(THEMES).toHaveLength(31);
    expect(THEMES.flatMap(problems)).toEqual([]);
  });
});

describe("commandes teintées des thèmes clairs", () => {
  it("le texte des boutons secondaires et les titres de section restent lisibles", () => {
    const issues: string[] = [];
    for (const theme of THEMES) {
      const t = theme.tokens;
      // Boutons : le texte sur chaque teinte opaque du dégradé (posé sur le panneau pour un fond transparent).
      const panel = parseColor(t.card.match(/rgba?\([^)]*\)|#[0-9a-f]{6}/gi)!.pop()!);
      const backdrop = blend(panel, parseColor(skyStops(t.sky).pop()!));
      const stops = (t.button.match(/rgba?\([^)]*\)|#[0-9a-f]{6}/gi) ?? []).map((c) => blend(parseColor(c), backdrop));
      for (const stop of stops) {
        const ratio = contrast(parseColor(t.buttonInk), stop);
        if (ratio < 4.5) issues.push(`${theme.id} : texte des boutons secondaires = ${ratio.toFixed(2)}`);
      }
      for (const sky of skyStops(t.sky).map(parseColor)) {
        const ratio = contrast(parseColor(t.heading), blend(panel, sky));
        if (ratio < 4.5) issues.push(`${theme.id} : titres de section = ${ratio.toFixed(2)}`);
      }
    }
    expect(issues).toEqual([]);
  });

  it("les titres posés sur le ciel des thèmes Signature restent lisibles", () => {
    const issues: string[] = [];
    for (const theme of THEMES.filter((t) => t.skin === "signature")) {
      // Les titres d'écran occupent le haut de la fenêtre : teintes du ciel à 0 et 20 %.
      for (const stop of skyStops(theme.tokens.sky).slice(0, 2)) {
        for (const [name, ink] of [["titre", theme.tokens.skyInk], ["sous-titre", theme.tokens.skySoft]] as const) {
          const ratio = contrast(parseColor(ink), parseColor(stop));
          if (ratio < 4.5) issues.push(`${theme.id} : ${name} sur le ciel ${stop} = ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(issues).toEqual([]);
  });

  it("la coche blanche reste visible sur la couleur « fait » (3:1, pictogramme)", () => {
    const issues: string[] = [];
    for (const theme of THEMES) {
      const bottom = colorsIn(theme.tokens.fresh.slice(theme.tokens.fresh.lastIndexOf("linear-gradient("))).pop()!;
      const ratio = contrast(parseColor(theme.tokens.onAccent), parseColor(bottom));
      if (ratio < 3) issues.push(`${theme.id} : coche = ${ratio.toFixed(2)}`);
    }
    expect(issues).toEqual([]);
  });
});
