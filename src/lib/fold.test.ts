import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SYMBOLS, symbolPath } from "../components/symbols";
import { searchItems } from "../palette/search";
import { containsExactly, fold, hasAccents } from "./fold";

describe("recherche en français", () => {
  it("ignore majuscules et accents, développe les ligatures", () => {
    expect(fold("Œuvre ÉTÉ çà")).toBe("oeuvre ete ca");
    expect(fold("Cœur")).toBe("coeur");
  });

  it("reconnaît une saisie accentuée", () => {
    expect(hasAccents("pêche")).toBe(true);
    expect(hasAccents("PÉCHÉ")).toBe(true);
    expect(hasAccents("peche")).toBe(false);
    expect(hasAccents("oeuf")).toBe(false);
    expect(hasAccents("œuf")).toBe(false);
  });

  it("compare l'orthographe exacte sans les majuscules", () => {
    expect(containsExactly("Canne à pêche", "PÊCHE")).toBe(true);
    expect(containsExactly("Péché mignon", "pêche")).toBe(false);
    expect(containsExactly("Œufs", "oeufs")).toBe(true);
  });

  it("la palette met l'orthographe exacte devant quand la saisie porte des accents", () => {
    const items = [{ label: "Péché" }, { label: "Pêche" }];
    expect(searchItems(items, "peche").map((i) => i.label)).toEqual(["Péché", "Pêche"]);
    expect(searchItems(items, "pêche").map((i) => i.label)).toEqual(["Pêche", "Péché"]);
  });
});

describe("symboles", () => {
  it("sont les mêmes que ceux acceptés par le cœur, sans doublon", () => {
    // Les tests se lancent depuis la racine du projet.
    const rust = readFileSync("src-tauri/src/data/symbols.rs", "utf8");
    const list = /SYMBOLS: \[&str; \d+\] = \[([^\]]*)\]/.exec(rust)?.[1] ?? "";
    const ids = [...list.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(SYMBOLS.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gardent un dessin même inconnus", () => {
    expect(symbolPath("maison", "x")).toBe(SYMBOLS[0]?.path);
    expect(symbolPath("inconnu", "x")).toBe("x");
    expect(symbolPath(null, "x")).toBe("x");
  });
});
