import { describe, expect, it } from "vitest";
import { presetsFor, recurrenceLabel, sameRecurrence, type Recurrence } from "./recurrence";

describe("libellés des répétitions", () => {
  it.each<[Recurrence, string]>([
    [{ kind: "daily", interval: 1 }, "Chaque jour"],
    [{ kind: "daily", interval: 3 }, "Tous les 3 jours"],
    [{ kind: "weekdays" }, "Du lundi au vendredi"],
    [{ kind: "weekly", interval: 1, days: [1] }, "Chaque lundi"],
    [{ kind: "weekly", interval: 1, days: [4, 1] }, "Chaque lundi et jeudi"],
    [{ kind: "weekly", interval: 1, days: [0, 1, 3] }, "Chaque lundi, mercredi et dimanche"],
    [{ kind: "weekly", interval: 2, days: [2] }, "Tous les 2 mardis"],
    [{ kind: "weekly", interval: 2, days: [1, 4] }, "Toutes les 2 semaines : lundi et jeudi"],
    [{ kind: "weekly", interval: 1, days: [1, 2, 3, 4, 5] }, "Du lundi au vendredi"],
    [{ kind: "weekly", interval: 1, days: [0, 1, 2, 3, 4, 5, 6] }, "Chaque jour"],
    [{ kind: "monthly", interval: 1, day: 15 }, "Le 15 de chaque mois"],
    [{ kind: "monthly", interval: 1, day: 1 }, "Le 1er de chaque mois"],
    [{ kind: "monthly", interval: 3, day: 15 }, "Le 15, tous les 3 mois"],
    [{ kind: "monthlyNth", interval: 1, nth: -1, weekday: 5 }, "Le dernier vendredi de chaque mois"],
    [{ kind: "monthlyNth", interval: 1, nth: 2, weekday: 2 }, "Le 2e mardi de chaque mois"],
    [{ kind: "monthlyNth", interval: 1, nth: 1, weekday: 1 }, "Le 1er lundi de chaque mois"],
    [{ kind: "monthlyNth", interval: 2, nth: 1, weekday: 1 }, "Le 1er lundi, tous les 2 mois"],
    [{ kind: "yearly", interval: 1, month: 8, day: 3 }, "Chaque année le 3 août"],
    [{ kind: "yearly", interval: 2, month: 1, day: 1 }, "Tous les 2 ans, le 1er janvier"],
    [{ kind: "afterDone", days: 3 }, "3 jours après achèvement"],
    [{ kind: "afterDone", days: 1 }, "1 jour après achèvement"],
  ])("%j → « %s »", (rule, label) => {
    expect(recurrenceLabel(rule)).toBe(label);
  });
});

describe("répétitions proposées pour une date", () => {
  it("s'appuient sur l'échéance (vendredi 30 octobre 2026, dernier du mois)", () => {
    const presets = presetsFor("2026-10-30");
    expect(presets.map((p) => p.label)).toEqual([
      "Chaque jour",
      "Du lundi au vendredi",
      "Chaque vendredi",
      "Tous les 2 vendredis",
      "Le 30 de chaque mois",
      "Le dernier vendredi de chaque mois",
      "Chaque année le 30 octobre",
    ]);
  });

  it("proposent « 2e mardi » au milieu du mois", () => {
    expect(presetsFor("2026-10-13").map((p) => p.label)).toContain("Le 2e mardi de chaque mois");
  });
});

it("compare deux répétitions, sans tenir compte de l'ordre des jours", () => {
  expect(sameRecurrence({ kind: "weekly", interval: 1, days: [4, 1] }, { kind: "weekly", interval: 1, days: [1, 4] })).toBe(true);
  expect(sameRecurrence({ kind: "daily", interval: 1 }, { kind: "daily", interval: 2 })).toBe(false);
  expect(sameRecurrence(null, null)).toBe(true);
  expect(sameRecurrence({ kind: "weekdays" }, null)).toBe(false);
});
