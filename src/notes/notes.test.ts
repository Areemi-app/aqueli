import { describe, expect, it } from "vitest";
import {
  backlinks,
  canNestNotebook,
  filterNotes,
  heightOf,
  depthOf,
  linksIn,
  notebookPath,
  notebookTree,
  noteTitle,
  plainOf,
  sortNotes,
  subtreeIds,
  tagCounts,
  titleMatches,
  updatedLabel,
  modifiedLabel,
  wordCount,
  type Notebook,
  type NoteSummary,
} from "./notes";
import { BUILTIN_TEMPLATES, fillDoc, fillVariables, isoWeek } from "./templates";

const book = (id: string, name: string, parentId: string | null = null, folderId: string | null = null): Notebook => ({ id, name, parentId, color: null, icon: null, folderId, createdAt: 1 });
const BOOKS = [book("t", "Travail"), book("p", "Projets", "t"), book("a", "Aqueli", "p"), book("m", "Maison"), book("c", "Cuisine", "m")];

const note = (id: string, extra: Partial<NoteSummary> = {}): NoteSummary => ({
  id,
  title: id,
  excerpt: "",
  notebookId: null,
  spaceId: null,
  tags: [],
  pinned: false,
  favorite: false,
  color: null,
  archived: false,
  links: [],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe("carnets", () => {
  it("s'affichent en arbre, par ordre alphabétique", () => {
    expect(notebookTree(BOOKS).map((r) => `${"  ".repeat(r.depth)}${r.notebook.name}${r.hasChildren ? " +" : ""}`)).toEqual([
      "Maison +",
      "  Cuisine",
      "Travail +",
      "  Projets +",
      "    Aqueli",
    ]);
  });

  it("donnent leur chemin, leur niveau, leur hauteur et leurs sous-carnets", () => {
    expect(notebookPath("a", BOOKS)).toBe("Travail › Projets › Aqueli");
    expect([depthOf("a", BOOKS), depthOf("t", BOOKS)]).toEqual([3, 1]);
    expect([heightOf("t", BOOKS), heightOf("m", BOOKS), heightOf("c", BOOKS)]).toEqual([3, 2, 1]);
    expect([...subtreeIds("t", BOOKS)].sort()).toEqual(["a", "p", "t"]);
  });

  it("se rangent dans un autre carnet sans boucle ni excès de niveaux", () => {
    expect(canNestNotebook("c", "t", BOOKS)).toBe(true);
    expect(canNestNotebook("m", "t", BOOKS)).toBe(true);
    // Pas dans lui-même ni dans un de ses sous-carnets.
    expect(canNestNotebook("t", "t", BOOKS)).toBe(false);
    expect(canNestNotebook("t", "a", BOOKS)).toBe(false);
    // Déjà rangé là.
    expect(canNestNotebook("c", "m", BOOKS)).toBe(false);
    // Trois niveaux au plus : « Maison › Cuisine » ne va pas sous « Projets ».
    expect(canNestNotebook("m", "p", BOOKS)).toBe(false);
    expect(canNestNotebook("c", "p", BOOKS)).toBe(true);
    expect(canNestNotebook("c", "a", BOOKS)).toBe(false);
  });

  it("un sous-carnet dont le parent a disparu remonte au premier niveau", () => {
    expect(notebookTree([book("x", "Orphelin", "disparu")]).map((r) => r.depth)).toEqual([0]);
  });
});

describe("filtres et tri", () => {
  const notes = [
    note("n1", { notebookId: "a", tags: ["maison/jardin"], updatedAt: 5 }),
    note("n2", { notebookId: "t", favorite: true, updatedAt: 9 }),
    note("n3", { pinned: true, tags: ["Maison"], updatedAt: 2 }),
    note("n4", { notebookId: "disparu", updatedAt: 1 }),
  ];

  it("un carnet montre aussi ses sous-carnets ; « Sans carnet » reprend les carnets disparus", () => {
    expect(filterNotes(notes, { kind: "carnet", id: "t" }, BOOKS).map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(filterNotes(notes, { kind: "sans-carnet" }, BOOKS).map((n) => n.id)).toEqual(["n3", "n4"]);
    expect(filterNotes(notes, { kind: "favoris" }, BOOKS).map((n) => n.id)).toEqual(["n2"]);
  });

  it("une note archivée ne figure que dans « Archives »", () => {
    const withArchive = [...notes, note("n5", { notebookId: "t", favorite: true, archived: true })];
    expect(filterNotes(withArchive, { kind: "toutes" }, BOOKS).map((n) => n.id)).toEqual(["n1", "n2", "n3", "n4"]);
    expect(filterNotes(withArchive, { kind: "carnet", id: "t" }, BOOKS).map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(filterNotes(withArchive, { kind: "favoris" }, BOOKS).map((n) => n.id)).toEqual(["n2"]);
    expect(filterNotes(withArchive, { kind: "archives" }, BOOKS).map((n) => n.id)).toEqual(["n5"]);
  });

  it("une étiquette comprend ses sous-étiquettes, sans tenir compte des majuscules", () => {
    expect(filterNotes(notes, { kind: "etiquette", tag: "maison" }, BOOKS).map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(tagCounts(notes)).toEqual([
      { tag: "Maison", count: 1 },
      { tag: "maison/jardin", count: 1 },
    ]);
  });

  it("épinglées d'abord, puis les plus récentes", () => {
    expect(sortNotes(notes).map((n) => n.id)).toEqual(["n3", "n2", "n1", "n4"]);
  });
});

describe("liens entre notes", () => {
  it("se lisent dans le document, sans doublon", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "noteLink", attrs: { id: "b", label: "B" } }, { type: "text", text: " et " }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "noteLink", attrs: { id: "c" } }] }] }] },
        { type: "paragraph", content: [{ type: "noteLink", attrs: { id: "b" } }] },
      ],
    };
    expect(linksIn(doc)).toEqual(["b", "c"]);
  });

  it("le texte brut garde un bloc par ligne et le titre des notes citées", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Titre" }] },
        { type: "paragraph", content: [{ type: "text", text: "Voir " }, { type: "noteLink", attrs: { id: "b", label: "Crêpes" } }] },
        { type: "paragraph" },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Lait" }] }] }] },
      ],
    };
    expect(plainOf(doc)).toBe("Titre\nVoir Crêpes\nLait");
  });

  it("le texte brut garde les contacts cités avec @", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cadeau pour " }, { type: "contactMention", attrs: { id: "lea", label: "Léa Bernard" } }] }] };
    expect(plainOf(doc)).toBe("Cadeau pour @Léa Bernard");
  });

  it("donnent les rétroliens d'une note", () => {
    const notes = [note("a", { links: ["b"], updatedAt: 1 }), note("b", { links: ["b"] }), note("c", { links: ["b", "a"], updatedAt: 3 })];
    expect(backlinks("b", notes).map((n) => n.id)).toEqual(["c", "a"]);
  });

  it("proposent les titres qui commencent par la saisie, puis ceux qui la contiennent", () => {
    const notes = [note("1", { title: "Idées de cadeaux", updatedAt: 9 }), note("2", { title: "Réunion d'équipe" }), note("3", { title: "Équipe", updatedAt: 2 })];
    expect(titleMatches("equipe", notes).map((n) => n.id)).toEqual(["3", "2"]);
    expect(titleMatches("", notes).map((n) => n.id)).toEqual(["1", "3", "2"]);
    expect(noteTitle({ title: "  " })).toBe("Sans titre");
    const pecheNotes = [note("1", { title: "Péché mignon", updatedAt: 9 }), note("2", { title: "Pêche en mer", updatedAt: 1 })];
    expect(titleMatches("peche", pecheNotes).map((n) => n.id)).toEqual(["1", "2"]);
    expect(titleMatches("pêche", pecheNotes).map((n) => n.id)).toEqual(["2", "1"]);
    expect(titleMatches("oeuf", [note("3", { title: "Œufs brouillés" })]).map((n) => n.id)).toEqual(["3"]);
  });
});

