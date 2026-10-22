import { describe, expect, it } from "vitest";
import { describeCriteria, EMPTY_CRITERIA, matchesFilter, type FilterCriteria } from "./filters";
import type { Task } from "./tasks";

const TODAY = "2026-10-05";

const task = (title: string, t: Partial<Task> = {}): Task =>
  ({
    id: title,
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
    projectId: null,
    doing: false,
    ...t,
  }) as Task;

const ids = (tasks: Task[], c: Partial<FilterCriteria>) => tasks.filter((t) => matchesFilter(t, { ...EMPTY_CRITERIA, ...c }, TODAY)).map((t) => t.title);

const TASKS = [
  task("jardin", { tags: ["Maison/Jardin"], dueDate: "2026-10-03", priority: 2 }),
  task("ménage", { tags: ["maison"], dueDate: "2026-10-09" }),
  task("rapport", { spaceId: "travail", projectId: "p1", dueDate: TODAY, priority: 3, notes: "Chiffres du trimestre" }),
  task("idée", {}),
  task("fait", { tags: ["maison"], doneAt: 10 }),
];

describe("filtres de tâches enregistrés", () => {
  it("retiennent les étiquettes (sous-étiquettes comprises, sans accents ni majuscules)", () => {
    expect(ids(TASKS, { tags: ["MAISON"] })).toEqual(["jardin", "ménage"]);
    expect(ids(TASKS, { tags: ["maison/jardin"] })).toEqual(["jardin"]);
    expect(ids(TASKS, { tags: ["maison"], includeDone: true })).toEqual(["jardin", "ménage", "fait"]);
  });

  it("combinent priorité, espace, projet et texte", () => {
    expect(ids(TASKS, { minPriority: 2 })).toEqual(["jardin", "rapport"]);
    expect(ids(TASKS, { spaceId: "travail" })).toEqual(["rapport"]);
    expect(ids(TASKS, { projectId: "p1", text: "trimestre" })).toEqual(["rapport"]);
    expect(ids(TASKS, { text: "MENAGE" })).toEqual(["ménage"]);
  });

  it("choisissent une fenêtre d'échéance", () => {
    expect(ids(TASKS, { due: "retard" })).toEqual(["jardin"]);
    expect(ids(TASKS, { due: "aujourdhui" })).toEqual(["jardin", "rapport"]);
    expect(ids(TASKS, { due: "semaine" })).toEqual(["jardin", "ménage", "rapport"]);
    expect(ids(TASKS, { due: "sans-date" })).toEqual(["idée"]);
    expect(ids(TASKS, { due: "datees" })).toEqual(["jardin", "ménage", "rapport"]);
  });

  it("se résument en une ligne", () => {
    const names = { space: (id: string) => (id === "travail" ? "Travail" : null), project: () => null };
    expect(describeCriteria(EMPTY_CRITERIA, names)).toBe("Toutes les tâches à faire");
    expect(describeCriteria({ ...EMPTY_CRITERIA, tags: ["maison"], minPriority: 2, spaceId: "travail", projectId: "x", due: "semaine" }, names)).toBe(
      "#maison · Moyenne ou haute · Espace Travail · Projet supprimé · D'ici 7 jours, retard compris",
    );
  });
});
