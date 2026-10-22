/**
 * Rappel d'écriture du journal : chaque jour à l'heure choisie, sauf si la page du jour est
 * déjà écrite (Paramètres › Rappels, ou l'en-tête du Journal). Identifiant « journal:jour » :
 * la notification ouvre la page du jour.
 */
import { readPref, writePref } from "../lib/storage";
import { addDays, fromDayKey, type DayKey } from "../tasks/day";
import type { ScheduledReminder } from "../tasks/reminders";
import { tr } from "../i18n/i18n";

export const JOURNAL_REMINDER_PREFIX = "journal:";
const KEY = "rappelJournal";
export const JOURNAL_REMINDER_CHANGED = "aqueli:rappel-journal";

/** Heures proposées ; `null` : aucun rappel. */
export const JOURNAL_REMINDER_TIMES = ["07:00", "08:00", "09:00", "12:00", "13:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"] as const;

const isTime = (v: unknown): v is string => typeof v === "string" && (JOURNAL_REMINDER_TIMES as readonly string[]).includes(v);

export function readJournalReminder(): string | null {
  return readPref<string | null>(KEY, null, (v): v is string | null => v === null || isTime(v));
}

export function writeJournalReminder(time: string | null): void {
  writePref(KEY, time);
  window.dispatchEvent(new Event(JOURNAL_REMINDER_CHANGED));
}

/** Rappels des 7 prochains jours ; aujourd'hui seulement si la page n'est pas encore écrite. */
export function scheduleForJournal(time: string | null, written: (day: DayKey) => boolean, now: Date, today: DayKey): ScheduledReminder[] {
  if (!time) return [];
  const [h, m] = time.split(":").map(Number) as [number, number];
  const list: ScheduledReminder[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(today, i);
    if (written(day)) continue;
    const at = fromDayKey(day);
    at.setHours(h, m, 0, 0);
    if (at.getTime() < now.getTime() - 60_000) continue;
    list.push({ at: Math.floor(at.getTime() / 1000), taskId: `${JOURNAL_REMINDER_PREFIX}${day}`, title: tr("Journal"), when: tr("Page du jour") });
  }
  return list;
}

export function parseJournalReminderId(id: string): DayKey | null {
  if (!id.startsWith(JOURNAL_REMINDER_PREFIX)) return null;
  const day = id.slice(JOURNAL_REMINDER_PREFIX.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}
