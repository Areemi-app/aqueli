/**
 * Vues du calendrier (maquette Calendrier.dc.html) : jour, semaine (du lundi au dimanche),
 * mois, année, agenda ; période affichée, navigation et libellés.
 */
import { addDays, addMonths, fromDayKey, makeDay, weekday, type DayKey } from "../tasks/day";
import { locale, tr } from "../i18n/i18n";

export type CalendarView = "jour" | "semaine" | "mois" | "annee" | "agenda";

export const VIEWS: readonly { id: CalendarView; label: string }[] = [
  { id: "jour", label: tr("Jour") },
  { id: "semaine", label: tr("Semaine") },
  { id: "mois", label: tr("Mois") },
  { id: "annee", label: tr("Année") },
  { id: "agenda", label: tr("Agenda") },
];

export function isCalendarView(value: unknown): value is CalendarView {
  return VIEWS.some((v) => v.id === value);
}

/** Jours montrés par la vue Agenda. */
export const AGENDA_DAYS = 28;

/** Lundi de la semaine du jour donné. */
export function startOfWeek(day: DayKey): DayKey {
  return addDays(day, -((weekday(day) + 6) % 7));
}

export function startOfMonth(day: DayKey): DayKey {
  return `${day.slice(0, 7)}-01`;
}

/** 42 jours (6 semaines) à partir du lundi qui précède le 1er du mois. */
export function monthGrid(day: DayKey): DayKey[] {
  const first = startOfWeek(startOfMonth(day));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Jours d'une semaine, du lundi au dimanche. */
export function weekDays(day: DayKey): DayKey[] {
  const monday = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Premier et dernier jour affichés (compris). */
export function viewRange(view: CalendarView, anchor: DayKey): { from: DayKey; to: DayKey } {
  switch (view) {
    case "jour":
      return { from: anchor, to: anchor };
    case "semaine": {
      const monday = startOfWeek(anchor);
      return { from: monday, to: addDays(monday, 6) };
    }
    case "mois": {
      const grid = monthGrid(anchor);
      return { from: grid[0]!, to: grid[grid.length - 1]! };
    }
    case "annee": {
      const year = anchor.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    case "agenda":
      return { from: anchor, to: addDays(anchor, AGENDA_DAYS - 1) };
  }
}

/** Période précédente (-1) ou suivante (1). */
export function shiftAnchor(view: CalendarView, anchor: DayKey, direction: -1 | 1): DayKey {
  switch (view) {
    case "jour":
      return addDays(anchor, direction);
    case "semaine":
      return addDays(anchor, 7 * direction);
    case "mois":
      return addMonths(anchor, direction);
    case "annee":
      return addMonths(anchor, 12 * direction);
    case "agenda":
      return addDays(anchor, AGENDA_DAYS * direction);
  }
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const LONG = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const MONTH_YEAR = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" });
const DAY_MONTH = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" });

/** « 28 sept. – 4 oct. 2026 » ; l'année figure deux fois si elle change. */
export function formatRange(from: DayKey, to: DayKey): string {
  const a = fromDayKey(from);
  const b = fromDayKey(to);
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${DAY_MONTH_YEAR.format(a)} – ${DAY_MONTH_YEAR.format(b)}`;
  return `${DAY_MONTH.format(a)} – ${DAY_MONTH_YEAR.format(b)}`;
}

/** Libellé de la période affichée, dans l'en-tête. */
export function rangeLabel(view: CalendarView, anchor: DayKey): string {
  const { from, to } = viewRange(view, anchor);
  switch (view) {
    case "jour":
      return capitalize(LONG.format(fromDayKey(anchor)));
    case "mois":
      return capitalize(MONTH_YEAR.format(fromDayKey(anchor)));
    case "annee":
      return anchor.slice(0, 4);
    default:
      return formatRange(from, to);
  }
}

export function monthLabel(day: DayKey): string {
  return capitalize(MONTH_YEAR.format(fromDayKey(day)));
}

/** Premier jour de chaque mois de l'année. */
export function yearMonths(day: DayKey): DayKey[] {
  const year = Number(day.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => makeDay(year, i + 1, 1)!);
}
