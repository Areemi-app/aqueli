/**
 * Rappels des événements du calendrier, confiés au cœur avec ceux des tâches. Chaque
 * occurrence d'un événement répété a son rappel ; il est identifié par « evt:id@date »
 * (la notification propose alors « Ouvrir » au lieu de « Terminé »).
 */
import { addDays, dayKey, fromDayKey, relativeDay, type DayKey } from "../tasks/day";
import { DEFAULT_REMINDER_TIME, type ScheduledReminder } from "../tasks/reminders";
import type { CalendarEvent } from "./events";
import { occurrenceOf, occurrenceStarts } from "./occurrences";

export const EVENT_REMINDER_PREFIX = "evt:";
/** Les rappels des 35 prochains jours (un rappel peut précéder l'événement d'une semaine). */
const HORIZON_DAYS = 35;
const MAX_ADVANCE_DAYS = 7;

/** Instant du rappel de l'occurrence du jour `day` (9 h pour la journée entière). */
export function eventReminderAt(event: CalendarEvent, day: DayKey): Date | null {
  if (event.reminder === null) return null;
  const occurrence = occurrenceOf(event, day);
  const [h = 9, m = 0] = (occurrence.startTime ?? DEFAULT_REMINDER_TIME).split(":").map(Number);
  const at = fromDayKey(occurrence.startDate);
  at.setHours(h, m - event.reminder, 0, 0);
  return at;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Rappels des événements, de maintenant (à une minute près) aux 35 prochains jours. */
export function scheduleForEvents(events: readonly CalendarEvent[], now: Date, today: DayKey): ScheduledReminder[] {
  const from = now.getTime() - 60_000;
  const until = now.getTime() + HORIZON_DAYS * 86_400_000;
  const list: ScheduledReminder[] = [];
  for (const event of events) {
    if (event.reminder === null) continue;
    for (const day of occurrenceStarts(event, addDays(today, -1), addDays(today, HORIZON_DAYS + MAX_ADVANCE_DAYS))) {
      const at = eventReminderAt(event, day);
      if (!at || at.getTime() < from || at.getTime() > until) continue;
      list.push({
        at: Math.floor(at.getTime() / 1000),
        taskId: `${EVENT_REMINDER_PREFIX}${event.id}@${day}`,
        title: event.title,
        when: capitalize(relativeDay(day, today)) + (event.startTime ? ` · ${event.startTime}` : ""),
      });
    }
  }
  return list;
}

/** Occurrences dont le rappel tombait entre `from` et `to` (secondes Unix). */
export function missedEventsBetween(events: readonly CalendarEvent[], from: number, to: number): { event: CalendarEvent; day: DayKey }[] {
  const first = addDays(dayKey(new Date(from * 1000)), -1);
  const last = addDays(dayKey(new Date(to * 1000)), MAX_ADVANCE_DAYS);
  const missed: { event: CalendarEvent; day: DayKey }[] = [];
  for (const event of events) {
    if (event.reminder === null) continue;
    for (const day of occurrenceStarts(event, first, last)) {
      const at = eventReminderAt(event, day);
      const s = at ? Math.floor(at.getTime() / 1000) : 0;
      if (at && s > from && s <= to) missed.push({ event, day });
    }
  }
  return missed;
}

/** « evt:id@date » : l'événement et le jour de l'occurrence visés par une notification. */
export function parseEventReminderId(id: string): { eventId: string; day: DayKey } | null {
  if (!id.startsWith(EVENT_REMINDER_PREFIX)) return null;
  const [eventId = "", day = ""] = id.slice(EVENT_REMINDER_PREFIX.length).split("@");
  return eventId && day ? { eventId, day } : null;
}
