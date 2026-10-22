/**
 * Jours fériés par pays ou région (liste « Pays » du calendrier). Les jours fériés nationaux
 * seulement, avec quelques régions qui ont les leurs (Alsace-Moselle, départements d'outre-mer,
 * cantons de Genève et de Vaud, Québec). Vérifiés le 08/10/2026 auprès des sources officielles ;
 * les fêtes religieuses musulmanes suivent le calendrier Umm al-Qura (date indicative).
 */
import { addDays, weekday, type DayKey } from "../tasks/day";
import { at, byDay, easter, HUE, nthWeekday, on, weekdayFrom, type Holiday } from "./holidays";
import { lunarDays } from "./lunar";
import { tr } from "../i18n/i18n";

export type CountryId =
  | "aucun"
  | "fr"
  | "fr-alsace"
  | "fr-guadeloupe"
  | "fr-martinique"
  | "fr-guyane"
  | "fr-reunion"
  | "fr-mayotte"
  | "be"
  | "lu"
  | "mc"
  | "ch"
  | "ch-ge"
  | "ch-vd"
  | "de"
  | "es"
  | "it"
  | "pt"
  | "gb"
  | "ca-qc"
  | "us"
  | "ma"
  | "dz"
  | "tn"
  | "sn"
  | "ci";

export interface Country {
  id: CountryId;
  name: string;
  group: "" | "France" | "Europe" | "Amérique du Nord" | "Afrique";
  holidays: (year: number) => Holiday[];
  /** Vacances scolaires par zone (France métropolitaine). */
  school?: boolean;
  /** Fête des mères et des pères, quand l'usage du pays est connu. */
  mothers?: (year: number) => DayKey;
  fathers?: (year: number) => DayKey;
  /** Changement d'heure : « europe » (derniers dimanches de mars et d'octobre), « amerique ». */
  clock?: "europe" | "amerique";
}

export const MOON_NOTE = tr("Date indicative : elle peut varier d'un jour selon l'observation de la lune.");

/** Dates de l'année liées à Pâques. */
export function easterDays(year: number) {
  const e = easter(year);
  return {
    mardiGras: addDays(e, -47),
    cendres: addDays(e, -46),
    rameaux: addDays(e, -7),
    jeudiSaint: addDays(e, -3),
    vendrediSaint: addDays(e, -2),
    samediSaint: addDays(e, -1),
    paques: e,
    lundiPaques: addDays(e, 1),
    ascension: addDays(e, 39),
    pentecote: addDays(e, 49),
    lundiPentecote: addDays(e, 50),
    feteDieu: addDays(e, 60),
  };
}

/** Identifiant d'une date du calendrier hégirien, commun aux pays et à la tradition musulmane. */
export const hijriId = (month: number, day: number) => `hegire-${month}-${day}`;

/** Fête musulmane du pays, à sa date du calendrier hégirien, sur un ou plusieurs jours. */
function hijri(year: number, month: number, day: number, name: string, color: string, days = 1): Holiday[] {
  return lunarDays("islamic-umalqura", year, month, day).flatMap((first) =>
    Array.from({ length: days }, (_, i) => ({
      ...at(addDays(first, i), i === 0 ? name : tr("{name} ({x}e jour)", { name, x: i + 1 }), color, "ferie", MOON_NOTE),
      ...(i === 0 ? { id: hijriId(month, day) } : {}),
    })),
  );
}

const NEW_YEAR = (y: number) => on(y, 1, 1, tr("Jour de l'An"), HUE.ambre);
const LABOUR = (y: number) => on(y, 5, 1, tr("Fête du Travail"), HUE.vert);
const ASSUMPTION = (y: number) => on(y, 8, 15, tr("Assomption"), HUE.turquoise);
const ALL_SAINTS = (y: number) => on(y, 11, 1, tr("Toussaint"), HUE.orange);
const CHRISTMAS = (y: number) => on(y, 12, 25, tr("Noël"), HUE.emeraude);
const SAINT_STEPHEN = (y: number) => on(y, 12, 26, tr("Saint-Étienne"), HUE.prune);
const IMMACULATE = (y: number) => on(y, 12, 8, tr("Immaculée Conception"), HUE.violet);
const EPIPHANY = (y: number) => on(y, 1, 6, tr("Épiphanie"), HUE.jaune);

