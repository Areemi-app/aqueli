/**
 * Modifier un événement répété : une seule occurrence (détachée de la série) ou toute la
 * série (décalée comme l'occurrence déplacée). Fonctions pures.
 */
import { addDays, daysBetween, fromDayKey, type DayKey } from "../tasks/day";
import { sortWeekdays, type Recurrence } from "../tasks/recurrence";
import { toEventInput, type CalendarEvent, type EventInput } from "./events";
import { occurrenceOf } from "./occurrences";

export type When = Pick<EventInput, "startDate" | "startTime" | "endDate" | "endTime">;

/** Portée d'une modification d'un événement répété. */
export type SeriesScope = "one" | "all";

/** Règle suivant la série quand son premier jour passe de `from` à `to`. */
export function shiftRule(rule: Recurrence, from: DayKey, to: DayKey): Recurrence {
  const delta = daysBetween(from, to);
  if (delta === 0) return rule;
  const date = fromDayKey(to);
  const dom = date.getDate();
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  switch (rule.kind) {
    case "weekly":
      return { ...rule, days: sortWeekdays(rule.days.map((d) => (((d + delta) % 7) + 7) % 7)) };
    case "monthly":
      return { ...rule, day: dom };
    case "monthlyNth":
      return { ...rule, nth: dom + 7 > lastDay ? -1 : Math.ceil(dom / 7), weekday: date.getDay() };
    case "yearly":
      return { ...rule, month: date.getMonth() + 1, day: dom };
    default:
      return rule;
  }
}

/**
 * Toute la série prend le changement fait sur l'occurrence du jour `occurrenceDay` : même
 * décalage de date, mêmes heures et même durée. Les occurrences retirées et la fin de la
 * série suivent.
 */
export function applyToSeries(series: CalendarEvent, occurrenceDay: DayKey, next: When): Partial<EventInput> {
  const occurrence = occurrenceOf(series, occurrenceDay);
  const shift = daysBetween(occurrence.startDate, next.startDate);
  const startDate = addDays(series.startDate, shift);
  return {
    startDate,
    startTime: next.startTime,
    endDate: addDays(startDate, daysBetween(next.startDate, next.endDate)),
    endTime: next.endTime,
    recurrence: series.recurrence ? shiftRule(series.recurrence, series.startDate, startDate) : null,
    exceptions: series.exceptions.map((d) => addDays(d, shift)),
    repeatUntil: series.repeatUntil ? addDays(series.repeatUntil, shift) : null,
  };
}

/** Retire l'occurrence du jour `occurrenceDay` de la série. */
export function withoutOccurrence(series: CalendarEvent, occurrenceDay: DayKey): Partial<EventInput> {
  return { exceptions: [...new Set([...series.exceptions, occurrenceDay])].sort() };
}

/** L'occurrence détachée devient un événement simple, avec ses propres valeurs. */
export function detachedEvent(series: CalendarEvent, changes: Partial<EventInput>): EventInput {
  return { ...toEventInput(series), ...changes, recurrence: null, exceptions: [], repeatUntil: null };
}
