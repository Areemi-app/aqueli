import { describe, expect, it } from "vitest";
import type { Habit } from "../habits/habits";
import type { Contact } from "../contacts/contacts";
import type { Document } from "../documents/documents";
import type { Project } from "../projects/projects";
import type { CalendarEvent } from "../calendar/events";
import type { NoteSummary } from "../notes/notes";
import type { Obligation } from "../obligations/obligations";
import type { Task } from "../tasks/tasks";
import type { BudgetCategory, Transaction } from "../budget/budget";
import type { Goal } from "../goals/goals";
import type { List, ListItem } from "../lists/lists";
import { buildDocs, groupResults, inDates, knownTags, listItemDocId, NO_FILTERS, searchDocs } from "./searchIndex";

const TODAY = "2026-09-29";

const task = (id: string, title: string, extra: Partial<Task> = {}): Task =>
  ({
    id,
    title,
    notes: "",
    spaceId: "perso",
    dueDate: null,
    dueTime: null,
    priority: 0,
    estimate: null,
    tags: [],
    subtasks: [],
    inbox: false,
    doneAt: null,
    createdAt: 1,
    updatedAt: 1,
    recurrence: null,
    color: null,
    reminder: null,
    ...extra,
  }) as Task;

const event = (id: string, title: string, startDate: string): CalendarEvent =>
  ({ id, title, location: "Mairie", notes: "", spaceId: "perso", startDate, startTime: "10:00", endDate: startDate, endTime: "11:00" }) as CalendarEvent;

const obligation = (id: string, title: string): Obligation =>
  ({ id, title, organization: "Maif", reference: "AUTO-1", notes: "", dueDate: "2026-10-06", spaceId: "travail", status: "a-faire" }) as Obligation;

const note = (id: string, title: string, extra: Partial<NoteSummary> = {}): NoteSummary =>
  ({ id, title, excerpt: "", tags: [], spaceId: "perso", updatedAt: Math.floor(new Date(2026, 8, 20).getTime() / 1000), ...extra }) as NoteSummary;

const docs = buildDocs({
  tasks: [
    task("t1", "Réunion d'équipe", { dueDate: "2026-09-30", tags: ["travail"] }),
    task("t2", "Réunion parents", { dueDate: "2026-12-01", doneAt: 5 }),
    task("t3", "Arroser les plantes", { tags: ["maison/jardin"] }),
  ],
  events: [event("e1", "Réunion de quartier", "2026-10-02")],
  obligations: [obligation("o1", "Assurance auto")],
  notes: [note("n1", "Compte rendu", { excerpt: "Notes de la réunion", tags: ["travail"] })],
  journal: [{ day: "2026-09-29", mood: 4, energy: 3, gratitudes: ["Le soleil", "", ""], excerpt: "Promenade au parc", updatedAt: 0, activities: [] }],
  habits: [
    { id: "h1", name: "Méditer", frequency: { kind: "quotidien" }, unit: "minutes", spaceId: "perso", archived: false } as Habit,
    { id: "h2", name: "Courir", frequency: { kind: "semaine", times: 2 }, unit: "", spaceId: "perso", archived: true } as Habit,
  ],
});

const ids = (query: string, filters = NO_FILTERS, noteIds: string[] = []) =>
  searchDocs(docs, query, filters, TODAY, noteIds).map((r) => r.doc.id);

