/**
 * Thèmes personnels (éditeur de thème, cahier des charges § 6) : un thème de départ, une couleur
 * d'accent, un fond d'écran personnel, le flou et la transparence des panneaux, et ses sons.
 * Leur réglage est rangé dans les préférences ; le fond d'écran, lui, est dans la base chiffrée
 * (il ne s'affiche qu'une fois le compte déverrouillé). Fonctions pures.
 */
import { blend, colorsIn, contrast, lastColor, middle, parseColor, skyStops, type Rgba } from "./contrast";
import { getTheme, isThemeId, lightControls, type CustomThemeId, type ThemeDef, type ThemeId } from "./themes";
import { tr } from "../i18n/i18n";

export interface CustomTheme {
  id: CustomThemeId;
  name: string;
  /** Thème de départ : formes, motif, couleurs qui ne sont pas réglées ici. */
  base: ThemeId;
  /** Couleur d'accent choisie ; nulle : celle du thème de départ. */
  accent: string | null;
  /** Flou du verre, en pixels (0 à 40). */
  blur: number;
  /** Opacité des panneaux, en % (30 à 100). */
  opacity: number;
  /** Voile posé sur le fond d'écran pour la lisibilité, en % (0 à 70). */
  dim: number;
  /** Le thème a un fond d'écran personnel (rangé dans la base chiffrée). */
  wallpaper: boolean;
  /** Teintes claire et sombre du fond d'écran, pour vérifier la lisibilité. */
  tones: [light: string, dark: string] | null;
  /** Sons d'un des thèmes intégrés. */
  sounds: ThemeId;
}

export const MAX_CUSTOM_THEMES = 12;
export const MAX_NAME_CHARS = 40;
export const BLUR_RANGE = [0, 40] as const;
export const OPACITY_RANGE = [30, 100] as const;
export const DIM_RANGE = [0, 70] as const;
/** Fond d'écran : image réduite (côté le plus long) et taille maximale enregistrée. */
export const WALLPAPER_MAX_SIDE = 2560;
export const MAX_WALLPAPER_CHARS = 8_000_000;

const HEX = /^#[0-9a-f]{6}$/i;
const WHITE: Rgba = [255, 255, 255, 1];
const BLACK: Rgba = [0, 0, 0, 1];

const clamp = (n: number, [min, max]: readonly [number, number]) => Math.round(Math.min(max, Math.max(min, n)));

