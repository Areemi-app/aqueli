import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./events";
import { eventReminderAt, missedEventsBetween, parseEventReminderId, scheduleForEvents } from "./eventReminders";

// Lundi 28 septembre 2026, 10 h.
const NOW = new Date(2026, 8, 28, 10, 0);
const TODAY = "2026-09-28";
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

const event = (extra: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e1",
  title: "Dentiste",
  location: "",
  notes: "",
  spaceId: "sante",
  startDate: "2026-09-29",
  startTime: "09:30",
  endDate: "2026-09-29",
  endTime: "10:00",
  color: null,
  reminder: 15,
  recurrence: null,
  exceptions: [],
  repeatUntil: null,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe("rappels des événements", () => {
  it("prévient avant le début, ou à 9 h pour la journée entière", () => {
    expect(eventReminderAt(event({}), "2026-09-29")).toEqual(new Date(2026, 8, 29, 9, 15));
    const birthday = event({ startTime: null, endTime: null, reminder: 1440 });
    expect(eventReminderAt(birthday, "2026-09-29")).toEqual(new Date(2026, 8, 28, 9, 0));
    expect(eventReminderAt(event({ reminder: null }), "2026-09-29")).toBeNull();
  });

  it("programme chaque occurrence d'une série, pas celles déjà passées", () => {
    const yoga = event({
      id: "y",
      title: "Yoga",
      startDate: "2026-09-21",
      endDate: "2026-09-21",
      startTime: "18:00",
      endTime: "19:00",
      reminder: 0,
      recurrence: { kind: "weekly", interval: 1, days: [1] },
      repeatUntil: "2026-10-12",
    });
    const list = scheduleForEvents([yoga], NOW, TODAY);
    expect(list.map((r) => [r.taskId, r.when])).toEqual([
      ["evt:y@2026-09-28", "Aujourd'hui · 18:00"],
      ["evt:y@2026-10-05", "Lun. 5 oct. · 18:00"],
      ["evt:y@2026-10-12", "Lun. 12 oct. · 18:00"],
    ]);
  });

  it("retrouve les rappels manqués pendant l'arrêt d'Aqueli", () => {
    const early = event({ startDate: TODAY, endDate: TODAY, startTime: "08:30", endTime: "09:00" });
    const missed = missedEventsBetween([early], unix(new Date(2026, 8, 28, 7, 0)), unix(NOW));
    expect(missed.map((m) => m.day)).toEqual([TODAY]);
  });

  it("lit l'identifiant d'une notification", () => {
    expect(parseEventReminderId("evt:e1@2026-10-05")).toEqual({ eventId: "e1", day: "2026-10-05" });
    expect(parseEventReminderId("t42")).toBeNull();
  });
});
