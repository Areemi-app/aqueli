import { describe, expect, it } from "vitest";
import { icsRecords } from "../import/cards";
import { buildRows, type ImportContext } from "../import/records";
import type { CalendarEvent } from "./events";
import { ruleOf, toIcs } from "./icsExport";

const event = (e: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e1",
  title: "Dentiste",
  location: "",
  notes: "",
  spaceId: null,
  startDate: "2026-10-08",
  startTime: "09:30",
  endDate: "2026-10-08",
  endTime: "10:00",
  color: null,
  reminder: null,
  recurrence: null,
  exceptions: [],
  repeatUntil: null,
  createdAt: 0,
  updatedAt: 0,
  ...e,
});

const ctx: ImportContext = {
  now: new Date(2026, 9, 2),
  today: "2026-10-02",
  date1904: false,
  spaces: [],
  defaultSpaceId: null,
  notebooks: [],
  categories: [],
  defaultReminder: null,
  existing: { tasks: [], events: [], obligations: [], notes: [] },
};

describe("export du calendrier", () => {
  it("traduit chaque répétition en règle iCalendar", () => {
    expect(ruleOf({ kind: "daily", interval: 2 })).toBe("FREQ=DAILY;INTERVAL=2");
    expect(ruleOf({ kind: "weekdays" })).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(ruleOf({ kind: "weekly", interval: 1, days: [1, 4] })).toBe("FREQ=WEEKLY;BYDAY=MO,TH");
    expect(ruleOf({ kind: "monthlyNth", interval: 1, nth: -1, weekday: 5 })).toBe("FREQ=MONTHLY;BYDAY=-1FR");
    expect(ruleOf({ kind: "yearly", interval: 1, month: 5, day: 14 })).toBe("FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=14");
    expect(ruleOf({ kind: "afterDone", days: 3 })).toBeNull();
  });

  it("écrit un fichier .ics que l'import relit tel quel", () => {
    const ics = toIcs(
      [
        event({ location: "Cabinet Martin", notes: "Apporter la carte Vitale ; ordonnance.", reminder: 60 }),
        event({ id: "e2", title: "Week-end à la mer", startDate: "2026-10-17", endDate: "2026-10-18", startTime: null, endTime: null }),
        event({ id: "e3", title: "Yoga", startDate: "2026-10-05", startTime: "18:00", endTime: "19:30", endDate: "2026-10-05", recurrence: { kind: "weekly", interval: 1, days: [1, 4] }, exceptions: ["2026-10-08"] }),
      ],
      new Date(Date.UTC(2026, 9, 2, 8, 0)),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("DTSTAMP:20261002T080000Z");
    expect(ics).toContain("DTEND;VALUE=DATE:20261019");
    expect(ics).toContain("EXDATE:20261008T180000");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    const rows = buildRows("ics", icsRecords(ics), ctx, new Set(), new Map());
    // Relu dans un compte vide : seul l'identifiant, inconnu ici, est signalé (un nouvel élément sera créé).
    expect(rows.filter((r) => r.errors.length || r.warnings.some((w) => !w.startsWith("Identifiant inconnu")))).toEqual([]);
    expect(rows[0]!.item).toMatchObject({ input: { title: "Dentiste", startTime: "09:30", endTime: "10:00", location: "Cabinet Martin", notes: "Apporter la carte Vitale ; ordonnance.", reminder: 60 } });
    expect(rows[1]!.item).toMatchObject({ input: { startDate: "2026-10-17", endDate: "2026-10-18", startTime: null } });
    expect(rows[2]!.item).toMatchObject({ input: { startTime: "18:00", endTime: "19:30", recurrence: { kind: "weekly", days: [1, 4] } } });
  });
});
