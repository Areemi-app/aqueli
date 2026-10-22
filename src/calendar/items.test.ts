import { describe, expect, it } from "vitest";
import { EMPTY_CONTACT } from "../contacts/contacts";
import type { Space } from "../spaces/spaces";
import type { Task } from "../tasks/tasks";
import type { CalendarEvent } from "./events";
import { allDaySpans, dayItems, itemsBetween, timedSegments, type Layers } from "./items";
import { DEFAULT_DAY_SETTINGS, holidaysBetween } from "./specialDays";

const SPACES: Space[] = [
  { id: "perso", name: "Perso", color: "#0778b0", icon: "maison", position: 0 },
  { id: "sante", name: "Santé", color: "#c2386f", icon: "coeur", position: 1 },
];

let seq = 0;
function event(title: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    title,
    location: "",
    notes: "",
    spaceId: "perso",
    startDate: "2026-09-28",
    startTime: "09:00",
    endDate: "2026-09-28",
    endTime: "10:00",
    color: null,
    reminder: null,
    recurrence: null,
    exceptions: [],
    repeatUntil: null,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function task(title: string, extra: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title,
    notes: "",
    spaceId: "perso",
    dueDate: "2026-09-29",
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
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

const layers = (extra: Partial<Layers> = {}): Layers => ({
  events: [],
  tasks: [],
  spaces: SPACES,
  filter: "tous",
  hiddenSpaces: [],
  showTasks: true,
  ...extra,
});

describe("éléments du calendrier", () => {
  it("réunit événements, tâches datées et jours fériés", () => {
    const items = itemsBetween(
      layers({
        events: [event("Dentiste", { spaceId: "sante" }), event("Hors période", { startDate: "2026-10-10", endDate: "2026-10-10" })],
        tasks: [task("Appeler le garage", { dueTime: "14:00", estimate: 45 }), task("Sans date", { dueDate: null }), task("Faite", { doneAt: 1 })],
        holidays: holidaysBetween(DEFAULT_DAY_SETTINGS, "2026-09-28", "2026-11-01"),
      }),
      "2026-09-28",
      "2026-11-01",
    ).filter((i) => i.startDate <= "2026-10-04" || i.kind === "holiday");
    expect(items.map((i) => [i.kind, i.title, i.color, i.start, i.end])).toEqual([
      ["event", "Dentiste", "#c2386f", 540, 600],
      ["task", "Appeler le garage", "#0778b0", 840, 885],
      ["holiday", "Toussaint", "#e0671f", null, null],
    ]);
  });

  it("suit le filtre d'espace, les calendriers décochés et les couches", () => {
    const base = { events: [event("Perso"), event("Santé", { spaceId: "sante" }), event("Sans calendrier", { spaceId: null })], tasks: [task("Tâche")] };
    const titles = (extra: Partial<Layers>) => itemsBetween(layers({ ...base, ...extra }), "2026-09-28", "2026-10-04").map((i) => i.title);
    expect(titles({})).toEqual(["Perso", "Santé", "Sans calendrier", "Tâche"]);
    expect(titles({ hiddenSpaces: ["sante"] })).toEqual(["Perso", "Sans calendrier", "Tâche"]);
    expect(titles({ filter: "sante" })).toEqual(["Santé"]);
    expect(titles({ showTasks: false })).toEqual(["Perso", "Santé", "Sans calendrier"]);
  });

  it("coupe une soirée qui finit le lendemain", () => {
    const items = itemsBetween(
      layers({ events: [event("Soirée", { startTime: "22:00", endDate: "2026-09-29", endTime: "01:30" })] }),
      "2026-09-28",
      "2026-09-29",
    );
    const monday = timedSegments(items, "2026-09-28");
    const tuesday = timedSegments(items, "2026-09-29");
    expect(monday.map((s) => [s.start, s.end, s.toAfter])).toEqual([[1320, 1440, true]]);
    expect(tuesday.map((s) => [s.start, s.end, s.fromBefore])).toEqual([[0, 90, true]]);
  });

  it("range la ligne « Journée » sans chevauchement", () => {
    const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    const items = itemsBetween(
      layers({
        events: [
          event("Salon", { startDate: "2026-09-26", startTime: null, endDate: "2026-09-29", endTime: null }),
          event("Congrès", { startDate: "2026-09-29", startTime: null, endDate: "2026-10-01", endTime: null }),
          event("Anniversaire", { startDate: "2026-10-04", startTime: null, endDate: "2026-10-04", endTime: null }),
        ],
        tasks: [task("Acheter des cartons")],
      }),
      days[0]!,
      days[6]!,
    );
    const spans = allDaySpans(items, days).map((s) => [s.item.title, s.col, s.span, s.row, s.clippedStart]);
    expect(spans).toEqual([
      ["Salon", 0, 2, 0, true],
      ["Congrès", 1, 3, 1, false],
      ["Acheter des cartons", 1, 1, 2, false],
      ["Anniversaire", 6, 1, 0, false],
    ]);
  });

  it("déplie un événement répété en occurrences", () => {
    const yoga = event("Yoga", { startDate: "2026-09-30", endDate: "2026-09-30", recurrence: { kind: "weekly", interval: 1, days: [3] } });
    const items = itemsBetween(layers({ events: [yoga] }), "2026-09-28", "2026-10-18");
    expect(items.map((i) => [i.key, i.occurrence, i.startDate])).toEqual([
      [`e:${yoga.id}@2026-09-30`, "2026-09-30", "2026-09-30"],
      [`e:${yoga.id}@2026-10-07`, "2026-10-07", "2026-10-07"],
      [`e:${yoga.id}@2026-10-14`, "2026-10-14", "2026-10-14"],
    ]);
  });

  it("montre les échéances à payer et les dates limites de résiliation", () => {
    const box = {
      id: "o1",
      title: "Box internet",
      category: "abonnements" as const,
      organization: "",
      reference: "",
      amountCents: 2999,
      periodMonths: 1,
      dueDate: "2026-10-05",
      anchorDay: 5,
      cancelBy: "2026-10-01",
      status: "a-faire" as const,
      spaceId: "perso",
      color: null,
      notes: "",
      lastPaidOn: null,
      createdAt: 1,
      updatedAt: 1,
      autoPay: false,
    };
    const items = itemsBetween(
      layers({ obligations: [box, { ...box, id: "o2", status: "paye" }], showObligations: true }),
      "2026-09-28",
      "2026-11-08",
    );
    expect(items.map((i) => [i.kind, i.title, i.startDate, i.color])).toEqual([
      ["obligation", "Box internet", "2026-10-05", "#7a5ce6"],
      ["obligation", "Box internet", "2026-11-05", "#7a5ce6"],
      ["cancel", "Résiliation : Box internet", "2026-10-01", "#7a5ce6"],
    ]);
  });

  it("classe les éléments d'un jour", () => {
    const items = itemsBetween(
      layers({ events: [event("Midi", { startTime: "12:00", endTime: "13:00" }), event("Matin"), event("Toute la journée", { startTime: null, endTime: null })] }),
      "2026-09-28",
      "2026-09-28",
    );
    expect(dayItems(items, "2026-09-28").map((i) => i.title)).toEqual(["Toute la journée", "Matin", "Midi"]);
  });

  it("montre les anniversaires des contacts de l'espace choisi", () => {
    const lea = { ...EMPTY_CONTACT, id: "c1", firstName: "Léa", birthday: "2016-09-29", spaceId: "famille", createdAt: 0, updatedAt: 0, lastContact: null };
    const paul = { ...EMPTY_CONTACT, id: "c2", firstName: "Paul", birthday: "--09-30", color: "#2d6ff0", spaceId: "travail", createdAt: 0, updatedAt: 0, lastContact: null };
    const all = itemsBetween(layers({ contacts: [lea, paul], showBirthdays: true, birthdayColor: "#d9567a" }), "2026-09-28", "2026-10-04");
    expect(all.map((i) => [i.kind, i.title, i.startDate, i.color])).toEqual([
      ["birthday", "Anniversaire de Léa (10 ans)", "2026-09-29", "#d9567a"],
      ["birthday", "Anniversaire de Paul", "2026-09-30", "#2d6ff0"],
    ]);
    expect(itemsBetween(layers({ contacts: [lea, paul], showBirthdays: true, filter: "travail" }), "2026-09-28", "2026-10-04")).toHaveLength(1);
    expect(itemsBetween(layers({ contacts: [lea], showBirthdays: false }), "2026-09-28", "2026-10-04")).toEqual([]);
  });
});
