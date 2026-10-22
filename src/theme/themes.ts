/**
 * Palettes des thèmes Aqueli.
 *
 * Les valeurs viennent des maquettes validées (docs/maquettes/Main.dc.html, Taches.dc.html,
 * BarreLaterale.dc.html, BarreTitre.dc.html, Themes.dc.html). Chaque clé devient une variable
 * CSS « --aq-… » (voir applyTheme.ts) : les composants n'utilisent que ces variables, jamais
 * de couleur écrite en dur.
 */

import { contrast, parseColor } from "./contrast";
import { tr } from "../i18n/i18n";

/** Reflet brillant posé sur les boutons « gel ». */
const GLOSS =
  "radial-gradient(120% 90% at 50% -20%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 55%, rgba(255,255,255,0) 70%)";

/** Reflet net à mi-hauteur des boutons « gel » d'Aqua, comme les boutons des années 2000. */
const AQUA_GLOSS =
  "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.14) 47%, rgba(255,255,255,0) 53%)";

export type ThemeId =
  | "aqua"
  | "jade"
  | "glycine"
  | "ambre"
  | "nuage"
  | "minuit"
  | "frutiger"
  | "prairie"
  | "lagon"
  | "tropiques"
  | "aurore-boreale"
  | "printemps"
  | "ete"
  | "automne"
  | "hiver"
  | "noel"
  | "nouvel-an"
  | "saint-valentin"
  | "paques"
  | "halloween"
  | "zen"
  | "energie"
  | "cocon"
  | "bulles-irisees"
  | "nuit-etoilee"
  | "abysses"
  | "lavande"
  | "terracotta"
  | "ardoise"
  | "velours"
  | "onyx";
export type ThemeFamily = "Signature" | "Mes thèmes" | "Couleurs et nature" | "Saisons" | "Fêtes" | "Humeurs" | "Nuit";
/** Thème créé dans l'éditeur de thème (src/theme/custom.ts). */
export type CustomThemeId = `perso-${string}`;
export type AnyThemeId = ThemeId | CustomThemeId;
export type ThemeMotif = "bulles" | "etoiles" | "feuilles" | "flocons" | "petales" | "coeurs" | "oeufs" | "chauvesouris";

/** Familles, dans l'ordre de la galerie. */
export const THEME_FAMILIES: readonly ThemeFamily[] = ["Signature", "Couleurs et nature", "Saisons", "Fêtes", "Humeurs", "Nuit", "Mes thèmes"];

/**
 * Nom affiché de chaque famille, ce qui la distingue, et sa pastille dans la galerie des thèmes :
 * un symbole (`src/components/symbols.ts`) et une couleur.
 */
export const FAMILY_INFO: Record<ThemeFamily, { label: string; hint: string; symbol: string; color: string }> = {
  Signature: { label: tr("Signature Aqueli"), hint: tr("Le style d'Aqueli : verre lumineux, reflets et titres posés sur le ciel."), symbol: "goutte", color: "#1e90e0" },
  "Couleurs et nature": { label: tr("Couleurs et nature"), hint: tr("Paysages et couleurs franches."), symbol: "feuille", color: "#2fae4a" },
  Saisons: { label: tr("Saisons"), hint: tr("Printemps, été, automne, hiver."), symbol: "soleil", color: "#e3a712" },
  Fêtes: { label: tr("Fêtes"), hint: tr("Noël, Nouvel An, Saint-Valentin, Pâques, Halloween."), symbol: "cadeau", color: "#e04848" },
  Humeurs: { label: tr("Humeurs"), hint: tr("Ambiances calmes ou toniques."), symbol: "sourire", color: "#d9567a" },
  Nuit: { label: tr("Nuit"), hint: tr("Thèmes sombres."), symbol: "lune", color: "#3d4fb8" },
  "Mes thèmes": { label: tr("Mes thèmes"), hint: tr("Thèmes créés ou importés."), symbol: "pinceau", color: "#7a4fd0" },
};

/**
 * Style d'un thème : « signature » pour la famille Signature Aqueli (barre de titre posée sur le
 * ciel, titres en blanc, barre d'état flottante, sélection brillante : src/styles/signature.css).
 */
export type ThemeSkin = "classique" | "signature";

export interface ThemeTokens {
  /** Fond de la fenêtre (ciel en dégradé). */
  sky: string;
  /** Couleur unie affichée avant le premier dessin de la fenêtre. */
  windowBg: string;
  /** Barres de titre et d'état. */
  bar: string;
  barSolid: string;
  /** Cartes et panneaux en verre dépoli. */
  card: string;
  cardSolid: string;
  /** Menus, palette de commandes, fenêtres superposées. */
  popover: string;
  popoverSolid: string;
  field: string;
  tile: string;
  border: string;
  ink: string;
  soft: string;
  accent: string;
  tint: string;
  hover: string;
  warn: string;
  warnBg: string;
  danger: string;
  dangerBg: string;
  /** Revenus et soldes positifs (Budget), texte lisible sur les panneaux. */
  gain: string;
  gainBg: string;
  /** Drapeaux de priorité des tâches (maquette Tâches). */
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;
  /** Lignes de tâches teintées : reflet, part de couleur (en %). */
  rowGloss: string;
  rowMix: string;
  rowMixStrong: string;
  /** Boutons principaux « gel ». */
  gel: string;
  glow: string;
  gelBorder: string;
  gelInset: string;
  onAccent: string;
  /** Texte foncé sur une couleur claire choisie par la personne (événements du calendrier). */
  onLight: string;
  /** Onglet actif des contrôles segmentés. */
  seg: string;
  segShadow: string;
  /** Élément actif de la barre latérale. */
  active: string;
  ring: string;
  line: string;
  lineStrong: string;
  shadow: string;
  titlebarShadow: string;
  controlShadow: string;
  fieldInset: string;
  note: string;
  bubble: string;
  bubbleEdge: string;
  star: string;
  /** Couleur des motifs du décor (feuilles, flocons, cœurs…). */
  motif: string;
  scrim: string;
  focus: string;
  scrollbar: string;
  chipGloss: string;
  chipShadow: string;
  /** Pastille des actions générales (Corbeille, Précédent…). */
  chipNeutral: string;
  /** Reflet qui glisse sur les boutons au survol. */
  sheen: string;
  starGlow: string;
  /** Bordure des champs de saisie. */
  fieldBorder: string;
  /** Flou du verre dépoli sous les panneaux (« 16px »), réglable dans l'éditeur de thème. */
  blur: string;
  /** Écran de verrouillage : halo central, ombre de la carte, halo de l'horloge. */
  lockGlow: string;
  lockShadow: string;
  clockGlow: string;
  closeHover: string;
  onClose: string;
  /** Boutons secondaires (verre teinté brillant sur les thèmes clairs) : fond, bord, texte. */
  button: string;
  buttonBorder: string;
  buttonInk: string;
  /** Piste des contrôles segmentés et des onglets. */
  track: string;
  /** Tuiles en relief (chiffres clés) : verre brillant teinté sur les thèmes clairs. */
  raised: string;
  /** Titres de section et de panneau. */
  heading: string;
  /** Couleur par défaut des lignes (bulles teintées), quand l'élément n'a pas la sienne. */
  row: string;
  /** Part de la couleur de la ligne dans sa bordure (« 28% »). */
  rowEdge: string;
  /** Voile posé sur les colonnes de navigation (listes, carnets, dossiers) pour les distinguer du contenu. */
  navTint: string;
  /** Ce qui est fait ou activé : cases cochées, interrupteurs, barres de progression (vert brillant de Frutiger). */
  fresh: string;
  freshGlow: string;
  /** Liseré sous la barre de titre (dégradé de la palette du thème). */
  barEdge: string;
  /** Texte posé directement sur le ciel (titres d'écran du style Signature), texte secondaire, ombre. */
  skyInk: string;
  skySoft: string;
  skyShadow: string;
  /** Seconde teinte des vagues au bas des cartes (style Signature), mêlée à la couleur du module. */
  waveTint: string;
}

export interface ThemeDef {
  id: AnyThemeId;
  name: string;
  family: ThemeFamily;
  dark: boolean;
  motif: ThemeMotif;
  /** Motifs dessinés au trait (flocons), sinon pleins. */
  motifStroke?: boolean;
  description: string;
  /** Pastilles affichées dans la galerie des thèmes. */
  swatches: string[];
  tokens: ThemeTokens;
  /** Style de la fenêtre (absent : classique). */
  skin?: ThemeSkin;
  /** Sons d'un autre thème (thème personnel) ; sinon ceux du thème lui-même. */
  sounds?: ThemeId;
}

