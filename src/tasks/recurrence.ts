/**
 * Répétition des tâches, côté interface : libellés (en français et en anglais avec leur propre
 * grammaire, dans les autres langues par des modèles traduits) et répétitions proposées.
 * Le calcul des échéances est fait par le cœur (src-tauri/src/data/recurrence.rs).
 */
import { lang, locale, tr, trn } from "../i18n/i18n";
import { weekdayNames } from "../i18n/calendarNames";
import { fromDayKey, type DayKey } from "./day";

export type Recurrence =
  | { kind: "daily"; interval: number }
  | { kind: "weekdays" }
  /** Jours : 0 = dimanche … 6 = samedi. */
  | { kind: "weekly"; interval: number; days: number[] }
  | { kind: "monthly"; interval: number; day: number }
  /** `nth` : 1 à 4, ou -1 pour le dernier. */
  | { kind: "monthlyNth"; interval: number; nth: number; weekday: number }
  | { kind: "yearly"; interval: number; month: number; day: number }
  | { kind: "afterDone"; days: number };

const FR_WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Noms des jours dans la langue de l'interface (0 = dimanche). */
export const WEEKDAY_NAMES = lang() === "en" ? EN_WEEKDAYS : lang() === "fr" ? FR_WEEKDAYS : weekdayNames("long");
const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Ordre français : du lundi au dimanche. */
export function sortWeekdays(days: readonly number[]): number[] {
  return [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

/** « lundi », « lundi et jeudi », « lundi, mercredi et vendredi ». */
function joinDays(days: readonly number[]): string {
  const names = sortWeekdays(days).map((d) => FR_WEEKDAYS[d] ?? "");
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

const ordinalDay = (day: number) => (day === 1 ? "1er" : String(day));
const nthLabel = (nth: number) => (nth === -1 ? "dernier" : nth === 1 ? "1er" : `${nth}e`);

/** « 1st », « 2nd », « 3rd », « 11th », « 22nd ». */
const enOrdinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
};

/** « Monday », « Monday and Thursday », « Monday, Wednesday and Friday ». */
function joinDaysEn(days: readonly number[]): string {
  const names = sortWeekdays(days).map((d) => EN_WEEKDAYS[d] ?? "");
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Libellé anglais, aussi celui des exports hors du français (l'import le relit). */
export function recurrenceLabelEn(rule: Recurrence): string {
  switch (rule.kind) {
    case "daily":
      return rule.interval === 1 ? "Every day" : `Every ${rule.interval} days`;
    case "weekdays":
      return "Monday to Friday";
    case "weekly": {
      const days = sortWeekdays(rule.days);
      if (rule.interval === 1 && days.length === 7) return "Every day";
      if (rule.interval === 1 && days.join() === "1,2,3,4,5") return "Monday to Friday";
      if (rule.interval === 1) return `Every ${joinDaysEn(days)}`;
      if (days.length === 1) return `Every ${rule.interval} weeks on ${EN_WEEKDAYS[days[0] ?? 1]}`;
      return `Every ${rule.interval} weeks: ${joinDaysEn(days)}`;
    }
    case "monthly":
      return rule.interval === 1 ? `The ${enOrdinal(rule.day)} of every month` : `The ${enOrdinal(rule.day)}, every ${rule.interval} months`;
    case "monthlyNth": {
      const what = `The ${rule.nth === -1 ? "last" : enOrdinal(rule.nth)} ${EN_WEEKDAYS[rule.weekday] ?? ""}`;
      return rule.interval === 1 ? `${what} of every month` : `${what}, every ${rule.interval} months`;
    }
    case "yearly": {
      const date = `${rule.day} ${EN_MONTHS[rule.month - 1] ?? ""}`;
      return rule.interval === 1 ? `Every year on ${date}` : `Every ${rule.interval} years, on ${date}`;
    }
    case "afterDone":
      return rule.days === 1 ? "1 day after completion" : `${rule.days} days after completion`;
  }
}

/**
 * Libellé dans une autre langue que le français et l'anglais : des modèles traduits, sans accord
 * délicat (« Chaque semaine : lundi et jeudi »), avec les noms de jours et de mois d'Intl.
 */
function recurrenceLabelAny(rule: Recurrence): string {
  const days = (list: readonly number[]) => new Intl.ListFormat(locale(), { type: "conjunction" }).format(sortWeekdays(list).map((d) => WEEKDAY_NAMES[d] ?? ""));
  switch (rule.kind) {
    case "daily":
      return trn(rule.interval, "Chaque jour", "Tous les {n} jours");
    case "weekdays":
      return tr("Du lundi au vendredi");
    case "weekly": {
      const sorted = sortWeekdays(rule.days);
      if (rule.interval === 1 && sorted.length === 7) return tr("Chaque jour");
      if (rule.interval === 1 && sorted.join() === "1,2,3,4,5") return tr("Du lundi au vendredi");
      return trn(rule.interval, "Chaque semaine : {days}", "Toutes les {n} semaines : {days}", { days: days(sorted) });
    }
    case "monthly":
      return trn(rule.interval, "Chaque mois, le jour {day}", "Tous les {n} mois, le jour {day}", { day: rule.day });
    case "monthlyNth": {
      const weekday = WEEKDAY_NAMES[rule.weekday] ?? "";
      const what =
        rule.nth === -1
          ? tr("Le dernier {weekday} du mois", { weekday })
          : rule.nth === 1
            ? tr("Le premier {weekday} du mois", { weekday })
            : rule.nth === 2
              ? tr("Le deuxième {weekday} du mois", { weekday })
              : rule.nth === 3
                ? tr("Le troisième {weekday} du mois", { weekday })
                : tr("Le quatrième {weekday} du mois", { weekday });
      return rule.interval === 1 ? what : tr("{what}, tous les {n} mois", { what, n: rule.interval });
    }
    case "yearly": {
      const date = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long" }).format(new Date(2023, rule.month - 1, rule.day));
      return trn(rule.interval, "Chaque année, le {date}", "Tous les {n} ans, le {date}", { date });
    }
    case "afterDone":
      return trn(rule.days, "{n} jour après achèvement", "{n} jours après achèvement");
  }
}

export function recurrenceLabel(rule: Recurrence): string {
  if (lang() === "en") return recurrenceLabelEn(rule);
  if (lang() !== "fr") return recurrenceLabelAny(rule);
  switch (rule.kind) {
    case "daily":
      return rule.interval === 1 ? "Chaque jour" : `Tous les ${rule.interval} jours`;
    case "weekdays":
      return "Du lundi au vendredi";
    case "weekly": {
      const days = sortWeekdays(rule.days);
      if (rule.interval === 1 && days.length === 7) return "Chaque jour";
      if (rule.interval === 1 && days.join() === "1,2,3,4,5") return "Du lundi au vendredi";
      if (rule.interval === 1) return `Chaque ${joinDays(days)}`;
      if (days.length === 1) return `Tous les ${rule.interval} ${FR_WEEKDAYS[days[0] ?? 1]}s`;
      return `Toutes les ${rule.interval} semaines : ${joinDays(days)}`;
    }
    case "monthly":
      return rule.interval === 1
        ? `Le ${ordinalDay(rule.day)} de chaque mois`
        : `Le ${ordinalDay(rule.day)}, tous les ${rule.interval} mois`;
    case "monthlyNth": {
      const what = `Le ${nthLabel(rule.nth)} ${FR_WEEKDAYS[rule.weekday] ?? ""}`;
      return rule.interval === 1 ? `${what} de chaque mois` : `${what}, tous les ${rule.interval} mois`;
    }
    case "yearly": {
      const date = `${ordinalDay(rule.day)} ${MONTH_NAMES[rule.month - 1] ?? ""}`;
      return rule.interval === 1 ? `Chaque année le ${date}` : `Tous les ${rule.interval} ans, le ${date}`;
    }
    case "afterDone":
      return `${rule.days} ${rule.days > 1 ? "jours" : "jour"} après achèvement`;
  }
}

export function sameRecurrence(a: Recurrence | null, b: Recurrence | null): boolean {
  if (a === null || b === null) return a === b;
  const norm = (r: Recurrence) => (r.kind === "weekly" ? { ...r, days: sortWeekdays(r.days) } : r);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export interface RecurrencePreset {
  label: string;
  rule: Recurrence;
}

/** Répétitions proposées à partir de l'échéance (ou d'aujourd'hui). */
export function presetsFor(day: DayKey): RecurrencePreset[] {
  const date = fromDayKey(day);
  const weekday = date.getDay();
  const dom = date.getDate();
  const month = date.getMonth() + 1;
  const lastDay = new Date(date.getFullYear(), month, 0).getDate();
  const nth = dom + 7 > lastDay ? -1 : Math.ceil(dom / 7);
  const rules: Recurrence[] = [
    { kind: "daily", interval: 1 },
    { kind: "weekdays" },
    { kind: "weekly", interval: 1, days: [weekday] },
    { kind: "weekly", interval: 2, days: [weekday] },
    { kind: "monthly", interval: 1, day: dom },
    { kind: "monthlyNth", interval: 1, nth, weekday },
    { kind: "yearly", interval: 1, month, day: dom },
  ];
  return rules.map((rule) => ({ label: recurrenceLabel(rule), rule }));
}
