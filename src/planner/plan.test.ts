import { describe, expect, it } from "vitest";
import type { Task } from "../tasks/tasks";
import {
  blocksFor,
  candidates,
  durationOf,
  formatDuration,
  nextFreeStart,
  plannedMinutes,
  snap,
  toMinutes,
  toTime,
} from "./plan";

const TODAY = "2026-09-28";

let seq = 0;
function task(title: string, extra: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title,
    notes: "",
    spaceId: null,
    dueDate: TODAY,
    dueTime: null,
    startDate: null,
    priority: 0,
    estimate: null,
    tags: [],
    subtasks: [],
    recurrence: null,
    color: null,
    reminder: null,
    inbox: false,
    projectId: null,
    doing: false,
    doneAt: null,
    createdAt: seq,
    updatedAt: seq,
    ...extra,
  };
}

describe("heures", () => {
  it("passe d'une heure « 14:30 » aux minutes et retour", () => {
    expect(toMinutes("14:30")).toBe(870);
    expect(toTime(870)).toBe("14:30");
    expect(toTime(5)).toBe("00:05");
  });

  it("reste dans la journée", () => {
    expect(toTime(-30)).toBe("00:00");
    expect(toTime(24 * 60)).toBe("23:45");
  });

  it("s'aligne sur le quart d'heure le plus proche", () => {
    expect(snap(607)).toBe(600);
    expect(snap(608)).toBe(615);
  });

  it("donne 30 min aux tâches sans durée estimée", () => {
    expect(durationOf(task("a"))).toBe(30);
    expect(durationOf(task("b", { estimate: 90 }))).toBe(90);
    expect(durationOf(task("c", { estimate: 5 }))).toBe(15);
  });

  it("écrit une durée à la française", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(150)).toBe("2 h 30");
  });
});

describe("tâches à planifier", () => {
  it("propose les tâches en retard et celles du jour sans heure", () => {
    const retard = task("Retard", { dueDate: "2026-09-26" });
    const retardHeure = task("Retard avec heure", { dueDate: "2026-09-27", dueTime: "10:00" });
    const jour = task("Du jour");
    const placee = task("Déjà placée", { dueTime: "09:00" });
    const demain = task("Demain", { dueDate: "2026-09-29" });
    const faite = task("Faite", { doneAt: 1 });
    const sansDate = task("Sans date", { dueDate: null });
    const { late, today } = candidates([retard, retardHeure, jour, placee, demain, faite, sansDate], TODAY);
    expect(late.map((t) => t.title)).toEqual(["Retard", "Retard avec heure"]);
    expect(today.map((t) => t.title)).toEqual(["Du jour"]);
  });
});

describe("agenda du jour", () => {
  it("place les tâches du jour qui ont une heure", () => {
    const blocks = blocksFor([task("A", { dueTime: "09:00", estimate: 60 }), task("B"), task("C", { dueTime: "14:00", doneAt: 1 })], TODAY);
    expect(blocks.map((b) => [b.task.title, b.start, b.end])).toEqual([["A", 540, 600]]);
  });

  it("met côte à côte les tâches qui se chevauchent", () => {
    const blocks = blocksFor(
      [
        task("A", { dueTime: "09:00", estimate: 60 }),
        task("B", { dueTime: "09:30" }),
        task("C", { dueTime: "10:00" }),
        task("D", { dueTime: "11:00" }),
      ],
      TODAY,
    );
    const lanes = Object.fromEntries(blocks.map((b) => [b.task.title, [b.lane, b.lanes]]));
    expect(lanes).toEqual({ A: [0, 2], B: [1, 2], C: [0, 1], D: [0, 1] });
  });

  it("s'arrête à minuit", () => {
    const [late] = blocksFor([task("Tard", { dueTime: "23:45", estimate: 60 })], TODAY);
    expect(late?.end).toBe(24 * 60);
  });

  it("trouve le prochain créneau libre", () => {
    const blocks = blocksFor([task("A", { dueTime: "09:00", estimate: 60 }), task("B", { dueTime: "10:15" })], TODAY);
    expect(nextFreeStart(blocks, 540, 15)).toBe(600);
    expect(nextFreeStart(blocks, 540, 30)).toBe(645);
    expect(nextFreeStart(blocks, 487, 30)).toBe(495);
    expect(nextFreeStart([], 23 * 60 + 50, 30)).toBeNull();
  });

  it("compte le temps planifié sans doubler les chevauchements", () => {
    const blocks = blocksFor([task("A", { dueTime: "09:00", estimate: 60 }), task("B", { dueTime: "09:30", estimate: 60 }), task("C", { dueTime: "14:00" })], TODAY);
    expect(plannedMinutes(blocks)).toBe(120);
  });
});