/** Valeurs communes à tous les thèmes (reflets blancs, conventions Windows). */
const COMMON = {
  gelBorder: "rgba(255,255,255,0.28)",
  gelInset: "inset 0 1px 0 rgba(255,255,255,0.35)",
  onAccent: "#ffffff",
  onLight: "#10243a",
  segShadow: "0 1px 3px rgba(0,30,60,0.18), inset 0 1px 0 rgba(255,255,255,0.7)",
  controlShadow: "0 1px 2px rgba(0,30,60,0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
  fieldInset: "inset 0 1px 3px rgba(0,30,60,0.14)",
  titlebarShadow: "0 1px 0 rgba(255,255,255,0.35) inset, 0 4px 14px rgba(0,40,90,0.10)",
  chipGloss: "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 55%)",
  chipShadow: "inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 3px rgba(0,0,0,0.2)",
  closeHover: "#c42b1c",
  onClose: "#ffffff",
  sheen: "rgba(255,255,255,0.35)",
  blur: "16px",
} satisfies Partial<ThemeTokens>;

/**
 * Collines du ciel de Frutiger, dessinées en SVG : deux vallons vert prairie, un reflet sur
 * la crête et une brume claire au pied. Étirées sur toute la largeur, au bas de la fenêtre.
 */
const HILLS_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 400' preserveAspectRatio='none'>" +
  "<defs>" +
  "<linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#bdee86'/><stop offset='1' stop-color='#6cc94f'/></linearGradient>" +
  "<linearGradient id='b' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#93df5c'/><stop offset='.6' stop-color='#55bb4a'/><stop offset='1' stop-color='#3aa548'/></linearGradient>" +
  "<radialGradient id='g' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff' stop-opacity='.55'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient>" +
  "</defs>" +
  "<path d='M0 190 C260 105 560 112 860 180 S1380 150 1600 92 V400 H0 Z' fill='url(#a)' opacity='.8'/>" +
  "<ellipse cx='1240' cy='160' rx='260' ry='34' fill='url(#g)'/>" +
  "<path d='M0 290 C320 196 700 226 1000 280 S1440 236 1600 258 V400 H0 Z' fill='url(#b)'/>" +
  "<path d='M0 290 C320 196 700 226 1000 280 S1440 236 1600 258' fill='none' stroke='#fff' stroke-opacity='.55' stroke-width='2.5' vector-effect='non-scaling-stroke'/>" +
  "<ellipse cx='420' cy='250' rx='300' ry='36' fill='url(#g)'/>" +
  "</svg>";
const HILLS = `url("data:image/svg+xml,${encodeURIComponent(HILLS_SVG)}") center bottom / 100% 24% no-repeat`;

/** Verre des panneaux des thèmes clairs, avant la lueur de la couleur du thème. */
const LIGHT_CARD = "linear-gradient(125deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 26%), linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 38%), rgba(255,255,255,0.62)";

/**
 * Frutiger : palette Frutiger Aero, chaque couleur avec son rôle : ciel bleu pour les actions et
 * les lignes, eau turquoise pour les commandes, les titres et la navigation, vert prairie pour ce
 * qui est fait ou activé, soleil doré dans le ciel, les notes et les favoris. Modèle des autres
 * thèmes clairs (lightTokens).
 */
export const FRUTIGER: ThemeDef = {
  id: "frutiger",
  name: tr("Frutiger"),
  family: "Couleurs et nature",
  dark: false,
  motif: "bulles",
  description: tr("Ciel, prairie et soleil"),
  swatches: ["#2a9fe6", "#2ec4d6", "#5cc94a", "#ffd257"],
  // Esprit des années 2000 (Frutiger Aero, Messenger) : ciel lumineux au-dessus de collines
  // vertes, soleil doux, reflets nets à mi-hauteur sur les barres, les boutons et les pastilles.
  tokens: {
    ...COMMON,
    sky: `radial-gradient(26% 34% at 93% 0%, rgba(255,251,226,0.95), rgba(255,236,160,0.42) 42%, rgba(255,236,160,0) 72%), radial-gradient(55% 45% at 6% 0%, rgba(150,236,255,0.55), rgba(150,236,255,0) 70%), ${HILLS}, linear-gradient(180deg, rgba(255,255,255,0) 58%, rgba(226,250,255,0.6) 74%, rgba(226,250,255,0) 86%), linear-gradient(180deg, #3aaee9 0%, #74cbf4 36%, #c0eafc 66%, #e6f8f4 100%)`,
    windowBg: "#8fd8fa",
    bar: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 48%, rgba(226,248,255,0.7) 52%, rgba(238,251,252,0.8) 100%)",
    barSolid: "#f4fbff",
    // Verre des panneaux : reflets en haut, lueur d'eau turquoise en bas, reflet de prairie au coin.
    card: "linear-gradient(125deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 26%), linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 38%), radial-gradient(60% 40% at 100% 100%, rgba(170,230,130,0.2), rgba(170,230,130,0) 70%), linear-gradient(180deg, rgba(130,218,238,0) 55%, rgba(130,218,238,0.26) 100%), rgba(255,255,255,0.62)",
    cardSolid: "#eef8fe",
    popover: "linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 40%), rgba(244,251,255,0.95)",
    popoverSolid: "#f4fbff",
    field: "rgba(255,255,255,0.9)",
    tile: "rgba(255,255,255,0.8)",
    border: "rgba(255,255,255,0.95)",
    ink: "#0b2a45",
    soft: "#3a5870",
    accent: "#07609f",
    tint: "rgba(10,112,188,0.14)",
    hover: "rgba(255,255,255,0.55)",
    warn: "#8f3a05",
    warnBg: "rgba(240,120,40,0.2)",
    danger: "#b3261c",
    dangerBg: "rgba(212,42,28,0.12)",
    gain: "#0b5226",
    gainBg: "rgba(34,160,84,0.14)",
    priorityHigh: "#e0483c",
    priorityMedium: "#e89a1c",
    priorityLow: "#0a9fd8",
    rowGloss: "linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 70%)",
    rowMix: "17%",
    rowMixStrong: "27%",
    gel: `${AQUA_GLOSS}, radial-gradient(90% 60% at 50% 118%, rgba(120,225,255,0.55), rgba(120,225,255,0) 70%), linear-gradient(180deg, #2b9ee4 0%, #0b5dab 100%)`,
    glow: "rgba(11,93,171,0.55)",
    chipGloss: "linear-gradient(180deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.22) 48%, rgba(255,255,255,0) 52%)",
    seg: "#ffffff",
    active: "linear-gradient(180deg, #ffffff 0%, #d4f1fa 100%)",
    ring: "0 0 0 1px rgba(10,112,188,0.35), 0 2px 6px rgba(6,68,120,0.18)",
    line: "rgba(11,42,69,0.12)",
    lineStrong: "rgba(11,42,69,0.18)",
    // Ombre portée sous les panneaux seulement : sur les côtés, entre deux panneaux, elle
    // doublait et grisait le ciel (retour d'essai du 28/09).
    shadow: "0 14px 22px -16px rgba(11,93,171,0.3), 0 1px 2px rgba(11,93,171,0.05)",
    note: "rgba(255,243,184,0.75)",
    bubble:
      "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 18%, rgba(255,255,255,0.08) 55%, rgba(255,255,255,0.35) 100%)",
    bubbleEdge: "rgba(255,255,255,0.7)",
    star: "#ffffff",
    motif: "#ffffff",
    scrim: "rgba(11,42,69,0.28)",
    focus: "#0b5dab",
    chipNeutral: "#5a7d99",
    starGlow: "rgba(255,255,255,0.9)",
    fieldBorder: "rgba(10,112,188,0.28)",
    lockGlow: "radial-gradient(45% 40% at 50% 42%, rgba(255,255,255,0.55), rgba(255,255,255,0) 70%)",
    lockShadow: "0 20px 60px rgba(6,68,120,0.22), inset 0 1px 0 rgba(255,255,255,0.7)",
    clockGlow: "rgba(255,255,255,0.8)",
    scrollbar: "rgba(6,98,124,0.26)",
    // Boutons secondaires façon Aero : haut blanc, reflet net à mi-hauteur, bas eau turquoise.
    button: "linear-gradient(180deg, #ffffff 0%, #effbfd 45%, #cdeff5 55%, #e3f7fa 100%)",
    buttonBorder: "rgba(8,136,160,0.32)",
    buttonInk: "#065d74",
    track: "rgba(20,160,190,0.13)",
    raised: "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(239,251,253,0.9) 48%, rgba(206,240,246,0.88) 52%, rgba(226,247,250,0.92) 100%)",
    heading: "#07627c",
    row: "#1f95dc",
    rowEdge: "40%",
    navTint: "rgba(30,180,190,0.1)",
    // Vert prairie brillant, comme les barres de progression des années 2000.
    fresh: `${AQUA_GLOSS}, radial-gradient(90% 60% at 50% 118%, rgba(200,255,140,0.6), rgba(200,255,140,0) 70%), linear-gradient(180deg, #5ec84a 0%, #1f8f3a 100%)`,
    freshGlow: "rgba(31,143,58,0.5)",
    barEdge: "linear-gradient(90deg, rgba(42,159,230,0) 0%, rgba(42,159,230,0.85) 14%, rgba(46,196,214,0.85) 50%, rgba(92,201,74,0.85) 86%, rgba(92,201,74,0) 100%)",
    skyInk: "#0b2a45",
    skySoft: "#3a5870",
    skyShadow: "none",
    waveTint: "#2ec4d6",
  },
};

