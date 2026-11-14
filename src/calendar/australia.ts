/**
 * Jours fériés d'Australie : chaque État ou territoire a les siens. Règles vérifiées le
 * 25/10/2026 sur le jeu de données officiel (data.gov.au, 2021-2025) et les pages des États
 * (2026-2027), comparées par `australia.test.ts`. Les fériés d'une seule ville ou région (Royal
 * Queensland Show, foires du Territoire du Nord, régates de Tasmanie) ne sont pas repris.
 */
import { addDays, makeDay, weekday, type DayKey } from "../tasks/day";
import { at, easter, HUE, nthWeekday, weekdayFrom, type Holiday } from "./holidays";
import { tr } from "../i18n/i18n";

export type AustralianState = "nsw" | "vic" | "qld" | "sa" | "wa" | "tas" | "act" | "nt";

const SAT = 6;
const SUN = 0;
const MON = 1;

/** Anniversaire du roi en Australie-Occidentale : dernier lundi de septembre, sauf proclamation. */
const WA_KINGS_BIRTHDAY: Record<number, DayKey> = { 2024: "2024-09-23" };

/** Report d'un jour tombé un week-end au lundi suivant (ou au mardi, si le lundi est déjà pris). */
const nextWeekday = (day: DayKey, taken: readonly DayKey[]) => {
  let d = addDays(day, 1);
  while (weekday(d) === SAT || weekday(d) === SUN || taken.includes(d)) d = addDays(d, 1);
  return d;
};

