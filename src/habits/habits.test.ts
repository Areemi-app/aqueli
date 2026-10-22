import { describe, expect, it } from "vitest";
import { addDays } from "../tasks/day";
import { SYMBOLS } from "../components/symbols";
import {
  bestStreak,
  currentStreak,
  frequencyLabel,
  HABIT_TEMPLATES,
  heatmap,
  indexChecks,
  isForToday,
  isPaused,
  strength,
  streakLabel,
  successRate,
  targetLabel,
  weekCount,
  weekStart,
  type Habit,
  type HabitCheck,
} from "./habits";

// Jeudi 1er octobre 2026 ; habitude créée le lundi 14 septembre.
const TODAY = "2026-10-01";
const CREATED = new Date(2026, 8, 14, 9).getTime() / 1000;

function habit(partial: Partial<Habit> = {}): Habit {
  return {
    id: "h",
    name: "Boire de l'eau",
    icon: "sante",
    color: null,
    kind: "oui-non",
    negative: false,
    target: 1,
    unit: "",
    frequency: { kind: "quotidien" },
    reminder: null,
    moment: null,
    spaceId: null,
    position: 0,
    archived: false,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...partial,
  };
}

const checks = (...days: (string | [string, number])[]): ReturnType<typeof indexChecks> =>
  indexChecks(days.map((d): HabitCheck => (typeof d === "string" ? { habitId: "h", day: d, value: 1 } : { habitId: "h", day: d[0], value: d[1] })));

describe("habitudes", () => {
  it("décrit la fréquence et l'objectif", () => {
    expect(frequencyLabel({ kind: "quotidien" })).toBe("Chaque jour");
    expect(frequencyLabel({ kind: "jours", days: [5, 1, 3] })).toBe("Lun, Mer, Ven");
    expect(frequencyLabel({ kind: "jours", days: [1, 2, 3, 4, 5] })).toBe("En semaine");
    expect(frequencyLabel({ kind: "jours", days: [0, 6] })).toBe("Le week-end");
    expect(frequencyLabel({ kind: "semaine", times: 3 })).toBe("3 fois par semaine");
    expect(targetLabel({ kind: "quantite", target: 8, unit: "verres" })).toBe("8 verres");
    expect(targetLabel({ kind: "oui-non", target: 1, unit: "" })).toBe("");
  });

  it("compte la série en cours sans la couper pour un jour pas encore coché", () => {
    const h = habit();
    const index = checks("2026-09-28", "2026-09-29", "2026-09-30");
    expect(currentStreak(h, index, TODAY)).toEqual({ count: 3, unit: "jour" });
    expect(currentStreak(h, checks("2026-09-28", "2026-09-29", "2026-09-30", TODAY), TODAY).count).toBe(4);
    expect(currentStreak(h, checks("2026-09-28", "2026-09-29"), TODAY).count).toBe(0);
    expect(streakLabel({ count: 1, unit: "jour" })).toBe("1 jour");
  });

  it("ignore les jours non prévus dans la série", () => {
    // Lundi, mercredi, vendredi : mercredi 30, lundi 28, vendredi 25 cochés.
    const h = habit({ frequency: { kind: "jours", days: [1, 3, 5] } });
    expect(currentStreak(h, checks("2026-09-25", "2026-09-28", "2026-09-30"), TODAY).count).toBe(3);
  });

  it("compte en semaines pour « X fois par semaine »", () => {
    const h = habit({ frequency: { kind: "semaine", times: 2 } });
    expect(weekStart(TODAY)).toBe("2026-09-28");
    const index = checks("2026-09-15", "2026-09-17", "2026-09-22", "2026-09-26", "2026-09-29");
    expect(weekCount(h, index, TODAY)).toBe(1);
    // Semaine en cours pas encore réussie : les deux précédentes comptent.
    expect(currentStreak(h, index, TODAY)).toEqual({ count: 2, unit: "semaine" });
    expect(isForToday(h, index, TODAY)).toBe(true);
    expect(isForToday(h, checks("2026-09-28", "2026-09-29"), TODAY)).toBe(false);
  });

  it("calcule le record et le taux de réussite", () => {
    const h = habit();
    const index = checks("2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-20", "2026-09-21", "2026-09-30");
    expect(bestStreak(h, index, TODAY).count).toBe(4);
    // 17 jours prévus du 14 au 30 septembre (aujourd'hui pas encore coché), 7 réussis.
    expect(successRate(h, index, TODAY)).toBe(41);
    expect(successRate(habit(), checks(), TODAY)).toBe(0);
  });

  it("une quantité compte quand l'objectif est atteint", () => {
    const h = habit({ kind: "quantite", target: 8 });
    expect(currentStreak(h, checks(["2026-09-30", 8], ["2026-09-29", 5]), TODAY).count).toBe(1);
  });

  it("dessine la carte de l'année", () => {
    const h = habit({ kind: "quantite", target: 8 });
    const weeks = heatmap(h, checks(["2026-09-30", 8], ["2026-09-29", 4], ["2026-09-28", 1]), TODAY);
    expect(weeks).toHaveLength(53);
    const last = weeks[52]!;
    expect(last[0]).toEqual({ day: "2026-09-28", level: 1, outside: false, paused: false });
    expect(last[1]!.level).toBe(2);
    expect(last[2]!.level).toBe(4);
    expect(last[4]!.outside).toBe(true);
    expect(weeks[0]![0]!.outside).toBe(true);
  });

  it("les modèles utilisent des symboles connus", () => {
    for (const t of HABIT_TEMPLATES) expect(SYMBOLS.map((s) => s.id)).toContain(t.icon);
  });
});

