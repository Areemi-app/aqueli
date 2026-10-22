import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./events";
import { applyToSeries, detachedEvent, shiftRule, withoutOccurrence } from "./series";

const yoga: CalendarEvent = {
  id: "e1",
  title: "Cours de yoga",
  location: "Salle B",
  notes: "",
  spaceId: "perso",
  startDate: "2026-09-30",
  startTime: "18:00",
  endDate: "2026-09-30",
  endTime: "19:00",
  color: null,
  reminder: 15,
  recurrence: { kind: "weekly", interval: 1, days: [3] },
  exceptions: ["2026-10-14"],
  repeatUntil: "2026-12-16",
  createdAt: 1,
  updatedAt: 1,
};

describe("modifier un événement répété", () => {
  it("adapte la règle quand la série change de jour", () => {
    expect(shiftRule({ kind: "weekly", interval: 1, days: [3, 5] }, "2026-09-30", "2026-10-01")).toEqual({
      kind: "weekly",
      interval: 1,
      days: [4, 6],
    });
    expect(shiftRule({ kind: "monthly", interval: 1, day: 30 }, "2026-09-30", "2026-10-02")).toEqual({ kind: "monthly", interval: 1, day: 2 });
    expect(shiftRule({ kind: "monthlyNth", interval: 1, nth: -1, weekday: 3 }, "2026-09-30", "2026-09-17")).toEqual({
      kind: "monthlyNth",
      interval: 1,
      nth: 3,
      weekday: 4,
    });
  });

  it("toute la série suit une occurrence déplacée au lendemain, une heure plus tard", () => {
    const changes = applyToSeries(yoga, "2026-10-21", {
      startDate: "2026-10-22",
      startTime: "19:00",
      endDate: "2026-10-22",
      endTime: "20:30",
    });
    expect(changes).toEqual({
      startDate: "2026-10-01",
      startTime: "19:00",
      endDate: "2026-10-01",
      endTime: "20:30",
      recurrence: { kind: "weekly", interval: 1, days: [4] },
      exceptions: ["2026-10-15"],
      repeatUntil: "2026-12-17",
    });
  });

  it("une seule occurrence : retirée de la série, recréée seule", () => {
    expect(withoutOccurrence(yoga, "2026-10-07")).toEqual({ exceptions: ["2026-10-07", "2026-10-14"] });
    const single = detachedEvent(yoga, { startDate: "2026-10-07", startTime: "20:00", endDate: "2026-10-07", endTime: "21:00" });
    expect(single).toMatchObject({ title: "Cours de yoga", startTime: "20:00", recurrence: null, exceptions: [], repeatUntil: null });
  });
});
