/**
 * Thèmes des cartes de contact : chaque thème accorde le bandeau (dégradé et motif) et les
 * couleurs de chaque sorte d'information, pour une carte d'identité colorée mais cohérente.
 * Les identifiants sont vérifiés aussi par le cœur (PALETTES, BANNERS, TILE_PATTERNS dans
 * src-tauri/src/data/contacts.rs ; un test compare les listes).
 */
import { INFO_STYLE, type Contact, type InfoKind } from "./contacts";
import { inkOn, luminance } from "../lib/colorInk";
import { tr } from "../i18n/i18n";

export interface ContactStyle {
  /** Thème de la carte. */
  palette: PaletteId;
  /** Motif du bandeau (repris du thème). */
  banner: BannerId;
  /** Ancien motif des bulles, gardé pour les fiches existantes. */
  tiles: TilePatternId;
}

export type PaletteId =
  | "arc-en-ciel"
  | "ton-sur-ton"
  | "ocean"
  | "foret"
  | "coucher-de-soleil"
  | "pastel"
  | "nuit"
  | "agrumes"
  | "classique"
  | "lagon"
  | "aurore"
  | "sakura"
  | "lavande"
  | "corail"
  | "menthe"
  | "framboise"
  | "cafe-creme"
  | "ardoise"
  | "tropiques"
  | "glacier"
  | "galaxie"
  | "dunes"
  | "cerise"
  | "emeraude"
  | "miel"
  | "orage"
  | "bonbon";
export type BannerId = "vagues" | "bulles" | "pois" | "rayures" | "etoiles" | "feuillage" | "confettis" | "coeurs" | "losanges" | "nuages" | "cercles" | "uni";
export type TilePatternId = "filigrane" | "pois" | "lignes" | "vague" | "uni";

type Colors = Record<InfoKind, string>;

export interface CardTheme {
  id: PaletteId;
  label: string;
  /** Dégradé du bandeau ; nul : la couleur du contact. */
  banner: [string, string] | null;
  pattern: BannerId;
  /** Couleur de chaque sorte d'information ; nulle : la couleur du contact partout (ton sur ton). */
  colors: Colors | null;
  /** Couleur des informations libres. */
  field: string;
}

/** Couleurs des informations, dans l'ordre : téléphone, e-mail, adresse, anniversaire, société, notes, étiquettes. */
function info(phone: string, email: string, address: string, birthday: string, company: string, notes: string, tags: string): Colors {
  return { phone, email, address, birthday, company, notes, tags };
}

const RAINBOW: Colors = Object.fromEntries(Object.entries(INFO_STYLE).map(([k, v]) => [k, v.color])) as Colors;

