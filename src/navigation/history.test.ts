import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY,
  canGoBack,
  canGoForward,
  createHistory,
  currentRoute,
  goBack,
  goForward,
  navigateTo,
} from "./history";
import { MODULES } from "../modules/modules";

describe("historique de navigation", () => {
  it("démarre sur l'écran donné, sans précédent ni suivant", () => {
    const h = createHistory("accueil");
    expect(currentRoute(h)).toBe("accueil");
    expect(canGoBack(h)).toBe(false);
    expect(canGoForward(h)).toBe(false);
  });

  it("revient en arrière puis en avant", () => {
    let h = createHistory("accueil");
    h = navigateTo(h, "taches");
    h = navigateTo(h, "calendrier");
    h = goBack(h);
    expect(currentRoute(h)).toBe("taches");
    h = goBack(h);
    expect(currentRoute(h)).toBe("accueil");
    expect(canGoBack(h)).toBe(false);
    h = goForward(h);
    h = goForward(h);
    expect(currentRoute(h)).toBe("calendrier");
    expect(canGoForward(h)).toBe(false);
  });

  it("oublie les écrans « suivants » quand on ouvre un nouvel écran", () => {
    let h = createHistory("accueil");
    h = navigateTo(h, "taches");
    h = navigateTo(h, "calendrier");
    h = goBack(h);
    h = navigateTo(h, "notes");
    expect(h.entries).toEqual(["accueil", "taches", "notes"]);
    expect(canGoForward(h)).toBe(false);
  });

  it("ignore un clic sur l'écran déjà ouvert", () => {
    const h = navigateTo(createHistory("accueil"), "taches");
    expect(navigateTo(h, "taches")).toBe(h);
  });

  it("ne dépasse jamais la taille maximale", () => {
    let h = createHistory("accueil");
    for (let i = 0; i < MAX_HISTORY * 2; i++) {
      const module = MODULES[i % MODULES.length];
      if (module) h = navigateTo(h, module.key);
    }
    expect(h.entries.length).toBe(MAX_HISTORY);
    expect(h.index).toBe(MAX_HISTORY - 1);
  });

  it("précédent et suivant ne font rien aux extrémités", () => {
    const h = createHistory("accueil");
    expect(goBack(h)).toBe(h);
    expect(goForward(h)).toBe(h);
  });
});