const goodFriday = (y: number) => at(easterDays(y).vendrediSaint, tr("Vendredi saint"), HUE.pourpre);
const easterMonday = (y: number) => at(easterDays(y).lundiPaques, tr("Lundi de Pâques"), HUE.rose);
const ascension = (y: number) => at(easterDays(y).ascension, tr("Ascension"), HUE.ciel);
const whitMonday = (y: number) => at(easterDays(y).lundiPentecote, tr("Lundi de Pentecôte"), HUE.corail);
const corpusChristi = (y: number) => at(easterDays(y).feteDieu, tr("Fête-Dieu"), HUE.jaune);

/** Les 11 jours fériés de la France métropolitaine. */
function france(y: number): Holiday[] {
  return [
    NEW_YEAR(y),
    easterMonday(y),
    LABOUR(y),
    on(y, 5, 8, tr("Victoire 1945"), HUE.indigo),
    ascension(y),
    whitMonday(y),
    on(y, 7, 14, tr("Fête nationale"), HUE.rouge),
    ASSUMPTION(y),
    ALL_SAINTS(y),
    on(y, 11, 11, tr("Armistice 1918"), HUE.bleu),
    CHRISTMAS(y),
  ];
}

/** Département d'outre-mer : les jours de la métropole et la fête de l'abolition de l'esclavage. */
const overseas = (month: number, day: number) => (y: number) => [...france(y), on(y, month, day, tr("Abolition de l'esclavage"), HUE.pourpre)];

/** Fête des mères en France : dernier dimanche de mai, ou premier de juin s'il tombe à la Pentecôte. */
export function frenchMothersDay(year: number): DayKey {
  const last = nthWeekday(year, 5, 0, -1);
  return last === easterDays(year).pentecote ? addDays(last, 7) : last;
}

const FRANCE_USES = {
  mothers: frenchMothersDay,
  fathers: (y: number) => nthWeekday(y, 6, 0, 3),
};

/** Royaume-Uni : un jour férié qui tombe un week-end est remplacé par le jour ouvré suivant. */
function englishHolidays(y: number): Holiday[] {
  const e = easterDays(y);
  const list: Holiday[] = [
    on(y, 1, 1, tr("Jour de l'An"), HUE.ambre),
    at(e.vendrediSaint, tr("Vendredi saint"), HUE.pourpre),
    at(e.lundiPaques, tr("Lundi de Pâques"), HUE.rose),
    at(nthWeekday(y, 5, 1, 1), tr("Jour férié de mai"), HUE.vert),
    at(nthWeekday(y, 5, 1, -1), tr("Jour férié de printemps"), HUE.pomme),
    at(nthWeekday(y, 8, 1, -1), tr("Jour férié d'été"), HUE.jaune),
    CHRISTMAS(y),
    on(y, 12, 26, tr("Lendemain de Noël"), HUE.prune),
  ];
  const newYear = list[0]!.day;
  if (weekday(newYear) % 6 === 0) list.push(at(weekdayFrom(newYear, 1), tr("Jour de l'An (jour de remplacement)"), HUE.ambre));
  const xmasDay = weekday(`${y}-12-25`);
  // Samedi : lundi 27 et mardi 28 ; dimanche : mardi 27 ; vendredi : lundi 28.
  if (xmasDay === 6) list.push(on(y, 12, 27, tr("Noël (jour de remplacement)"), HUE.emeraude), on(y, 12, 28, tr("Lendemain de Noël (jour de remplacement)"), HUE.prune));
  if (xmasDay === 0) list.push(on(y, 12, 27, tr("Noël (jour de remplacement)"), HUE.emeraude));
  if (xmasDay === 5) list.push(on(y, 12, 28, tr("Lendemain de Noël (jour de remplacement)"), HUE.prune));
  return list;
}

