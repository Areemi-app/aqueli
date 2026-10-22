import { describe, expect, it } from "vitest";
import { decorColors, DIALOG_MOTIFS, dialogMotifsFor, motifFor } from "./dialogDecor";
import { THEMES } from "./themes";

describe("décor des fenêtres", () => {
  it("donne à chaque thème trois teintes tirées de ses pastilles et des motifs de son univers", () => {
    for (const theme of THEMES) {
      const colors = decorColors(theme.swatches, theme.tokens.accent);
      expect(colors).toHaveLength(3);
      for (const c of colors) expect(theme.swatches.includes(c) || c === theme.tokens.accent).toBe(true);
      const motifs = dialogMotifsFor(theme);
      expect(motifs.length).toBeGreaterThan(0);
      for (const m of motifs) expect(DIALOG_MOTIFS).toContain(m);
    }
  });

  it("préfère les teintes éclatantes aux neutres", () => {
    expect(decorColors(["#ffffff", "#2a9fe6", "#050505", "#5cc94a", "#ffd257"], "#000000")).toEqual(["#2a9fe6", "#5cc94a", "#ffd257"]);
    expect(decorColors(["#2a9fe6"], "#123456")).toEqual(["#2a9fe6", "#2a9fe6", "#2a9fe6"]);
    expect(decorColors([], "#123456")).toEqual(["#123456", "#123456", "#123456"]);
  });

  it("garde l'eau des thèmes Signature et la nuit des thèmes étoilés", () => {
    expect(dialogMotifsFor({ motif: "etoiles", skin: "signature" })).toContain("vagues");
    expect(dialogMotifsFor({ motif: "etoiles" })).toContain("constellation");
  });

  it("tire toujours le même motif pour une fenêtre, parmi ceux du thème", () => {
    const set = dialogMotifsFor({ motif: "bulles" });
    expect(motifFor("Nouvelle tâche", set)).toBe(motifFor("Nouvelle tâche", set));
    expect(set).toContain(motifFor("Image de profil", set));
  });
});
