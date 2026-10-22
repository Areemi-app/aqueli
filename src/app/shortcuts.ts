import { tr, trValue } from "../i18n/i18n";
/**
 * Raccourcis clavier globaux. Ceux propres à Aqueli se personnalisent (Paramètres › Clavier) ;
 * ceux de Windows et de la saisie (Ctrl+Z, Ctrl+C, Entrée, Suppr, F2, Échap…) restent fixes.
 * On lit `code` pour les chiffres (sur un clavier AZERTY, Ctrl+1 donne la touche « & ») et
 * `key` pour les lettres (la lettre imprimée sur la touche).
 */

export type ShortcutAction =
  | { type: "palette" }
  /** Recherche globale (Ctrl+Maj+F). */
  | { type: "search" }
  /** Annuler la dernière action (Ctrl+Z), hors d'un champ de saisie. */
  | { type: "undo" }
  | { type: "module"; index: number }
  | { type: "settings" }
  | { type: "back" }
  | { type: "forward" }
  | { type: "spaces" }
  | { type: "lock" }
  /** Sauvegarder maintenant (Ctrl+S, cahier des charges § 7 : « force l'enregistrement »). */
  | { type: "backup" }
  /** Nouvel élément de l'écran affiché, une tâche ailleurs (Ctrl+N) ; sans lui, WebView2
   * ouvrirait une nouvelle fenêtre. */
  | { type: "newItem" }
  /** Aide intégrée (F1) et liste des raccourcis (Ctrl+/). */
  | { type: "help" }
  | { type: "shortcuts" }
  /** Imprimer la vue affichée (Ctrl+P, raccourci de Windows). */
  | { type: "print" }
  /** Raccourci du navigateur intégré qui n'a pas de sens dans une application (Actualiser, Imprimer…). */
  | { type: "block" };

export interface KeyInput {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Combinaison : touches de contrôle et touche principale (lettre en minuscule, chiffre, « , »,
 * « ArrowLeft », « F5 »…). */
export interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

/** Raccourcis personnalisables. */
export type CommandId =
  | "palette"
  | "search"
  | "newItem"
  | "spaces"
  | "lock"
  | "backup"
  | "settings"
  | "back"
  | "forward"
  | "duplicate"
  | "help"
  | "shortcuts";

export interface CommandDef {
  id: CommandId;
  /** Ce que fait le raccourci (Paramètres › Clavier). */
  label: string;
  /** Nom court, pour signaler un raccourci déjà pris. */
  name: string;
  combo: Combo;
}

const combo = (key: string, mods: Partial<Omit<Combo, "key">> = {}): Combo => ({ ctrl: false, alt: false, shift: false, ...mods, key });

export const COMMANDS: readonly CommandDef[] = [
  { id: "palette", name: tr("Palette de commandes"), label: tr("Rechercher une commande, un module, un thème"), combo: combo("k", { ctrl: true }) },
  {
    id: "search",
    name: tr("Recherche globale"),
    label: tr("Rechercher dans tout Aqueli"),
    combo: combo("f", { ctrl: true, shift: true }),
  },
  {
    id: "newItem",
    name: tr("Nouvel élément"),
    label: tr("Nouvel élément de l'écran affiché (une tâche par défaut)"),
    combo: combo("n", { ctrl: true }),
  },
  { id: "spaces", name: tr("Choix de l'espace"), label: tr("Choisir l'espace affiché"), combo: combo("e", { ctrl: true, shift: true }) },
  { id: "lock", name: tr("Verrouillage"), label: tr("Verrouiller Aqueli"), combo: combo("l", { ctrl: true }) },
  { id: "backup", name: tr("Sauvegarde"), label: tr("Sauvegarder maintenant"), combo: combo("s", { ctrl: true }) },
  { id: "settings", name: tr("Paramètres"), label: tr("Paramètres"), combo: combo(",", { ctrl: true }) },
  { id: "back", name: tr("Écran précédent"), label: tr("Écran précédent"), combo: combo("ArrowLeft", { alt: true }) },
  { id: "forward", name: tr("Écran suivant"), label: tr("Écran suivant"), combo: combo("ArrowRight", { alt: true }) },
  { id: "duplicate", name: tr("Dupliquer"), label: tr("Dupliquer"), combo: combo("d", { ctrl: true }) },
  { id: "help", name: tr("Aide"), label: tr("Aide"), combo: combo("F1") },
  { id: "shortcuts", name: tr("Liste des raccourcis"), label: tr("Liste des raccourcis clavier"), combo: combo("/", { ctrl: true }) },
];

export type ShortcutMap = Record<CommandId, Combo>;

export const DEFAULT_SHORTCUTS = Object.fromEntries(COMMANDS.map((c) => [c.id, c.combo])) as ShortcutMap;

export function isCombo(value: unknown): value is Combo {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.ctrl === "boolean" &&
    typeof c.alt === "boolean" &&
    typeof c.shift === "boolean" &&
    typeof c.key === "string" &&
    c.key.length > 0 &&
    c.key.length <= 20
  );
}

