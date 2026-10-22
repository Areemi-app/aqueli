/**
 * Prochains rappels, pour la cloche de la barre de titre : RemindersBridge publie la liste qu'il
 * confie au cœur et la façon d'ouvrir l'élément d'un rappel.
 */
import { useSyncExternalStore } from "react";
import type { ScheduledReminder } from "../tasks/reminders";

let upcoming: readonly ScheduledReminder[] = [];
let opener: ((id: string) => void) | null = null;
const listeners = new Set<() => void>();

export function publishUpcoming(list: readonly ScheduledReminder[]): void {
  upcoming = list;
  listeners.forEach((listener) => listener());
}

export function setReminderOpener(open: ((id: string) => void) | null): void {
  opener = open;
}

/** Ouvre l'élément d'un rappel (tâche, événement, obligation…). */
export function openReminder(id: string): void {
  opener?.(id);
}

/** Rappels encore à venir dans les `hours` prochaines heures, du plus proche au plus lointain. */
export function nextReminders(list: readonly ScheduledReminder[], now: number, hours = 24): ScheduledReminder[] {
  const from = now / 1000;
  return list.filter((r) => r.at > from && r.at <= from + hours * 3600);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpcomingReminders(): readonly ScheduledReminder[] {
  return useSyncExternalStore(subscribe, () => upcoming);
}