export const NUIT_ETOILEE: ThemeDef = {
  id: "nuit-etoilee",
  name: tr("Nuit étoilée"),
  family: "Nuit",
  dark: true,
  motif: "etoiles",
  description: tr("Bleu nuit et étoiles"),
  swatches: ["#050b2a", "#173f96", "#3c92f2", "#8adbff"],
  tokens: {
    ...COMMON,
    sky: "radial-gradient(55% 45% at 85% 8%, rgba(140,100,255,0.35), rgba(140,100,255,0) 70%), radial-gradient(55% 45% at 8% 95%, rgba(0,190,255,0.28), rgba(0,190,255,0) 70%), linear-gradient(180deg, #050b2a 0%, #0c1c56 55%, #173f96 100%)",
    windowBg: "#0c1c56",
    bar: "linear-gradient(180deg, rgba(40,72,160,0.7) 0%, rgba(10,22,64,0.62) 100%)",
    barSolid: "#142a70",
    card: "linear-gradient(180deg, rgba(160,200,255,0.14) 0%, rgba(160,200,255,0) 38%), rgba(12,26,72,0.62)",
    cardSolid: "#0f2257",
    popover: "linear-gradient(180deg, rgba(160,200,255,0.16) 0%, rgba(160,200,255,0) 40%), rgba(12,26,72,0.95)",
    popoverSolid: "#0f2257",
    field: "rgba(8,18,52,0.78)",
    tile: "rgba(30,56,130,0.6)",
    border: "rgba(150,200,255,0.3)",
    ink: "#eef5ff",
    soft: "#b4c8e8",
    accent: "#8adbff",
    tint: "rgba(114,210,255,0.18)",
    hover: "rgba(120,170,255,0.14)",
    warn: "#ffc08f",
    warnBg: "rgba(255,140,60,0.2)",
    danger: "#ff9b90",
    dangerBg: "rgba(255,120,100,0.16)",
    gain: "#8be8aa",
    gainBg: "rgba(90,220,140,0.16)",
    priorityHigh: "#ff8a7e",
    priorityMedium: "#ffc070",
    priorityLow: "#7fd0ff",
    rowGloss: "linear-gradient(180deg, rgba(170,210,255,0.12) 0%, rgba(170,210,255,0) 70%)",
    rowMix: "20%",
    rowMixStrong: "32%",
    gel: `${GLOSS}, linear-gradient(180deg, #3c92f2 0%, #1a45b5 100%)`,
    glow: "rgba(70,150,255,0.6)",
    seg: "rgba(110,170,255,0.32)",
    active: "linear-gradient(180deg, rgba(90,150,255,0.5) 0%, rgba(40,80,200,0.4) 100%)",
    ring: "0 0 0 1px rgba(140,200,255,0.45), 0 0 12px rgba(90,160,255,0.35)",
    line: "rgba(200,220,255,0.14)",
    lineStrong: "rgba(200,220,255,0.25)",
    shadow: "0 10px 30px rgba(0,0,0,0.35)",
    note: "rgba(255,215,110,0.12)",
    bubble:
      "radial-gradient(circle at 32% 28%, rgba(200,230,255,0.7) 0%, rgba(120,180,255,0.2) 20%, rgba(80,140,255,0.05) 55%, rgba(140,190,255,0.25) 100%)",
    bubbleEdge: "rgba(150,200,255,0.35)",
    star: "#ffffff",
    motif: "#ffffff",
    scrim: "rgba(2,6,24,0.55)",
    focus: "#8adbff",
    chipNeutral: "#3f5aa6",
    starGlow: "rgba(180,220,255,0.9)",
    fieldBorder: "rgba(150,200,255,0.4)",
    lockGlow: "radial-gradient(45% 40% at 50% 42%, rgba(70,130,255,0.35), rgba(70,130,255,0) 70%)",
    lockShadow: "0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
    clockGlow: "rgba(120,180,255,0.5)",
    scrollbar: "rgba(200,220,255,0.25)",
    button: "rgba(8,18,52,0.78)",
    buttonBorder: "rgba(150,200,255,0.3)",
    buttonInk: "#eef5ff",
    track: "rgba(8,18,52,0.78)",
    raised: "rgba(30,56,130,0.6)",
    heading: "#b4c8e8",
    row: "#8adbff",
    rowEdge: "28%",
    navTint: "rgba(0,0,0,0)",
    fresh: `${GLOSS}, linear-gradient(180deg, #3c92f2 0%, #1a45b5 100%)`,
    freshGlow: "rgba(70,150,255,0.6)",
    barEdge: "rgba(0,0,0,0)",
    skyInk: "#eef5ff",
    skySoft: "#b4c8e8",
    skyShadow: "none",
    waveTint: "#8adbff",
  },
};

// ——— Les 18 autres thèmes (galerie Themes.dc.html ; Prairie et Automne : Main.dc.html) ———

/** « #rrggbb » → [r, g, b]. */
function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Couleur « #rrggbb » avec une transparence. */
function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Mélange de deux couleurs : `t` est la part de `b` (de 0 à 1). */
function mix(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  return `#${ca.map((v, i) => Math.round(v + (cb[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Palette d'un thème, telle que dans la galerie des maquettes. */
interface Palette {
  id: ThemeId;
  name: string;
  family: ThemeFamily;
  dark?: boolean;
  motif: ThemeMotif;
  motifStroke?: boolean;
  description: string;
  swatches: string[];
  sky: string;
  windowBg: string;
  ink: string;
  soft: string;
  accent: string;
  /** Dégradé des boutons « gel », du haut vers le bas. */
  g1: string;
  g2: string;
  glow: string;
  /** Couleur des motifs du décor. */
  motifColor: string;
  /** Couleur la plus présente du ciel d'un thème sombre (barres, cartes, champs). */
  deep?: string;
  /** Valeurs reprises telles quelles des maquettes. */
  tokens?: Partial<ThemeTokens>;
}

/** Texte d'une couleur assez foncée sur `background` (contraste de 4,6 au moins). */
function readableInk(color: string, background: string): string {
  let c = color;
  for (let i = 0; i < 12 && contrast(parseColor(c), parseColor(background)) < 4.6; i++) c = mix(c, "#000000", 0.12);
  return c;
}

/**
 * Commandes d'un thème clair teintées de sa couleur (au lieu du blanc sur blanc) : boutons
 * secondaires en verre brillant, piste des onglets, tuiles en relief, titres de section, couleur
 * des lignes. Aussi pour un thème personnel dont la couleur change.
 */
export function lightControls(accent: string, row: string): Pick<ThemeTokens, "button" | "buttonBorder" | "buttonInk" | "track" | "raised" | "heading" | "row" | "rowEdge" | "navTint" | "fieldBorder" | "barEdge"> {
  const pale = (t: number) => mix(accent, "#ffffff", t);
  return {
    button: `linear-gradient(180deg, #ffffff 0%, ${pale(0.95)} 45%, ${pale(0.85)} 55%, ${pale(0.91)} 100%)`,
    buttonBorder: alpha(accent, 0.3),
    buttonInk: readableInk(accent, pale(0.85)),
    track: alpha(accent, 0.11),
    raised: `linear-gradient(180deg, rgba(255,255,255,0.94) 0%, ${alpha(pale(0.95), 0.9)} 48%, ${alpha(pale(0.86), 0.88)} 52%, ${alpha(pale(0.92), 0.92)} 100%)`,
    heading: accent,
    row,
    rowEdge: "40%",
    navTint: alpha(row, 0.08),
    fieldBorder: alpha(accent, 0.28),
    barEdge: `linear-gradient(90deg, ${alpha(row, 0)} 0%, ${alpha(row, 0.7)} 18%, ${alpha(accent, 0.7)} 82%, ${alpha(accent, 0)} 100%)`,
  };
}

