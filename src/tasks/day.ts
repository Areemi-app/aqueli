/**
 * Jours locaux au format « AAAA-MM-JJ » : c'est ainsi que les tâches enregistrent leur
 * échéance. « Aujourd'hui » est toujours celui de ce PC.
 */
import { locale, tr } from "../i18n/i18n";

export type DayKey = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Minuit (heure locale) du jour donné. */
export function fromDayKey(key: DayKey): Date {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Vrai pour une date réelle : « 2026-02-30 » est refusée. */
export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dayKey(fromDayKey(value)) === value;
}

/** Date réelle à partir de ses parties, ou `null` (31 février…). */
export function makeDay(year: number, month: number, day: number): DayKey | null {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return dayKey(date);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

/** Même jour, `months` mois plus tard (le 31 devient le dernier jour d'un mois plus court). */
export function addMonths(key: DayKey, months: number): DayKey {
  const date = fromDayKey(key);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return dayKey(date);
}

/** 0 = dimanche … 6 = samedi. */
export function weekday(key: DayKey): number {
  return fromDayKey(key).getDay();
}

/** Nombre de jours de `from` à `to` (négatif si `to` est avant). */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((fromDayKey(to).getTime() - fromDayKey(from).getTime()) / 86_400_000);
}

const SHORT_DAY = new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short" });
const SHORT_DAY_YEAR = new Intl.DateTimeFormat(locale(), {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** « ven. 2 oct. » ; l'année est ajoutée si ce n'est pas celle de `today`. */
export function formatShortDay(key: DayKey, today: DayKey): string {
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return (sameYear ? SHORT_DAY : SHORT_DAY_YEAR).format(fromDayKey(key));
}

/** « aujourd'hui », « demain », « hier », sinon « ven. 2 oct. ». */
export function relativeDay(key: DayKey, today: DayKey): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return tr("aujourd'hui");
  if (diff === 1) return tr("demain");
  if (diff === -1) return tr("hier");
  return formatShortDay(key, today);
}
