import { describe, expect, it } from "vitest";
import type { Recurrence } from "../tasks/recurrence";
import { matchesRule, occurrenceOf, occurrenceStarts } from "./occurrences";

const series = (recurrence: Recurrence | null, extra: Partial<Parameters<typeof occurrenceStarts>[0]> = {}) => ({
  startDate: "2026-09-28",
  endDate: "2026-09-28",
  recurrence,
  exceptions: [],
  repeatUntil: null,
  ...extra,
});

describe("règles de répétition", () => {
  it("tous les 2 mardis, à partir de la semaine du début", () => {
    const rule: Recurrence = { kind: "weekly", interval: 2, days: [2] };
    expect(matchesRule(rule, "2026-09-29", "2026-10-06")).toBe(false);
    expect(matchesRule(rule, "2026-09-29", "2026-10-13")).toBe(true);
  });

  it("le 31 devient le dernier jour d'un mois plus court", () => {
    const rule: Recurrence = { kind: "monthly", interval: 1, day: 31 };
    expect(matchesRule(rule, "2026-01-31", "2026-02-28")).toBe(true);
    expect(matchesRule(rule, "2026-01-31", "2026-04-30")).toBe(true);
    expect(matchesRule(rule, "2026-01-31", "2026-04-29")).toBe(false);
  });

  it("le dernier vendredi du mois", () => {
    const rule: Recurrence = { kind: "monthlyNth", interval: 1, nth: -1, weekday: 5 };
    expect(matchesRule(rule, "2026-09-25", "2026-10-30")).toBe(true);
    expect(matchesRule(rule, "2026-09-25", "2026-10-23")).toBe(false);
  });

  it("le 29 février devient le 28 les autres années", () => {
    const rule: Recurrence = { kind: "yearly", interval: 1, month: 2, day: 29 };
    expect(matchesRule(rule, "2028-02-29", "2029-02-28")).toBe(true);
  });
});

describe("occurrences d'un événement", () => {
  it("un événement simple n'a qu'une occurrence", () => {
    expect(occurrenceStarts(series(null), "2026-09-01", "2026-09-30")).toEqual(["2026-09-28"]);
    expect(occurrenceStarts(series(null), "2026-10-01", "2026-10-31")).toEqual([]);
  });

  it("chaque lundi, sauf une date retirée, jusqu'à une date", () => {
    const monday = series({ kind: "weekly", interval: 1, days: [1] }, { exceptions: ["2026-10-12"], repeatUntil: "2026-10-26" });
    expect(occurrenceStarts(monday, "2026-09-01", "2026-12-31")).toEqual(["2026-09-28", "2026-10-05", "2026-10-19", "2026-10-26"]);
  });

  it("rien avant le début de la série", () => {
    const daily = series({ kind: "daily", interval: 1 });
    expect(occurrenceStarts(daily, "2026-09-26", "2026-09-29")).toEqual(["2026-09-28", "2026-09-29"]);
  });

  it("une occurrence sur plusieurs jours touche la période même si elle commence avant", () => {
    const weekend = series({ kind: "weekly", interval: 1, days: [6] }, { startDate: "2026-10-03", endDate: "2026-10-04" });
    expect(occurrenceStarts(weekend, "2026-10-11", "2026-10-11")).toEqual(["2026-10-10"]);
  });

  it("garde la durée de la série", () => {
    const night = { startDate: "2026-09-28", startTime: "22:00", endDate: "2026-09-29", endTime: "01:00" };
    expect(occurrenceOf(night, "2026-10-05")).toEqual({ startDate: "2026-10-05", startTime: "22:00", endDate: "2026-10-06", endTime: "01:00" });
  });
});
