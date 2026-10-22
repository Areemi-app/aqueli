import { describe, expect, it } from "vitest";
import { indexChecks, type Habit } from "../habits/habits";
import { doneDay, formatMinutes, habitRate, habitTally, isoWeek, moodAverage, periodOf, periodTitle, shiftPeriod, sumByBucket, weekBounds, weekLabel } from "./review";

const habit = (partial: Partial<Habit> = {}): Habit => ({
  id: "h",
  name: "Marcher",
  icon: "sport",
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
  createdAt: new Date(2026, 8, 1, 9).getTime() / 1000,
  updatedAt: 0,
  ...partial,
});

describe("bilan", () => {
  it("numérote les semaines comme la norme ISO", () => {
    expect(isoWeek("2026-10-02")).toBe("2026-W40");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2024-12-30")).toBe("2025-W01");
    expect(weekBounds("2026-W40")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(weekBounds(isoWeek("2027-01-01")).start).toBe("2026-12-28");
    expect(weekLabel("2026-W40")).toBe("Semaine 40 · 28 sept. – 4 oct.");
  });

  it("découpe les périodes en tranches", () => {
    const week = periodOf("semaine", "2026-10-02");
    expect([week.from, week.to, week.buckets.length]).toEqual(["2026-09-28", "2026-10-04", 7]);
    const month = periodOf("mois", "2026-10-15");
    expect(month.buckets.map((b) => [b.from, b.to])).toEqual([
      ["2026-10-01", "2026-10-04"],
      ["2026-10-05", "2026-10-11"],
      ["2026-10-12", "2026-10-18"],
      ["2026-10-19", "2026-10-25"],
      ["2026-10-26", "2026-10-31"],
    ]);
    const year = periodOf("annee", "2026-10-15");
    expect([year.from, year.to, year.buckets.length, year.buckets[1]!.to]).toEqual(["2026-01-01", "2026-12-31", 12, "2026-02-28"]);
    expect(periodTitle(month)).toBe("Octobre 2026");
    expect(periodTitle(shiftPeriod(month, -1))).toBe("Septembre 2026");
    expect(periodTitle(shiftPeriod(year, 1))).toBe("2027");
    expect(shiftPeriod(week, 1).from).toBe("2026-10-05");
  });

  it("additionne les valeurs par tranche", () => {
    const week = periodOf("semaine", "2026-10-02");
    const values = [
      { day: "2026-09-28", value: 2 },
      { day: "2026-09-28", value: 1 },
      { day: "2026-10-02", value: 25 },
      { day: "2026-10-05", value: 9 },
    ];
    expect(sumByBucket(values, week.buckets)).toEqual([3, 0, 0, 0, 25, 0, 0]);
    expect(doneDay(new Date(2026, 9, 2, 23, 30).getTime() / 1000)).toBe("2026-10-02");
  });

  it("mesure la réussite des habitudes sur les jours passés", () => {
    const daily = habit();
    const checks = indexChecks(["2026-09-28", "2026-09-29", "2026-10-01"].map((day) => ({ habitId: "h", day, value: 1 })));
    // Du lundi 28 au jeudi 1er (jour non coché aujourd'hui exclu) : 3 sur 4.
    const t = habitTally([daily], checks, "2026-09-28", "2026-10-04", "2026-10-02");
    expect(t).toEqual({ done: 3, due: 4 });
    expect(habitRate(t)).toBe(75);
    // « 3 fois par semaine » : 3 jours cochés sur une semaine passée, réussie à 100 %.
    const weekly = habit({ id: "s", frequency: { kind: "semaine", times: 3 } });
    const wChecks = indexChecks(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"].map((day) => ({ habitId: "s", day, value: 1 })));
    expect(habitRate(habitTally([weekly], wChecks, "2026-09-21", "2026-09-27", "2026-10-02"))).toBe(100);
    expect(habitRate(habitTally([], checks, "2026-09-21", "2026-09-27", "2026-10-02"))).toBeNull();
    expect(habitRate(habitTally([habit({ archived: true })], checks, "2026-09-28", "2026-10-04", "2026-10-02"))).toBeNull();
  });

  it("calcule l'humeur moyenne et écrit les durées", () => {
    const pages = [
      { day: "2026-10-01", mood: 4 },
      { day: "2026-10-02", mood: 5 },
      { day: "2026-10-03", mood: null },
      { day: "2026-09-30", mood: 1 },
    ];
    expect(moodAverage(pages, "2026-10-01", "2026-10-31")).toBe(4.5);
    expect(moodAverage(pages, "2026-11-01", "2026-11-30")).toBeNull();
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(200)).toBe("3 h 20");
    expect(formatMinutes(120)).toBe("2 h");
  });
});
