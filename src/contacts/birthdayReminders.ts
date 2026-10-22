/**
 * Rappels des anniversaires des contacts : le jour même ou la veille, à 9 h (Paramètres ›
 * Rappels). Identifiant « anniv:id@jour » : la notification ouvre la fiche.
 */
import { readPref, writePref } from "../lib/storage";
import { addDays, fromDayKey, type DayKey } from "../tasks/day";
import type { ScheduledReminder } from "../tasks/reminders";
import { birthdaysBetween, birthdayTitle, type Contact } from "./contacts";
import { tr } from "../i18n/i18n";

export const BIRTHDAY_REMINDER_PREFIX = "anniv:";
/** Jours avant l'anniversaire ; `null` : aucun rappel. */
export type BirthdayReminder = 0 | 1 | null;

export const BIRTHDAY_REMINDER_CHOICES: readonly { value: BirthdayReminder; label: string }[] = [
  { value: 0, label: tr("Le jour même à 9 h") },
  { value: 1, label: tr("La veille à 9 h") },
  { value: null, label: tr("Aucun") },
];

const KEY = "rappelAnniversaires";
export const BIRTHDAY_REMINDER_CHANGED = "aqueli:rappels-anniversaires";

export function readBirthdayReminder(): BirthdayReminder {
  return readPref<BirthdayReminder>(KEY, 0, (v): v is BirthdayReminder => v === 0 || v === 1 || v === null);
}

export function writeBirthdayReminder(value: BirthdayReminder): void {
  writePref(KEY, value);
  window.dispatchEvent(new Event(BIRTHDAY_REMINDER_CHANGED));
}

/** Rappels des anniversaires des 35 prochains jours. */
export function scheduleForBirthdays(contacts: readonly Contact[], offset: BirthdayReminder, now: Date, today: DayKey): ScheduledReminder[] {
  if (offset === null) return [];
  const from = now.getTime() - 60_000;
  const list: ScheduledReminder[] = [];
  for (const b of birthdaysBetween(contacts, today, addDays(today, 35))) {
    const at = fromDayKey(addDays(b.day, -offset));
    at.setHours(9, 0, 0, 0);
    if (at.getTime() < from) continue;
    list.push({
      at: Math.floor(at.getTime() / 1000),
      taskId: `${BIRTHDAY_REMINDER_PREFIX}${b.contact.id}@${b.day}`,
      title: birthdayTitle(b),
      when: offset === 0 ? tr("Aujourd'hui") : tr("Demain"),
    });
  }
  return list;
}

export function parseBirthdayReminderId(id: string): string | null {
  if (!id.startsWith(BIRTHDAY_REMINDER_PREFIX)) return null;
  return id.slice(BIRTHDAY_REMINDER_PREFIX.length).split("@")[0] || null;
}