export const CARD_THEMES: readonly CardTheme[] = [
  { id: "arc-en-ciel", label: tr("Arc-en-ciel"), banner: null, pattern: "vagues", colors: RAINBOW, field: "#16a3a3" },
  { id: "ton-sur-ton", label: tr("Ton sur ton"), banner: null, pattern: "bulles", colors: null, field: "#16a3a3" },
  {
    id: "ocean",
    label: tr("Océan"),
    banner: ["#0a5f94", "#0f7f8e"],
    pattern: "vagues",
    colors: { phone: "#0a9fd8", email: "#2d6ff0", address: "#16a3a3", birthday: "#4f5bd5", company: "#14b4d4", notes: "#1f9a6e", tags: "#3d6fb8" },
    field: "#0a8fb8",
  },
  {
    id: "foret",
    label: tr("Forêt"),
    banner: ["#2fa258", "#6cc24a"],
    pattern: "feuillage",
    colors: { phone: "#2fae4a", email: "#1f9a6e", address: "#7f9a14", birthday: "#c2861a", company: "#16a3a3", notes: "#e3a712", tags: "#6cc24a" },
    field: "#5a8f2a",
  },
  {
    id: "coucher-de-soleil",
    label: tr("Coucher de soleil"),
    banner: ["#d76a8b", "#f0a52c"],
    pattern: "confettis",
    colors: { phone: "#e0671f", email: "#e04848", address: "#e89a1c", birthday: "#e0508a", company: "#7a5ce6", notes: "#f0664a", tags: "#c2479a" },
    field: "#d9563a",
  },
  {
    id: "pastel",
    label: tr("Pastel"),
    banner: ["#9f88e8", "#f2b6cf"],
    pattern: "bulles",
    colors: { phone: "#5cbf94", email: "#6f9ce8", address: "#e89a68", birthday: "#e88cb0", company: "#9f88e8", notes: "#e3b94a", tags: "#5cbcbc" },
    field: "#8f9fd8",
  },
  {
    id: "nuit",
    label: tr("Nuit"),
    banner: ["#1b1f5c", "#5b3fb3"],
    pattern: "etoiles",
    colors: { phone: "#4f5bd5", email: "#7a5ce6", address: "#3d6fb8", birthday: "#c2479a", company: "#6d5ce0", notes: "#8f6fe0", tags: "#2d6ff0" },
    field: "#5b6fd5",
  },
  {
    id: "agrumes",
    label: tr("Agrumes"),
    banner: ["#e8780c", "#e3c21a"],
    pattern: "pois",
    colors: { phone: "#7fb514", email: "#e8780c", address: "#d9a20c", birthday: "#e0508a", company: "#c2861a", notes: "#e3b512", tags: "#5aa832" },
    field: "#d98a0c",
  },
  {
    id: "classique",
    label: tr("Classique"),
    banner: ["#2b3a52", "#5a6f8c"],
    pattern: "rayures",
    colors: { phone: "#3d6fb8", email: "#5a6f8c", address: "#8a6b4a", birthday: "#a83f5c", company: "#4a5a72", notes: "#9a7b2a", tags: "#3d8a8a" },
    field: "#5a6f8c",
  },
  { id: "lagon", label: tr("Lagon"), banner: ["#0c9bb6", "#3fd6c8"], pattern: "bulles", colors: info("#0a9fb8", "#1f7fd6", "#14b49a", "#e0508a", "#0f8f8f", "#e3a712", "#2fb4c8"), field: "#0f9aa8" },
  { id: "aurore", label: tr("Aurore boréale"), banner: ["#0f6b5c", "#7a4fd6"], pattern: "etoiles", colors: info("#1fa37a", "#6d5ce0", "#2f9ea8", "#c2479a", "#4f7fd6", "#8fbf3a", "#5ac8a0"), field: "#3f8fa0" },
  { id: "sakura", label: tr("Cerisier en fleur"), banner: ["#e88cb0", "#ffd6e4"], pattern: "confettis", colors: info("#d9608f", "#9f78d8", "#e88a6a", "#e0508a", "#b06fb0", "#c99a3a", "#e07aa8"), field: "#c9709a" },
  { id: "lavande", label: tr("Lavande"), banner: ["#9482d2", "#c4b4f0"], pattern: "feuillage", colors: info("#7d68c8", "#5f7fd8", "#9a6cc0", "#d0609a", "#6f5cb8", "#a88a3a", "#8f7fd8"), field: "#7d6cc0" },
  { id: "corail", label: tr("Corail"), banner: ["#e8604a", "#ffb48a"], pattern: "vagues", colors: info("#e0603a", "#3f8fd6", "#e8902c", "#e04870", "#c0503a", "#d9a20c", "#f07a5a"), field: "#d9654a" },
  { id: "menthe", label: tr("Menthe"), banner: ["#28a87a", "#a8ecd0"], pattern: "pois", colors: info("#1f9a6e", "#2f8fd6", "#3fae8a", "#e0508a", "#16a3a3", "#c2a21a", "#4cc49a"), field: "#28a07a" },
  { id: "framboise", label: tr("Framboise"), banner: ["#b0204a", "#e41552"], pattern: "coeurs", colors: info("#c02858", "#7a4fd6", "#e0603a", "#e0407a", "#a0305a", "#d99a1a", "#e05a8a"), field: "#c0305a" },
  { id: "cafe-creme", label: tr("Café crème"), banner: ["#6b4428", "#996b35"], pattern: "rayures", colors: info("#8a5a33", "#5a6f8c", "#a87a3a", "#c0505a", "#6b4a2c", "#b08a2a", "#9a6b44"), field: "#8a6440" },
  { id: "ardoise", label: tr("Ardoise"), banner: ["#3a4a5c", "#61778e"], pattern: "losanges", colors: info("#4f6f9a", "#5a6f8c", "#6f7f6a", "#a85060", "#4a5a72", "#9a8a4a", "#5f8a96"), field: "#5a6a80" },
  { id: "tropiques", label: tr("Tropiques"), banner: ["#21a24e", "#e8d02a"], pattern: "feuillage", colors: info("#2fae4a", "#0aa0c8", "#e89a1c", "#e0508a", "#7fb514", "#e8780c", "#16b4a0"), field: "#4aa83a" },
  { id: "glacier", label: tr("Glacier"), banner: ["#5aa8e0", "#e0f4ff"], pattern: "nuages", colors: info("#3a8fd6", "#5a7fe0", "#3fb4c8", "#c0609a", "#4f8fb8", "#8a9a3a", "#6ab0e0"), field: "#4a90c8" },
  { id: "galaxie", label: tr("Galaxie"), banner: ["#2a1b6e", "#bc44ab"], pattern: "etoiles", colors: info("#6d5ce0", "#4f7fe0", "#9a4fc8", "#e0508a", "#5a4fc0", "#c88a3a", "#b05ac8"), field: "#7a5cc8" },
  { id: "dunes", label: tr("Dunes"), banner: ["#c8863a", "#f0d8a0"], pattern: "vagues", colors: info("#c2861a", "#3f7fb8", "#b0703a", "#d0505a", "#a07030", "#8a9a2a", "#d0a040"), field: "#b8843a" },
  { id: "cerise", label: tr("Cerise"), banner: ["#a81c2c", "#e51414"], pattern: "pois", colors: info("#d0303a", "#5a5fc8", "#e0603a", "#e04070", "#a83040", "#d9a20c", "#e05050"), field: "#c83a40" },
  { id: "emeraude", label: tr("Émeraude"), banner: ["#0fa371", "#2fc88a"], pattern: "losanges", colors: info("#1f9a6e", "#1f7fb8", "#2fae6a", "#c0508a", "#0f8a6a", "#b8a01a", "#3fc0a0"), field: "#1a8a62" },
  { id: "miel", label: tr("Miel"), banner: ["#d08a0c", "#ffd86a"], pattern: "cercles", colors: info("#c8860c", "#3f7fc8", "#d0a020", "#e0508a", "#a8700c", "#7fa82a", "#e0a82a"), field: "#c08a1a" },
  { id: "orage", label: tr("Orage"), banner: ["#26303f", "#3a74cc"], pattern: "rayures", colors: info("#4a7fd0", "#6d5ce0", "#3fa0b8", "#c0508a", "#5a6f9a", "#c8a03a", "#5a90c8"), field: "#4a6fa8" },
  { id: "bonbon", label: tr("Bonbon"), banner: ["#f08ab8", "#8ad0f0"], pattern: "confettis", colors: info("#e0609a", "#4fa0e0", "#f0904a", "#d0408a", "#9a6fd8", "#d0b030", "#4cc0c0"), field: "#d070a8" },
];