/** Commandes d'un thème sombre : celles de Nuit étoilée, d'après ses propres couleurs. */
function darkControls(t: Pick<ThemeTokens, "field" | "border" | "ink" | "tile" | "soft" | "accent">): Pick<ThemeTokens, "button" | "buttonBorder" | "buttonInk" | "track" | "raised" | "heading" | "row" | "rowEdge" | "navTint"> {
  return { button: t.field, buttonBorder: t.border, buttonInk: t.ink, track: t.field, raised: t.tile, heading: t.soft, row: t.accent, rowEdge: "28%", navTint: "rgba(0,0,0,0)" };
}

/** Lueur de la couleur du thème au bas du verre des panneaux, glissée avant leur teinte de fond. */
function withGlow(card: string, color: string): string {
  const at = card.lastIndexOf(", ");
  if (at < 0) return card;
  const tone = mix(color, "#ffffff", 0.45);
  return `${card.slice(0, at)}, linear-gradient(180deg, ${alpha(tone, 0)} 55%, ${alpha(tone, 0.24)} 100%)${card.slice(at)}`;
}

/** Thème clair, sur le modèle de Frutiger. */
function lightTokens(p: Palette): ThemeTokens {
  const paper = mix(p.accent, "#ffffff", 0.95);
  const gel = `${GLOSS}, linear-gradient(180deg, ${p.g1} 0%, ${p.g2} 100%)`;
  return {
    ...FRUTIGER.tokens,
    skyInk: p.ink,
    skySoft: p.soft,
    waveTint: p.g1,
    sky: p.sky,
    windowBg: p.windowBg,
    barSolid: paper,
    cardSolid: mix(p.accent, "#ffffff", 0.92),
    popover: `linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 40%), ${alpha(paper, 0.95)}`,
    popoverSolid: paper,
    ink: p.ink,
    soft: p.soft,
    accent: p.accent,
    tint: alpha(p.accent, 0.14),
    gel,
    glow: p.glow,
    fresh: gel,
    freshGlow: p.glow,
    active: `linear-gradient(180deg, #ffffff 0%, ${mix(p.accent, "#ffffff", 0.84)} 100%)`,
    ring: `0 0 0 1px ${alpha(p.accent, 0.35)}, 0 2px 6px ${alpha(p.g2, 0.18)}`,
    line: alpha(p.ink, 0.12),
    lineStrong: alpha(p.ink, 0.18),
    shadow: `0 14px 22px -16px ${alpha(p.g2, 0.3)}, 0 1px 2px ${alpha(p.g2, 0.05)}`,
    motif: p.motifColor,
    scrim: alpha(p.ink, 0.28),
    focus: p.accent,
    chipNeutral: p.soft,
    lockShadow: `0 20px 60px ${alpha(p.g2, 0.22)}, inset 0 1px 0 rgba(255,255,255,0.7)`,
    scrollbar: alpha(p.ink, 0.22),
    ...lightControls(p.accent, p.g1),
    ...p.tokens,
    card: withGlow(p.tokens?.card ?? LIGHT_CARD, p.g1),
  };
}

/** Thème sombre, sur le modèle de Nuit étoilée. */
function darkTokens(p: Palette): ThemeTokens {
  const deep = p.deep ?? p.windowBg;
  const light = mix(p.accent, "#ffffff", 0.5);
  const panel = mix(deep, "#000000", 0.25);
  return {
    ...NUIT_ETOILEE.tokens,
    skyInk: p.ink,
    skySoft: p.soft,
    waveTint: p.g1,
    sky: p.sky,
    windowBg: p.windowBg,
    bar: `linear-gradient(180deg, ${alpha(mix(deep, p.g1, 0.3), 0.7)} 0%, ${alpha(panel, 0.62)} 100%)`,
    barSolid: mix(deep, "#ffffff", 0.06),
    card: `linear-gradient(180deg, ${alpha(light, 0.14)} 0%, ${alpha(light, 0)} 38%), ${alpha(panel, 0.62)}`,
    cardSolid: mix(deep, "#000000", 0.12),
    popover: `linear-gradient(180deg, ${alpha(light, 0.16)} 0%, ${alpha(light, 0)} 40%), ${alpha(panel, 0.95)}`,
    popoverSolid: mix(deep, "#000000", 0.12),
    field: alpha(mix(deep, "#000000", 0.5), 0.78),
    tile: alpha(mix(deep, p.g1, 0.3), 0.6),
    border: alpha(light, 0.3),
    ink: p.ink,
    soft: p.soft,
    accent: p.accent,
    tint: alpha(p.accent, 0.18),
    hover: alpha(p.accent, 0.14),
    rowGloss: `linear-gradient(180deg, ${alpha(light, 0.12)} 0%, ${alpha(light, 0)} 70%)`,
    gel: `${GLOSS}, linear-gradient(180deg, ${p.g1} 0%, ${p.g2} 100%)`,
    glow: p.glow,
    fresh: `${GLOSS}, linear-gradient(180deg, ${p.g1} 0%, ${p.g2} 100%)`,
    freshGlow: p.glow,
    seg: alpha(p.accent, 0.3),
    active: `linear-gradient(180deg, ${alpha(p.g1, 0.5)} 0%, ${alpha(p.g2, 0.4)} 100%)`,
    ring: `0 0 0 1px ${alpha(p.accent, 0.45)}, 0 0 12px ${alpha(p.g1, 0.35)}`,
    line: alpha(p.ink, 0.14),
    lineStrong: alpha(p.ink, 0.25),
    bubble: `radial-gradient(circle at 32% 28%, ${alpha(light, 0.7)} 0%, ${alpha(p.accent, 0.2)} 20%, ${alpha(p.accent, 0.05)} 55%, ${alpha(p.accent, 0.25)} 100%)`,
    bubbleEdge: alpha(p.accent, 0.35),
    motif: p.motifColor,
    scrim: alpha(mix(deep, "#000000", 0.7), 0.55),
    focus: p.accent,
    chipNeutral: mix(deep, p.g1, 0.4),
    starGlow: alpha(light, 0.9),
    fieldBorder: alpha(light, 0.4),
    lockGlow: `radial-gradient(45% 40% at 50% 42%, ${alpha(p.g1, 0.35)}, ${alpha(p.g1, 0)} 70%)`,
    clockGlow: alpha(p.accent, 0.5),
    scrollbar: alpha(p.ink, 0.25),
    ...darkControls({ field: alpha(mix(deep, "#000000", 0.5), 0.78), border: alpha(light, 0.3), ink: p.ink, tile: alpha(mix(deep, p.g1, 0.3), 0.6), soft: p.soft, accent: p.accent }),
    ...p.tokens,
  };
}

function theme(p: Palette): ThemeDef {
  return {
    id: p.id,
    name: p.name,
    family: p.family,
    dark: p.dark ?? false,
    motif: p.motif,
    motifStroke: p.motifStroke,
    description: p.description,
    swatches: p.swatches,
    tokens: p.dark ? darkTokens(p) : lightTokens(p),
  };
}

export const PRAIRIE = theme({
  id: "prairie",
  name: tr("Prairie"),
  family: "Couleurs et nature",
  motif: "feuilles",
  description: tr("Collines vertes sous le ciel"),
  swatches: ["#34a8e6", "#86cf49", "#1b6810", "#eefaff"],
  sky: "radial-gradient(130% 55% at 25% 112%, #58b52c 0%, #58b52c 55%, rgba(88,181,44,0) 55.4%), radial-gradient(100% 45% at 88% 110%, #86cf49 0%, #86cf49 58%, rgba(134,207,73,0) 58.4%), radial-gradient(70% 40% at 80% 0%, rgba(255,255,255,0.7), rgba(255,255,255,0) 70%), linear-gradient(180deg, #34a8e6 0%, #9edcf9 45%, #eefaff 100%)",
  windowBg: "#9edcf9",
  ink: "#12321a",
  soft: "#3a5a40",
  accent: "#1d6e10",
  g1: "#47ab27",
  g2: "#1b6810",
  glow: "rgba(27,104,16,0.5)",
  motifColor: "#2f8f1c",
  tokens: {
    card: "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 38%), rgba(255,255,255,0.64)",
    tint: "rgba(31,125,18,0.14)",
  },
});

export const LAGON = theme({
  id: "lagon",
  name: tr("Lagon"),
  family: "Couleurs et nature",
  motif: "bulles",
  description: tr("Eau turquoise et corail"),
  swatches: ["#13bcd4", "#7fe6e0", "#ff8a65", "#fdf1d6"],
  sky: "radial-gradient(70% 45% at 85% 0%, rgba(255,255,255,0.6), rgba(255,255,255,0) 70%), linear-gradient(180deg, #13bcd4 0%, #7fe6e0 55%, #fdf1d6 100%)",
  windowBg: "#7fe6e0",
  ink: "#073b44",
  soft: "#2e5f66",
  accent: "#0a6875",
  g1: "#ff8a65",
  g2: "#d2432b",
  glow: "rgba(216,69,44,0.55)",
  motifColor: "#ffffff",
});

