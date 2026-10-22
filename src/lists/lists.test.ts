import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cellText,
  columnId,
  COLUMN_KINDS,
  formatPrice,
  groupBySection,
  itemMatches,
  LIST_TEMPLATES,
  listAsText,
  listFromTemplate,
  parsePrice,
  sameTitle,
  sortItems,
  sortOptions,
  suggestionsFor,
  templateOf,
  totalOf,
  type ListItem,
} from "./lists";

const rustList = (source: string, name: string) => [...(source.split(/\r?\n/).find((l) => l.startsWith(`pub const ${name}:`)) ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

const item = (id: string, section: string | null, cells: ListItem["cells"] = {}, done = false, position = 0): ListItem => ({
  id,
  listId: "l",
  title: id,
  section,
  cells,
  done,
  image: null,
  position,
  createdAt: 0,
  updatedAt: 0,
});

describe("listes", () => {
  it("proposent les mêmes modèles et sortes de colonnes que le cœur", () => {
    const rust = readFileSync("src-tauri/src/data/lists.rs", "utf8");
    expect([...LIST_TEMPLATES.map((t) => t.id)].sort()).toEqual([...rustList(rust, "TEMPLATES")].sort());
    expect(COLUMN_KINDS.map((k) => k.id)).toEqual(rustList(rust, "COLUMN_KINDS"));
  });

  it("partent d'un modèle avec ses colonnes et ses rayons", () => {
    const courses = listFromTemplate(templateOf("courses"));
    expect(courses.sections).toContain("Fruits et légumes");
    expect(courses.columns.map((c) => c.kind)).toEqual(["texte", "prix"]);
    expect(templateOf("inconnu" as never).id).toBe("libre");
  });

  it("lisent et affichent les prix, notes et dates", () => {
    expect(parsePrice("12,5")).toBe(1250);
    expect(parsePrice("3.99 €")).toBe(399);
    expect(parsePrice("douze")).toBeNull();
    expect(formatPrice(1250)).toMatch(/12,50/);
    expect(cellText("note", 3)).toBe("★★★☆☆");
    expect(cellText("date", "2026-10-02")).toMatch(/2 oct/);
    expect(cellText("case", false)).toBe("");
  });

  it("rangent par rayon, dans l'ordre de la liste, puis les éléments sans rayon", () => {
    const groups = groupBySection({ sections: ["Frais", "Épicerie"], columns: [] }, [item("pâtes", "Épicerie"), item("lait", "Frais"), item("piles", null)]);
    expect(groups.map((g) => g.section)).toEqual(["Frais", "Épicerie", null]);
  });

  it("additionnent les prix de ce qui reste à acheter", () => {
    const prix = { id: "prix", name: "Prix", kind: "prix" as const };
    const items = [item("a", null, { prix: 250 }), item("b", null, { prix: 100 }, true)];
    expect(totalOf(prix, items)).toBe(350);
    expect(totalOf(prix, items, true)).toBe(250);
  });

  it("donnent un identifiant unique à une nouvelle colonne et cherchent dans les valeurs", () => {
    expect(columnId("Prix unitaire", [])).toBe("prix-unitaire");
    expect(columnId("Prix", [{ id: "prix", name: "Prix", kind: "prix" }])).toBe("prix-2");
    expect(itemMatches(item("Le Petit Prince", null, { auteur: "Saint-Exupéry" }), "exupery")).toBe(true);
  });

  it("se trient par nom, ajout récent ou colonne, les valeurs vides à la fin", () => {
    const list = {
      columns: [
        { id: "note", name: "Note", kind: "note" as const },
        { id: "prix", name: "Prix", kind: "prix" as const },
        { id: "auteur", name: "Auteur", kind: "texte" as const },
      ],
    };
    const items = [
      { ...item("Zadig", null, { note: 3, prix: 900, auteur: "Voltaire" }, false, 0), createdAt: 3 },
      { ...item("candide", null, { note: 5 }, false, 1), createdAt: 1 },
      { ...item("Émile", null, { prix: 450, auteur: "Rousseau" }, false, 2), createdAt: 2 },
    ];
    const titles = (sort: Parameters<typeof sortItems>[2]) => sortItems(list, items, sort).map((i) => i.title);
    expect(titles("manuel")).toEqual(["Zadig", "candide", "Émile"]);
    expect(titles("nom")).toEqual(["candide", "Émile", "Zadig"]);
    expect(titles("recent")).toEqual(["Zadig", "Émile", "candide"]);
    expect(titles("colonne:note")).toEqual(["candide", "Zadig", "Émile"]);
    expect(titles("colonne:prix")).toEqual(["Émile", "Zadig", "candide"]);
    expect(titles("colonne:auteur")).toEqual(["Émile", "Zadig", "candide"]);
    expect(sortOptions(list).map((o) => o.value)).toEqual(["manuel", "nom", "recent", "colonne:note", "colonne:prix", "colonne:auteur"]);
  });
});

describe("saisie et partage", () => {
  const named = (title: string, done: boolean, updatedAt: number, section: string | null = null): ListItem => ({ ...item(title, section, {}, done), title, updatedAt });

  it("retrouve un élément déjà présent et propose ceux de l'historique", () => {
    const list = [named("Pommes", true, 5, "Fruits"), named("Pâtes", false, 9), named("Pain complet", true, 7), named("Lait", true, 3)];
    expect(sameTitle(list, "  pommes ")?.section).toBe("Fruits");
    expect(sameTitle(list, "poires")).toBeUndefined();
    // « pa » : les éléments faits d'abord (à remettre), puis le reste.
    expect(suggestionsFor(list, "pa").map((i) => i.title)).toEqual(["Pain complet", "Pâtes"]);
    // Le titre exact n'est pas proposé (la saisie suffit).
    expect(suggestionsFor(list, "pommes")).toEqual([]);
    // Sans saisie : les derniers éléments faits.
    expect(suggestionsFor(list, "", 2).map((i) => i.title)).toEqual(["Pain complet", "Pommes"]);
  });

  it("écrit la liste en texte, par section", () => {
    const text = listAsText("Courses", [
      { section: "Fruits", items: [named("Pommes", true, 0)] },
      { section: null, items: [named("Pain", false, 0)] },
    ]);
    expect(text).toBe("Courses\n\nFruits\n☑ Pommes\n☐ Pain");
  });
});
