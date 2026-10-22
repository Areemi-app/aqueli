/**
 * Calendrier imprimé (Ctrl+P) : la période affichée, jour par jour (événements, tâches datées,
 * obligations, anniversaires, jours fériés et fêtes selon les couches choisies, périodes de vacances).
 */
import { toTime } from "../planner/plan";
import type { PrintDoc, PrintRow } from "../print/print";
import { addDays, fromDayKey, type DayKey } from "../tasks/day";
import { dayItems, type CalItem } from "./items";
import type { DayMark } from "./specialDays";
import { AGENDA_DAYS, formatRange, startOfMonth, startOfWeek, type CalendarView } from "./view";
import { locale, tr } from "../i18n/i18n";

const LONG = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });
const MONTH = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const KIND_LABELS: Partial<Record<CalItem["kind"], string>> = {
  task: tr("Tâche"),
  obligation: tr("Échéance"),
  cancel: tr("Date limite de résiliation"),
  holiday: tr("Jour férié"),
};

/** Période imprimée : le mois sans les jours voisins de la grille, l'année entière… */
export function printRange(view: CalendarView, anchor: DayKey): { from: DayKey; to: DayKey; title: string } {
  switch (view) {
    case "jour":
      return { from: anchor, to: anchor, title: cap(LONG.format(fromDayKey(anchor))) };
    case "semaine": {
      const monday = startOfWeek(anchor);
      return { from: monday, to: addDays(monday, 6), title: tr("Semaine du {formatRange}", { formatRange: formatRange(monday, addDays(monday, 6)) }) };
    }
    case "mois": {
      const first = startOfMonth(anchor);
      const next = startOfMonth(addDays(first, 32));
      return { from: first, to: addDays(next, -1), title: cap(MONTH.format(fromDayKey(first))) };
    }
    case "annee": {
      const year = anchor.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31`, title: tr("Année {year}", { year }) };
    }
    case "agenda":
      return { from: anchor, to: addDays(anchor, AGENDA_DAYS - 1), title: tr("Agenda du {formatRange}", { formatRange: formatRange(anchor, addDays(anchor, AGENDA_DAYS - 1)) }) };
  }
}

function when(item: CalItem, day: DayKey): string {
  if (item.start === null) return tr("Journée");
  const start = item.startDate === day ? toTime(item.start) : "00:00";
  const end = item.endDate === day ? toTime((item.end ?? 0) % (24 * 60)) : "24:00";
  return item.end === null ? start : `${start} – ${end}`;
}

function row(item: CalItem, day: DayKey): PrintRow {
  const kind = item.special?.kind === "fete" ? tr("Fête") : KIND_LABELS[item.kind];
  const meta = [kind, when(item, day), item.location || null].filter(Boolean).join(" · ");
  return { text: item.title, meta };
}

export function calendarPrintDoc(
  view: CalendarView,
  anchor: DayKey,
  items: readonly CalItem[],
  subtitle?: string,
  special?: ReadonlyMap<DayKey, DayMark>,
): PrintDoc {
  const range = printRange(view, anchor);
  // Jour et semaine : chaque jour figure, même libre ; ailleurs, seulement les jours occupés.
  const everyDay = view === "jour" || view === "semaine";
  const sections = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    const list = dayItems(items, day);
    // Une période figure à son premier jour, ou au premier jour imprimé si elle est en cours.
    const periods = (special?.get(day)?.periods ?? []).filter((p) => p.starts || day === range.from);
    if (list.length === 0 && periods.length === 0 && !everyDay) continue;
    const rows: PrintRow[] = [...periods.map((p) => ({ text: p.label, meta: p.starts ? tr("Début de la période") : tr("Période en cours") })), ...list.map((i) => row(i, day))];
    sections.push({
      heading: cap(LONG.format(fromDayKey(day))),
      rows: rows.length > 0 ? rows : [{ text: tr("Rien de prévu.") }],
    });
  }
  return { title: range.title, subtitle, sections, empty: tr("Aucun événement sur cette période.") };
}