export const BANNERS: readonly { id: BannerId; label: string }[] = [
  { id: "vagues", label: tr("Vagues") },
  { id: "bulles", label: tr("Bulles") },
  { id: "pois", label: tr("Pois") },
  { id: "rayures", label: tr("Rayures") },
  { id: "etoiles", label: tr("Étoiles") },
  { id: "feuillage", label: tr("Feuillage") },
  { id: "confettis", label: tr("Confettis") },
  { id: "coeurs", label: tr("Cœurs") },
  { id: "losanges", label: tr("Losanges") },
  { id: "nuages", label: tr("Nuages") },
  { id: "cercles", label: tr("Cercles") },
  { id: "uni", label: tr("Uni") },
];

export const TILE_PATTERNS: readonly { id: TilePatternId; label: string }[] = [
  { id: "filigrane", label: tr("Filigrane") },
  { id: "pois", label: tr("Pois") },
  { id: "lignes", label: tr("Lignes") },
  { id: "vague", label: tr("Vague") },
  { id: "uni", label: tr("Uni") },
];

export const DEFAULT_STYLE: ContactStyle = { palette: "arc-en-ciel", banner: "vagues", tiles: "filigrane" };

/** Style de la fiche, celui par défaut pour une fiche qui n'en a pas (ou un style inconnu). */
export function styleOf(c: Pick<Contact, "style">): ContactStyle {
  const s = c.style;
  if (!s) return DEFAULT_STYLE;
  return {
    palette: CARD_THEMES.some((p) => p.id === s.palette) ? s.palette : DEFAULT_STYLE.palette,
    banner: BANNERS.some((b) => b.id === s.banner) ? s.banner : DEFAULT_STYLE.banner,
    tiles: TILE_PATTERNS.some((t) => t.id === s.tiles) ? s.tiles : DEFAULT_STYLE.tiles,
  };
}