export const sameCombo = (a: Combo, b: Combo) => a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.key === b.key;

/** Raccourcis choisis par la personne, par-dessus ceux d'origine. */
export function resolveShortcuts(custom: Readonly<Partial<Record<string, unknown>>> | undefined): ShortcutMap {
  const map = { ...DEFAULT_SHORTCUTS };
  for (const c of COMMANDS) {
    const value = custom?.[c.id];
    if (isCombo(value)) map[c.id] = value;
  }
  return map;
}

// Raccourcis en vigueur, pour le code hors de React (touches de la fenêtre, menus).
let active: ShortcutMap = DEFAULT_SHORTCUTS;

export function setActiveShortcuts(map: ShortcutMap): void {
  active = map;
}

export function activeShortcuts(): ShortcutMap {
  return active;
}

const DIGIT = /^(?:Digit|Numpad)([0-9])$/;

/** Touche principale d'un appui : chiffre d'après `code`, lettre ou signe en minuscule, sinon le
 * nom de la touche (« ArrowLeft », « F5 »). */
export function keyOf(e: Pick<KeyInput, "key" | "code">): string {
  const digit = DIGIT.exec(e.code);
  if (digit) return digit[1]!;
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/** Signe (« / », « , »…) : selon le clavier, il demande Maj ou non (« / » est Maj+: en AZERTY) ;
 * Maj n'entre donc pas dans sa combinaison. */
const isSign = (key: string) => key.length === 1 && key !== " " && !/[\p{L}\p{N}]/u.test(key);

export function matches(e: KeyInput, c: Combo): boolean {
  const key = keyOf(e);
  const shiftOk = e.shiftKey === c.shift || (isSign(key) && !c.shift);
  return (e.ctrlKey || e.metaKey) === c.ctrl && e.altKey === c.alt && shiftOk && key === c.key;
}

const MODIFIERS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS", "Dead", "Unidentified", "Process"]);

/** Combinaison saisie au clavier ; `null` pour une touche de contrôle seule. */
export function comboFromEvent(e: KeyInput): Combo | null {
  if (MODIFIERS.has(e.key)) return null;
  const key = keyOf(e);
  return { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey && !isSign(key), key };
}

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  " ": tr("Espace|touche"),
  Home: tr("Début|touche"),
  End: tr("Fin|touche"),
  PageUp: tr("Pg préc."),
  PageDown: tr("Pg suiv."),
  Insert: tr("Inser"),
  Delete: tr("Suppr"),
  Backspace: tr("Retour arrière"),
  Enter: tr("Entrée"),
  Escape: tr("Échap"),
  Tab: "Tab",
};

/** Touches à afficher : « Ctrl », « Maj », « F ». */
export function comboKeys(c: Combo): string[] {
  const key = KEY_NAMES[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key);
  return [...(c.ctrl ? ["Ctrl"] : []), ...(c.alt ? ["Alt"] : []), ...(c.shift ? [tr("Maj")] : []), key];
}

/** « Ctrl+Maj+F » (ou « Ctrl Maj F » avec `separator`). */
export function comboText(c: Combo, separator = "+"): string {
  return comboKeys(c).join(separator);
}

/** Raccourci en vigueur d'une commande : « Ctrl+K ». */
export function shortcutText(id: CommandId, map: ShortcutMap = active, separator = "+"): string {
  return comboText(map[id], separator);
}

/** « Ctrl+Maj+Z » écrit dans la langue de l'interface (« Ctrl+Shift+Z »). */
const inLanguage = (text: string) => text.split("+").map((k) => trValue(k)).join("+");

