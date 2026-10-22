import { describe, expect, it } from "vitest";
import {
  addMonthsAnchored,
  cancelSoon,
  mergeCategories,
  dueDatesBetween,
  dueLabel,
  formatAmount,
  parseAmount,
  sectionsOf,
  paidInYear,
  subscriptionsPerMonth,
  subscriptionsPerYear,
  type Obligation,
} from "./obligations";
import { symbolOf } from "../components/symbols";

const TODAY = "2026-09-29";
let seq = 0;
const obligation = (title: string, extra: Partial<Obligation> = {}): Obligation => {
  seq += 1;
  return {
    id: `o${seq}`,
    title,
    category: "factures",
    organization: "",
    reference: "",
    amountCents: null,
    periodMonths: null,
    dueDate: "2026-10-15",
    anchorDay: 15,
    cancelBy: null,
    status: "a-faire",
    spaceId: null,
    color: null,
    notes: "",
    lastPaidOn: null,
    createdAt: 1,
    updatedAt: 1,
    autoPay: false,
    ...extra,
  };
};

describe("montants", () => {
  it("s'écrivent à la française", () => {
    expect(formatAmount(4590).replace(/\s/g, " ")).toBe("45,90 €");
  });

  it("se saisissent de plusieurs façons", () => {
    expect(parseAmount("45,9")).toBe(4590);
    expect(parseAmount(" 1 234,50 € ")).toBe(123450);
    expect(parseAmount("12.5")).toBe(1250);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("douze")).toBeNaN();
    expect(parseAmount("1,234")).toBeNaN();
  });
});

describe("échéances", () => {
  it("gardent le jour du mois, ou le dernier jour d'un mois plus court", () => {
    expect(addMonthsAnchored("2027-01-31", 1, 31)).toBe("2027-02-28");
    expect(addMonthsAnchored("2027-01-31", 2, 31)).toBe("2027-03-31");
    expect(addMonthsAnchored("2026-11-30", 3, 30)).toBe("2027-02-28");
  });

  it("se projettent pour une obligation périodique", () => {
    const rent = obligation("Loyer", { dueDate: "2026-10-31", anchorDay: 31, periodMonths: 1 });
    expect(dueDatesBetween(rent, "2026-10-01", "2027-01-31")).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31"]);
    expect(dueDatesBetween(obligation("Taxe", { dueDate: "2026-10-15" }), "2026-01-01", "2026-12-31")).toEqual(["2026-10-15"]);
  });

  it("s'annoncent simplement", () => {
    expect(dueLabel("2026-09-26", TODAY)).toBe("En retard de 3 jours");
    expect(dueLabel(TODAY, TODAY)).toBe("Aujourd'hui");
    expect(dueLabel("2026-09-30", TODAY)).toBe("Demain");
    expect(dueLabel("2026-10-09", TODAY)).toBe("Dans 10 jours");
  });
});

describe("catégories personnalisées", () => {
  it("gardent l'origine pour ce qui n'est pas choisi", () => {
    const merged = mergeCategories([
      { id: "logement", label: "Maison et jardin", color: null, icon: "feuille" },
      { id: "sante", label: null, color: "#1f9a6e", icon: null },
      { id: "impots", label: null, color: null, icon: "inconnu" },
    ]);
    expect(merged.find((c) => c.id === "logement")).toMatchObject({ label: "Maison et jardin", color: "#2fae4a", symbol: "feuille" });
    expect(merged.find((c) => c.id === "logement")?.icon).toBe(symbolOf("feuille")?.path);
    expect(merged.find((c) => c.id === "sante")).toMatchObject({ label: "Santé", color: "#1f9a6e", symbol: "coeur" });
    expect(merged.find((c) => c.id === "impots")?.symbol, "symbole inconnu : celui d'origine").toBe("banque");
    expect(merged).toHaveLength(10);
  });
});

describe("liste des obligations", () => {
  it("se range en sections", () => {
    const list = [
      obligation("Plus tard", { dueDate: "2027-01-10" }),
      obligation("Retard", { dueDate: "2026-09-20" }),
      obligation("Bientôt", { dueDate: "2026-10-05" }),
      obligation("Payée", { status: "paye" }),
      obligation("Résiliée", { status: "resilie" }),
    ];
    expect(sectionsOf(list, TODAY).map((s) => [s.title, s.obligations.map((o) => o.title)])).toEqual([
      ["En retard", ["Retard"]],
      ["30 prochains jours", ["Bientôt"]],
      ["Plus tard", ["Plus tard"]],
      ["Payées", ["Payée"]],
      ["Résiliées", ["Résiliée"]],
    ]);
  });

  it("totalise les abonnements par mois", () => {
    const list = [
      obligation("Musique", { category: "abonnements", amountCents: 1099, periodMonths: 1 }),
      obligation("Box", { category: "abonnements", amountCents: 35880, periodMonths: 12 }),
      obligation("Ancien", { category: "abonnements", amountCents: 999, periodMonths: 1, status: "resilie" }),
      obligation("Assurance", { category: "assurances", amountCents: 3000, periodMonths: 1 }),
    ];
    expect(subscriptionsPerMonth(list)).toBe(1099 + 2990);
  });

  it("signale une date limite de résiliation proche", () => {
    expect(cancelSoon(obligation("Box", { cancelBy: "2026-11-15" }), TODAY)).toBe(true);
    expect(cancelSoon(obligation("Box", { cancelBy: "2027-06-15" }), TODAY)).toBe(false);
    expect(cancelSoon(obligation("Box", { cancelBy: "2026-11-15", status: "resilie" }), TODAY)).toBe(false);
  });
});

describe("abonnements à l'année et paiements", () => {
  it("ramène les abonnements à l'année et totalise les paiements de l'année", () => {
    const list = [
      obligation("Musique", { category: "abonnements", amountCents: 1099, periodMonths: 1 }),
      obligation("Presse", { category: "abonnements", amountCents: 6000, periodMonths: 12 }),
      obligation("Ancien", { category: "abonnements", amountCents: 999, periodMonths: 1, status: "resilie" }),
    ];
    expect(subscriptionsPerYear(list)).toBe(1099 * 12 + 6000);
    const pay = (paidOn: string, amountCents: number | null) => ({ id: 1, obligationId: "o", dueDate: paidOn, paidOn, amountCents, auto: true });
    expect(paidInYear([pay("2026-01-05", 2999), pay("2026-02-05", 2999), pay("2025-12-05", 2999), pay("2026-03-05", null)], "2026")).toBe(5998);
  });
});