/** Thème de la carte d'un contact. */
export function themeOf(c: Pick<Contact, "style">): CardTheme {
  const id = styleOf(c).palette;
  return CARD_THEMES.find((t) => t.id === id) ?? CARD_THEMES[0]!;
}

/** Style enregistré pour un thème choisi. */
export function styleFor(theme: CardTheme): ContactStyle {
  return { palette: theme.id, banner: theme.pattern, tiles: "uni" };
}

/** Couleur d'une sorte d'information, selon le thème de la carte. */
export function infoColor(kind: InfoKind, theme: CardTheme, cardColor: string): string {
  return theme.colors?.[kind] ?? cardColor;
}

/** Dégradé de la carte. Sans dégradé propre au thème, la couleur du contact, en une nuance où le texte reste lisible. */
export function bannerColors(theme: CardTheme, cardColor: string): [string, string] {
  if (theme.banner) return theme.banner;
  const shade = readableShade(cardColor);
  return [shade, shade];
}

function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Nuance d'une couleur (même teinte) où l'une des deux encres atteint 4,5:1 : assombrie pour
 * l'encre blanche, ou éclaircie pour l'encre foncée, selon ce qui la change le moins.
 */
export function readableShade(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [h, s, l] = toHsl(hex);
  const towards = (ink: string, step: number) => {
    let light = l;
    let color = hex;
    for (let i = 0; i < 100 && contrast(ink, color) < 4.6; i++) {
      light = Math.min(1, Math.max(0, light + step));
      color = fromHsl(h, s, light);
    }
    return { color, moved: Math.abs(light - l) };
  };
  const darker = towards(CARD_INK.light, -0.01);
  const lighter = towards(CARD_INK.dark, 0.01);
  return darker.moved <= lighter.moved ? darker.color : lighter.color;
}

/** Encres du texte posé sur le dégradé : blanche, ou foncée (celle des thèmes clairs). */
export const CARD_INK = { light: "#ffffff", dark: "#10243a" } as const;

/** Contraste WCAG entre deux couleurs « #rrggbb ». */
export function contrast(x: string, y: string): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Encre du texte de la carte : celle qui contraste le mieux avec les deux bouts du dégradé (le
 * texte y passe d'un bout à l'autre). Les thèmes fournis atteignent 4,5:1 partout (un test le
 * vérifie) ; une couleur de contact choisie librement prend la meilleure des deux.
 */
export function cardInk(theme: CardTheme, cardColor: string): "light" | "dark" {
  const [a, b] = bannerColors(theme, cardColor);
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return inkOn(b);
  const worst = (ink: string) => Math.min(contrast(ink, a), contrast(ink, b));
  return worst(CARD_INK.light) >= worst(CARD_INK.dark) ? "light" : "dark";
}