export function hexOf(c: Rgba): string {
  return `#${c
    .slice(0, 3)
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1];
}

const rgba = (c: Rgba, alpha: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;

/**
 * La couleur, assombrie (fond clair) ou éclaircie (fond sombre) juste assez pour atteindre le
 * contraste voulu sur chacun des fonds.
 */
export function readableOn(color: string, backgrounds: readonly Rgba[], lighten: boolean, min = 4.5): string {
  const c = parseColor(color);
  const target = lighten ? WHITE : BLACK;
  for (let step = 0; step <= 20; step++) {
    // Mesuré sur la couleur arrondie, celle qui sera réellement affichée.
    const m = hexOf(mix(c, target, step / 20));
    if (backgrounds.every((bg) => contrast(parseColor(m), bg) >= min)) return m;
  }
  return hexOf(target);
}

/** Nouvel identifiant de thème personnel. */
export function newCustomId(random: () => number = Math.random): CustomThemeId {
  return `perso-${Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0")}`;
}

export function isCustomId(value: unknown): value is CustomThemeId {
  return typeof value === "string" && /^perso-[a-z0-9]{6,20}$/.test(value);
}

/** Nouveau thème personnel, au départ du thème donné. */
export function draftFrom(base: ThemeDef, id: CustomThemeId, name: string): CustomTheme {
  const baseId = isThemeId(base.id) ? base.id : "aqua";
  return {
    id,
    name,
    base: baseId,
    accent: null,
    blur: Number.parseInt(base.tokens.blur, 10) || 16,
    opacity: Math.round(parseColor(lastColor(base.tokens.card))[3] * 100),
    dim: base.dark ? 35 : 25,
    wallpaper: false,
    tones: null,
    sounds: base.sounds ?? baseId,
  };
}

/** Réglage valide (préférences, fichier .aqtheme) ; nul sinon. */
export function cleanCustomTheme(value: unknown): CustomTheme | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isCustomId(v.id) || typeof v.name !== "string" || !isThemeId(v.base)) return null;
  const name = v.name.trim().slice(0, MAX_NAME_CHARS);
  if (!name) return null;
  const num = (x: unknown, range: readonly [number, number], fallback: number) => (typeof x === "number" && Number.isFinite(x) ? clamp(x, range) : fallback);
  const tones = Array.isArray(v.tones) && v.tones.length === 2 && v.tones.every((t) => typeof t === "string" && HEX.test(t)) ? (v.tones as [string, string]) : null;
  return {
    id: v.id,
    name,
    base: v.base,
    accent: typeof v.accent === "string" && HEX.test(v.accent) ? v.accent.toLowerCase() : null,
    blur: num(v.blur, BLUR_RANGE, 16),
    opacity: num(v.opacity, OPACITY_RANGE, 62),
    dim: num(v.dim, DIM_RANGE, 25),
    wallpaper: v.wallpaper === true,
    tones,
    sounds: isThemeId(v.sounds) ? v.sounds : v.base,
  };
}

export function isCustomThemeList(value: unknown): value is CustomTheme[] {
  return Array.isArray(value);
}

/** Thèmes personnels enregistrés, sans les réglages abîmés ni les doublons. */
export function cleanCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return [];
  const out: CustomTheme[] = [];
  for (const item of value) {
    const c = cleanCustomTheme(item);
    if (c && !out.some((x) => x.id === c.id) && out.length < MAX_CUSTOM_THEMES) out.push(c);
  }
  return out;
}

/** Remplace la dernière couleur d'une valeur CSS (le fond d'un panneau sous ses reflets). */
function withLastColor(value: string, color: string): string {
  const last = lastColor(value);
  const i = value.lastIndexOf(last);
  return value.slice(0, i) + color + value.slice(i + last.length);
}

/** Voile du fond d'écran : blanc sur un thème clair, noir sur un thème sombre. */
function veil(c: CustomTheme, dark: boolean): Rgba {
  return dark ? [0, 0, 0, c.dim / 100] : [255, 255, 255, c.dim / 100];
}

/**
 * Fonds sur lesquels le texte des panneaux doit rester lisible : les teintes du ciel du thème
 * de départ, ou celles du fond d'écran sous son voile.
 */
export function backdropsOf(c: CustomTheme, base: ThemeDef): Rgba[] {
  if (c.wallpaper && c.tones) return c.tones.map((t) => blend(veil(c, base.dark), parseColor(t)));
  return skyStops(base.tokens.sky).map(parseColor);
}

/**
 * Le thème personnel prêt à appliquer. `wallpaperUrl` : adresse de l'image (« blob: »), connue
 * une fois le compte déverrouillé ; sans elle, le ciel du thème de départ s'affiche.
 */
