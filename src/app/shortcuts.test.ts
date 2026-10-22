import { describe, expect, it } from "vitest";
import { itemAction, KEYS } from "../lib/itemKeys";
import {
  comboFromEvent,
  comboKeys,
  comboProblem,
  comboText,
  DEFAULT_SHORTCUTS,
  resolveShortcuts,
  setActiveShortcuts,
  shortcutFor,
  shortcutText,
  type KeyInput,
} from "./shortcuts";

function press(partial: Partial<KeyInput>): KeyInput {
  return { key: "", code: "", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial };
}

describe("raccourcis clavier", () => {
  it("Ctrl+K ouvre la palette de commandes", () => {
    expect(shortcutFor(press({ key: "k", code: "KeyK", ctrlKey: true }))).toEqual({ type: "palette" });
    expect(shortcutFor(press({ key: "K", code: "KeyK", ctrlKey: true }))).toEqual({ type: "palette" });
  });

  it("Ctrl+1 à Ctrl+9 ouvrent les modules, même sur un clavier AZERTY", () => {
    expect(shortcutFor(press({ key: "&", code: "Digit1", ctrlKey: true }))).toEqual({ type: "module", index: 0 });
    expect(shortcutFor(press({ key: "é", code: "Digit2", ctrlKey: true }))).toEqual({ type: "module", index: 1 });
    expect(shortcutFor(press({ key: "9", code: "Numpad9", ctrlKey: true }))).toEqual({ type: "module", index: 8 });
    expect(shortcutFor(press({ key: "0", code: "Digit0", ctrlKey: true }))).toBeNull();
  });

  it("Alt+← et Alt+→ font précédent et suivant", () => {
    expect(shortcutFor(press({ key: "ArrowLeft", altKey: true }))).toEqual({ type: "back" });
    expect(shortcutFor(press({ key: "ArrowRight", altKey: true }))).toEqual({ type: "forward" });
    expect(shortcutFor(press({ key: "ArrowLeft" }))).toBeNull();
  });

  it("Ctrl+, ouvre les Paramètres et Ctrl+Maj+E les espaces", () => {
    expect(shortcutFor(press({ key: ",", code: "KeyM", ctrlKey: true }))).toEqual({ type: "settings" });
    expect(shortcutFor(press({ key: "E", code: "KeyE", ctrlKey: true, shiftKey: true }))).toEqual({ type: "spaces" });
  });

  it("Ctrl+L verrouille Aqueli", () => {
    expect(shortcutFor(press({ key: "l", code: "KeyL", ctrlKey: true }))).toEqual({ type: "lock" });
    expect(shortcutFor(press({ key: "L", code: "KeyL", ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("Ctrl+N crée une tâche (et n'ouvre pas de nouvelle fenêtre)", () => {
    expect(shortcutFor(press({ key: "n", code: "KeyN", ctrlKey: true }))).toEqual({ type: "newItem" });
    expect(shortcutFor(press({ key: "F", code: "KeyF", ctrlKey: true, shiftKey: true }))).toEqual({ type: "search" });
    expect(shortcutFor(press({ key: "f", code: "KeyF", ctrlKey: true }))).toEqual({ type: "block" });
    expect(shortcutFor(press({ key: "z", code: "KeyW", ctrlKey: true }))).toEqual({ type: "undo" });
    expect(shortcutFor(press({ key: "Z", code: "KeyW", ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutFor(press({ key: "N", code: "KeyN", ctrlKey: true }))).toEqual({ type: "newItem" });
    expect(shortcutFor(press({ key: "n", code: "KeyN" }))).toBeNull();
  });

  it("F1 ouvre l'aide et Ctrl+/ la liste des raccourcis, avec ou sans Maj selon le clavier", () => {
    expect(shortcutFor(press({ key: "F1", code: "F1" }))).toEqual({ type: "help" });
    expect(shortcutFor(press({ key: "/", code: "Slash", ctrlKey: true }))).toEqual({ type: "shortcuts" });
    // AZERTY : « / » est Maj+: ; pavé numérique : « / » sans Maj.
    expect(shortcutFor(press({ key: "/", code: "Period", ctrlKey: true, shiftKey: true }))).toEqual({ type: "shortcuts" });
    expect(shortcutFor(press({ key: "/", code: "NumpadDivide", ctrlKey: true }))).toEqual({ type: "shortcuts" });
    expect(shortcutFor(press({ key: "/", code: "Slash" }))).toBeNull();
    expect(comboFromEvent(press({ key: "/", code: "Period", ctrlKey: true, shiftKey: true }))).toEqual({ ctrl: true, alt: false, shift: false, key: "/" });
    expect(shortcutText("shortcuts")).toBe("Ctrl+/");
  });

  it("Ctrl+S sauvegarde maintenant", () => {
    expect(shortcutFor(press({ key: "s", code: "KeyS", ctrlKey: true }))).toEqual({ type: "backup" });
  });

  it("neutralise Actualiser et Imprimer du navigateur intégré", () => {
    expect(shortcutFor(press({ key: "F5", code: "F5" }))).toEqual({ type: "block" });
    expect(shortcutFor(press({ key: "r", code: "KeyR", ctrlKey: true }))).toEqual({ type: "block" });
    expect(shortcutFor(press({ key: "p", code: "KeyP", ctrlKey: true }))).toEqual({ type: "print" });
    expect(shortcutFor(press({ key: "P", code: "KeyP", ctrlKey: true, shiftKey: true }))).toEqual({ type: "block" });
  });

  it("laisse passer la frappe normale et le copier-coller", () => {
    expect(shortcutFor(press({ key: "a", code: "KeyA" }))).toBeNull();
    expect(shortcutFor(press({ key: "c", code: "KeyC", ctrlKey: true }))).toBeNull();
    expect(shortcutFor(press({ key: "v", code: "KeyV", ctrlKey: true }))).toBeNull();
  });
});

describe("raccourcis personnalisés", () => {
  const custom = resolveShortcuts({ palette: { ctrl: false, alt: true, shift: false, key: "p" }, search: { ctrl: false, alt: false, shift: false, key: "F5" } });

  it("suivent les combinaisons choisies, avant les touches neutralisées", () => {
    expect(shortcutFor(press({ key: "p", code: "KeyP", altKey: true }), custom)).toEqual({ type: "palette" });
    expect(shortcutFor(press({ key: "k", code: "KeyK", ctrlKey: true }), custom)).toBeNull();
    expect(shortcutFor(press({ key: "F5", code: "F5" }), custom)).toEqual({ type: "search" });
    // Les autres gardent leur valeur d'origine.
    expect(shortcutFor(press({ key: "l", code: "KeyL", ctrlKey: true }), custom)).toEqual({ type: "lock" });
  });

  it("ignorent les valeurs enregistrées mal formées", () => {
    const map = resolveShortcuts({ lock: { ctrl: true }, spaces: "Ctrl+E", inconnu: { ctrl: true, alt: false, shift: false, key: "q" } });
    expect(map).toEqual(DEFAULT_SHORTCUTS);
  });

  it("lisent la combinaison saisie, chiffres compris sur un clavier AZERTY", () => {
    expect(comboFromEvent(press({ key: "Control", ctrlKey: true }))).toBeNull();
    expect(comboFromEvent(press({ key: "é", code: "Digit2", ctrlKey: true, shiftKey: true }))).toEqual({ ctrl: true, alt: false, shift: true, key: "2" });
    expect(comboFromEvent(press({ key: "M", code: "KeyM", altKey: true, shiftKey: true }))).toEqual({ ctrl: false, alt: true, shift: true, key: "m" });
    expect(comboText({ ctrl: false, alt: true, shift: false, key: "ArrowLeft" })).toBe("Alt+←");
    expect(comboKeys({ ctrl: true, alt: false, shift: false, key: " " })).toEqual(["Ctrl", "Espace"]);
    expect(shortcutText("search", DEFAULT_SHORTCUTS, " ")).toBe("Ctrl Maj F");
  });

  it("refusent les combinaisons réservées, sans Ctrl ni Alt, ou déjà prises", () => {
    const c = (key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => ({ ctrl: false, alt: false, shift: false, ...mods, key });
    expect(comboProblem(c("e", { ctrl: true, alt: true }), "palette", DEFAULT_SHORTCUTS)).toMatch(/AltGr/);
    expect(comboProblem(c("p"), "palette", DEFAULT_SHORTCUTS)).toMatch(/Ctrl ou Alt/);
    expect(comboProblem(c("c", { ctrl: true }), "palette", DEFAULT_SHORTCUTS)).toBe("Ctrl+C est réservé : Copier.");
    expect(comboProblem(c("3", { ctrl: true }), "palette", DEFAULT_SHORTCUTS)).toMatch(/modules/);
    expect(comboProblem(c("l", { ctrl: true }), "palette", DEFAULT_SHORTCUTS)).toBe("Ctrl+L est déjà utilisé : Verrouillage.");
    expect(comboProblem(c("a", { ctrl: true, shift: true }), "palette", DEFAULT_SHORTCUTS, [{ keys: ["Ctrl", "Maj", "A"], name: "Capture rapide" }])).toBe(
      "Ctrl+Maj+A est déjà utilisé : Capture rapide.",
    );
    expect(comboProblem(c("F6"), "palette", DEFAULT_SHORTCUTS)).toBeNull();
    expect(comboProblem(c("p", { alt: true }), "palette", DEFAULT_SHORTCUTS)).toBeNull();
    // Reprendre sa propre combinaison n'est pas un conflit.
    expect(comboProblem(c("k", { ctrl: true }), "palette", DEFAULT_SHORTCUTS)).toBeNull();
  });

  it("Dupliquer suit le raccourci choisi, dans les menus comme au clavier", () => {
    const actions = { duplicate: () => undefined };
    setActiveShortcuts(resolveShortcuts({ duplicate: { ctrl: false, alt: true, shift: false, key: "d" } }));
    try {
      expect(KEYS.duplicate).toBe("Alt+D");
      expect(itemAction({ key: "d", code: "KeyD", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }, actions, false)).toBe(actions.duplicate);
      expect(itemAction({ key: "d", code: "KeyD", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, actions, false)).toBeUndefined();
    } finally {
      setActiveShortcuts(DEFAULT_SHORTCUTS);
    }
    expect(KEYS.duplicate).toBe("Ctrl+D");
  });
});
