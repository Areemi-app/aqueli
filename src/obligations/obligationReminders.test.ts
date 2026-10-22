import { describe, expect, it } from "vitest";
import type { Obligation } from "./obligations";
import {
  DEFAULT_OFFSETS,
  missedObligationsBetween,
  offsetsFor,
  parseObligationReminderId,
  scheduleForObligations,
  type ReminderSettings,
} from "./obligationReminders";

// Mardi 29 septembre 2026, 8 h.
const NOW = new Date(2026, 8, 29, 8, 0);
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const defaults: ReminderSettings = { default: [...DEFAULT_OFFSETS], categories: {} };

const obligation = (extra: Partial<Obligation>): Obligation => ({
  id: "o1",
  title: "Assurance auto",
  category: "assurances",
  organization: "",
  reference: "",
  amountCents: 4590,
  periodMonths: 12,
  dueDate: "2026-10-06",
  anchorDay: 6,
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
});

describe("rappels des obligations", () => {
  it("J-7 et J-1 à 9 h, dans les 35 prochains jours", () => {
    const list = scheduleForObligations([obligation({})], defaults, NOW);
    expect(list.map((r) => [r.taskId, new Date(r.at * 1000).toLocaleString("fr-FR"), r.when.replace(/\s/g, " ")])).toEqual([
      ["obl:o1@2026-10-06:e7", "29/09/2026 09:00:00", "Échéance dans 7 jours · 45,90 €"],
      ["obl:o1@2026-10-06:e1", "05/10/2026 09:00:00", "Échéance demain · 45,90 €"],
    ]);
  });

  it("préviennent aussi avant la date limite de résiliation", () => {
    const box = obligation({ id: "b", dueDate: "2027-01-15", anchorDay: 15, cancelBy: "2026-10-30", amountCents: null });
    const list = scheduleForObligations([box], defaults, NOW);
    expect(list.map((r) => [r.taskId, r.when])).toEqual([
      ["obl:b@2026-10-30:r30", "Date limite de résiliation dans 30 jours"],
      ["obl:b@2026-10-30:r7", "Date limite de résiliation dans 7 jours"],
      ["obl:b@2026-10-30:r1", "Date limite de résiliation demain"],
    ]);
  });

  it("suivent les jours choisis pour la catégorie, et rien une fois payée ou résiliée", () => {
    const onlyDay: ReminderSettings = { ...defaults, categories: { assurances: [0] } };
    expect(offsetsFor(onlyDay, "assurances")).toEqual([0]);
    expect(offsetsFor(onlyDay, "logement")).toEqual([30, 7, 1]);
    expect(scheduleForObligations([obligation({})], onlyDay, NOW).map((r) => r.when.replace(/\s/g, " "))).toEqual(["Échéance aujourd'hui · 45,90 €"]);
    expect(scheduleForObligations([obligation({ status: "paye" }), obligation({ status: "resilie" })], defaults, NOW)).toEqual([]);
  });

  it("retrouvent les rappels manqués", () => {
    const missed = missedObligationsBetween([obligation({ dueDate: "2026-09-30", anchorDay: 30 })], defaults, unix(new Date(2026, 8, 29, 0, 0)), unix(new Date(2026, 8, 29, 10, 0)));
    expect(missed.map((m) => m.id)).toEqual(["obl:o1@2026-09-30:e1"]);
  });

  it("lisent l'identifiant d'une notification", () => {
    expect(parseObligationReminderId("obl:o1@2026-10-06:e7")).toEqual({ obligationId: "o1" });
    expect(parseObligationReminderId("evt:e1@2026-10-06")).toBeNull();
  });
});
