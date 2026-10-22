import { describe, expect, it } from "vitest";
import { dayKey } from "./day";
import { defaultReminderFor, missedBetween, reminderAt, reminderChoices, reminderLabel, scheduleFor } from "./reminders";
import type { Task } from "./tasks";

// Dimanche 27 septembre 2026, 10 h.
const NOW = new Date(2026, 8, 27, 10, 0);
const TODAY = dayKey(NOW);
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

let seq = 0;
function task(title: string, extra: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title,
    notes: "",
    spaceId: null,
    dueDate: null,
    dueTime: null,
    startDate: null,
    priority: 0,
    estimate: null,
    tags: [],
    subtasks: [],
    recurrence: null,
    color: null,
    reminder: null,
    inbox: false,
    projectId: null,
    doing: false,
    doneAt: null,
    createdAt: seq,
    updatedAt: seq,
    ...extra,
  };
}

describe("heure du rappel", () => {
  it("se compte avant l'échéance", () => {
    const t = task("Garage", { dueDate: "2026-09-27", dueTime: "14:00", reminder: 60 });
    expect(reminderAt(t)).toEqual(new Date(2026, 8, 27, 13, 0));
    expect(reminderAt({ ...t, reminder: 0 })).toEqual(new Date(2026, 8, 27, 14, 0));
  });

  it("vise 9 h quand la tâche n'a pas d'heure", () => {
    const t = task("Mutuelle", { dueDate: "2026-09-30", reminder: 0 });
    expect(reminderAt(t)).toEqual(new Date(2026, 8, 30, 9, 0));
    expect(reminderAt({ ...t, reminder: 1440 })).toEqual(new Date(2026, 8, 29, 9, 0));
  });

  it("garde 9 h la veille, même au passage à l'heure d'hiver", () => {
    const t = task("Réveil", { dueDate: "2026-10-26", dueTime: "09:00", reminder: 1440 });
    expect(reminderAt(t)).toEqual(new Date(2026, 9, 25, 9, 0));
  });

  it("n'existe pas sans rappel ni sans échéance", () => {
    expect(reminderAt(task("A", { dueDate: "2026-09-30" }))).toBeNull();
    expect(reminderAt(task("B", { reminder: 15 }))).toBeNull();
  });
});

describe("libellés et choix", () => {
  it.each([
    [0, true, "À l'échéance"],
    [5, true, "5 min avant"],
    [60, true, "1 h avant"],
    [90, true, "1 h 30 avant"],
    [1440, true, "La veille"],
    [2880, true, "2 jours avant"],
    [0, false, "Le jour même à 9 h"],
    [1440, false, "La veille à 9 h"],
  ])("%i min, heure %s → « %s »", (minutes, timed, label) => {
    expect(reminderLabel(minutes, timed)).toBe(label);
  });

  it("propose des choix adaptés à la présence d'une heure", () => {
    expect(reminderChoices(true)).toEqual([0, 5, 15, 30, 60, 120, 1440]);
    expect(reminderChoices(false)).toEqual([0, 1440]);
  });
});

describe("rappels à programmer", () => {
  const garage = task("Appeler le garage", { dueDate: TODAY, dueTime: "14:00", reminder: 60 });
  const passe = task("Déjà passé", { dueDate: TODAY, dueTime: "08:00", reminder: 0 });
  const demain = task("Mutuelle", { dueDate: "2026-09-28", reminder: 0 });
  const fait = task("Fait", { dueDate: TODAY, dueTime: "18:00", reminder: 0, doneAt: 1 });
  const loin = task("Loin", { dueDate: "2026-12-31", reminder: 0 });
  const sansRappel = task("Sans rappel", { dueDate: TODAY, dueTime: "16:00" });

  it("liste les rappels à venir des tâches à faire, dans l'ordre", () => {
    const list = scheduleFor([demain, loin, garage, passe, fait, sansRappel], NOW, TODAY);
    expect(list.map((r) => r.title)).toEqual(["Appeler le garage", "Mutuelle"]);
    expect(list[0]).toEqual({ at: unix(new Date(2026, 8, 27, 13, 0)), taskId: garage.id, title: "Appeler le garage", when: "Aujourd'hui · 14:00" });
    expect(list[1]?.when).toBe("Demain");
  });

  it("retrouve les rappels manqués pendant l'absence", () => {
    const from = unix(new Date(2026, 8, 27, 7, 0));
    const to = unix(NOW);
    expect(missedBetween([garage, passe, demain, fait], from, to).map((t) => t.title)).toEqual(["Déjà passé"]);
  });
});

describe("rappel par défaut", () => {
  it("s'applique quand une tâche reçoit une heure sans rappel", () => {
    expect(defaultReminderFor({ dueTime: null, reminder: null }, "18:17", 0)).toBe(0);
    expect(defaultReminderFor({ dueTime: null, reminder: null }, "18:17", 15)).toBe(15);
  });

  it("ne remplace jamais un rappel déjà choisi", () => {
    expect(defaultReminderFor({ dueTime: null, reminder: 1440 }, "18:17", 0)).toBe(1440);
  });

  it("ne revient pas quand on change seulement l'heure", () => {
    expect(defaultReminderFor({ dueTime: "14:00", reminder: null }, "15:00", 0)).toBeNull();
  });

  it("ne s'applique ni sans heure ni quand le réglage est « Aucun »", () => {
    expect(defaultReminderFor({ dueTime: null, reminder: null }, null, 0)).toBeNull();
    expect(defaultReminderFor({ dueTime: null, reminder: null }, "18:17", null)).toBeNull();
  });
});