export const TROPIQUES = theme({
  id: "tropiques",
  name: tr("Tropiques"),
  family: "Couleurs et nature",
  motif: "feuilles",
  description: tr("Jungle, mangue et soleil"),
  swatches: ["#1fbfa2", "#8ee07a", "#ff9f1c", "#f7d774"],
  sky: "radial-gradient(70% 50% at 85% 10%, rgba(255,220,120,0.85), rgba(255,220,120,0) 70%), linear-gradient(180deg, #1fbfa2 0%, #8ee07a 55%, #f7d774 100%)",
  windowBg: "#8ee07a",
  ink: "#0f3a28",
  soft: "#34604b",
  accent: "#0b6b4a",
  g1: "#fc9d1c",
  g2: "#c54f09",
  glow: "rgba(217,87,10,0.55)",
  motifColor: "#0f7a45",
});

export const AURORE_BOREALE = theme({
  id: "aurore-boreale",
  name: tr("Aurore boréale"),
  family: "Couleurs et nature",
  dark: true,
  motif: "etoiles",
  description: tr("Voiles verts et violets"),
  swatches: ["#07142e", "#50ffaa", "#aa5aff", "#123b5a"],
  sky: "radial-gradient(80% 50% at 30% 20%, rgba(80,255,170,0.45), rgba(80,255,170,0) 70%), radial-gradient(60% 45% at 75% 15%, rgba(170,90,255,0.45), rgba(170,90,255,0) 70%), linear-gradient(180deg, #07142e 0%, #0c2a4a 60%, #123b5a 100%)",
  windowBg: "#0c2a4a",
  ink: "#eafcff",
  soft: "#a9cfe0",
  accent: "#7ff5c8",
  g1: "#35d69f",
  g2: "#117384",
  glow: "rgba(60,230,170,0.6)",
  motifColor: "#ffffff",
});

export const PRINTEMPS = theme({
  id: "printemps",
  name: tr("Printemps"),
  family: "Saisons",
  motif: "petales",
  description: tr("Auto : 20 mars → 20 juin"),
  swatches: ["#bfe8ff", "#fde2ec", "#f07aab", "#e3f7cf"],
  sky: "linear-gradient(180deg, #bfe8ff 0%, #fde2ec 55%, #e3f7cf 100%)",
  windowBg: "#fde2ec",
  ink: "#3a1f33",
  soft: "#6b4a5f",
  accent: "#a8326a",
  g1: "#f07aab",
  g2: "#b8346c",
  glow: "rgba(184,52,108,0.5)",
  motifColor: "#f59bbf",
});

export const ETE = theme({
  id: "ete",
  name: tr("Été"),
  family: "Saisons",
  motif: "bulles",
  description: tr("Auto : 21 juin → 22 sept."),
  swatches: ["#1fa6f0", "#7fd6ff", "#ffa92e", "#ffe6a8"],
  sky: "radial-gradient(60% 45% at 80% 8%, rgba(255,240,150,0.95), rgba(255,240,150,0) 65%), linear-gradient(180deg, #1fa6f0 0%, #7fd6ff 50%, #ffe6a8 82%, #ffd27a 100%)",
  windowBg: "#7fd6ff",
  ink: "#0c2f4a",
  soft: "#3a5a72",
  accent: "#0a5e99",
  g1: "#f2a12c",
  g2: "#bd580a",
  glow: "rgba(217,101,11,0.55)",
  motifColor: "#ffffff",
  // Rouge des erreurs un peu plus foncé : lisible sur le bleu vif du ciel.
  tokens: { danger: "#af251b" },
});

export const AUTOMNE = theme({
  id: "automne",
  name: tr("Automne"),
  family: "Saisons",
  motif: "feuilles",
  description: tr("Auto : 23 sept. → 20 déc."),
  swatches: ["#f7cd7a", "#efa059", "#983b0c", "#a8452a"],
  sky: "radial-gradient(60% 45% at 82% 4%, rgba(255,240,190,0.95), rgba(255,240,190,0) 70%), linear-gradient(180deg, #f7cd7a 0%, #efa059 45%, #d9713c 75%, #a8452a 100%)",
  windowBg: "#efa059",
  ink: "#3a1a0a",
  soft: "#6a3b22",
  accent: "#8f3709",
  g1: "#e07833",
  g2: "#983b0c",
  glow: "rgba(152,59,12,0.5)",
  motifColor: "#b8481c",
  tokens: {
    bar: "linear-gradient(180deg, rgba(255,250,240,0.9) 0%, rgba(255,244,228,0.62) 100%)",
    card: "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 38%), rgba(255,247,236,0.7)",
    field: "rgba(255,251,245,0.92)",
    tile: "rgba(255,250,242,0.85)",
    border: "rgba(255,250,240,0.95)",
    tint: "rgba(168,65,12,0.14)",
    warn: "#8a1f0c",
    danger: "#9f2219",
    warnBg: "rgba(220,60,30,0.18)",
    seg: "#fffaf3",
    note: "rgba(255,236,170,0.8)",
    bubble:
      "radial-gradient(circle at 32% 28%, rgba(255,245,220,0.95) 0%, rgba(255,220,160,0.35) 20%, rgba(255,200,140,0.08) 55%, rgba(255,230,190,0.35) 100%)",
    bubbleEdge: "rgba(255,240,210,0.7)",
  },
});

export const HIVER = theme({
  id: "hiver",
  name: tr("Hiver"),
  family: "Saisons",
  motif: "flocons",
  motifStroke: true,
  description: tr("Auto : 21 déc. → 19 mars"),
  swatches: ["#9fd3f5", "#dff1fc", "#2462a8", "#ffffff"],
  sky: "linear-gradient(180deg, #9fd3f5 0%, #dff1fc 55%, #ffffff 100%)",
  windowBg: "#dff1fc",
  ink: "#10304a",
  soft: "#45627a",
  accent: "#1f5f99",
  g1: "#5eaee8",
  g2: "#2462a8",
  glow: "rgba(36,98,168,0.5)",
  motifColor: "#6aa8da",
});

export const NOEL = theme({
  id: "noel",
  name: tr("Noël"),
  family: "Fêtes",
  dark: true,
  motif: "flocons",
  motifStroke: true,
  description: tr("Auto : 1er → 25 déc."),
  swatches: ["#145c3f", "#e8403a", "#ffd36b", "#fff8ec"],
  sky: "radial-gradient(60% 50% at 50% 0%, rgba(255,220,150,0.35), rgba(255,220,150,0) 70%), linear-gradient(180deg, #0f3d2e 0%, #145c3f 55%, #1f7a4f 100%)",
  windowBg: "#145c3f",
  deep: "#0f3d2e",
  ink: "#fff8ec",
  soft: "#e6d8bd",
  accent: "#ffd36b",
  g1: "#e8403a",
  g2: "#a3161a",
  glow: "rgba(232,64,58,0.6)",
  motifColor: "#ffffff",
});

export const NOUVEL_AN = theme({
  id: "nouvel-an",
  name: tr("Nouvel An"),
  family: "Fêtes",
  dark: true,
  motif: "etoiles",
  description: tr("Auto : 26 déc. → 2 janv."),
  swatches: ["#0b0b24", "#2b2560", "#e0a82e", "#fffaf0"],
  sky: "radial-gradient(50% 40% at 50% 0%, rgba(255,215,120,0.35), rgba(255,215,120,0) 70%), linear-gradient(180deg, #0b0b24 0%, #1c1845 60%, #2b2560 100%)",
  windowBg: "#1c1845",
  ink: "#fffaf0",
  soft: "#d8d0f0",
  accent: "#ffd76b",
  g1: "#e0a82e",
  g2: "#94620a",
  glow: "rgba(240,190,70,0.6)",
  motifColor: "#ffd76b",
  tokens: { star: "#ffe9b0" },
});

export const SAINT_VALENTIN = theme({
  id: "saint-valentin",
  name: tr("Saint-Valentin"),
  family: "Fêtes",
  motif: "coeurs",
  description: tr("Auto : 7 → 14 févr."),
  swatches: ["#ffb3c7", "#ff5a8a", "#c2185b", "#fff0f3"],
  sky: "linear-gradient(180deg, #ffb3c7 0%, #ffd6e0 50%, #fff0f3 100%)",
  windowBg: "#ffd6e0",
  ink: "#4a0f24",
  soft: "#7a3a50",
  accent: "#b0164f",
  g1: "#ff5a8a",
  g2: "#c2185b",
  glow: "rgba(194,24,91,0.5)",
  motifColor: "#ff6f98",
});

