import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { daysLeft, expectedRatio, HORIZONS, METRICS, nextPeriod, outlookOf, paceOf, periodLabel, periodOf, progressOf, progressSeries, type Goal, type GoalStep } from "./goals";

const rustList = (source: string, name: string) => [...(source.split(/\r?\n/).find((l) => l.startsWith(`pub const ${name}:`)) ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

const goal = (g: Partial<Goal>): Goal => ({
  id: "g",
  title: "Lire 20 livres",
  why: "",
  horizon: "annee",
  startDate: "2026-01-01",
  targetDate: "2026-12-31",
  metric: "manuel",
  target: 20,
  unit: "livres",
  habitId: null,
  status: "en-cours",
  color: null,
  icon: "livre",
  spaceId: null,
  position: 0,
  createdAt: 0,
  updatedAt: 0,
  ...g,
});

const step = (done: boolean): GoalStep => ({ id: String(Math.random()), goalId: "g", title: "x", dueDate: null, doneAt: done ? 1 : null, position: 0 });
const empty = { steps: [], entries: [], tasks: [], today: "2026-07-02" };

describe("objectifs", () => {
  it("proposent les mêmes horizons et sortes de progression que le cœur", () => {
    const rust = readFileSync("src-tauri/src/data/goals.rs", "utf8");
    expect(HORIZONS.map((h) => h.id)).toEqual(rustList(rust, "HORIZONS"));
    expect(METRICS.map((m) => m.id)).toEqual(rustList(rust, "METRICS"));
  });

  it("calculent la période d'un horizon", () => {
    expect(periodOf("annee", "2026-10-02")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(periodOf("trimestre", "2026-10-02")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(periodOf("mois", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodOf("libre", "2026-02-10")).toEqual({ start: "2026-02-10", end: null });
    expect(periodLabel({ horizon: "trimestre", startDate: "2026-10-01" })).toBe("4e trimestre 2026");
    expect(periodLabel({ horizon: "trimestre", startDate: "2026-01-01" })).toBe("1er trimestre 2026");
    expect(periodLabel({ horizon: "mois", startDate: "2026-10-01" })).toBe("Octobre 2026");
  });

  it("avancent avec les saisies, les tâches liées, les étapes ou une habitude", () => {
    const entries = [3, 4].map((value, i) => ({ id: String(i), goalId: "g", day: "2026-03-01", value, note: "", createdAt: 0 }));
    expect(progressOf(goal({}), { ...empty, entries })).toMatchObject({ value: 7, total: 20, label: "7 / 20 livres" });
    expect(progressOf(goal({ metric: "taches" }), { ...empty, tasks: [{ done: true }, { done: false }] })).toMatchObject({ ratio: 0.5, label: "1 tâche sur 2" });
    expect(progressOf(goal({ metric: "etapes" }), { ...empty, steps: [step(true), step(true), step(false)] }).label).toBe("2 étapes sur 3");
    const habit = goal({ metric: "habitude", target: 10, unit: "", startDate: "2026-07-01", targetDate: "2026-07-31" });
    expect(progressOf(habit, { ...empty, today: "2026-07-05", habitDone: (d) => d !== "2026-07-03" })).toMatchObject({ value: 4, label: "4 / 10 jours" });
    expect(progressOf(goal({ metric: "taches" }), empty).label).toBe("Aucune tâche liée");
    // Une saisie au-delà de la cible ne dépasse pas 100 %.
    expect(progressOf(goal({ target: 2 }), { ...empty, entries }).ratio).toBe(1);
  });

  it("disent si l'objectif est en avance ou en retard sur le temps écoulé", () => {
    const g = goal({});
    const expected = expectedRatio(g, "2026-07-02");
    expect(expected).toBeCloseTo(0.5, 1);
    expect(paceOf({ value: 15, total: 20, ratio: 0.75, label: "" }, expected)).toBe("avance");
    expect(paceOf({ value: 10, total: 20, ratio: 0.5, label: "" }, expected)).toBe("temps");
    expect(paceOf({ value: 2, total: 20, ratio: 0.1, label: "" }, expected)).toBe("retard");
    expect(paceOf({ value: 2, total: 20, ratio: 0.1, label: "" }, null)).toBeNull();
    expect(daysLeft(g, "2026-12-30")).toBe(1);
  });

  it("se reconduisent sur la période suivante", () => {
    expect(nextPeriod(goal({}))).toEqual({ start: "2027-01-01", end: "2027-12-31" });
    expect(nextPeriod(goal({ horizon: "trimestre", startDate: "2026-10-01", targetDate: "2026-12-31" }))).toEqual({ start: "2027-01-01", end: "2027-03-31" });
    expect(nextPeriod(goal({ horizon: "mois", startDate: "2026-01-01", targetDate: "2026-01-31" }))).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(nextPeriod(goal({ horizon: "libre", startDate: "2026-03-01", targetDate: "2026-03-10" }))).toEqual({ start: "2026-03-11", end: "2026-03-20" });
    expect(nextPeriod(goal({ horizon: "libre", startDate: "2026-03-01", targetDate: null }))).toEqual({ start: "2026-03-01", end: null });
  });
});

describe("prévision et courbe", () => {
  const entry = (day: string, value: number) => ({ id: day, goalId: "g", day, value, note: "", createdAt: 0 });

  it("dit ce qui reste, le rythme par semaine et la date estimée", () => {
    // 5 livres lus en 100 jours (du 1er janvier au 10 avril) : 15 restent.
    const g = goal({});
    const o = outlookOf(g, { value: 5, total: 20 }, "2026-04-10");
    expect(o?.remaining).toBe(15);
    // 265 jours jusqu'au 31 décembre : 15 / 265 × 7.
    expect(o?.perWeek).toBeCloseTo((15 / 265) * 7);
    // Un livre tous les 20 jours : 300 jours de plus.
    expect(o?.eta).toBe("2027-02-04");
    expect(outlookOf(g, { value: 0, total: 20 }, "2026-04-10")?.eta).toBeNull();
    expect(outlookOf(g, { value: 20, total: 20 }, "2026-04-10")).toBeNull();
    expect(outlookOf(goal({ targetDate: null }), { value: 5, total: 20 }, "2026-04-10")?.perWeek).toBeNull();
  });

  it("cumule l'avancement jour après jour", () => {
    const p = { steps: [] as GoalStep[], entries: [entry("2026-02-01", 2), entry("2026-01-10", 1), entry("2026-02-01", 1)], tasks: [], today: "2026-03-01" };
    expect(progressSeries(goal({}), p)).toEqual([
      { day: "2026-01-01", value: 0 },
      { day: "2026-01-10", value: 1 },
      { day: "2026-02-01", value: 4 },
    ]);
    expect(progressSeries(goal({ metric: "taches" }), p)).toBeNull();
    const habit = progressSeries(goal({ metric: "habitude", startDate: "2026-02-26" }), { ...p, habitDone: (d) => d !== "2026-02-27" });
    expect(habit?.map((x) => x.value)).toEqual([0, 1, 2, 3]);
  });
});
