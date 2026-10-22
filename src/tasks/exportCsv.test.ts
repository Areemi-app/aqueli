import { describe, expect, it } from "vitest";
import { COLUMNS, ID_COLUMN } from "../import/fields";
import type { ImportContext } from "../import/records";
import { previewSources, readImportFile } from "../import/sources";
import { durationText, TASK_CSV_COLUMNS, toTasksCsv } from "./exportCsv";
import type { Task } from "./tasks";

const spaces = [
  { id: "perso", name: "Perso" },
  { id: "travail", name: "Travail" },
];

const task = (title: string, t: Partial<Task> = {}): Task =>
  ({
    id: title,
    title,
    notes: "",
    spaceId: "perso",
    dueDate: null,
    dueTime: null,
    priority: 0,
    estimate: null,
    tags: [],
    subtasks: [],
    inbox: false,
    doneAt: null,
    createdAt: 1,
    updatedAt: 1,
    recurrence: null,
    color: null,
    reminder: null,
    projectId: null,
    doing: false,
    ...t,
  }) as Task;

const ctx: ImportContext = {
  now: new Date(2026, 9, 5, 9),
  today: "2026-10-05",
  date1904: false,
  spaces: spaces as unknown as ImportContext["spaces"],
  defaultSpaceId: "perso",
  notebooks: [],
  categories: [],
  defaultReminder: 15,
  existing: { tasks: [], events: [], obligations: [], notes: [] },
};

describe("export des tâches", () => {
  it("reprend les colonnes du modèle d'import « Tâches »", () => {
    expect([...TASK_CSV_COLUMNS]).toEqual([...COLUMNS.task, ID_COLUMN].map((c) => c.names[0]));
  });

  it("écrit les durées comme l'import les lit", () => {
    expect([45, 60, 90, 125, 1440, 2880].map(durationText)).toEqual(["45 min", "1 h", "1 h 30", "2 h 05", "1 j", "2 j"]);
  });

  it("écrit un tableau que l'import relit tel quel", async () => {
    const tasks = [
      task("Appeler le garage", { dueDate: "2026-10-09", dueTime: "14:00", priority: 3, tags: ["voiture", "maison/garage"], reminder: 60, estimate: 30 }),
      task("Préparer la réunion; points", {
        spaceId: "travail",
        dueDate: "2026-10-12",
        dueTime: "09:30",
        reminder: null,
        notes: 'Penser au "budget"\net aux congés',
        subtasks: [
          { id: "a", title: "Chiffres", done: true },
          { id: "b", title: "Ordre du jour", done: false },
        ],
      }),
      task("Payer le loyer", { dueDate: "2026-11-05", recurrence: { kind: "monthly", interval: 1, day: 5 }, reminder: 0 }),
      task("Trier les photos", { priority: 1, estimate: 90 }),
    ];
    const csv = toTasksCsv(tasks, spaces);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const file = await readImportFile("taches.csv", new TextEncoder().encode(csv));
    const rows = previewSources(file.sources, {}, ctx).flatMap((s) => s.rows);
    // Relu dans un compte vide : seul l'identifiant, inconnu ici, est signalé (un nouvel élément sera créé).
    expect(rows.filter((r) => r.errors.length || r.warnings.some((w) => !w.startsWith("Identifiant inconnu")))).toEqual([]);
    expect(rows.map((r) => r.item)).toMatchObject([
      { kind: "task", input: { title: "Appeler le garage", dueDate: "2026-10-09", dueTime: "14:00", priority: 3, tags: ["voiture", "maison/garage"], reminder: 60, estimate: 30, spaceId: "perso" } },
      {
        kind: "task",
        input: {
          title: "Préparer la réunion; points",
          spaceId: "travail",
          dueDate: "2026-10-12",
          dueTime: "09:30",
          reminder: null,
          notes: 'Penser au "budget"\net aux congés',
          subtasks: [{ title: "Chiffres" }, { title: "Ordre du jour" }],
        },
      },
      { kind: "task", input: { title: "Payer le loyer", dueDate: "2026-11-05", recurrence: { kind: "monthly", interval: 1, day: 5 }, reminder: 0 } },
      { kind: "task", input: { title: "Trier les photos", dueDate: null, priority: 1, estimate: 90 } },
    ]);
  });
});