export const PAQUES = theme({
  id: "paques",
  name: tr("Pâques"),
  family: "Fêtes",
  motif: "oeufs",
  description: tr("Auto : semaine de Pâques"),
  swatches: ["#cdeeff", "#f3e8ff", "#9b8cff", "#fff6cc"],
  sky: "linear-gradient(180deg, #cdeeff 0%, #f3e8ff 50%, #fff6cc 100%)",
  windowBg: "#f3e8ff",
  ink: "#2e2a4a",
  soft: "#5a5577",
  accent: "#5a45c8",
  g1: "#9b8cff",
  g2: "#5f49d0",
  glow: "rgba(95,73,208,0.5)",
  motifColor: "#ffd36b",
});

export const HALLOWEEN = theme({
  id: "halloween",
  name: tr("Halloween"),
  family: "Fêtes",
  dark: true,
  motif: "chauvesouris",
  description: tr("Auto : 24 → 31 oct."),
  swatches: ["#1b0f33", "#3a1a4f", "#ff8c1a", "#ffd98a"],
  sky: "radial-gradient(22% 30% at 82% 22%, #fff1c2 0%, #ffd98a 55%, rgba(255,217,138,0) 58%), linear-gradient(180deg, #1b0f33 0%, #3a1a4f 55%, #5a2a2a 100%)",
  windowBg: "#3a1a4f",
  deep: "#2a1440",
  ink: "#fff3e6",
  soft: "#d9c2e6",
  accent: "#ffb04d",
  g1: "#ff8c1a",
  g2: "#c24c08",
  glow: "rgba(255,140,26,0.6)",
  motifColor: "#f28a2e",
});

export const ZEN = theme({
  id: "zen",
  name: tr("Zen"),
  family: "Humeurs",
  motif: "bulles",
  description: tr("Auto : humeur « calme »"),
  swatches: ["#dfeee4", "#e9e2d3", "#77a888", "#3a6a4e"],
  sky: "linear-gradient(180deg, #dfeee4 0%, #eef3e8 55%, #e9e2d3 100%)",
  windowBg: "#eef3e8",
  ink: "#22352b",
  soft: "#52665a",
  accent: "#3a6a4e",
  g1: "#77a888",
  g2: "#3a6a4e",
  glow: "rgba(58,106,78,0.45)",
  motifColor: "#9ab5a3",
  tokens: {
    bubble:
      "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(210,230,215,0.4) 18%, rgba(154,181,163,0.1) 55%, rgba(154,181,163,0.35) 100%)",
    bubbleEdge: "rgba(154,181,163,0.55)",
  },
});

export const ENERGIE = theme({
  id: "energie",
  name: tr("Énergie"),
  family: "Humeurs",
  motif: "etoiles",
  description: tr("Auto : humeur « motivé »"),
  swatches: ["#ffcf3f", "#ff8a3d", "#ff4f6d", "#b8173c"],
  sky: "radial-gradient(60% 50% at 20% 10%, rgba(255,255,255,0.5), rgba(255,255,255,0) 60%), linear-gradient(135deg, #ffcf3f 0%, #ff8a3d 50%, #ff4f6d 100%)",
  windowBg: "#ff8a3d",
  ink: "#3a0d0d",
  soft: "#6b2a22",
  accent: "#a3122f",
  g1: "#ff4f6d",
  g2: "#b8173c",
  glow: "rgba(184,23,60,0.55)",
  motifColor: "#ffffff",
  tokens: { danger: "#a5231a" },
});

export const COCON = theme({
  id: "cocon",
  name: tr("Cocon"),
  family: "Humeurs",
  motif: "bulles",
  description: tr("Auto : humeur « fatigué »"),
  swatches: ["#ffd9c4", "#f3d9f0", "#c09af0", "#fff4e6"],
  sky: "linear-gradient(180deg, #ffd9c4 0%, #f3d9f0 55%, #fff4e6 100%)",
  windowBg: "#f3d9f0",
  ink: "#3e2433",
  soft: "#6e5063",
  accent: "#7a45b8",
  g1: "#c09af0",
  g2: "#7f52c2",
  glow: "rgba(127,82,194,0.5)",
  motifColor: "#ffffff",
});

export const BULLES_IRISEES = theme({
  id: "bulles-irisees",
  name: tr("Bulles irisées"),
  family: "Humeurs",
  motif: "bulles",
  description: tr("Reflets nacrés de bulle de savon"),
  swatches: ["#d7f5ff", "#f3dcff", "#fff3d1", "#7a5cf0"],
  sky: "linear-gradient(135deg, #d7f5ff 0%, #f3dcff 35%, #fff3d1 65%, #d9ffe9 100%)",
  windowBg: "#f3dcff",
  ink: "#243049",
  soft: "#55607a",
  accent: "#4a4ad0",
  g1: "#4fb4ff",
  g2: "#7a5cf0",
  glow: "rgba(122,92,240,0.5)",
  motifColor: "#b8a8ff",
  tokens: {
    bubble:
      "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(200,230,255,0.45) 18%, rgba(255,205,245,0.18) 50%, rgba(255,240,190,0.3) 75%, rgba(190,255,225,0.5) 100%)",
    bubbleEdge: "rgba(184,168,255,0.6)",
  },
});

export const ABYSSES = theme({
  id: "abysses",
  name: tr("Abysses"),
  family: "Nuit",
  dark: true,
  motif: "bulles",
  description: tr("Fond marin lumineux"),
  swatches: ["#010b18", "#03324a", "#17c5dc", "#5ff0ff"],
  sky: "radial-gradient(50% 40% at 50% 0%, rgba(80,220,255,0.35), rgba(80,220,255,0) 70%), linear-gradient(180deg, #03324a 0%, #03172b 60%, #010b18 100%)",
  windowBg: "#03172b",
  ink: "#e6fbff",
  soft: "#9cc7d6",
  accent: "#5ff0ff",
  g1: "#17c5dc",
  g2: "#0a5f94",
  glow: "rgba(40,220,240,0.6)",
  motifColor: "#5ff0ff",
});

export const LAVANDE = theme({
  id: "lavande",
  name: tr("Lavande"),
  family: "Couleurs et nature",
  motif: "petales",
  description: tr("Champs de lavande et lilas"),
  swatches: ["#9b87e0", "#c4b5f0", "#5b3fb3", "#fbf7ff"],
  sky: "radial-gradient(70% 45% at 85% 0%, rgba(255,255,255,0.6), rgba(255,255,255,0) 70%), radial-gradient(55% 40% at 8% 100%, rgba(255,214,240,0.5), rgba(255,214,240,0) 70%), linear-gradient(180deg, #9b87e0 0%, #c4b5f0 45%, #ece5ff 82%, #fbf7ff 100%)",
  windowBg: "#c4b5f0",
  ink: "#2a1f4a",
  soft: "#524572",
  accent: "#583aae",
  g1: "#8f6fe0",
  g2: "#5532a8",
  glow: "rgba(85,50,168,0.5)",
  motifColor: "#f6eeff",
  tokens: { danger: "#9c1d15" },
});

export const TERRACOTTA = theme({
  id: "terracotta",
  name: tr("Terracotta"),
  family: "Couleurs et nature",
  motif: "feuilles",
  description: tr("Terre cuite, sable et olivier"),
  swatches: ["#d9825b", "#eab08e", "#7b8c4a", "#fbf1e6"],
  sky: "radial-gradient(70% 45% at 85% 0%, rgba(255,240,220,0.65), rgba(255,240,220,0) 70%), linear-gradient(180deg, #d9825b 0%, #eab08e 40%, #f6dcc6 78%, #fbf1e6 100%)",
  windowBg: "#eab08e",
  ink: "#3b1f14",
  soft: "#664031",
  accent: "#953a1a",
  g1: "#d4693c",
  g2: "#963814",
  glow: "rgba(150,56,20,0.5)",
  motifColor: "#6f8240",
});

export const ARDOISE = theme({
  id: "ardoise",
  name: tr("Ardoise"),
  family: "Humeurs",
  motif: "bulles",
  description: tr("Gris ardoise et bleu acier"),
  swatches: ["#6f8296", "#9fb0c1", "#2a5280", "#f3f6f8"],
  sky: "radial-gradient(70% 45% at 85% 0%, rgba(255,255,255,0.55), rgba(255,255,255,0) 70%), linear-gradient(180deg, #6f8296 0%, #9fb0c1 45%, #dfe6ec 82%, #f3f6f8 100%)",
  windowBg: "#9fb0c1",
  ink: "#1c2733",
  soft: "#3f4e61",
  accent: "#28507d",
  g1: "#4f7fb0",
  g2: "#2b4f78",
  glow: "rgba(43,79,120,0.5)",
  motifColor: "#ffffff",
  tokens: { danger: "#921b13" },
});