describe("recherche globale", () => {
  it("trouve les projets, les contacts (numéro compris) et les documents", () => {
    const more = buildDocs({
      tasks: [],
      events: [],
      obligations: [],
      notes: [],
      projects: [{ id: "p1", name: "Déménagement", description: "Cartons et box", status: "en-cours", archived: false, endDate: null, spaceId: "perso" } as Project],
      contacts: [{ id: "c1", firstName: "Léa", lastName: "Bernard", company: "", phones: [{ label: "Mobile", value: "06 12 34 56 78" }], emails: [], address: "", notes: "", tags: ["famille"], spaceId: "famille" } as unknown as Contact],
      documents: [{ id: "d1", name: "Carte d'identité.pdf", ext: "pdf", size: 1000, notes: "", tags: ["papiers"], expiresOn: "2031-03-01", spaceId: "perso" } as Document],
    });
    const found = (q: string) => searchDocs(more, q, NO_FILTERS, TODAY).map((r) => r.doc.id);
    expect(found("demenagement")).toEqual(["p1"]);
    expect(found("cartons")).toEqual(["p1"]);
    expect(found("bernard")).toEqual(["c1"]);
    expect(found("famille")).toEqual(["c1"]);
    expect(found("identite")).toEqual(["d1"]);
    expect(found("papiers")).toEqual(["d1"]);
  });

  it("trouve les listes et leurs éléments, les objectifs et les opérations du budget", () => {
    const more = buildDocs({
      tasks: [],
      events: [],
      obligations: [],
      notes: [],
      lists: [{ id: "l1", name: "Livres à lire", columns: [{ id: "auteur", name: "Auteur", kind: "texte" }], sections: [], archived: false, spaceId: null } as unknown as List],
      listItems: new Map([["l1", [{ id: "i1", listId: "l1", title: "Dune", section: null, cells: { auteur: "Frank Herbert" }, done: false } as unknown as ListItem]]]),
      goals: [{ id: "g1", title: "Courir un semi-marathon", why: "Pour la santé", horizon: "annee", startDate: "2026-01-01", targetDate: "2026-12-31", status: "en-cours", spaceId: null, unit: "km" } as unknown as Goal],
      transactions: [{ id: "t1", label: "Marché du samedi", amountCents: 4250, kind: "depense", categoryId: "cat-courses", notes: "", day: "2026-09-26", spaceId: null } as Transaction],
      budgetCategories: [{ id: "cat-courses", name: "Courses" } as BudgetCategory],
    });
    const found = (q: string) => searchDocs(more, q, NO_FILTERS, TODAY).map((r) => r.doc.id);
    expect(found("livres")).toEqual(["l1"]);
    expect(found("herbert")).toEqual([listItemDocId("l1", "i1")]);
    expect(found("semi marathon")).toEqual(["g1"]);
    expect(found("marche samedi")).toEqual(["t1"]);
    expect(found("courses")).toEqual(["t1"]);
    expect(searchDocs(more, "dune", NO_FILTERS, TODAY)[0]!.doc.detail).toBe("Liste « Livres à lire » · Frank Herbert");
  });

  it("trouve les pages du journal et les habitudes", () => {
    expect(ids("promenade")).toEqual(["2026-09-29"]);
    expect(ids("soleil")).toEqual(["2026-09-29"]);
    expect(ids("mardi 29")).toEqual(["2026-09-29"]);
    expect(searchDocs(docs, "orage", NO_FILTERS, TODAY, [], ["2026-09-29"]).map((r) => r.doc.id)).toEqual(["2026-09-29"]);
    expect(ids("mediter")).toEqual(["h1"]);
    const archived = searchDocs(docs, "courir", NO_FILTERS, TODAY)[0]!;
    expect(archived.doc.closed).toBe(true);
    expect(groupResults(searchDocs(docs, "minutes", NO_FILTERS, TODAY)).map((g) => g.kind)).toEqual(["habit"]);
  });

  it("cherche dans tous les modules, sans accents et avec une faute", () => {
    expect(new Set(ids("reunion"))).toEqual(new Set(["t1", "t2", "e1", "n1"]));
    expect(ids("reunoin")).toContain("t1");
    expect(ids("maif")).toEqual(["o1"]);
    expect(ids("mairie")).toEqual(["e1"]);
  });

  it("met le titre devant le texte, puis ce qui est proche d'aujourd'hui ; ce qui est terminé passe après", () => {
    const order = ids("reunion");
    expect(order.indexOf("t1")).toBeLessThan(order.indexOf("n1"));
    expect(order.indexOf("t1")).toBeLessThan(order.indexOf("t2"));
  });

  it("filtre par type, date, étiquette et espace", () => {
    expect(ids("reunion", { ...NO_FILTERS, kind: "event" })).toEqual(["e1"]);
    expect(ids("reunion", { ...NO_FILTERS, date: "7-jours" })).toEqual(["t1", "e1"]);
    expect(ids("reunion", { ...NO_FILTERS, tag: "travail" }).sort()).toEqual(["n1", "t1"]);
    expect(ids("arroser", { ...NO_FILTERS, tag: "maison" })).toEqual(["t3"]);
    expect(ids("assurance", { ...NO_FILTERS, space: "perso" })).toEqual([]);
  });

  it("reprend les notes trouvées dans leur texte complet par le cœur", () => {
    expect(ids("budget")).toEqual([]);
    expect(ids("budget", NO_FILTERS, ["n1"])).toEqual(["n1"]);
  });

  it("groupe par type et liste les étiquettes", () => {
    expect(groupResults(searchDocs(docs, "reunion", NO_FILTERS, TODAY)).map((g) => [g.label, g.results.length])).toEqual([
      ["Tâches", 2],
      ["Événements", 1],
      ["Notes", 1],
    ]);
    expect(knownTags(docs)).toEqual(["maison/jardin", "travail"]);
    expect(inDates(null, "toutes", TODAY)).toBe(true);
    expect(inDates(null, "annee", TODAY)).toBe(false);
  });
});
