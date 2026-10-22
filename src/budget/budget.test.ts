import { describe, expect, it } from "vitest";
import type { Obligation } from "../obligations/obligations";
import {
  addMonthsDay,
  budgetUse,
  history,
  isRecurring,
  monthBounds,
  monthLabel,
  nextOccurrence,
  perDayLeft,
  plannedPayments,
  repeatLabel,
  scheduledIn,
  searchTransactions,
  shiftMonth,
  summarize,
  type Transaction,
} from "./budget";

const obligation = (o: Partial<Obligation>): Obligation =>
  ({
    id: "o",
    title: "Box internet",
    category: "abonnements",
    organization: "",
    reference: "",
    amountCents: 2999,
    periodMonths: 1,
    dueDate: "2026-10-05",
    anchorDay: 5,
    cancelBy: null,
    status: "a-faire",
    spaceId: null,
    color: null,
    notes: "",
    lastPaidOn: null,
    createdAt: 0,
    updatedAt: 0,
    ...o,
  }) as Obligation;

const t = (day: string, cents: number, kind: "depense" | "revenu" = "depense", categoryId: string | null = "cat-courses"): Transaction => ({
  id: `${day}-${cents}`,
  day,
  amountCents: cents,
  kind,
  categoryId,
  label: "x",
  notes: "",
  spaceId: null,
  createdAt: 0,
  updatedAt: 0,
  repeatMonths: null,
  repeatUntil: null,
  repeatNext: null,
  seriesId: null,
});

describe("budget", () => {
  it("passe d'un mois à l'autre, année comprise", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthBounds("2026-02")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(monthLabel("2026-10")).toBe("Octobre 2026");
  });

  it("reprend les obligations du mois : mensuelles passées et à venir, trimestrielles, ponctuelles", () => {
    const box = obligation({});
    const assurance = obligation({ id: "a", title: "Assurance", periodMonths: 3, dueDate: "2026-11-15", anchorDay: 15, amountCents: 9000 });
    const impot = obligation({ id: "i", title: "Taxe foncière", periodMonths: null, dueDate: "2026-10-15", amountCents: 80000 });
    const sans = obligation({ id: "s", amountCents: null });
    expect(plannedPayments([box, assurance, impot, sans], "2026-08").map((p) => [p.obligation.id, p.day])).toEqual([
      ["a", "2026-08-15"],
      ["o", "2026-08-05"],
    ].sort((x, y) => x[1]!.localeCompare(y[1]!)));
    expect(plannedPayments([box, assurance, impot], "2026-10").map((p) => p.obligation.id)).toEqual(["o", "i"]);
    // Une obligation résiliée n'est plus comptée après sa dernière échéance.
    expect(plannedPayments([obligation({ status: "resilie" })], "2026-12")).toEqual([]);
  });

  it("totalise dépenses, revenus, obligations et solde du mois", () => {
    const list = [t("2026-10-02", 4250), t("2026-10-10", 1000, "depense", null), t("2026-10-01", 200000, "revenu", "cat-salaire"), t("2026-09-30", 999)];
    const s = summarize(list, plannedPayments([obligation({})], "2026-10"), "2026-10");
    expect(s.spent).toBe(5250);
    expect(s.planned).toBe(2999);
    expect(s.income).toBe(200000);
    expect(s.balance).toBe(200000 - 5250 - 2999);
    expect(s.byCategory.get("cat-courses")).toBe(4250);
    expect(s.byCategory.get(null)).toBe(1000);
    expect(history(list, [], "2026-10", 2)).toEqual([
      { month: "2026-09", spent: 999, income: 0 },
      { month: "2026-10", spent: 5250, income: 200000 },
    ]);
    expect(budgetUse({ monthlyCents: 10000 }, 4250)).toBeCloseTo(0.425);
    expect(budgetUse({ monthlyCents: null }, 4250)).toBeNull();
  });
});

describe("opérations récurrentes, recherche et reste par jour", () => {
  it("calcule les échéances au même jour du mois", () => {
    expect(addMonthsDay("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsDay("2026-11-15", 3)).toBe("2027-02-15");
    expect(nextOccurrence("2026-01-31", 1, "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence("2026-01-15", 3, "2026-03-20")).toBe("2026-04-15");
    expect(repeatLabel(1)).toBe("Chaque mois");
    expect(repeatLabel(null)).toBe("Une seule fois");
  });

  it("prévoit les échéances à venir du mois et les compte, charges fixes à part", () => {
    const salary = { ...t("2026-07-28", 245000, "revenu", "cat-salaire"), repeatMonths: 1, repeatNext: "2026-10-28" };
    const gym = { ...t("2026-08-05", 3500, "depense", "cat-loisirs"), repeatMonths: 1, repeatNext: "2026-11-05", repeatUntil: "2026-12-31" };
    const copy = { ...t("2026-10-05", 3500, "depense", "cat-loisirs"), seriesId: gym.id };
    expect(scheduledIn([salary, gym], "2026-10").map((s) => [s.source.id, s.day])).toEqual([[salary.id, "2026-10-28"]]);
    expect(scheduledIn([salary, gym], "2027-01").map((s) => s.source.id)).toEqual([salary.id]);
    const list = [salary, gym, copy, t("2026-10-02", 4250)];
    const s = summarize(list, [], "2026-10", scheduledIn(list, "2026-10"));
    expect(s.income).toBe(245000);
    expect(s.upcomingIncome).toBe(245000);
    expect(s.spent).toBe(3500 + 4250);
    expect(s.fixed).toBe(3500);
    expect(isRecurring(copy)).toBe(true);
  });

  it("cherche dans toutes les opérations, sans accents, montant compris", () => {
    const list = [
      { ...t("2026-10-02", 4250), label: "Marché du samedi" },
      { ...t("2026-09-12", 1999), label: "Café", notes: "Avec Léa" },
      { ...t("2026-08-01", 4250), label: "Pharmacie", categoryId: "cat-sante" },
    ];
    const cats = [{ id: "cat-sante", name: "Santé" }];
    expect(searchTransactions(list, "marche", cats).map((x) => x.label)).toEqual(["Marché du samedi"]);
    expect(searchTransactions(list, "42,50", cats).map((x) => x.label)).toEqual(["Marché du samedi", "Pharmacie"]);
    expect(searchTransactions(list, "sante", cats).map((x) => x.label)).toEqual(["Pharmacie"]);
    expect(searchTransactions(list, "lea", cats).map((x) => x.label)).toEqual(["Café"]);
    expect(searchTransactions(list, " ", cats)).toEqual([]);
  });

  it("donne le reste par jour jusqu'à la fin du mois en cours", () => {
    // 22 jours du 10 au 31 octobre compris.
    expect(perDayLeft(44000, "2026-10-10", "2026-10")).toBe(2000);
    expect(perDayLeft(44000, "2026-10-10", "2026-09")).toBeNull();
    expect(perDayLeft(-100, "2026-10-10", "2026-10")).toBeNull();
  });
});
