import { describe, expect, it } from "vitest";
import { monthsLeft, savingsProgress, savingsStatus, type SavingsGoal } from "./savings";

const goal = (g: Partial<SavingsGoal>): SavingsGoal => ({
  id: "g",
  name: "Vacances",
  targetCents: 300_000,
  targetDate: null,
  color: null,
  icon: "tirelire",
  spaceId: null,
  position: 0,
  createdAt: 0,
  updatedAt: 0,
  savedCents: 0,
  ...g,
});

describe("objectifs d'épargne", () => {
  it("mesure l'avancement, sans dépasser 100 % ni descendre sous 0", () => {
    expect(savingsProgress(goal({ savedCents: 75_000 }))).toBe(0.25);
    expect(savingsProgress(goal({ savedCents: 400_000 }))).toBe(1);
    expect(savingsProgress(goal({ savedCents: -5_000 }))).toBe(0);
  });

  it("compte les mois restants, le mois en cours compris", () => {
    expect(monthsLeft("2026-10-25", "2026-10-31")).toBe(1);
    expect(monthsLeft("2026-10-25", "2026-11-10")).toBe(1);
    expect(monthsLeft("2026-10-25", "2027-07-01")).toBe(9);
    expect(monthsLeft("2026-10-25", "2026-10-01")).toBe(0);
  });

  it("dit ce qu'il reste à mettre de côté chaque mois, ou que c'est atteint", () => {
    expect(savingsStatus(goal({ savedCents: 120_000, targetDate: "2027-07-01" }), "2026-10-25")).toEqual({ kind: "mensuel", perMonthCents: 20_000, remainingCents: 180_000 });
    expect(savingsStatus(goal({ savedCents: 300_000 }), "2026-10-25")).toEqual({ kind: "atteint" });
    expect(savingsStatus(goal({ savedCents: 100_000, targetDate: "2026-09-01" }), "2026-10-25")).toEqual({ kind: "depasse", remainingCents: 200_000 });
    expect(savingsStatus(goal({ savedCents: 100_000 }), "2026-10-25")).toEqual({ kind: "libre", remainingCents: 200_000 });
    // La date visée tombe ce mois-ci : tout le reste ce mois-ci.
    expect(savingsStatus(goal({ savedCents: 290_000, targetDate: "2026-10-31" }), "2026-10-25")).toMatchObject({ perMonthCents: 10_000 });
  });
});