export function buildCustomTheme(c: CustomTheme, wallpaperUrl: string | null = null): ThemeDef {
  const base = getTheme(c.base);
  const t = { ...base.tokens };
  const dark = base.dark;
  const panel = parseColor(lastColor(t.card));
  const glass: Rgba = [panel[0], panel[1], panel[2], c.opacity / 100];
  t.card = withLastColor(t.card, rgba(glass, glass[3]));
  t.blur = `${c.blur}px`;
  const showWallpaper = c.wallpaper && wallpaperUrl !== null;
  if (showWallpaper) {
    const v = veil(c, dark);
    t.sky = `linear-gradient(${rgba(v, v[3])}, ${rgba(v, v[3])}), url("${wallpaperUrl}") center / cover no-repeat`;
    // Sur une image, un titre blanc ne serait pas toujours lisible : il prend l'encre des panneaux.
    t.skyInk = t.ink;
    t.skySoft = t.soft;
    t.skyShadow = "none";
    if (c.tones) t.windowBg = c.tones[dark ? 1 : 0];
  }
  if (c.accent) {
    const accent = parseColor(c.accent);
    const panels = backdropsOf(c, base).map((bg) => blend(glass, bg));
    t.accent = readableOn(c.accent, panels, dark);
    t.focus = t.accent;
    t.tint = rgba(accent, dark ? 0.24 : 0.16);
    // Boutons « gel » : le bas assez foncé pour le texte blanc, le haut un peu plus clair.
    const deep = parseColor(readableOn(c.accent, [WHITE], false, 4.6));
    let top = mix(deep, accent, 0.6);
    while (contrast(WHITE, middle(top, deep)) < 3.2) top = mix(top, deep, 0.25);
    const gloss = t.gel.slice(0, t.gel.lastIndexOf("linear-gradient("));
    t.gel = `${gloss}linear-gradient(180deg, ${hexOf(top)} 0%, ${hexOf(deep)} 100%)`;
    t.glow = rgba(deep, 0.55);
    t.fresh = t.gel;
    t.freshGlow = t.glow;
    t.ring = `0 0 0 1px ${rgba(accent, 0.38)}, 0 2px 6px ${rgba(deep, 0.2)}`;
    if (!dark) {
      t.active = `linear-gradient(180deg, #ffffff 0%, ${hexOf(mix(accent, WHITE, 0.82))} 100%)`;
      Object.assign(t, lightControls(t.accent, hexOf(mix(accent, deep, 0.25))));
    } else {
      t.heading = t.soft;
      t.row = t.accent;
    }
  }
  return {
    ...base,
    id: c.id,
    name: c.name,
    family: "Mes thèmes",
    description: tr("D'après « {name} »", { name: base.name }),
    swatches: [c.accent ?? colorsIn(base.tokens.gel).pop() ?? base.swatches[0]!, ...base.swatches.slice(1, 4)],
    tokens: t,
    sounds: c.sounds,
  };
}

// ——— Fichier .aqtheme ———

export const AQTHEME_FORMAT = "aqueli-theme";

interface AqthemeFile extends Omit<CustomTheme, "id" | "wallpaper"> {
  format: typeof AQTHEME_FORMAT;
  version: 1;
  /** Image du fond d'écran (« data:image/jpeg;base64,… »), si le thème en a une. */
  wallpaper: string | null;
}

/** Contenu du fichier .aqtheme d'un thème personnel (avec son fond d'écran). */
export function toAqtheme(c: CustomTheme, wallpaper: string | null): string {
  const { id: _id, wallpaper: _w, ...rest } = c;
  const file: AqthemeFile = { format: AQTHEME_FORMAT, version: 1, ...rest, wallpaper: c.wallpaper ? wallpaper : null };
  return JSON.stringify(file);
}

export function isWallpaperData(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_WALLPAPER_CHARS &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
  );
}

/** Lit un fichier .aqtheme : le thème (nouvel identifiant) et son fond d'écran ; nul s'il est illisible. */
export function fromAqtheme(text: string, id: CustomThemeId): { theme: CustomTheme; wallpaper: string | null } | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const f = data as Record<string, unknown>;
  if (f.format !== AQTHEME_FORMAT || f.version !== 1) return null;
  const wallpaper = isWallpaperData(f.wallpaper) ? f.wallpaper : null;
  const theme = cleanCustomTheme({ ...f, id, wallpaper: wallpaper !== null });
  if (!theme) return null;
  return { theme: wallpaper ? theme : { ...theme, tones: null }, wallpaper };
}