describe("dates et mots", () => {
  const now = new Date(2026, 8, 29, 15, 0);
  const at = (d: Date) => Math.floor(d.getTime() / 1000);

  it("l'heure aujourd'hui, « Hier », puis la date", () => {
    expect(updatedLabel(at(new Date(2026, 8, 29, 9, 5)), now)).toBe("09:05");
    expect(updatedLabel(at(new Date(2026, 8, 28, 23, 0)), now)).toBe("Hier");
    expect(updatedLabel(at(new Date(2026, 8, 12)), now)).toBe("12 sept.");
    expect(updatedLabel(at(new Date(2025, 0, 3)), now)).toBe("3 janv. 2025");
    expect(modifiedLabel(at(new Date(2026, 8, 29, 9, 5)), now)).toBe("Modifiée à 09:05");
    expect(modifiedLabel(at(new Date(2026, 8, 28, 9, 5)), now)).toBe("Modifiée hier");
    expect(modifiedLabel(at(new Date(2026, 8, 12)), now)).toBe("Modifiée le 12 sept.");
  });

  it("compte les mots", () => {
    expect(wordCount("  Deux mots — et  un  tiret\n3 ")).toBe(6);
  });
});

describe("modèles", () => {
  it("remplacent {date} et {semaine}", () => {
    const date = new Date(2026, 8, 29);
    expect(isoWeek(date)).toBe(40);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
    expect(fillVariables("Compte rendu du {date}, {semaine}", date)).toBe("Compte rendu du 29 septembre 2026, semaine 40");
    const doc = fillDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Le {date}" }] }] }, date);
    expect(doc.content?.[0]?.content?.[0]?.text).toBe("Le 29 septembre 2026");
  });

  it("sont les quatre du cahier des charges", () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toEqual(["Compte rendu", "Liste de courses", "Fiche recette", "Plan de projet"]);
  });
});

describe("dossiers de carnets", () => {
  it("montrent les notes de leurs carnets et sous-carnets", () => {
    const books = [book("c1", "Voyages", null, "d1"), book("c2", "Italie", "c1"), book("c3", "Recettes")];
    const list = [
      { id: "n1", notebookId: "c2" },
      { id: "n2", notebookId: "c3" },
      { id: "n3", notebookId: "c1" },
    ] as NoteSummary[];
    expect(filterNotes(list, { kind: "dossier", id: "d1" }, books).map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(filterNotes(list, { kind: "dossier", id: "autre" }, books)).toEqual([]);
  });
});
