import { describe, expect, it } from "vitest";
import type { Task } from "./tasks";
import { kanbanColumns, kanbanMove, quadrantMove, quadrantOf, timeline } from "./taskViews";

const TODAY = "2026-10-05"; // lundi
const NOW = new Date(2026, 9, 5, 12).getTime() / 1000;

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

const spaces = [
  { id: "perso", name: "Perso", color: "#2d6ff0" },
  { id: "travail", name: "Travail", color: "#e89a1c" },
];

describe("vue Kanban des tâches", () => {
  it("range par avancement, priorité ou espace", () => {
    const tasks = [task("a"), task("b", { doing: true, priority: 3 }), task("c", { doneAt: NOW - 3600, spaceId: "travail" }), task("d", { doneAt: NOW - 30 * 86_400 }), task("e", { spaceId: null, priority: 2 })];
    expect(kanbanColumns(tasks, "avancement", spaces, NOW).map((c) => [c.id, c.tasks.map((t) => t.id)])).toEqual([
      ["a-faire", ["e", "a"]],
      ["en-cours", ["b"]],
      ["termine", ["c"]],
    ]);
    expect(kanbanColumns(tasks, "priorite", spaces, NOW).map((c) => [c.label, c.tasks.map((t) => t.id)])).toEqual([
      ["Priorité haute", ["b"]],
      ["Priorité moyenne", ["e"]],
      ["Priorité basse", []],
      ["Sans priorité", ["a"]],
    ]);
    expect(kanbanColumns(tasks, "espace", spaces, NOW).map((c) => [c.label, c.tasks.map((t) => t.id)])).toEqual([
      ["Perso", ["b", "a"]],
      ["Travail", []],
      ["Sans espace", ["e"]],
    ]);
  });

  it("change ce qu'il faut quand une tâche change de colonne", () => {
    expect(kanbanMove(task("a"), "en-cours")).toEqual({ changes: { doing: true } });
    expect(kanbanMove(task("a"), "termine")).toEqual({ done: true });
    expect(kanbanMove(task("a", { doneAt: 1 }), "a-faire")).toEqual({ done: false, changes: { doing: false } });
    expect(kanbanMove(task("a"), "a-faire")).toBeNull();
    expect(kanbanMove(task("a"), "p3")).toEqual({ changes: { priority: 3 } });
    expect(kanbanMove(task("a"), "e:travail")).toEqual({ changes: { spaceId: "travail" } });
    expect(kanbanMove(task("a"), "e:")).toEqual({ changes: { spaceId: null } });
  });
});

describe("matrice urgent / important", () => {
  it("classe selon l'échéance (deux jours) et la priorité (moyenne ou haute)", () => {
    expect(quadrantOf(task("a", { dueDate: "2026-10-06", priority: 3 }), TODAY)).toBe("maintenant");
    expect(quadrantOf(task("a", { dueDate: "2026-10-01", priority: 2 }), TODAY)).toBe("maintenant");
    expect(quadrantOf(task("a", { dueDate: "2026-10-20", priority: 2 }), TODAY)).toBe("planifier");
    expect(quadrantOf(task("a", { priority: 3 }), TODAY)).toBe("planifier");
    expect(quadrantOf(task("a", { dueDate: TODAY, priority: 1 }), TODAY)).toBe("expedier");
    expect(quadrantOf(task("a"), TODAY)).toBe("reconsiderer");
  });

  it("déplace en changeant la priorité et l'échéance", () => {
    expect(quadrantMove(task("a"), "maintenant", TODAY)).toEqual({ priority: 2, dueDate: TODAY });
    expect(quadrantMove(task("a", { priority: 3, dueDate: TODAY }), "planifier", TODAY)).toEqual({ dueDate: "2026-10-12" });
    expect(quadrantMove(task("a", { priority: 3 }), "reconsiderer", TODAY)).toEqual({ priority: 1 });
    expect(quadrantMove(task("a"), "reconsiderer", TODAY)).toBeNull();
  });
});

describe("chronologie", () => {
  it("met en tête le retard, puis jour par jour sur deux semaines, puis par semaine", () => {
    const tasks = [
      task("loin", { dueDate: "2026-11-04" }),
      task("retard", { dueDate: "2026-10-02" }),
      task("auj-14h", { dueDate: TODAY, dueTime: "14:00" }),
      task("auj-9h", { dueDate: TODAY, dueTime: "09:00" }),
      task("demain", { dueDate: "2026-10-06" }),
      task("vendredi", { dueDate: "2026-10-09" }),
      task("sans-date"),
      task("fait", { dueDate: TODAY, doneAt: 5 }),
    ];
    const groups = timeline(tasks, TODAY);
    expect(groups.map((g) => [g.label, g.tasks.map((t) => t.id)])).toEqual([
      ["En retard", ["retard"]],
      ["Aujourd'hui", ["auj-9h", "auj-14h"]],
      ["Demain", ["demain"]],
      ["Vendredi 9 octobre", ["vendredi"]],
      ["Semaine du 2 novembre", ["loin"]],
    ]);
    expect(groups[1]!.tone).toBe("today");
  });
});
