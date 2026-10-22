/** Dates et heures d'un événement : durée, décalage, créneau proposé à la création. */
import { toMinutes, toTime } from "../planner/plan";
import { addDays, daysBetween, type DayKey } from "../tasks/day";
import type { EventInput } from "./events";

const DAY = 24 * 60;

/** Minutes de (`fromDay`, `fromTime`) à (`toDay`, `toTime`). */
export function minutesBetween(fromDay: DayKey, fromTime: string, toDay: DayKey, toTimeText: string): number {
  return daysBetween(fromDay, toDay) * DAY + toMinutes(toTimeText) - toMinutes(fromTime);
}

/** (jour, heure) décalés de `minutes`, en passant au jour suivant ou précédent si besoin. */
export function addMinutes(day: DayKey, time: string, minutes: number): { day: DayKey; time: string } {
  const total = toMinutes(time) + minutes;
  const days = Math.floor(total / DAY);
  const rest = total - days * DAY;
  return { day: addDays(day, days), time: `${String(Math.floor(rest / 60)).padStart(2, "0")}:${String(rest % 60).padStart(2, "0")}` };
}

type When = Pick<EventInput, "startDate" | "startTime" | "endDate" | "endTime">;

/** Nouveau début : la fin suit, pour garder la même durée. */
export function moveStart(when: When, startDate: DayKey, startTime: string | null): When {
  if (when.startTime === null || when.endTime === null || startTime === null) {
    return { startDate, startTime, endDate: addDays(startDate, Math.max(0, daysBetween(when.startDate, when.endDate))), endTime: when.endTime };
  }
  const duration = minutesBetween(when.startDate, when.startTime, when.endDate, when.endTime);
  const end = addMinutes(startDate, startTime, duration);
  return { startDate, startTime, endDate: end.day, endTime: end.time };
}

/** Passe de la journée entière aux heures (9 h – 10 h) et inversement. */
export function toggleAllDay(when: When, allDay: boolean): When {
  if (allDay) return { startDate: when.startDate, startTime: null, endDate: when.endDate < when.startDate ? when.startDate : when.endDate, endTime: null };
  return { startDate: when.startDate, startTime: "09:00", endDate: when.startDate, endTime: "10:00" };
}

/** La fin est bien après le début (ou le même jour pour la journée entière). */
export function isOrdered(when: When): boolean {
  if (when.startTime === null || when.endTime === null) return when.startTime === when.endTime && when.endDate >= when.startDate;
  return minutesBetween(when.startDate, when.startTime, when.endDate, when.endTime) > 0;
}

/** Créneau proposé pour un nouvel événement : l'heure pleine qui suit `now`, de la durée choisie. */
export function nextHourSlot(day: DayKey, now: Date, today: DayKey, duration = 60): When {
  const hour = day === today ? Math.min(now.getHours() + 1, 23) : 9;
  const start = toTime(hour * 60);
  const end = addMinutes(day, start, duration);
  return { startDate: day, startTime: start, endDate: end.day, endTime: end.time };
}
