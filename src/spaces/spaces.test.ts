import { describe, expect, it } from "vitest";
import { symbolOf } from "../components/symbols";
import { moveSpace, spaceFilterLabel, spaceIconPath, type Space } from "./spaces";

const spaces: Space[] = [
  { id: "perso", name: "Perso", color: "#0a9fd8", icon: "maison", position: 0 },
  { id: "travail", name: "Travail", color: "#7a5ce6", icon: "valise", position: 1 },
];

describe("espaces", () => {
  it("nomme le filtre affiché", () => {
    expect(spaceFilterLabel("tous", spaces)).toBe("Tous");
    expect(spaceFilterLabel("travail", spaces)).toBe("Travail");
    expect(spaceFilterLabel("supprime", spaces)).toBe("Tous");
  });

  it("déplace un espace d'un cran", () => {
    expect(moveSpace(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveSpace(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveSpace(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveSpace(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });

  it("trouve le dessin d'un symbole, même inconnu", () => {
    expect(spaceIconPath("maison")).toBe(symbolOf("maison")?.path);
    expect(spaceIconPath("avion")).toBe(symbolOf("avion")?.path);
    expect(spaceIconPath("inconnu")).toBe(symbolOf("etoile")?.path);
  });

  it("garde les symboles des espaces existants", () => {
    for (const id of ["maison", "valise", "coeur", "famille", "etoile", "livre", "sport", "voyage", "argent", "ecole", "cadeau", "feuille"]) {
      expect(symbolOf(id), id).toBeDefined();
    }
  });
});
