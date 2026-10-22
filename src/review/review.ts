/**
 * Bilan (cahier des charges § 4.14) : semaines ISO de la revue, périodes des statistiques
 * (semaine, mois, année) et leurs tranches, sommes par tranche, réussite des habitudes et humeur
 * moyenne. Fonctions pures ; les revues sont gardées par le cœur (src-tauri/src/data/reviews.rs).
 */
import { isDoneOn, isDue, createdDay, type CheckIndex, type Habit } from "../habits/habits";
import { addDays, addMonths, daysBetween, makeDay, weekday, type DayKey } from "../tasks/day";
import { locale, tr } from "../i18n/i18n";

export interface Review {
  /** « 2026-W40 ». */
  week: string;
  wins: string;
  lessons: string;
  priorities: string;
  doneAt: number | null;
  updatedAt: number;
}

export type ReviewInput = Pick<Review, "wins" | "lessons" | "priorities"> & { done: boolean };

/** Lundi de la semaine du jour. */
export function mondayOf(day: DayKey): DayKey {
  return addDays(day, -((weekday(day) + 6) % 7));
}

/** Semaine ISO du jour : « 2026-W40 » (la semaine appartient à l'année de son jeudi). */
export function isoWeek(day: DayKey): string {
  const thursday = addDays(mondayOf(day), 3);
  const year = Number(thursday.slice(0, 4));
  const firstThursday = addDays(mondayOf(`${year}-01-04`), 3);
  const n = Math.round(daysBetween(firstThursday, thursday) / 7) + 1;
  return `${year}-W${String(n).padStart(2, "0")}`;
}

/** Lundi et dimanche d'une semaine ISO. */
export function weekBounds(week: string): { start: DayKey; end: DayKey } {
  const year = Number(week.slice(0, 4));
  const n = Number(week.slice(6));
  const start = addDays(mondayOf(`${year}-01-04`), (n - 1) * 7);
  return { start, end: addDays(start, 6) };
}

const SHORT = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" });
const short = (day: DayKey) => SHORT.format(new Date(`${day}T12:00:00`));

/** « Semaine 40 · 28 sept. – 4 oct. ». */
export function weekLabel(week: string): string {
  const { start, end } = weekBounds(week);
  return tr("Semaine {week} · {from} – {to}", { week: Number(week.slice(6)), from: short(start), to: short(end) });
}

// ——— Périodes des statistiques ———

export type PeriodUnit = "semaine" | "mois" | "annee";

export interface Bucket {
  label: string;
  from: DayKey;
  to: DayKey;
}

export interface Period {
  unit: PeriodUnit;
  from: DayKey;
  to: DayKey;
  /** Tranches des graphiques : les jours d'une semaine, les semaines d'un mois, les mois d'une année. */
  buckets: Bucket[];
}

const WEEKDAY = new Intl.DateTimeFormat(locale(), { weekday: "short" });
const MONTH = new Intl.DateTimeFormat(locale(), { month: "short" });

function lastOfMonth(day: DayKey): DayKey {
  return addDays(addMonths(`${day.slice(0, 7)}-01`, 1), -1);
}

/** Période qui contient le jour. */
export function periodOf(unit: PeriodUnit, day: DayKey): Period {
  if (unit === "semaine") {
    const from = mondayOf(day);
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      return { label: WEEKDAY.format(new Date(`${d}T12:00:00`)), from: d, to: d };
    });
    return { unit, from, to: addDays(from, 6), buckets };
  }
  if (unit === "mois") {
    const from = `${day.slice(0, 7)}-01`;
    const to = lastOfMonth(day);
    const buckets: Bucket[] = [];
    for (let start = from; start <= to; start = addDays(mondayOf(start), 7)) {
      const end = addDays(mondayOf(start), 6);
      buckets.push({ label: short(start), from: start, to: end < to ? end : to });
    }
    return { unit, from, to, buckets };
  }
  const year = Number(day.slice(0, 4));
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const from = makeDay(year, i + 1, 1)!;
    return { label: MONTH.format(new Date(`${from}T12:00:00`)), from, to: lastOfMonth(from) };
  });
  return { unit, from: `${year}-01-01`, to: `${year}-12-31`, buckets };
}

/** Période précédente (-1) ou suivante (+1). */
export function shiftPeriod(p: Period, by: number): Period {
  if (p.unit === "semaine") return periodOf("semaine", addDays(p.from, 7 * by));
  if (p.unit === "mois") return periodOf("mois", addMonths(p.from, by));
  return periodOf("annee", addMonths(p.from, 12 * by));
}

/** « Semaine 40 · 28 sept. – 4 oct. », « Octobre 2026 », « 2026 ». */
export function periodTitle(p: Period): string {
  if (p.unit === "semaine") return weekLabel(isoWeek(p.from));
  if (p.unit === "mois") {
    const text = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }).format(new Date(`${p.from}T12:00:00`));
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return p.from.slice(0, 4);
}

/** Somme des valeurs datées dans chaque tranche. */
export function sumByBucket(values: readonly { day: DayKey; value: number }[], buckets: readonly Bucket[]): number[] {
  return buckets.map((b) => values.reduce((s, v) => (v.day >= b.from && v.day <= b.to ? s + v.value : s), 0));
}

/** Jour de fin d'une tâche terminée (heure de ce PC). */
export function doneDay(doneAt: number): DayKey {
  const d = new Date(doneAt * 1000);
  return makeDay(d.getFullYear(), d.getMonth() + 1, d.getDate())!;
}

export interface HabitTally {
  done: number;
  due: number;
}

/**
 * Habitudes tenues sur une période (jours passés seulement) : jours prévus et jours réussis ;
 * « X fois par semaine » compte X/7 par jour, sans dépasser ce qui était prévu.
 */
export function habitTally(habits: readonly Habit[], index: CheckIndex, from: DayKey, to: DayKey, today: DayKey): HabitTally {
  let done = 0;
  let due = 0;
  const end = to < today ? to : today;
  for (const h of habits) {
    if (h.archived) continue;
    const start = [from, createdDay(h)].sort().at(-1)!;
    let hDone = 0;
    let hDue = 0;
    for (let day = start; day <= end; day = addDays(day, 1)) {
      const ok = isDoneOn(h, index, day);
      // Aujourd'hui ne compte pas tant que l'habitude n'est pas cochée.
      if (day === today && !ok) continue;
      if (h.frequency.kind === "semaine") hDue += h.frequency.times / 7;
      else if (isDue(h, day)) hDue += 1;
      else continue;
      if (ok) hDone += 1;
    }
    due += hDue;
    done += Math.min(hDone, hDue);
  }
  return { done, due };
}

/** Part des habitudes tenues, en pour cent, ou nulle si rien n'était prévu. */
export function habitRate(t: HabitTally): number | null {
  return t.due < 0.5 ? null : Math.round((100 * t.done) / t.due);
}

/** Humeur moyenne (1 à 5, au dixième) des pages du journal de la période. */
export function moodAverage(pages: readonly { day: DayKey; mood: number | null }[], from: DayKey, to: DayKey): number | null {
  const moods = pages.filter((p) => p.mood !== null && p.day >= from && p.day <= to).map((p) => p.mood!);
  if (moods.length === 0) return null;
  return Math.round((10 * moods.reduce((a, b) => a + b, 0)) / moods.length) / 10;
}

/** « 3 h 20 », « 45 min ». */
export { durationLabel as formatMinutes } from "../lib/duration";
