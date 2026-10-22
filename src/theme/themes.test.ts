import { describe, expect, it } from "vitest";
import { THEMES, getTheme, isThemeId } from "./themes";
import { applyTheme, cssVarName, themeStyle } from "./applyTheme";

describe("thèmes", () => {
  it("nomme les variables CSS", () => {
    expect(cssVarName("bubbleEdge")).toBe("--aq-bubble-edge");
    expect(cssVarName("sky")).toBe("--aq-sky");
  });

  it("chaque thème définit les mêmes variables, toutes remplies", () => {
    const reference = Object.keys(THEMES[0]!.tokens).sort();
    for (const theme of THEMES) {
      expect(Object.keys(theme.tokens).sort()).toEqual(reference);
      for (const value of Object.values(theme.tokens)) {
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("applique un thème à la fenêtre", () => {
    const root = document.createElement("div");
    applyTheme(getTheme("nuit-etoilee"), root);
    expect(root.dataset.theme).toBe("nuit-etoilee");
    expect(root.style.getPropertyValue("--aq-ink")).toBe("#eef5ff");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("reconnaît les identifiants de thème", () => {
    expect(isThemeId("aqua")).toBe(true);
    expect(isThemeId("hiver")).toBe(true);
    expect(isThemeId("inconnu")).toBe(false);
    expect(Object.keys(themeStyle(getTheme("aqua")))).toContain("--aq-gel");
  });
});
