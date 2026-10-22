import { describe, expect, it } from "vitest";
import type { FocusSession } from "./api";
import { DEFAULT_FOCUS_SETTINGS, minutesByDay, planOf, readSettings, scheduleForFocus, summarize, topTasks } from "./focus";
import { initialState, PLANS, start, suspend } from "./timer";

const TODAY = "2026-10-01"; // jeudi

function session(day: string, minutes: number, taskId: string | null = null): FocusSession {
  return { id: 0, taskId, day, startedAt: 0, minutes, note: null };
}

describe("statistiques du Focus", () => {
  const sessions = [
    session("2026-09-20", 25),
    session("2026-09-28", 50), // lundi
    session("2026-09-29", 25),
    session("2026-09-30", 25),
    session("2026-09-30", 25),
    session(TODAY, 25, "t1"),
    session(TODAY, 15, "t1"),
  ];

  it("compte les minutes du jour, de la semaine et la série de jours", () => {
    expect(summarize(sessions, TODAY)).toEqual({ today: 40, todaySessions: 2, week: 165, average: 38, streak: 4 });
    // Pas encore de séance aujourd'hui : la série d'hier compte toujours.
    expect(summarize(sessions.slice(0, 5), TODAY).streak).toBe(3);
    expect(summarize([], TODAY)).toEqual({ today: 0, todaySessions: 0, week: 0, average: 0, streak: 0 });
  });

  it("donne les minutes de chaque jour, jours vides compris", () => {
    const week = minutesByDay(sessions, TODAY, 7);
    expect(week.map((d) => d.minutes)).toEqual([0, 0, 0, 50, 25, 50, 40]);
    expect(week[6]!.day).toBe(TODAY);
  });

  it("classe les tâches par temps passé", () => {
    expect(topTasks(new Map([["a", 10], ["b", 90], ["c", 40]]), 2)).toEqual([["b", 90], ["c", 40]]);
  });

  it("lit les réglages enregistrés en corrigeant ce qui ne va pas", () => {
    expect(readSettings(null)).toEqual(DEFAULT_FOCUS_SETTINGS);
    const s = readSettings({ plan: "perso", custom: { focus: 500 }, ambience: "orage", volume: 140, quiet: false });
    expect(s).toMatchObject({ plan: "perso", ambience: "aucune", volume: 100, quiet: false });
    expect(planOf(s)).toEqual({ focus: 240, pause: 8, longPause: 20, every: 4 });
    expect(planOf(DEFAULT_FOCUS_SETTINGS).focus).toBe(25);
    // Séance libre et objectif du jour : seules les valeurs proposées sont gardées.
    expect(readSettings({ plan: "libre", dailyGoal: 90 })).toMatchObject({ plan: "libre", dailyGoal: 90 });
    expect(planOf(readSettings({ plan: "libre" })).flow).toBe(true);
    expect(readSettings({ dailyGoal: 77 }).dailyGoal).toBe(DEFAULT_FOCUS_SETTINGS.dailyGoal);
    expect(readSettings({ dailyGoal: 0 }).dailyGoal).toBe(0);
  });
});

describe("annonce de fin de séance", () => {
  it("annonce la fin de la séance puis celle de la pause", () => {
    const t0 = 1_800_000_000_000;
    const running = start(initialState(PLANS.classique, "t1"), t0);
    expect(scheduleForFocus(running, false)).toEqual([
      { at: 1_800_001_500, taskId: "focus:fin", title: "Séance terminée", when: "Pause de 5 min." },
      { at: 1_800_001_800, taskId: "focus:pause", title: "Pause terminée", when: "Prochaine séance : 25 min." },
    ]);
    expect(scheduleForFocus({ ...running, cycle: 4 }, true)[0]!.when).toBe("Longue pause de 15 min.");
    expect(scheduleForFocus(suspend(running, t0 + 1000), false)).toEqual([]);
    const pause = { ...running, phase: "pause" as const };
    expect(scheduleForFocus(pause, true)).toEqual([{ at: 1_800_001_500, taskId: "focus:pause", title: "Pause terminée", when: "Nouvelle séance de 25 min." }]);
  });

  it("séance libre : fin à 4 heures au plus, puis pause du cinquième", () => {
    const t0 = 1_800_000_000_000;
    const free = start(initialState(PLANS.libre), t0);
    expect(scheduleForFocus({ ...free, cycle: 4 }, false)).toEqual([
      { at: 1_800_014_400, taskId: "focus:fin", title: "Séance terminée", when: "Pause de 30 min." },
      { at: 1_800_016_200, taskId: "focus:pause", title: "Pause terminée", when: "Prochaine séance : libre." },
    ]);
  });
});
