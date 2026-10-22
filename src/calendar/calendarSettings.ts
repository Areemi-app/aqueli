/**
 * Réglages d'affichage du calendrier (Paramètres › Calendrier) : heures de travail, durée et
 * rappel par défaut d'un événement, numéros de semaine, week-ends dans la vue Semaine. Préférences
 * d'affichage seulement (aucune donnée personnelle).
 */
import { useSyncExternalStore } from "react";
import { readPref, writePref } from "../lib/storage";
import { readDefaultReminder } from "../tasks/reminderPrefs";
import { addDays, fromDayKey, weekday, type DayKey } from "../tasks/day";
import { tr } from "../i18n/i18n";

export interface CalendarSettings {
  /** Début et fin de la journée de travail (« 08:00 ») : le reste est grisé dans les vues Jour et Semaine. */
  workStart: string;
  workEnd: string;
  showWorkHours: boolean;
  /** Durée d'un nouvel événement, en minutes. */
  defaultDuration: number;
  /** Rappel d'un nouvel événement, en minutes avant (null : aucun). */
  eventReminder: number | null;
  weekNumbers: boolean;
  /** Samedi et dimanche dans la vue Semaine. */
  weekends: boolean;
}

export const DURATIONS: readonly { value: number; label: string }[] = [
  { value: 15, label: tr("15 min") },
  { value: 30, label: tr("30 min") },
  { value: 45, label: tr("45 min") },
  { value: 60, label: "1 h" },
  { value: 90, label: "1 h 30" },
  { value: 120, label: "2 h" },
];

export const EVENT_REMINDERS: readonly { value: number | null; label: string }[] = [
  { value: null, label: tr("Aucun") },
  { value: 0, label: tr("À l'heure de l'événement") },
  { value: 5, label: tr("5 min avant") },
  { value: 10, label: tr("10 min avant") },
  { value: 15, label: tr("15 min avant") },
  { value: 30, label: tr("30 min avant") },
  { value: 60, label: tr("1 h avant") },
  { value: 120, label: tr("2 h avant") },
  { value: 1440, label: tr("La veille") },
];

const KEY = "calendrierAffichage";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function defaults(): CalendarSettings {
  return { workStart: "08:00", workEnd: "18:00", showWorkHours: true, defaultDuration: 60, eventReminder: readDefaultReminder(), weekNumbers: false, weekends: true };
}

export function readCalendarSettings(): CalendarSettings {
  const base = defaults();
  const v = readPref<Record<string, unknown>>(KEY, {}, isRecord);
  const time = (x: unknown, fallback: string) => (typeof x === "string" && TIME.test(x) ? x : fallback);
  const workStart = time(v.workStart, base.workStart);
  const workEnd = time(v.workEnd, base.workEnd);
  return {
    workStart,
    workEnd: workEnd > workStart ? workEnd : base.workEnd > workStart ? base.workEnd : "23:59",
    showWorkHours: typeof v.showWorkHours === "boolean" ? v.showWorkHours : base.showWorkHours,
    defaultDuration: DURATIONS.some((d) => d.value === v.defaultDuration) ? (v.defaultDuration as number) : base.defaultDuration,
    eventReminder: v.eventReminder === null || EVENT_REMINDERS.some((r) => r.value === v.eventReminder) ? ((v.eventReminder ?? null) as number | null) : base.eventReminder,
    weekNumbers: v.weekNumbers === true,
    weekends: v.weekends !== false,
  };
}

const listeners = new Set<() => void>();
let snapshot = readCalendarSettings();

export function setCalendarSettings(changes: Partial<CalendarSettings>): void {
  const next = { ...snapshot, ...changes };
  writePref(KEY, next);
  snapshot = readCalendarSettings();
  listeners.forEach((l) => l());
}

/** Réglages en vigueur, mis à jour partout dès qu'ils changent. */
export function useCalendarSettings(): CalendarSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function isoWeek(day: DayKey): number {
  // Le jeudi de la même semaine décide de l'année.
  const thursday = addDays(day, 3 - ((weekday(day) + 6) % 7));
  const year = thursday.slice(0, 4);
  const first = fromDayKey(`${year}-01-01`).getTime();
  // Arrondi au jour : le changement d'heure ne compte pas.
  const days = Math.round((fromDayKey(thursday).getTime() - first) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

/** Minutes depuis minuit d'une heure « HH:MM ». */
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