export const COUNTRIES: readonly Country[] = [
  { id: "aucun", name: tr("Aucun jour férié"), group: "", holidays: () => [] },
  { id: "fr", name: tr("France métropolitaine"), group: "France", holidays: france, school: true, ...FRANCE_USES, clock: "europe" },
  {
    id: "fr-alsace",
    name: tr("Alsace et Moselle"),
    group: "France",
    holidays: (y) => [...france(y), goodFriday(y), SAINT_STEPHEN(y)],
    school: true,
    ...FRANCE_USES,
    clock: "europe",
  },
  { id: "fr-guadeloupe", name: tr("Guadeloupe"), group: "France", holidays: overseas(5, 27), ...FRANCE_USES },
  { id: "fr-martinique", name: tr("Martinique"), group: "France", holidays: overseas(5, 22), ...FRANCE_USES },
  { id: "fr-guyane", name: tr("Guyane"), group: "France", holidays: overseas(6, 10), ...FRANCE_USES },
  { id: "fr-reunion", name: tr("La Réunion"), group: "France", holidays: overseas(12, 20), ...FRANCE_USES },
  { id: "fr-mayotte", name: tr("Mayotte"), group: "France", holidays: overseas(4, 27), ...FRANCE_USES },
  {
    id: "be",
    name: tr("Belgique"),
    group: "Europe",
    holidays: (y) => [
      NEW_YEAR(y),
      easterMonday(y),
      LABOUR(y),
      ascension(y),
      whitMonday(y),
      on(y, 7, 21, tr("Fête nationale"), HUE.rouge),
      ASSUMPTION(y),
      ALL_SAINTS(y),
      on(y, 11, 11, tr("Armistice 1918"), HUE.bleu),
      CHRISTMAS(y),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 2),
    fathers: (y) => nthWeekday(y, 6, 0, 2),
    clock: "europe",
  },
  {
    id: "lu",
    name: tr("Luxembourg"),
    group: "Europe",
    holidays: (y) => [
      NEW_YEAR(y),
      easterMonday(y),
      LABOUR(y),
      on(y, 5, 9, tr("Journée de l'Europe"), HUE.bleu),
      ascension(y),
      whitMonday(y),
      on(y, 6, 23, tr("Fête nationale"), HUE.rouge),
      ASSUMPTION(y),
      ALL_SAINTS(y),
      CHRISTMAS(y),
      SAINT_STEPHEN(y),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 2),
    fathers: (y) => nthWeekday(y, 10, 0, 1),
    clock: "europe",
  },
  {
    id: "mc",
    name: tr("Monaco"),
    group: "Europe",
    holidays: (y) => [
      NEW_YEAR(y),
      on(y, 1, 27, tr("Sainte-Dévote"), HUE.rouge),
      easterMonday(y),
      LABOUR(y),
      ascension(y),
      whitMonday(y),
      corpusChristi(y),
      ASSUMPTION(y),
      ALL_SAINTS(y),
      on(y, 11, 19, tr("Fête du Prince"), HUE.rouge),
      IMMACULATE(y),
      CHRISTMAS(y),
    ],
    ...FRANCE_USES,
    clock: "europe",
  },
  {
    id: "ch-ge",
    name: tr("Suisse – Genève"),
    group: "Europe",
    holidays: (y) => [
      NEW_YEAR(y),
      goodFriday(y),
      easterMonday(y),
      ascension(y),
      whitMonday(y),
      on(y, 8, 1, tr("Fête nationale"), HUE.rouge),
      // Jeudi qui suit le premier dimanche de septembre.
      at(addDays(nthWeekday(y, 9, 0, 1), 4), tr("Jeûne genevois"), HUE.indigo),
      CHRISTMAS(y),
      on(y, 12, 31, tr("Restauration de la République"), HUE.ambre),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 2),
    fathers: (y) => nthWeekday(y, 6, 0, 1),
    clock: "europe",
  },
  {
    id: "ch-vd",
    name: tr("Suisse – Vaud"),
    group: "Europe",
    holidays: (y) => [
      NEW_YEAR(y),
      on(y, 1, 2, tr("Saint-Berchtold"), HUE.jaune),
      goodFriday(y),
      easterMonday(y),
      ascension(y),
      whitMonday(y),
      on(y, 8, 1, tr("Fête nationale"), HUE.rouge),
      // Lundi qui suit le troisième dimanche de septembre.
      at(addDays(nthWeekday(y, 9, 0, 3), 1), tr("Lundi du Jeûne fédéral"), HUE.indigo),
      CHRISTMAS(y),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 2),
    fathers: (y) => nthWeekday(y, 6, 0, 1),
    clock: "europe",
  },
  {
    id: "ch",
    name: tr("Suisse – autres cantons (jours fédéraux)"),
    group: "Europe",
    holidays: (y) => [NEW_YEAR(y), ascension(y), on(y, 8, 1, tr("Fête nationale"), HUE.rouge), CHRISTMAS(y)],
    mothers: (y) => nthWeekday(y, 5, 0, 2),
    fathers: (y) => nthWeekday(y, 6, 0, 1),
    clock: "europe",
  },
  {
    id: "de",
    name: tr("Allemagne"),
    group: "Europe",
    holidays: (y) => [
      NEW_YEAR(y),
      goodFriday(y),
      easterMonday(y),
      LABOUR(y),
      ascension(y),
      whitMonday(y),
      on(y, 10, 3, tr("Fête de l'Unité allemande"), HUE.rouge),
      CHRISTMAS(y),
      SAINT_STEPHEN(y),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 2),
    fathers: (y) => easterDays(y).ascension,
    clock: "europe",
  },
  {
    id: "es",
    name: tr("Espagne"),
    group: "Europe",
    holidays: (y) => [
      NEW_YEAR(y),
      EPIPHANY(y),
      goodFriday(y),
      LABOUR(y),
      ASSUMPTION(y),
      on(y, 10, 12, tr("Fête nationale"), HUE.rouge),
      ALL_SAINTS(y),
      on(y, 12, 6, tr("Jour de la Constitution"), HUE.indigo),
      IMMACULATE(y),
      CHRISTMAS(y),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 1),
    fathers: (y) => `${y}-03-19`,
    clock: "europe",
  },
  {
    id: "it",
    name: tr("Italie"),
    group: "Europe",
    holidays: (y) => [
      NEW_YEAR(y),
      EPIPHANY(y),
      easterMonday(y),
      on(y, 4, 25, tr("Fête de la Libération"), HUE.rouge),
      LABOUR(y),
      on(y, 6, 2, tr("Fête de la République"), HUE.vert),
      ASSUMPTION(y),
      // Fête nationale de saint François d'Assise, rétablie à partir de 2026.
      ...(y >= 2026 ? [on(y, 10, 4, tr("Saint-François d'Assise"), HUE.brun)] : []),
      ALL_SAINTS(y),
      IMMACULATE(y),
      CHRISTMAS(y),
      SAINT_STEPHEN(y),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 2),
    fathers: (y) => `${y}-03-19`,
    clock: "europe",
  },
  {
    id: "pt",
    name: tr("Portugal"),
    group: "Europe",
    holidays: (y) => [
      NEW_YEAR(y),
      goodFriday(y),
      at(easterDays(y).paques, tr("Pâques"), HUE.rose),
      on(y, 4, 25, tr("Jour de la Liberté"), HUE.rouge),
      LABOUR(y),
      corpusChristi(y),
      on(y, 6, 10, tr("Jour du Portugal"), HUE.vert),
      ASSUMPTION(y),
      on(y, 10, 5, tr("Proclamation de la République"), HUE.rouge),
      ALL_SAINTS(y),
      on(y, 12, 1, tr("Restauration de l'indépendance"), HUE.indigo),
      IMMACULATE(y),
      CHRISTMAS(y),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 1),
    fathers: (y) => `${y}-03-19`,
    clock: "europe",
  },
  {
    id: "gb",
    name: tr("Royaume-Uni (Angleterre et pays de Galles)"),
    group: "Europe",
    holidays: englishHolidays,
    // Mothering Sunday : quatrième dimanche du carême.
    mothers: (y) => addDays(easter(y), -21),
    fathers: (y) => nthWeekday(y, 6, 0, 3),
    clock: "europe",
  },
  {
    id: "ca-qc",
    name: tr("Canada – Québec"),
    group: "Amérique du Nord",
    holidays: (y) => [
      NEW_YEAR(y),
      goodFriday(y),
      easterMonday(y),
      // Lundi qui précède le 25 mai.
      at(weekdayFrom(`${y}-05-18`, 1), tr("Journée nationale des patriotes"), HUE.vert),
      on(y, 6, 24, tr("Fête nationale du Québec"), HUE.bleu),
      on(y, 7, 1, tr("Fête du Canada"), HUE.rouge),
      at(nthWeekday(y, 9, 1, 1), tr("Fête du Travail"), HUE.vert),
      at(nthWeekday(y, 10, 1, 2), tr("Action de grâce"), HUE.orange),
      CHRISTMAS(y),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 2),
    fathers: (y) => nthWeekday(y, 6, 0, 3),
    clock: "amerique",
  },
  {
    id: "us",
    name: tr("États-Unis"),
    group: "Amérique du Nord",
    holidays: (y) => [
      NEW_YEAR(y),
      at(nthWeekday(y, 1, 1, 3), tr("Martin Luther King Day"), HUE.indigo),
      at(nthWeekday(y, 2, 1, 3), tr("Presidents' Day"), HUE.bleu),
      at(nthWeekday(y, 5, 1, -1), tr("Memorial Day"), HUE.ardoise),
      on(y, 6, 19, tr("Juneteenth"), HUE.vert),
      on(y, 7, 4, tr("Fête de l'Indépendance"), HUE.rouge),
      at(nthWeekday(y, 9, 1, 1), tr("Labor Day"), HUE.vert),
      at(nthWeekday(y, 10, 1, 2), tr("Columbus Day"), HUE.ciel),
      on(y, 11, 11, tr("Veterans Day"), HUE.bleu),
      at(nthWeekday(y, 11, 4, 4), tr("Thanksgiving"), HUE.orange),
      CHRISTMAS(y),
    ],
    mothers: (y) => nthWeekday(y, 5, 0, 2),
    fathers: (y) => nthWeekday(y, 6, 0, 3),
    clock: "amerique",
  },
  {
    id: "ma",
    name: tr("Maroc"),
    group: "Afrique",
    holidays: (y) => [
      NEW_YEAR(y),
      on(y, 1, 11, tr("Manifeste de l'Indépendance"), HUE.rouge),
      on(y, 1, 14, tr("Nouvel An amazigh"), HUE.jaune),
      LABOUR(y),
      on(y, 7, 30, tr("Fête du Trône"), HUE.rouge),
      on(y, 8, 14, tr("Allégeance d'Oued Eddahab"), HUE.orange),
      on(y, 8, 20, tr("Révolution du Roi et du Peuple"), HUE.indigo),
      on(y, 8, 21, tr("Fête de la Jeunesse"), HUE.pomme),
      ...(y >= 2026 ? [on(y, 10, 31, tr("Fête de l'Unité"), HUE.bleu)] : []),
      on(y, 11, 6, tr("Marche verte"), HUE.vert),
      on(y, 11, 18, tr("Fête de l'Indépendance"), HUE.rouge),
      ...hijri(y, 10, 1, tr("Aïd al-Fitr"), HUE.emeraude),
      ...hijri(y, 12, 10, tr("Aïd al-Adha"), HUE.vert),
      ...hijri(y, 1, 1, "1er Moharram", HUE.ambre),
      ...hijri(y, 3, 12, tr("Aïd al-Mawlid"), HUE.cyan),
    ],
  },
  {
    id: "dz",
    name: tr("Algérie"),
    group: "Afrique",
    holidays: (y) => [
      NEW_YEAR(y),
      on(y, 1, 12, tr("Yennayer"), HUE.jaune),
      LABOUR(y),
      on(y, 7, 5, tr("Fête de l'Indépendance"), HUE.rouge),
      on(y, 11, 1, tr("Fête de la Révolution"), HUE.rouge),
      ...hijri(y, 10, 1, tr("Aïd al-Fitr"), HUE.emeraude, 3),
      ...hijri(y, 12, 10, tr("Aïd al-Adha"), HUE.vert, 3),
      ...hijri(y, 1, 1, tr("Awal Moharram"), HUE.ambre),
      ...hijri(y, 1, 10, tr("Achoura"), HUE.indigo),
      ...hijri(y, 3, 12, tr("Mawlid Ennabaoui"), HUE.cyan),
    ],
  },
  {
    id: "tn",
    name: tr("Tunisie"),
    group: "Afrique",
    holidays: (y) => [
      NEW_YEAR(y),
      on(y, 3, 20, tr("Fête de l'Indépendance"), HUE.rouge),
      on(y, 4, 9, tr("Fête des Martyrs"), HUE.indigo),
      LABOUR(y),
      on(y, 7, 25, tr("Fête de la République"), HUE.rouge),
      on(y, 8, 13, tr("Fête de la Femme"), HUE.rose),
      on(y, 10, 15, tr("Fête de l'Évacuation"), HUE.bleu),
      on(y, 12, 17, tr("Fête de la Révolution"), HUE.rouge),
      ...hijri(y, 10, 1, tr("Aïd al-Fitr"), HUE.emeraude),
      ...hijri(y, 12, 10, tr("Aïd al-Adha"), HUE.vert),
      ...hijri(y, 1, 1, tr("Ras El Am El Hijri"), HUE.ambre),
      ...hijri(y, 3, 12, tr("Mouled"), HUE.cyan),
    ],
  },
  {
    id: "sn",
    name: tr("Sénégal"),
    group: "Afrique",
    holidays: (y) => [
      NEW_YEAR(y),
      on(y, 4, 4, tr("Fête de l'Indépendance"), HUE.rouge),
      easterMonday(y),
      LABOUR(y),
      ascension(y),
      whitMonday(y),
      ASSUMPTION(y),
      ALL_SAINTS(y),
      CHRISTMAS(y),
      ...hijri(y, 10, 1, tr("Korité"), HUE.emeraude),
      ...hijri(y, 12, 10, tr("Tabaski"), HUE.vert),
      ...hijri(y, 1, 10, tr("Tamkharit"), HUE.indigo),
      ...hijri(y, 2, 18, tr("Grand Magal de Touba"), HUE.brun),
      ...hijri(y, 3, 12, tr("Maouloud"), HUE.cyan),
    ],
  },
  {
    id: "ci",
    name: tr("Côte d'Ivoire"),
    group: "Afrique",
    holidays: (y) => [
      NEW_YEAR(y),
      easterMonday(y),
      LABOUR(y),
      ascension(y),
      whitMonday(y),
      on(y, 8, 7, tr("Fête nationale"), HUE.orange),
      ASSUMPTION(y),
      ALL_SAINTS(y),
      on(y, 11, 15, tr("Journée nationale de la Paix"), HUE.ciel),
      CHRISTMAS(y),
      ...hijri(y, 9, 27, tr("Lendemain de la Nuit du Destin"), HUE.violet),
      ...hijri(y, 10, 1, tr("Aïd al-Fitr"), HUE.emeraude),
      ...hijri(y, 12, 10, tr("Tabaski"), HUE.vert),
      ...hijri(y, 3, 12, tr("Maouloud"), HUE.cyan),
    ],
  },
];

export const DEFAULT_COUNTRY: CountryId = "fr";

export const isCountryId = (value: unknown): value is CountryId => COUNTRIES.some((c) => c.id === value);

export const countryOf = (id: CountryId): Country => COUNTRIES.find((c) => c.id === id) ?? COUNTRIES[1]!;

/** Jours fériés du pays pour l'année, dans l'ordre. */
export function countryHolidays(id: CountryId, year: number): Holiday[] {
  return countryOf(id).holidays(year).sort(byDay);
}