export function australianHolidays(state: AustralianState, y: number): Holiday[] {
  const list: Holiday[] = [];
  const add = (day: DayKey, name: string, color: string, note?: string) => list.push(at(day, name, color, "ferie", note));
  const replacement = (name: string) => tr("{name} (jour de remplacement)", { name });
  const sunday = easter(y);

  // Jour de l'An : un samedi, le lundi s'ajoute (il remplace le samedi en Australie-Méridionale,
  // en Tasmanie et dans le Territoire du Nord) ; un dimanche, le lundi s'ajoute partout.
  const newYear = makeDay(y, 1, 1)!;
  const newYearName = tr("Jour de l'An");
  const movesSaturday = state === "sa" || state === "tas" || state === "nt";
  if (!(weekday(newYear) === SAT && movesSaturday)) add(newYear, newYearName, HUE.ambre);
  if (weekday(newYear) === SAT || weekday(newYear) === SUN) add(nextWeekday(newYear, []), movesSaturday && weekday(newYear) === SAT ? newYearName : replacement(newYearName), HUE.ambre);

  // Fête nationale : un week-end, seul le lundi suivant est férié.
  const australiaDay = makeDay(y, 1, 26)!;
  add(weekday(australiaDay) === SAT || weekday(australiaDay) === SUN ? weekdayFrom(australiaDay, MON) : australiaDay, tr("Fête nationale de l'Australie"), HUE.bleu);

  // Pâques : le samedi n'est pas férié en Australie-Occidentale ni en Tasmanie ; le dimanche l'est
  // partout sauf en Tasmanie (depuis 2023 en Australie-Occidentale et dans le Territoire du Nord,
  // depuis 2025 en Australie-Méridionale).
  const easterSunday = state !== "tas" && !(state === "sa" && y < 2025) && !((state === "wa" || state === "nt") && y < 2023);
  add(addDays(sunday, -2), tr("Vendredi saint"), HUE.pourpre);
  if (state !== "wa" && state !== "tas") add(addDays(sunday, -1), tr("Samedi de Pâques"), HUE.violet);
  if (easterSunday) add(sunday, tr("Dimanche de Pâques"), HUE.jaune);
  add(addDays(sunday, 1), tr("Lundi de Pâques"), HUE.rose);

  // Anzac Day : selon l'État, reporté au lundi ou doublé d'un lundi quand il tombe un week-end.
  const anzac = makeDay(y, 4, 25)!;
  const anzacName = tr("Jour de l'ANZAC");
  const anzacDay = weekday(anzac);
  const movesToMonday = anzacDay === SUN && (state === "act" || state === "qld" || state === "sa" || state === "nt");
  const extraMonday =
    (state === "wa" && (anzacDay === SAT || anzacDay === SUN)) ||
    (state === "nsw" && y >= 2026 && (anzacDay === SAT || anzacDay === SUN)) ||
    (state === "act" && anzacDay === SAT);
  if (!movesToMonday) add(anzac, anzacName, HUE.ardoise);
  if (movesToMonday) add(weekdayFrom(anzac, MON), anzacName, HUE.ardoise);
  if (extraMonday) add(weekdayFrom(anzac, MON), replacement(anzacName), HUE.ardoise);

  // Fête du Travail et jours propres à chaque État.
  const labour = tr("Fête du Travail");
  const kings = tr("Anniversaire du roi");
  switch (state) {
    case "nsw":
      add(nthWeekday(y, 6, MON, 2), kings, HUE.indigo);
      add(nthWeekday(y, 10, MON, 1), labour, HUE.vert);
      break;
    case "vic":
      add(nthWeekday(y, 3, MON, 2), labour, HUE.vert);
      add(nthWeekday(y, 6, MON, 2), kings, HUE.indigo);
      // Grande finale de l'AFL : en général le dernier samedi de septembre.
      add(addDays(nthWeekday(y, 9, SAT, -1), -1), tr("Vendredi de la finale de l'AFL"), HUE.ciel, tr("Date fixée chaque année par l'AFL."));
      add(nthWeekday(y, 11, 2, 1), tr("Melbourne Cup"), HUE.turquoise, tr("Férié dans l'agglomération de Melbourne."));
      break;
    case "qld":
      add(nthWeekday(y, 5, MON, 1), labour, HUE.vert);
      add(nthWeekday(y, 10, MON, 1), kings, HUE.indigo);
      add(makeDay(y, 12, 24)!, tr("Veille de Noël"), HUE.emeraude, tr("Férié de 18 h à minuit."));
      break;
    case "sa":
      add(nthWeekday(y, 3, MON, 2), tr("Adelaide Cup"), HUE.turquoise);
      add(nthWeekday(y, 6, MON, 2), kings, HUE.indigo);
      add(nthWeekday(y, 10, MON, 1), labour, HUE.vert);
      add(makeDay(y, 12, 24)!, tr("Veille de Noël"), HUE.emeraude, tr("Férié de 19 h à minuit."));
      add(makeDay(y, 12, 31)!, tr("Saint-Sylvestre"), HUE.ambre, tr("Férié de 19 h à minuit."));
      break;
    case "wa":
      add(nthWeekday(y, 3, MON, 1), labour, HUE.vert);
      add(nthWeekday(y, 6, MON, 1), tr("Fête de l'Australie-Occidentale"), HUE.jaune);
      add(WA_KINGS_BIRTHDAY[y] ?? nthWeekday(y, 9, MON, -1), kings, HUE.indigo);
      break;
    case "tas":
      add(nthWeekday(y, 3, MON, 2), tr("Eight Hours Day"), HUE.vert);
      add(nthWeekday(y, 6, MON, 2), kings, HUE.indigo);
      break;
    case "act":
      add(nthWeekday(y, 3, MON, 2), tr("Fête de Canberra"), HUE.ciel);
      // Lundi le 27 mai ou juste après.
      add(weekdayFrom(makeDay(y, 5, 27)!, MON), tr("Journée de la réconciliation"), HUE.orange);
      add(nthWeekday(y, 6, MON, 2), kings, HUE.indigo);
      add(nthWeekday(y, 10, MON, 1), labour, HUE.vert);
      break;
    case "nt":
      add(nthWeekday(y, 5, MON, 1), tr("May Day"), HUE.vert);
      add(nthWeekday(y, 6, MON, 2), kings, HUE.indigo);
      add(nthWeekday(y, 8, MON, 1), tr("Picnic Day"), HUE.pomme);
      add(makeDay(y, 12, 24)!, tr("Veille de Noël"), HUE.emeraude, tr("Férié de 19 h à minuit."));
      add(makeDay(y, 12, 31)!, tr("Saint-Sylvestre"), HUE.ambre, tr("Férié de 19 h à minuit."));
      break;
  }

  // Noël et le lendemain : un jour tombé un week-end est remplacé par le jour ouvré suivant.
  const christmas = makeDay(y, 12, 25)!;
  const boxing = makeDay(y, 12, 26)!;
  const christmasName = tr("Noël");
  const boxingName = state === "sa" ? tr("Proclamation Day et lendemain de Noël") : tr("Lendemain de Noël");
  add(christmas, christmasName, HUE.emeraude);
  add(boxing, boxingName, HUE.prune);
  const taken: DayKey[] = [christmas, boxing];
  for (const [day, name] of [
    [christmas, christmasName],
    [boxing, boxingName],
  ] as const) {
    if (weekday(day) !== SAT && weekday(day) !== SUN) continue;
    const substitute = nextWeekday(day, taken);
    taken.push(substitute);
    add(substitute, replacement(name), name === christmasName ? HUE.emeraude : HUE.prune);
  }
  return list;
}
