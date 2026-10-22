/**
 * Jours spéciaux du calendrier : types communs et calculs de dates (Pâques, « deuxième dimanche
 * de mai »…). Les jours fériés de chaque pays sont dans `countries.ts`, les fêtes des traditions
 * dans `traditions.ts`, les vacances scolaires dans `school.ts` ; `specialDays.ts` les réunit.
 */
import { addDays, makeDay, weekday, type DayKey } from "../tasks/day";

export interface Holiday {
  day: DayKey;
  name: string;
  /** Couleur propre à chaque fête (palette de src/tasks/colors.ts). */
  color: string;
  /** « ferie » : jour férié du pays choisi ; « fete » : fête d'une tradition ou date usuelle. */
  kind: "ferie" | "fete";
  /** Précision donnée avec le nom (« date indicative », « commence la veille au soir »). */
  note?: string;
  /**
   * Même fête sous des noms différents (« Tabaski » au Sénégal, « Aïd al-Adha » ailleurs) :
   * une fête d'une tradition n'est pas répétée le jour où le pays la compte déjà.
   */
  id?: string;
}

/** Période de plusieurs jours : vacances scolaires, ramadan, carême… */
export interface Period {
  /** Même nom pour les mêmes vacances de zones différentes : elles se regroupent à l'affichage. */
  name: string;
  /** « Zone A », « Toutes zones »… ; vide sinon. */
  detail: string;
  from: DayKey;
  to: DayKey;
  color: string;
}

/** Couleurs de la palette (src/tasks/colors.ts), par nom. */
export const HUE = {
  rouge: "#e04848",
  corail: "#f0664a",
  orange: "#e0671f",
  ambre: "#e89a1c",
  jaune: "#e6c019",
  anis: "#a6c21a",
  pomme: "#6cc24a",
  vert: "#2fae4a",
  emeraude: "#1f9a6e",
  turquoise: "#16a3a3",
  cyan: "#14b4d4",
  ciel: "#0a9fd8",
  bleu: "#2d6ff0",
  indigo: "#4f5bd5",
  violet: "#7a5ce6",
  pourpre: "#9b4fd0",
  prune: "#c2479a",
  rose: "#e0508a",
  ardoise: "#64788c",
  brun: "#a0703c",
} as const;

/** Dimanche de Pâques (algorithme grégorien de Meeus, Jones et Butcher). */
export function easter(year: number): DayKey {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDay(year, month, day)!;
}

/** Pâques orthodoxe : comput julien (Meeus), ramené au calendrier grégorien (+13 jours de 1900 à 2099). */
export function orthodoxEaster(year: number): DayKey {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return addDays(makeDay(year, month, day)!, 13);
}

/**
 * `n`-ième jour de semaine `wd` (0 dimanche … 6 samedi) du mois ; `n` négatif compte depuis la fin
 * (-1 : le dernier).
 */
export function nthWeekday(year: number, month: number, wd: number, n: number): DayKey {
  if (n > 0) {
    const first = makeDay(year, month, 1)!;
    return addDays(first, ((wd - weekday(first) + 7) % 7) + (n - 1) * 7);
  }
  const last = addDays(month === 12 ? makeDay(year + 1, 1, 1)! : makeDay(year, month + 1, 1)!, -1);
  return addDays(last, -((weekday(last) - wd + 7) % 7) + (n + 1) * 7);
}

/** Premier jour de semaine `wd` à partir de `from` compris. */
export function weekdayFrom(from: DayKey, wd: number): DayKey {
  return addDays(from, (wd - weekday(from) + 7) % 7);
}

/** Jour fixe de l'année. */
export const on = (year: number, month: number, day: number, name: string, color: string, kind: Holiday["kind"] = "ferie", note?: string): Holiday => ({
  day: makeDay(year, month, day)!,
  name,
  color,
  kind,
  ...(note ? { note } : {}),
});

/** Jour donné par une date déjà calculée. */
export const at = (day: DayKey, name: string, color: string, kind: Holiday["kind"] = "ferie", note?: string): Holiday => ({
  day,
  name,
  color,
  kind,
  ...(note ? { note } : {}),
});

export const byDay = (a: { day: DayKey }, b: { day: DayKey }) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