/** Combinaisons de Windows, de la saisie et de l'éditeur de notes, jamais réattribuées. */
const RESERVED: Record<string, string> = Object.fromEntries(Object.entries({
  "Ctrl+Z": tr("Annuler"),
  "Ctrl+Y": tr("Rétablir"),
  "Ctrl+Maj+Z": tr("Rétablir"),
  "Ctrl+C": tr("Copier"),
  "Ctrl+X": tr("Couper"),
  "Ctrl+V": tr("Coller"),
  "Ctrl+A": tr("Tout sélectionner"),
  "Ctrl+F": tr("Rechercher dans l'écran"),
  "Ctrl+P": tr("Imprimer"),
  "Ctrl+B": tr("Gras"),
  "Ctrl+I": tr("Italique"),
  "Ctrl+U": tr("Souligné"),
  "Ctrl+E": tr("Code"),
  "Ctrl+Maj+B": tr("Citation"),
  "Ctrl+Maj+S": tr("Barré"),
  "Ctrl+Maj+H": tr("Surlignage"),
  "Ctrl+Maj+7": tr("Liste numérotée"),
  "Ctrl+Maj+8": tr("Liste à puces"),
  "Ctrl+Maj+9": tr("Cases à cocher"),
  "Ctrl+Entrée": tr("Saut de ligne"),
  F2: tr("Renommer"),
  "Alt+F4": tr("Fermer la fenêtre"),
  "Alt+Tab": tr("Changer de fenêtre"),
  "Alt+Espace": tr("Menu de la fenêtre"),
  "Ctrl+Échap": tr("Menu Démarrer"),
}).map(([keys, use]) => [inLanguage(keys), use]));

const FKEY = /^F([1-9]|1[0-2])$/;

/**
 * Pourquoi une combinaison ne peut pas servir à la commande `id`, ou `null` si elle convient.
 * `taken` : autres raccourcis déjà pris (capture rapide).
 */
export function comboProblem(
  c: Combo,
  id: CommandId,
  map: ShortcutMap,
  taken: readonly { keys: readonly string[]; name: string }[] = [],
): string | null {
  const text = comboText(c);
  if (c.ctrl && c.alt) return tr("Ctrl+Alt équivaut à AltGr et sert à saisir des caractères.");
  if (!c.ctrl && !c.alt && !FKEY.test(c.key)) return tr("Ajouter Ctrl ou Alt, ou choisir une touche F1 à F12.");
  if (RESERVED[text]) return tr("{text} est réservé : {use}.", { text, use: RESERVED[text] });
  if (c.ctrl && !c.alt && !c.shift && /^[0-9]$/.test(c.key)) return tr("{text} est réservé : ouverture des modules.", { text });
  const other = COMMANDS.find((d) => d.id !== id && sameCombo(map[d.id], c));
  if (other) return tr("{text} est déjà utilisé : {name}.", { text, name: other.name });
  const outside = taken.find((t) => t.keys.join("+") === text);
  if (outside) return tr("{text} est déjà utilisé : {name}.", { text, name: outside.name });
  return null;
}

/** Commandes lancées depuis toute la fenêtre (Dupliquer agit sur l'élément qui a le focus). */
const GLOBAL: readonly Exclude<CommandId, "duplicate">[] = ["palette", "search", "newItem", "spaces", "lock", "backup", "settings", "back", "forward", "help", "shortcuts"];

export function shortcutFor(e: KeyInput, map: ShortcutMap = active): ShortcutAction | null {
  const key = keyOf(e);
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && !e.altKey && !e.shiftKey && key === "z") return { type: "undo" };
  for (const id of GLOBAL) if (matches(e, map[id])) return { type: id };

  const digit = DIGIT.exec(e.code);
  if (ctrl && !e.altKey && !e.shiftKey && digit && digit[1] !== "0") {
    return { type: "module", index: Number(digit[1]) - 1 };
  }

  if (key === "BrowserBack") return { type: "back" };
  if (key === "BrowserForward") return { type: "forward" };

  if (ctrl && !e.altKey && !e.shiftKey && key === "p") return { type: "print" };
  if (key === "F5" || key === "F3" || key === "F7" || key === "BrowserRefresh") return { type: "block" };
  if (ctrl && ["r", "p", "f", "g", "u", "j", "s", "o", "h"].includes(key)) return { type: "block" };
  return null;
}
