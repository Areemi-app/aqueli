/**
 * Rappels des habitudes, confiés au cœur avec ceux des tâches : aujourd'hui et demain, à
 * l'heure choisie, tant que l'habitude n'est pas tenue. Identifiant « habitude:id@jour » :
 * le bouton « Terminé » de la notification coche l'habitude ce jour-là.
 */
import { addDays, fromDayKey, relativeDay, type DayKey } from "../tasks/day";
import type { ScheduledReminder } from "../tasks/reminders";
import { isDoneOn, isForToday, type CheckIndex, type Habit } from "./habits";

export const HABIT_REMINDER_PREFIX = "habitude:";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function scheduleForHabits(habits: readonly Habit[], checks: CheckIndex, now: Date, today: DayKey): ScheduledReminder[] {
  const from = now.getTime() - 60_000;
  const list: ScheduledReminder[] = [];
  for (const day of [today, addDays(today, 1)]) {
    for (const h of habits) {
      if (h.reminder === null || !isForToday(h, checks, day) || isDoneOn(h, checks, day)) continue;
      const [hours = 20, minutes = 0] = h.reminder.split(":").map(Number);
      const at = fromDayKey(day);
      at.setHours(hours, minutes, 0, 0);
      if (at.getTime() < from) continue;
      list.push({
        at: Math.floor(at.getTime() / 1000),
        taskId: `${HABIT_REMINDER_PREFIX}${h.id}@${day}`,
        title: h.name,
        when: `${capitalize(relativeDay(day, today))} · ${h.reminder}`,
      });
    }
  }
  return list;
}

export function parseHabitReminderId(id: string): { habitId: string; day: DayKey } | null {
  if (!id.startsWith(HABIT_REMINDER_PREFIX)) return null;
  const [habitId, day] = id.slice(HABIT_REMINDER_PREFIX.length).split("@");
  return habitId && day ? { habitId, day } : null;
}
