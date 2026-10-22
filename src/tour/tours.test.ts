import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "../app/shortcuts";
import { fillShortcuts } from "../help/shortcutTokens";
import { MODULES } from "../modules/modules";
import { placeBubble } from "./placement";
import { GENERAL_TOUR, MODULE_TOURS, tourOf } from "./tours";

const ALL = [GENERAL_TOUR, ...Object.values(MODULE_TOURS)];

describe("visites guidées", () => {
  it("existent pour chaque module, sur l'écran du module", () => {
    for (const m of MODULES) {
      const tour = tourOf(m.key);
      expect(tour.id).toBe(m.key);
      expect(tour.route).toBe(m.key);
      expect(tour.steps.length).toBeGreaterThanOrEqual(2);
    }
    expect(GENERAL_TOUR.steps.length).toBeGreaterThanOrEqual(5);
  });

  it("ont des étapes rédigées, sans raccourci personnalisable écrit en dur", () => {
    for (const tour of ALL)
      for (const step of tour.steps) {
        expect(step.title.trim()).not.toBe("");
        expect(step.text.trim()).not.toBe("");
        expect(fillShortcuts(step.text, DEFAULT_SHORTCUTS, "Ctrl+Alt+A")).not.toMatch(/[{}]/);
        for (const fixed of ["Ctrl+K", "Ctrl+L", "Ctrl+S", "Ctrl+N", "Ctrl+Maj+F", "Ctrl+Maj+E", "Ctrl+,", "Ctrl+D", "Ctrl+/", "F1"]) expect(step.text).not.toContain(fixed);
      }
  });
});

describe("bulle d'une visite", () => {
  const view = { width: 1200, height: 800 };
  const bubble = { width: 360, height: 200 };

  it("se pose sous l'élément, centrée, sans sortir de la fenêtre", () => {
    expect(placeBubble({ left: 100, top: 100, width: 200, height: 40 }, bubble, view)).toEqual({ left: 20, top: 154, side: "bottom" });
    expect(placeBubble({ left: 1100, top: 100, width: 80, height: 40 }, bubble, view).left).toBe(1200 - 360 - 12);
  });

  it("passe au-dessus, à côté, ou se pose sur un élément trop grand", () => {
    expect(placeBubble({ left: 400, top: 700, width: 200, height: 60 }, bubble, view).side).toBe("top");
    expect(placeBubble({ left: 0, top: 0, width: 300, height: 800 }, bubble, view)).toMatchObject({ side: "right", left: 314 });
    expect(placeBubble({ left: 0, top: 0, width: 1200, height: 800 }, bubble, view).side).toBe("center");
  });

  it("se centre quand rien n'est éclairé", () => {
    expect(placeBubble(null, bubble, view)).toEqual({ left: 420, top: 300, side: "center" });
  });
});
