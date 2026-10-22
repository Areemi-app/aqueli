import { describe, expect, it } from "vitest";
import { TASK_COLORS } from "../tasks/colors";
import { contrast, lastColor, parseColor, readabilityProblems } from "./contrast";
import {
  backdropsOf,
  buildCustomTheme,
  cleanCustomTheme,
  cleanCustomThemes,
  draftFrom,
  fromAqtheme,
  isCustomId,
  newCustomId,
  readableOn,
  toAqtheme,
  type CustomTheme,
} from "./custom";
import { getTheme, THEMES } from "./themes";

const draft = (changes: Partial<CustomTheme> = {}): CustomTheme => ({ ...draftFrom(getTheme("aqua"), "perso-abc12345", "Mon thème"), ...changes });

describe("thèmes personnels", () => {
  it("partent d'un thème, avec un identifiant reconnaissable", () => {
    const id = newCustomId(() => 0.5);
    expect(isCustomId(id)).toBe(true);
    expect(isCustomId("aqua")).toBe(false);
    const d = draft();
    expect(d.base).toBe("aqua");
    expect(d.blur).toBe(16);
    expect(d.opacity).toBe(84);
    expect(d.sounds).toBe("aqua");
  });

  it("ne gardent que des réglages valides", () => {
    expect(cleanCustomTheme({ ...draft(), blur: 99, opacity: 5, dim: -4, accent: "rouge" })).toMatchObject({ blur: 40, opacity: 30, dim: 0, accent: null });
    expect(cleanCustomTheme({ ...draft(), id: "aqua" })).toBeNull();
    expect(cleanCustomTheme({ ...draft(), base: "inconnu" })).toBeNull();
    expect(cleanCustomTheme({ ...draft(), name: "   " })).toBeNull();
    expect(cleanCustomThemes([draft(), draft(), "x"])).toHaveLength(1);
  });

  it("appliquent le flou, l'opacité et le fond d'écran", () => {
    const t = buildCustomTheme(draft({ blur: 4, opacity: 80, wallpaper: true, tones: ["#f0e0d0", "#203040"] }), "blob:aqueli/fond");
    expect(t.tokens.blur).toBe("4px");
    expect(parseColor(lastColor(t.tokens.card))[3]).toBeCloseTo(0.8);
    expect(t.tokens.sky).toContain('url("blob:aqueli/fond")');
    expect(t.family).toBe("Mes thèmes");
    // Avant le déverrouillage, le ciel du thème de départ.
    expect(buildCustomTheme(draft({ wallpaper: true }), null).tokens.sky).toBe(getTheme("aqua").tokens.sky);
  });

  it("gardent un texte lisible quelle que soit la couleur d'accent, sur chacun des thèmes intégrés", () => {
    const failures: string[] = [];
    for (const base of THEMES) {
      for (const color of TASK_COLORS) {
        const c = { ...draftFrom(base, "perso-test0001", "Essai"), accent: color.value };
        const theme = buildCustomTheme(c);
        for (const p of readabilityProblems(theme.tokens, backdropsOf(c, base))) failures.push(`${base.id} + ${color.label} : ${p.name} ${p.ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("signalent un fond d'écran trop chargé pour des panneaux trop transparents", () => {
    const busy = draft({ wallpaper: true, tones: ["#ffffff", "#101010"], opacity: 30, dim: 0 });
    expect(readabilityProblems(buildCustomTheme(busy, "blob:x").tokens, backdropsOf(busy, getTheme("aqua"))).length).toBeGreaterThan(0);
    const calm = { ...busy, opacity: 85, dim: 40 };
    expect(readabilityProblems(buildCustomTheme(calm, "blob:x").tokens, backdropsOf(calm, getTheme("aqua")))).toEqual([]);
  });

  it("assombrissent une couleur trop claire juste assez", () => {
    const white = parseColor("#ffffff");
    const fixed = readableOn("#e6c019", [white], false);
    expect(contrast(parseColor(fixed), white)).toBeGreaterThanOrEqual(4.5);
    expect(readableOn("#000000", [white], false)).toBe("#000000");
  });

  it("s'exportent et se relisent en fichier .aqtheme, fond d'écran compris", () => {
    const c = draft({ accent: "#e04848", wallpaper: true, tones: ["#eeeeee", "#222222"] });
    const text = toAqtheme(c, "data:image/jpeg;base64,AAAA");
    const back = fromAqtheme(text, "perso-zzz00001");
    expect(back?.theme).toEqual({ ...c, id: "perso-zzz00001" });
    expect(back?.wallpaper).toBe("data:image/jpeg;base64,AAAA");
    expect(fromAqtheme("{}", "perso-zzz00001")).toBeNull();
    expect(fromAqtheme("pas du JSON", "perso-zzz00001")).toBeNull();
    // Une image illisible est ignorée : le thème reste, sans fond d'écran.
    const noImage = fromAqtheme(text.replace("data:image/jpeg;base64,AAAA", "javascript:alert(1)"), "perso-zzz00001");
    expect(noImage?.wallpaper).toBeNull();
    expect(noImage?.theme.wallpaper).toBe(false);
  });
});

describe("teintes d'un fond d'écran", () => {
  it("prennent la moyenne des pixels les plus clairs et des plus sombres", async () => {
    const { tonesOf } = await import("./wallpapers");
    const pixels = [...Array(10).fill([250, 250, 250, 1]), ...Array(80).fill([128, 128, 128, 1]), ...Array(10).fill([10, 20, 30, 1])];
    expect(tonesOf(pixels, 0.1)).toEqual(["#fafafa", "#0a141e"]);
  });
});
