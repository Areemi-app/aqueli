import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "../app/shortcuts";
import { MODULES } from "../modules/modules";
import { fillShortcuts, HELP_GROUPS, HELP_TOPICS, searchHelp, SHORTCUTS_TOPIC, topicForRoute, topicTexts } from "./helpTopics";

const allTexts = HELP_TOPICS.flatMap(topicTexts);

describe("aide intégrée", () => {
  it("a des rubriques distinctes, toutes rédigées en deux phases (sauf la liste des raccourcis)", () => {
    expect(new Set(HELP_TOPICS.map((t) => t.id)).size).toBe(HELP_TOPICS.length);
    for (const t of HELP_TOPICS) {
      if (t.id === SHORTCUTS_TOPIC) continue;
      expect(t.intro.length).toBeGreaterThan(20);
      expect(t.basics.length).toBeGreaterThanOrEqual(2);
      expect(t.advanced.length).toBeGreaterThanOrEqual(2);
      for (const s of [...t.basics, ...t.advanced]) expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it("range les rubriques par groupe, dans l'ordre des groupes", () => {
    const order = HELP_GROUPS.map((g) => g.key);
    const ranks = HELP_TOPICS.map((t) => order.indexOf(t.group));
    expect(ranks.every((r) => r >= 0)).toBe(true);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("écrit des phrases, pas des mots-clés : chaque texte finit par un point", () => {
    for (const t of HELP_TOPICS) {
      for (const s of [...t.basics, ...t.advanced]) for (const text of s.text) expect(text).toMatch(/[.»)]$/);
    }
  });

  it("n'écrit aucun raccourci personnalisable en dur et les remplace par ceux en vigueur", () => {
    const filled = allTexts.map((t) => fillShortcuts(t, DEFAULT_SHORTCUTS, "Ctrl+Alt+A"));
    // Tout jeton est connu : plus aucune accolade après remplacement.
    for (const t of filled) expect(t).not.toMatch(/[{}]/);
    for (const fixed of ["Ctrl+K", "Ctrl+L", "Ctrl+S", "Ctrl+N", "Ctrl+Maj+F", "Ctrl+Maj+E", "Alt+←"]) {
      for (const t of allTexts) expect(t).not.toContain(fixed);
    }
    expect(fillShortcuts("Palette ({palette}), capture ({capture})", { ...DEFAULT_SHORTCUTS, palette: { ctrl: true, alt: false, shift: true, key: "p" } }, "Ctrl+Alt+A")).toBe(
      "Palette (Ctrl+Maj+P), capture (Ctrl+Alt+A)",
    );
  });

  it("cherche sans accents ni majuscules, tous les mots à la fois", () => {
    expect(searchHelp("").length).toBe(HELP_TOPICS.length);
    expect(searchHelp("RESILIATION").map((t) => t.id)).toContain("obligations");
    expect(searchHelp("markdown pdf").map((t) => t.id)).toEqual(expect.arrayContaining(["notes", "import-export"]));
    expect(searchHelp("zzz introuvable")).toEqual([]);
  });

  it("F1 ouvre la rubrique de l'écran affiché, une par module", () => {
    for (const m of MODULES) expect(HELP_TOPICS.some((t) => t.id === topicForRoute(m.key))).toBe(true);
    expect(topicForRoute("notes")).toBe("notes");
    expect(topicForRoute("budget")).toBe("budget");
    expect(topicForRoute("accueil")).toBe("accueil");
    expect(topicForRoute("parametres")).toBe("apparence");
    expect(topicForRoute("corbeille")).toBe("prise-en-main");
  });
});
