import { describe, expect, it } from "vitest";
import { changesTask, DEFAULT_DISPLAY, displaySections, isDefaultDisplay, listChanges, sectionChanges, sortBy, type ListDisplay } from "./taskDisplay";
import type { Task } from "./tasks";

const task = (id: string, t: Partial<Task> = {}): Task =>
  ({
    id,
    title: id,
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

const today = "2026-10-09";
const names = { space: (id: string) => ({ perso: "Perso", travail: "Travail" })[id] ?? null, project: (id: string) => (id === "p1" ? "Déménagement" : null) };
const show = (d: Partial<ListDisplay>, tasks: Task[]) =>
  displaySections("boite", tasks, today, { ...DEFAULT_DISPLAY, ...d }, names).map((s) => `${s.title}: ${s.tasks.map((t) => t.id).join(",")}`);

const tasks = [
  task("courses", { title: "Courses", priority: 1, dueDate: "2026-10-10", tags: ["maison"], createdAt: 3 }),
  task("banque", { title: "Appeler la banque", priority: 3, spaceId: "travail", createdAt: 1 }),
  task("cartons", { title: "Cartons", priority: 2, dueDate: "2026-10-08", projectId: "p1", tags: ["maison", "demenagement"], createdAt: 2 }),
  task("fait", { title: "Déjà fait", priority: 3, doneAt: 100, createdAt: 4 }),
];

describe("affichage d'une liste de tâches", () => {
  it("trie par priorité, titre ou création, les terminées toujours en bas", () => {
    expect(sortBy(tasks, "priorite").map((t) => t.id)).toEqual(["banque", "cartons", "courses", "fait"]);
    expect(sortBy(tasks, "titre").map((t) => t.id)).toEqual(["banque", "cartons", "courses", "fait"]);
    expect(sortBy(tasks, "creation").map((t) => t.id)).toEqual(["courses", "cartons", "banque", "fait"]);
    expect(sortBy(tasks, "auto").map((t) => t.id)).toEqual(["cartons", "courses", "banque", "fait"]);
  });

  it("regroupe par priorité, espace, projet, étiquette ou échéance, les tâches sans valeur à la fin", () => {
    expect(show({ group: "priorite" }, tasks)).toEqual(["Priorité haute: banque,fait", "Priorité moyenne: cartons", "Priorité basse: courses"]);
    expect(show({ group: "espace" }, tasks)).toEqual(["Perso: cartons,courses,fait", "Travail: banque"]);
    expect(show({ group: "projet" }, tasks)).toEqual(["Déménagement: cartons", "Sans projet: courses,banque,fait"]);
    expect(show({ group: "etiquette" }, tasks)).toEqual(["#demenagement: cartons", "#maison: courses", "Sans étiquette: banque,fait"]);
    expect(show({ group: "echeance" }, tasks)).toEqual(["En retard · Hier: cartons", "Demain · sam. 10 oct.: courses", "Sans date: banque,fait"]);
  });

  it("garde une priorité minimale et sait si l'affichage est celui par défaut", () => {
    expect(show({ group: "aucun", minPriority: 3 }, tasks)).toEqual([": banque,fait"]);
    expect(isDefaultDisplay(DEFAULT_DISPLAY)).toBe(true);
    expect(isDefaultDisplay({ ...DEFAULT_DISPLAY, showDone: true })).toBe(false);
  });
});

describe("glisser une tâche", () => {
  it("sur une section : la date, la priorité, l'espace ou le projet de la section", () => {
    expect(sectionChanges("aujourdhui", "auto", "2026-10-10")).toEqual({ dueDate: "2026-10-10" });
    expect(sectionChanges("aujourdhui", "auto", "retard")).toBeNull();
    expect(sectionChanges("boite", "auto", "tout")).toBeNull();
    expect(sectionChanges("boite", "echeance", "sans")).toEqual({ dueDate: null, dueTime: null });
    expect(sectionChanges("boite", "priorite", "3")).toEqual({ priority: 3 });
    expect(sectionChanges("boite", "priorite", "sans")).toEqual({ priority: 0 });
    expect(sectionChanges("boite", "espace", "travail")).toEqual({ spaceId: "travail" });
    expect(sectionChanges("boite", "projet", "sans")).toEqual({ projectId: null });
    expect(sectionChanges("boite", "etiquette", "maison")).toBeNull();
  });

  it("sur une liste : aujourd'hui, demain, sans date, boîte de réception, étiquette, terminée", () => {
    const t = task("t", { dueDate: "2026-10-12", startDate: "2026-10-11", tags: ["Maison"] });
    expect(listChanges(t, "aujourdhui", today)).toEqual({ dueDate: today, startDate: null });
    expect(listChanges(t, "a-venir", today)).toEqual({ dueDate: "2026-10-10" });
    expect(listChanges(t, "sans-date", today)).toEqual({ dueDate: null, dueTime: null });
    expect(listChanges(t, "boite", today)).toEqual({ inbox: true });
    expect(listChanges(t, "terminees", today)).toBe("terminer");
    expect(listChanges(t, "tag:voiture", today)).toEqual({ tags: ["Maison", "voiture"] });
    expect(listChanges(t, "tag:maison", today)).toEqual({});
    expect(listChanges(t, "en-retard", today)).toBeNull();
  });

  it("ne propose une cible que si la tâche changerait", () => {
    const t = task("t", { dueDate: today });
    expect(changesTask(t, { dueDate: today })).toBe(false);
    expect(changesTask(t, { dueDate: "2026-10-10" })).toBe(true);
    expect(changesTask(t, {})).toBe(false);
    expect(changesTask(t, "terminer")).toBe(true);
    expect(changesTask({ ...t, doneAt: 5 }, "terminer")).toBe(false);
  });
});
