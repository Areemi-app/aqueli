import { describe, expect, it } from "vitest";
import { readingMinutes } from "./outline";
import { filterSlash, slashItems } from "./slash";

describe("menu « / » de l'éditeur", () => {
  const items = slashItems(() => {});

  it("propose les blocs courants, chacun avec un nom, une explication et un symbole", () => {
    expect(items.map((i) => i.label)).toEqual(
      expect.arrayContaining(["Titre 1", "Liste à puces", "Cases à cocher", "Tableau", "Image", "Lien vers une note", "Date du jour"]),
    );
    for (const i of items) expect(i.hint && i.icon).toBeTruthy();
  });

  it("filtre par nom ou par mot-clé, sans accents", () => {
    expect(filterSlash(items, "titre").map((i) => i.id)).toEqual(["titre1", "titre2", "titre3"]);
    expect(filterSlash(items, "todo").map((i) => i.id)).toEqual(["cases"]);
    expect(filterSlash(items, "separ").map((i) => i.id)).toEqual(["separateur"]);
    expect(filterSlash(items, "")).toHaveLength(items.length);
  });

  it("estime le temps de lecture", () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(40)).toBe(1);
    expect(readingMinutes(700)).toBe(3);
  });
});
