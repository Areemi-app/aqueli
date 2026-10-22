/**
 * Rappels de « Rester en contact » : le jour où un contact suivi est à recontacter, à 10 h
 * (Paramètres › Rappels). Identifiant « suivi:id@jour » : la notification ouvre la fiche.
 */
import { readPref, writePref } from "../lib/storage";
import { addDays, fromDayKey, type DayKey } from "../tasks/day";
import type { ScheduledReminder } from "../tasks/reminders";
import { contactName, nextContact, type Contact } from "./contacts";
import { tr } from "../i18n/i18n";

export const KEEP_REMINDER_PREFIX = "suivi:";
const KEY = "rappelSuivi";
export const KEEP_REMINDER_CHANGED = "aqueli:rappel-suivi";

export function readKeepReminder(): boolean {
  return readPref(KEY, true, (v): v is boolean => typeof v === "boolean");
}

export function writeKeepReminder(on: boolean): void {
  writePref(KEY, on);
  window.dispatchEvent(new Event(KEEP_REMINDER_CHANGED));
}

/** Rappels des 35 prochains jours, un par contact suivi, le jour où il est à recontacter. */
export function scheduleForKeepInTouch(contacts: readonly Contact[], enabled: boolean, now: Date, today: DayKey): ScheduledReminder[] {
  if (!enabled) return [];
  const limit = addDays(today, 35);
  const list: ScheduledReminder[] = [];
  for (const c of contacts) {
    const day = nextContact(c);
    if (!day || day < today || day > limit) continue;
    const at = fromDayKey(day);
    at.setHours(10, 0, 0, 0);
    if (at.getTime() < now.getTime() - 60_000) continue;
    list.push({ at: Math.floor(at.getTime() / 1000), taskId: `${KEEP_REMINDER_PREFIX}${c.id}@${day}`, title: tr("Prendre des nouvelles de {contactName}", { contactName: contactName(c) }), when: "Aujourd'hui" });
  }
  return list;
}

export function parseKeepReminderId(id: string): string | null {
  if (!id.startsWith(KEEP_REMINDER_PREFIX)) return null;
  return id.slice(KEEP_REMINDER_PREFIX.length).split("@")[0] || null;
}