export const VELOURS = theme({
  id: "velours",
  name: tr("Velours"),
  family: "Nuit",
  dark: true,
  motif: "etoiles",
  description: tr("Bordeaux profond et or rose"),
  swatches: ["#2a0712", "#6b1a30", "#d9566f", "#ffb3a1"],
  sky: "radial-gradient(55% 45% at 85% 8%, rgba(255,170,150,0.25), rgba(255,170,150,0) 70%), radial-gradient(50% 40% at 8% 95%, rgba(217,86,111,0.22), rgba(217,86,111,0) 70%), linear-gradient(180deg, #2a0712 0%, #4a0f22 55%, #6b1a30 100%)",
  windowBg: "#4a0f22",
  deep: "#3a0b1a",
  ink: "#fff0f2",
  soft: "#e6c3cc",
  accent: "#ffb3a1",
  g1: "#d9566f",
  g2: "#8f1f3a",
  glow: "rgba(217,86,111,0.55)",
  motifColor: "#ffcfbf",
});

export const ONYX = theme({
  id: "onyx",
  name: tr("Onyx"),
  family: "Nuit",
  dark: true,
  motif: "bulles",
  description: tr("Noir profond, verre fumé et reflets argentés"),
  swatches: ["#000000", "#16181d", "#4a4f5a", "#b8d4ff"],
  sky: "radial-gradient(60% 45% at 82% 0%, rgba(200,214,240,0.16), rgba(200,214,240,0) 70%), radial-gradient(50% 40% at 8% 100%, rgba(120,150,210,0.12), rgba(120,150,210,0) 70%), linear-gradient(180deg, #000000 0%, #08090c 55%, #15171c 100%)",
  windowBg: "#08090c",
  deep: "#0e1014",
  ink: "#f4f6fa",
  soft: "#b8bec9",
  accent: "#b8d4ff",
  g1: "#50555f",
  g2: "#16181d",
  glow: "rgba(176,204,255,0.35)",
  motifColor: "#d7dde8",
});

// ——— Famille Signature Aqueli ———

/** Palette d'un thème Signature : le ciel en cinq teintes, du haut (sous les titres) vers le bas. */
interface SignatureSpec {
  id: ThemeId;
  name: string;
  description: string;
  swatches: string[];
  dark?: boolean;
  motif?: ThemeMotif;
  /** Ciel à 0, 20, 50, 80 et 100 % de la hauteur ; le haut porte les titres (texte `skyInk`). */
  sky: [string, string, string, string, string];
  /** Lueur claire du ciel (bas à gauche, reflets). */
  light: string;
  /** Touche chaude en haut à droite (soleil, aurore). */
  warm: string;
  /** Lueur fraîche au bas du ciel (menthe, turquoise). */
  mint: string;
  /** Seconde teinte des vagues des cartes. */
  wave: string;
  /** Prairie au bas du ciel (vert doux des fonds d'écran d'autrefois), si le thème en a une. */
  meadow?: string;
  ink: string;
  soft: string;
  accent: string;
  heading: string;
  g1: string;
  g2: string;
  row: string;
  skyInk: string;
  skySoft: string;
}

/**
 * Vagues et voile de lumière du ciel Signature, en SVG : un voile flou en biais (aurore), puis
 * trois vagues claires superposées, chacune soulignée d'un liseré. `strength` : 1 pour un ciel
 * clair, moins pour un ciel sombre.
 */
function signatureWaves(strength: number, meadow?: string): string {
  const o = (v: number) => (v * strength).toFixed(3);
  // Les deux vagues du bas prennent la teinte de la prairie quand le thème en a une.
  const low = meadow ?? "#ffffff";
  const lowAlpha = (v: number, green: number) => (meadow ? green : v * strength).toFixed(3);
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='none'>" +
    "<defs><filter id='f' x='-10%' y='-60%' width='120%' height='220%'><feGaussianBlur stdDeviation='22'/></filter></defs>" +
    `<path d='M-60 360 C 280 250 620 450 980 320 S 1480 200 1660 300' fill='none' stroke='#ffffff' stroke-opacity='${o(0.22)}' stroke-width='90' filter='url(#f)'/>` +
    `<path d='M-60 250 C 360 170 760 300 1160 210 S 1560 160 1660 200' fill='none' stroke='#ffffff' stroke-opacity='${o(0.12)}' stroke-width='50' filter='url(#f)'/>` +
    `<path d='M0 560 C 260 480 520 640 820 570 S 1350 440 1600 520 V900 H0 Z' fill='#ffffff' fill-opacity='${o(0.1)}'/>` +
    `<path d='M0 560 C 260 480 520 640 820 570 S 1350 440 1600 520' fill='none' stroke='#ffffff' stroke-opacity='${o(0.4)}' stroke-width='1.5' vector-effect='non-scaling-stroke'/>` +
    `<path d='M0 700 C 330 630 700 780 1050 700 S 1450 640 1600 690 V900 H0 Z' fill='${low}' fill-opacity='${lowAlpha(0.09, 0.2)}'/>` +
    `<path d='M0 700 C 330 630 700 780 1050 700 S 1450 640 1600 690' fill='none' stroke='#ffffff' stroke-opacity='${o(0.32)}' stroke-width='1.5' vector-effect='non-scaling-stroke'/>` +
    `<path d='M0 815 C 400 765 800 875 1200 805 S 1500 785 1600 795 V900 H0 Z' fill='${low}' fill-opacity='${lowAlpha(0.08, 0.34)}'/>` +
    "</svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
}

/**
 * Style Signature Aqueli (thème par défaut et ses variantes) : ciel lumineux et profond, titres
 * posés sur le ciel, panneaux de verre clair traversés d'un reflet en biais, lueur de couleur au
 * bas des cartes, boutons « gel » très brillants. La mise en page vient de src/styles/signature.css.
 */
function signature(s: SignatureSpec): ThemeDef {
  const [s0, s1, s2, s3, s4] = s.sky;
  const sky =
    `radial-gradient(32% 30% at 99% 4%, ${alpha(s.warm, s.dark ? 0.3 : 0.6)}, ${alpha(s.warm, 0)} 72%), ` +
    `radial-gradient(55% 34% at 42% -8%, rgba(255,255,255,${s.dark ? 0.06 : 0.2}), rgba(255,255,255,0) 70%), ` +
    `${signatureWaves(s.dark ? 0.45 : 1, s.meadow)}, ` +
    (s.meadow
      ? `radial-gradient(85% 34% at 70% 116%, ${alpha(s.meadow, 0.62)}, ${alpha(s.meadow, 0)} 72%), radial-gradient(55% 26% at 4% 112%, ${alpha(s.meadow, 0.42)}, ${alpha(s.meadow, 0)} 70%), `
      : "") +
    `radial-gradient(75% 55% at 18% 110%, ${alpha(s.mint, s.dark ? 0.35 : 0.65)}, ${alpha(s.mint, 0)} 70%), ` +
    `radial-gradient(60% 45% at 92% 100%, ${alpha(s.light, 0.45)}, ${alpha(s.light, 0)} 70%), ` +
    `linear-gradient(150deg, ${alpha(mix(s0, "#000000", 0.25), 0.4)} 0%, ${alpha(s0, 0)} 40%), ` +
    `linear-gradient(180deg, ${s0} 0%, ${s1} 20%, ${s2} 50%, ${s3} 80%, ${s4} 100%)`;
  const sheen = `linear-gradient(118deg, rgba(255,255,255,0) 56%, rgba(255,255,255,${s.dark ? 0.07 : 0.3}) 64%, rgba(255,255,255,0) 75%)`;
  const palette: Palette = {
    id: s.id,
    name: s.name,
    family: "Signature",
    dark: s.dark,
    motif: s.motif ?? (s.dark ? "etoiles" : "bulles"),
    description: s.description,
    swatches: s.swatches,
    sky,
    windowBg: s2,
    ink: s.ink,
    soft: s.soft,
    accent: s.accent,
    g1: s.g1,
    g2: s.g2,
    glow: alpha(s.g2, 0.55),
    motifColor: "#ffffff",
    deep: s1,
  };
  const base = s.dark ? darkTokens(palette) : lightTokens(palette);
  const gel = `${AQUA_GLOSS}, radial-gradient(90% 60% at 50% 118%, ${alpha(s.light, 0.6)}, ${alpha(s.light, 0)} 70%), linear-gradient(180deg, ${s.g1} 0%, ${s.g2} 100%)`;
  const tokens: ThemeTokens = s.dark
    ? {
        ...base,
        card: `${sheen}, linear-gradient(180deg, rgba(170,205,255,0.16) 0%, rgba(170,205,255,0) 40%), linear-gradient(180deg, ${alpha(s.light, 0)} 60%, ${alpha(s.light, 0.14)} 100%), ${alpha(mix(s1, "#000000", 0.35), 0.72)}`,
        bar: `linear-gradient(180deg, ${alpha(mix(s1, "#ffffff", 0.12), 0.78)} 0%, ${alpha(mix(s1, "#000000", 0.2), 0.7)} 100%)`,
        gel,
        glow: alpha(s.g1, 0.6),
        heading: s.heading,
        row: s.row,
        fresh: `${AQUA_GLOSS}, linear-gradient(180deg, #3fcf86 0%, #138a52 100%)`,
        freshGlow: "rgba(40,190,120,0.5)",
        barEdge: "rgba(0,0,0,0)",
        skyInk: s.skyInk,
        skySoft: s.skySoft,
        skyShadow: "0 1px 3px rgba(0,0,0,0.45)",
        waveTint: s.wave,
        shadow: "0 18px 34px -16px rgba(0,0,0,0.55)",
      }
    : {
        ...base,
        card: `${sheen}, linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 40%), linear-gradient(180deg, ${alpha(s.light, 0)} 58%, ${alpha(s.light, 0.24)} 100%), rgba(250,253,255,0.84)`,
        cardSolid: mix(s.accent, "#ffffff", 0.94),
        bar: "linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.66) 100%)",
        barSolid: mix(s.accent, "#ffffff", 0.95),
        border: "rgba(255,255,255,0.92)",
        gel,
        glow: alpha(s.g2, 0.55),
        button: "linear-gradient(180deg, #ffffff 0%, #f7fbff 46%, #ebf4fe 54%, #f5f9ff 100%)",
        buttonBorder: "rgba(255,255,255,0.95)",
        buttonInk: s.heading,
        heading: s.heading,
        row: s.row,
        rowEdge: "34%",
        rowMix: "14%",
        rowMixStrong: "24%",
        navTint: alpha(s.row, 0.06),
        active: `linear-gradient(180deg, #ffffff 0%, ${mix(s.accent, "#ffffff", 0.86)} 100%)`,
        fresh: `${AQUA_GLOSS}, radial-gradient(90% 60% at 50% 118%, rgba(190,255,215,0.6), rgba(190,255,215,0) 70%), linear-gradient(180deg, #3fcf86 0%, #10894e 100%)`,
        freshGlow: "rgba(16,137,78,0.5)",
        barEdge: "rgba(0,0,0,0)",
        skyInk: s.skyInk,
        skySoft: s.skySoft,
        waveTint: s.wave,
        skyShadow: s.skyInk === "#ffffff" ? `0 1px 3px ${alpha(mix(s0, "#000000", 0.5), 0.45)}` : "none",
        shadow: `0 20px 34px -18px ${alpha(s.g2, 0.5)}, 0 2px 6px ${alpha(s.g2, 0.08)}`,
        note: "rgba(255,240,170,0.86)",
      };
  return {
    id: s.id,
    name: s.name,
    family: "Signature",
    dark: s.dark ?? false,
    motif: palette.motif,
    description: s.description,
    swatches: s.swatches,
    tokens,
    skin: "signature",
  };
}