describe("pauses et force de l'habitude", () => {
  const pause = (day: string): HabitCheck => ({ habitId: "h", day, value: 0, skipped: true });
  const index = (done: string[], paused: string[]) =>
    indexChecks([...done.map((day): HabitCheck => ({ habitId: "h", day, value: 1 })), ...paused.map(pause)]);

  it("un jour de pause ne coupe pas la série et ne compte pas dans le taux", () => {
    const h = habit();
    // 28, 29 et 30 septembre faits, sauf le 29 en pause : la série continue sur 2 jours.
    const idx = index(["2026-09-28", "2026-09-30"], ["2026-09-29"]);
    expect(isPaused(idx, "h", "2026-09-29")).toBe(true);
    expect(currentStreak(h, idx, TODAY)).toEqual({ count: 2, unit: "jour" });
    expect(currentStreak(h, index(["2026-09-28", "2026-09-30"], []), TODAY)).toEqual({ count: 1, unit: "jour" });
    // Jour de pause aujourd'hui : l'habitude n'est plus proposée.
    expect(isForToday(h, index([], [TODAY]), TODAY)).toBe(false);
  });

  it("une semaine de vacances ne compte pas pour « X fois par semaine »", () => {
    const h = habit({ frequency: { kind: "semaine", times: 3 } });
    // Semaine du 21 : trois fois ; semaine du 14 : en pause tout entière (au moins 3 jours).
    const idx = index(["2026-09-21", "2026-09-23", "2026-09-25"], ["2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(currentStreak(h, idx, TODAY)).toEqual({ count: 1, unit: "semaine" });
  });

  it("la force monte avec la régularité et baisse doucement après un oubli", () => {
    const h = habit();
    const every = (from: string, to: string) => {
      const days: string[] = [];
      for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
      return days;
    };
    const regular = strength(h, index(every("2026-09-14", "2026-10-01"), []), TODAY);
    const oneMiss = strength(h, index(every("2026-09-14", "2026-10-01").filter((d) => d !== "2026-09-30"), []), TODAY);
    const never = strength(h, index([], []), TODAY);
    expect(regular).toBeGreaterThan(80);
    expect(oneMiss).toBeLessThan(regular);
    expect(oneMiss).toBeGreaterThan(regular - 15);
    expect(never).toBe(0);
  });
});
