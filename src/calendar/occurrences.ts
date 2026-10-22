/**
 * Événements répétés : dates des occurrences, avec les mêmes règles que les tâches
 * (src-tauri/src/data/recurrence.rs). La première occurrence est le jour de début de la
 * série ; les occurrences retirées et celles après « jusqu'au » sont écartées.
 */
import { addDays, daysBetween, fromDayKey, weekday, type DayKey } from "../tasks/day";
import type { Recurrence } from "../tasks/recurrence";
import type { CalendarEvent } from "./events";

const EPOCH = "1970-01-01";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Semaine (du lundi au dimanche) depuis 1970, comme `week_index` dans le cœur. */
function weekIndex(day: DayKey): number {
  return Math.floor((daysBetween(EPOCH, day) + 3) / 7);
}

function monthIndex(day: DayKey): number {
  return Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
}

const every = (steps: number, interval: number) => ((steps % interval) + interval) % interval === 0;

/** Vrai si `day` est une occurrence de la série commencée le jour `anchor`. */
export function matchesRule(rule: Recurrence, anchor: DayKey, day: DayKey): boolean {
  const date = fromDayKey(day);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const dom = date.getDate();
  switch (rule.kind) {
    case "daily":
      return every(daysBetween(anchor, day), rule.interval);
    case "weekdays":
      return weekday(day) >= 1 && weekday(day) <= 5;
    case "weekly":
      return rule.days.includes(weekday(day)) && every(weekIndex(day) - weekIndex(anchor), rule.interval);
    case "monthly":
      return every(monthIndex(day) - monthIndex(anchor), rule.interval) && dom === Math.min(rule.day, daysInMonth(year, month));
    case "monthlyNth": {
      const inMonth = rule.nth > 0 ? Math.floor((dom - 1) / 7) + 1 === rule.nth : dom + 7 > daysInMonth(year, month);
      return every(monthIndex(day) - monthIndex(anchor), rule.interval) && weekday(day) === rule.weekday && inMonth;
    }
    case "yearly":
      return (
        every(year - Number(anchor.slice(0, 4)), rule.interval) &&
        month === rule.month &&
        dom === Math.min(rule.day, daysInMonth(year, rule.month))
      );
    case "afterDone":
      return false;
  }
}

type Series = Pick<CalendarEvent, "startDate" | "endDate" | "recurrence" | "exceptions" | "repeatUntil">;

/** Jours de début des occurrences qui touchent la période de `from` à `to` (compris). */
export function occurrenceStarts(event: Series, from: DayKey, to: DayKey): DayKey[] {
  const span = Math.max(0, daysBetween(event.startDate, event.endDate));
  if (!event.recurrence) return event.startDate <= to && event.endDate >= from ? [event.startDate] : [];
  const first = addDays(from, -span) > event.startDate ? addDays(from, -span) : event.startDate;
  const last = event.repeatUntil && event.repeatUntil < to ? event.repeatUntil : to;
  const starts: DayKey[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (event.exceptions.includes(day)) continue;
    if (day === event.startDate || matchesRule(event.recurrence, event.startDate, day)) starts.push(day);
  }
  return starts;
}

/** Dates de l'occurrence qui commence le jour `day` (même durée que la série). */
export function occurrenceOf(
  event: Pick<CalendarEvent, "startDate" | "startTime" | "endDate" | "endTime">,
  day: DayKey,
): Pick<CalendarEvent, "startDate" | "startTime" | "endDate" | "endTime"> {
  const span = daysBetween(event.startDate, event.endDate);
  return { startDate: day, startTime: event.startTime, endDate: addDays(day, span), endTime: event.endTime };
}
