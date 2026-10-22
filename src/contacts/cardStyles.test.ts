import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANNERS, bannerColors, CARD_INK, CARD_THEMES, cardInk, contrast, DEFAULT_STYLE, infoColor, styleFor, styleOf, themeOf, TILE_PATTERNS } from "./cardStyles";
import { INFO_STYLE } from "./contacts";

/** Identifiants d'une liste du cœur : « pub const NOM: [&str; n] = [...] ». */
/** Liste du cœur, écrite sur une ligne ou sur plusieurs, jusqu'à « ]; ». */
function rustList(source: string, name: string): string[] {
  const start = source.indexOf(`pub const ${name}:`);
  if (start < 0) return [];
  const block = source.slice(start, source.indexOf("];", start));
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("thèmes des cartes de contact", () => {
  it("proposent les mêmes thèmes et motifs que le cœur", () => {
    const rust = readFileSync("src-tauri/src/data/contacts.rs", "utf8");
    expect(CARD_THEMES.map((p) => p.id)).toEqual(rustList(rust, "PALETTES"));
    expect(BANNERS.map((b) => b.id)).toEqual(rustList(rust, "BANNERS"));
    expect(TILE_PATTERNS.map((t) => t.id)).toEqual(rustList(rust, "TILE_PATTERNS"));
    for (const t of CARD_THEMES) expect(BANNERS.some((b) => b.id === t.pattern)).toBe(true);
  });

  it("colorent chaque information selon le thème, ou de la couleur du contact", () => {
    const rainbow = themeOf({ style: null });
    expect(infoColor("phone", rainbow, "#123456")).toBe(INFO_STYLE.phone.color);
    expect(infoColor("email", themeOf({ style: styleFor(CARD_THEMES[1]!) }), "#123456")).toBe("#123456");
    expect(styleFor(CARD_THEMES.find((t) => t.id === "foret")!)).toEqual({ palette: "foret", banner: "feuillage", tiles: "uni" });
  });

  it("gardent le style par défaut pour une fiche sans style ou au style inconnu", () => {
    expect(styleOf({ style: null })).toEqual(DEFAULT_STYLE);
    expect(styleOf({ style: { palette: "inconnue", banner: "pois", tiles: "x" } as never })).toEqual({ ...DEFAULT_STYLE, banner: "pois" });
  });

  it("gardent un texte lisible (4,5:1) sur tout le dégradé de la carte", () => {
    for (const t of CARD_THEMES) {
      if (!t.banner) continue;
      const ink = CARD_INK[cardInk(t, "#000000")];
      for (const end of t.banner) expect(contrast(ink, end), `${t.id} ${end}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("rend lisible toute couleur de contact sur les cartes « Arc-en-ciel » et « Ton sur ton »", () => {
    for (const color of ["#1f9a6e", "#a0703c", "#e04848", "#e0508a", "#ffe08a", "#0a3d6b", "#888888"]) {
      for (const t of CARD_THEMES.filter((x) => !x.banner)) {
        const [a] = bannerColors(t, color);
        expect(contrast(CARD_INK[cardInk(t, color)], a), `${t.id} ${color}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("choisit l'encre qui contraste le mieux avec une couleur de contact libre", () => {
    const rainbow = CARD_THEMES[0]!;
    expect(cardInk(rainbow, "#0a3d6b")).toBe("light");
    expect(cardInk(rainbow, "#ffe08a")).toBe("dark");
  });
});