/** Aqua, le thème par défaut : le bleu classique d'Aqueli. */
export const AQUA = signature({
  id: "aqua",
  name: tr("Aqua"),
  description: tr("Thème par défaut, bleu lumineux"),
  swatches: ["#1767c8", "#3aa6f0", "#ffffff", "#2fc06e"],
  sky: ["#1566cc", "#1a74d4", "#2f99ea", "#5cc3f2", "#9fe6c8"],
  light: "#9ae6ff",
  warm: "#ffd58c",
  mint: "#7ff2cf",
  wave: "#4fdcc8",
  meadow: "#6fd36a",
  ink: "#0c2746",
  soft: "#3a5676",
  accent: "#0b5fc0",
  heading: "#0d3f78",
  g1: "#43a8ff",
  g2: "#0a5ed6",
  row: "#2b8de8",
  skyInk: "#ffffff",
  skySoft: "#ffffff",
});

export const JADE = signature({
  id: "jade",
  name: tr("Jade"),
  description: tr("Vert nature, frais et lumineux"),
  swatches: ["#0f6a3c", "#3fb46a", "#ffffff", "#9fe0b0"],
  motif: "feuilles",
  sky: ["#0d6238", "#137341", "#2fa45c", "#6fd08a", "#b4edc0"],
  light: "#c8ffb0",
  warm: "#ffe58c",
  mint: "#d4ff9a",
  wave: "#c5e85a",
  ink: "#0f2e1d",
  soft: "#36553f",
  accent: "#0d6a3a",
  heading: "#11522f",
  g1: "#3cc673",
  g2: "#0d7f41",
  row: "#26a85b",
  skyInk: "#ffffff",
  skySoft: "#f2fbf4",
});

export const GLYCINE = signature({
  id: "glycine",
  name: tr("Glycine"),
  description: tr("Violet et lavande"),
  swatches: ["#4325a8", "#8a6be0", "#ffffff", "#d7c9fa"],
  motif: "petales",
  sky: ["#3f22a2", "#5236bd", "#7f63dc", "#b39ef0", "#e2d8fb"],
  light: "#f0c8ff",
  warm: "#ffc9a8",
  mint: "#ffc4ec",
  wave: "#ff9ad5",
  ink: "#24164a",
  soft: "#4f4472",
  accent: "#5432c0",
  heading: "#3d2690",
  g1: "#9a7bff",
  g2: "#5531c9",
  row: "#7a5ce6",
  skyInk: "#ffffff",
  skySoft: "#f6f2ff",
});

export const AMBRE = signature({
  id: "ambre",
  name: tr("Ambre"),
  description: tr("Orange chaleureux"),
  swatches: ["#a8400a", "#e07a2a", "#ffffff", "#fbd9b4"],
  motif: "feuilles",
  sky: ["#a13d09", "#b14a0c", "#dd7528", "#f4aa66", "#fbd8b2"],
  light: "#ffe0a0",
  warm: "#ffe27a",
  mint: "#ffe8a0",
  wave: "#ffd24a",
  ink: "#3a1d0b",
  soft: "#6a4a33",
  accent: "#964009",
  heading: "#843a0a",
  g1: "#f7953a",
  g2: "#b44c0a",
  row: "#e0782a",
  skyInk: "#ffffff",
  skySoft: "#fff6ee",
});

export const NUAGE = signature({
  id: "nuage",
  name: tr("Nuage"),
  description: tr("Ciel pastel, tout en douceur"),
  swatches: ["#a9d6f6", "#e6f3fd", "#ffffff", "#ffd7e6"],
  sky: ["#9fd0f4", "#b4dbf7", "#d3eafb", "#ecf6fd", "#fbf3f8"],
  light: "#ffe3ef",
  warm: "#ffe0c0",
  mint: "#c8f4ea",
  wave: "#ffb3d1",
  ink: "#13325a",
  soft: "#425d80",
  accent: "#1c66b8",
  heading: "#184f8f",
  g1: "#5aaef2",
  g2: "#1d68c4",
  row: "#5aa6e8",
  skyInk: "#11305a",
  skySoft: "#2c4c76",
});

export const MINUIT = signature({
  id: "minuit",
  name: tr("Minuit"),
  description: tr("Nuit profonde, reflets bleus"),
  swatches: ["#061233", "#13306f", "#2f8cff", "#8fd0ff"],
  dark: true,
  sky: ["#050f2e", "#0a1a48", "#112c68", "#18387f", "#1d4492"],
  light: "#3f8cff",
  warm: "#8a6bff",
  mint: "#1fc8d8",
  wave: "#8a6bff",
  ink: "#eef5ff",
  soft: "#b8cbea",
  accent: "#8fd0ff",
  heading: "#b8cbea",
  g1: "#3d9cff",
  g2: "#1650c8",
  row: "#5aaeff",
  skyInk: "#ffffff",
  skySoft: "#d4e2fb",
});

/** Les thèmes, dans l'ordre de la galerie (par famille). */
export const THEMES: readonly ThemeDef[] = [
  AQUA,
  JADE,
  GLYCINE,
  AMBRE,
  NUAGE,
  MINUIT,
  FRUTIGER,
  PRAIRIE,
  LAGON,
  TROPIQUES,
  LAVANDE,
  TERRACOTTA,
  AURORE_BOREALE,
  PRINTEMPS,
  ETE,
  AUTOMNE,
  HIVER,
  NOEL,
  NOUVEL_AN,
  SAINT_VALENTIN,
  PAQUES,
  HALLOWEEN,
  ZEN,
  ENERGIE,
  COCON,
  BULLES_IRISEES,
  ARDOISE,
  NUIT_ETOILEE,
  ABYSSES,
  VELOURS,
  ONYX,
];
export const DEFAULT_THEME_ID: ThemeId = "aqua";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function getTheme(id: AnyThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? AQUA;
}