describe("export des tâches en anglais", () => {
  it("écrit les colonnes et les valeurs en anglais, que l'import relit", async () => {
    const { setLanguageForTests, tr } = await import("../i18n/i18n");
    const { EN } = await import("../i18n/en");
    setLanguageForTests("en", EN);
    try {
      const tasks = [
        task("Call the garage", { dueDate: "2026-10-09", dueTime: "14:00", priority: 3, tags: ["car"], reminder: null, estimate: 90 }),
        task("Pay the rent", { dueDate: "2026-11-05", recurrence: { kind: "monthly", interval: 1, day: 5 }, reminder: 0, priority: 2 }),
      ];
      const csv = toTasksCsv(tasks, spaces);
      expect(csv.split("\r\n")[0]).toBe("﻿Title;Due date;Time;Start on;Priority;Tags;Space;Duration;Reminder;Repeat;Subtasks;Notes;ID");
      expect(csv).toContain(";high;");
      expect(csv).toContain("The 5th of every month");
      const file = await readImportFile("tasks.csv", new TextEncoder().encode(csv));
      const rows = previewSources(file.sources, {}, ctx).flatMap((s) => s.rows);
      const unknownId = tr("Identifiant inconnu : un nouvel élément sera créé.");
      expect(rows.filter((r) => r.errors.length || r.warnings.some((w) => w !== unknownId))).toEqual([]);
      expect(rows.map((r) => r.item)).toMatchObject([
        { kind: "task", input: { title: "Call the garage", dueDate: "2026-10-09", dueTime: "14:00", priority: 3, tags: ["car"], reminder: null, estimate: 90 } },
        { kind: "task", input: { title: "Pay the rent", dueDate: "2026-11-05", recurrence: { kind: "monthly", interval: 1, day: 5 }, reminder: 0, priority: 2 } },
      ]);
    } finally {
      setLanguageForTests("fr", null);
    }
  });
});

describe("export des tâches dans une autre langue", () => {
  it("écrit les colonnes et les valeurs en anglais, que l'import relit", async () => {
    const { setLanguageForTests, tr } = await import("../i18n/i18n");
    const { EN } = await import("../i18n/en");
    const { default: es } = await import("../i18n/locales/es.json");
    setLanguageForTests("es", EN, es);
    try {
      const tasks = [
        task("Llamar al taller", { dueDate: "2026-10-09", dueTime: "14:00", priority: 3, reminder: 0 }),
        task("Regar las plantas", { dueDate: "2026-10-12", recurrence: { kind: "weekly", interval: 1, days: [1, 4] }, priority: 1 }),
        task("Reunión de vecinos", { dueDate: "2026-10-26", recurrence: { kind: "monthlyNth", interval: 1, nth: -1, weekday: 1 } }),
      ];
      const csv = toTasksCsv(tasks, spaces);
      expect(csv.split("\r\n")[0]).toBe("﻿Title;Due date;Time;Start on;Priority;Tags;Space;Duration;Reminder;Repeat;Subtasks;Notes;ID");
      const file = await readImportFile("tareas.csv", new TextEncoder().encode(csv));
      const rows = previewSources(file.sources, {}, ctx).flatMap((s) => s.rows);
      const unknownId = tr("Identifiant inconnu : un nouvel élément sera créé.");
      expect(rows.filter((r) => r.errors.length || r.warnings.some((w) => w !== unknownId))).toEqual([]);
      expect(rows.map((r) => r.item)).toMatchObject([
        { kind: "task", input: { title: "Llamar al taller", dueDate: "2026-10-09", dueTime: "14:00", priority: 3, reminder: 0 } },
        { kind: "task", input: { title: "Regar las plantas", recurrence: { kind: "weekly", interval: 1, days: [1, 4] }, priority: 1 } },
        { kind: "task", input: { title: "Reunión de vecinos", recurrence: { kind: "monthlyNth", interval: 1, nth: -1, weekday: 1 } } },
      ]);
    } finally {
      setLanguageForTests("fr", null);
    }
  });
});
