import { describe, expect, it } from "vitest";
import { addMinutes, isOrdered, minutesBetween, moveStart, nextHourSlot, toggleAllDay } from "./eventTime";

describe("heures d'un événement", () => {
  it("compte et ajoute des minutes, d'un jour à l'autre", () => {
    expect(minutesBetween("2026-09-28", "22:00", "2026-09-29", "01:30")).toBe(210);
    expect(addMinutes("2026-09-28", "23:30", 90)).toEqual({ day: "2026-09-29", time: "01:00" });
    expect(addMinutes("2026-09-28", "00:30", -60)).toEqual({ day: "2026-09-27", time: "23:30" });
  });

  it("garde la durée quand le début change", () => {
    const when = { startDate: "2026-09-28", startTime: "09:30", endDate: "2026-09-28", endTime: "11:00" };
    expect(moveStart(when, "2026-09-30", "23:00")).toEqual({
      startDate: "2026-09-30",
      startTime: "23:00",
      endDate: "2026-10-01",
      endTime: "00:30",
    });
    const days = { startDate: "2026-10-17", startTime: null, endDate: "2026-10-19", endTime: null };
    expect(moveStart(days, "2026-10-24", null)).toEqual({ ...days, startDate: "2026-10-24", endDate: "2026-10-26" });
  });

  it("passe de la journée entière aux heures", () => {
    const when = { startDate: "2026-09-28", startTime: "14:00", endDate: "2026-09-28", endTime: "15:00" };
    expect(toggleAllDay(when, true)).toEqual({ startDate: "2026-09-28", startTime: null, endDate: "2026-09-28", endTime: null });
    expect(toggleAllDay({ ...when, startTime: null, endTime: null }, false).startTime).toBe("09:00");
  });

  it("vérifie que la fin suit le début", () => {
    expect(isOrdered({ startDate: "2026-09-28", startTime: "10:00", endDate: "2026-09-28", endTime: "10:00" })).toBe(false);
    expect(isOrdered({ startDate: "2026-09-28", startTime: null, endDate: "2026-09-28", endTime: null })).toBe(true);
    expect(isOrdered({ startDate: "2026-09-28", startTime: null, endDate: "2026-09-27", endTime: null })).toBe(false);
  });

  it("propose l'heure pleine suivante", () => {
    const now = new Date(2026, 8, 28, 14, 20);
    expect(nextHourSlot("2026-09-28", now, "2026-09-28")).toMatchObject({ startTime: "15:00", endTime: "16:00" });
    expect(nextHourSlot("2026-10-02", now, "2026-09-28")).toMatchObject({ startTime: "09:00", endTime: "10:00" });
    expect(nextHourSlot("2026-09-28", new Date(2026, 8, 28, 23, 10), "2026-09-28")).toMatchObject({
      startTime: "23:00",
      endDate: "2026-09-29",
      endTime: "00:00",
    });
  });
});
