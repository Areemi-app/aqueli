/**
 * Fêtes des traditions cochées dans le calendrier (« Fêtes et traditions ») : ce ne sont pas des
 * jours fériés, mais des repères. Les dates lunaires viennent des calendriers d'Intl (`lunar.ts`).
 */
import { addDays, makeDay, type DayKey } from "../tasks/day";
import { countryOf, easterDays, hijriId, MOON_NOTE, type CountryId } from "./countries";
import { at, HUE, nthWeekday, on, orthodoxEaster, weekdayFrom, type Holiday, type Period } from "./holidays";
import { adarDays, lunarDays, type LunarCalendar } from "./lunar";
import { tr } from "../i18n/i18n";

export type TraditionId = "chretienne" | "orthodoxe" | "juive" | "musulmane" | "asiatique" | "populaire";

export interface Tradition {
  id: TraditionId;
  name: string;
  /** Couleur de la case à cocher. */
  color: string;
  days: (year: number, country: CountryId) => Holiday[];
  periods?: (year: number) => Period[];
}

const EVE_NOTE = tr("La fête commence la veille au soir.");

const fete = (day: DayKey, name: string, color: string, note?: string) => at(day, name, color, "fete", note);

/** Fête lunaire : chaque jour de l'année grégorienne qui tombe à cette date. */
const lunar = (calendar: LunarCalendar, year: number, month: string | number, day: number, name: string, color: string, note?: string) =>
  lunarDays(calendar, year, month, day).map((d) => fete(d, name, color, note));

/** Fête du calendrier hégirien (date indicative), reconnue sous un autre nom dans un pays. */
const hijriFeast = (year: number, month: number, day: number, name: string, color: string, note = MOON_NOTE) =>
  lunar("islamic-umalqura", year, month, day, name, color, note).map((h) => ({ ...h, id: hijriId(month, day) }));

/**
 * Période lunaire de `length` jours qui commence à cette date. Celle qui a commencé l'année
 * grégorienne précédente est aussi rendue (elle peut déborder sur janvier).
 */
function lunarPeriod(calendar: LunarCalendar, year: number, month: string | number, day: number, length: number, name: string, color: string): Period[] {
  return [year - 1, year].flatMap((y) =>
    lunarDays(calendar, y, month, day).map((from) => ({ name, detail: "", from, to: addDays(from, length - 1), color })),
  );
}

/** Ramadan : du 1er ramadan à la veille de l'Aïd al-Fitr. */
function ramadan(year: number): Period[] {
  return [year - 1, year].flatMap((y) =>
    lunarDays("islamic-umalqura", y, 9, 1).map((from) => {
      const fitr = [...lunarDays("islamic-umalqura", y, 10, 1), ...lunarDays("islamic-umalqura", y + 1, 10, 1)].find((d) => d > from);
      return { name: tr("Ramadan"), detail: "", from, to: fitr ? addDays(fitr, -1) : addDays(from, 29), color: HUE.indigo };
    }),
  );
}

/** Premier dimanche de l'Avent : le dimanche du 27 novembre au 3 décembre. */
const adventSunday = (year: number) => weekdayFrom(makeDay(year, 11, 27)!, 0);

export const TRADITIONS: readonly Tradition[] = [
  {
    id: "chretienne",
    name: tr("Chrétiennes"),
    color: HUE.pourpre,
    days: (y) => {
      const e = easterDays(y);
      return [
        on(y, 1, 6, tr("Épiphanie"), HUE.jaune, "fete"),
        fete(e.cendres, tr("Mercredi des Cendres"), HUE.ardoise),
        fete(e.rameaux, tr("Rameaux"), HUE.pomme),
        fete(e.jeudiSaint, tr("Jeudi saint"), HUE.violet),
        fete(e.vendrediSaint, tr("Vendredi saint"), HUE.pourpre),
        fete(e.paques, tr("Pâques"), HUE.rose),
        fete(e.ascension, tr("Ascension"), HUE.ciel),
        fete(e.pentecote, tr("Pentecôte"), HUE.corail),
        on(y, 8, 15, tr("Assomption"), HUE.turquoise, "fete"),
        on(y, 11, 1, tr("Toussaint"), HUE.orange, "fete"),
        on(y, 12, 8, tr("Immaculée Conception"), HUE.violet, "fete"),
        on(y, 12, 24, tr("Veillée de Noël"), HUE.emeraude, "fete"),
        on(y, 12, 25, tr("Noël"), HUE.emeraude, "fete"),
      ];
    },
    periods: (y) => {
      const e = easterDays(y);
      return [
        { name: tr("Carême"), detail: "", from: e.cendres, to: e.samediSaint, color: HUE.pourpre },
        { name: tr("Avent"), detail: "", from: adventSunday(y), to: makeDay(y, 12, 24)!, color: HUE.violet },
      ];
    },
  },
  {
    id: "orthodoxe",
    name: tr("Orthodoxes"),
    color: HUE.ambre,
    days: (y) => {
      const e = orthodoxEaster(y);
      return [
        on(y, 1, 7, tr("Noël orthodoxe"), HUE.emeraude, "fete", tr("Selon le calendrier julien.")),
        on(y, 1, 19, tr("Théophanie orthodoxe"), HUE.ciel, "fete", tr("Selon le calendrier julien.")),
        fete(addDays(e, -2), tr("Vendredi saint orthodoxe"), HUE.pourpre),
        fete(e, tr("Pâques orthodoxe"), HUE.rose),
        fete(addDays(e, 39), tr("Ascension orthodoxe"), HUE.ciel),
        fete(addDays(e, 49), tr("Pentecôte orthodoxe"), HUE.corail),
      ];
    },
  },
  {
    id: "juive",
    name: tr("Juives"),
    color: HUE.bleu,
    days: (y) => [
      ...adarDays(y, 14).map((d) => fete(d, tr("Pourim"), HUE.prune, EVE_NOTE)),
      ...lunar("hebrew", y, tr("Nisan"), 15, tr("Pessa'h"), HUE.bleu, EVE_NOTE),
      ...lunar("hebrew", y, tr("Sivan"), 6, tr("Chavouot"), HUE.vert, EVE_NOTE),
      ...lunar("hebrew", y, tr("Tishri"), 1, tr("Roch Hachana"), HUE.ambre, EVE_NOTE),
      ...lunar("hebrew", y, tr("Tishri"), 2, tr("Roch Hachana (2e jour)"), HUE.ambre),
      ...lunar("hebrew", y, tr("Tishri"), 10, tr("Yom Kippour"), HUE.indigo, EVE_NOTE),
      ...lunar("hebrew", y, tr("Tishri"), 15, tr("Souccot"), HUE.emeraude, EVE_NOTE),
      ...lunar("hebrew", y, tr("Tishri"), 23, tr("Sim'hat Torah"), HUE.jaune, EVE_NOTE),
      ...lunar("hebrew", y, tr("Kislev"), 25, tr("Hanoucca"), HUE.ciel, EVE_NOTE),
    ],
    periods: (y) => [
      ...lunarPeriod("hebrew", y, tr("Nisan"), 15, 8, tr("Pessa'h"), HUE.bleu),
      ...lunarPeriod("hebrew", y, tr("Tishri"), 15, 7, tr("Souccot"), HUE.emeraude),
      ...lunarPeriod("hebrew", y, tr("Kislev"), 25, 8, tr("Hanoucca"), HUE.ciel),
    ],
  },
  {
    id: "musulmane",
    name: tr("Musulmanes"),
    color: HUE.emeraude,
    days: (y) => [
      ...hijriFeast(y, 9, 1, tr("Début du ramadan"), HUE.indigo),
      ...hijriFeast(y, 9, 27, tr("Nuit du Destin"), HUE.violet, `${tr("Nuit du 26 au 27 ramadan.")} ${MOON_NOTE}`),
      ...hijriFeast(y, 10, 1, tr("Aïd al-Fitr"), HUE.emeraude),
      ...hijriFeast(y, 12, 10, tr("Aïd al-Adha"), HUE.vert),
      ...hijriFeast(y, 1, 1, tr("Nouvel An de l'Hégire"), HUE.ambre),
      ...hijriFeast(y, 1, 10, tr("Achoura"), HUE.indigo),
      ...hijriFeast(y, 3, 12, tr("Mawlid"), HUE.cyan),
    ],
    periods: ramadan,
  },
  {
    id: "asiatique",
    name: tr("Asiatiques"),
    color: HUE.rouge,
    days: (y) => [
      ...lunar("chinese", y, 1, 1, tr("Nouvel An lunaire"), HUE.rouge),
      ...lunar("chinese", y, 1, 15, tr("Fête des lanternes"), HUE.ambre),
      ...lunar("chinese", y, 5, 5, tr("Fête des bateaux-dragons"), HUE.turquoise),
      ...lunar("chinese", y, 8, 15, tr("Fête de la mi-automne"), HUE.orange),
    ],
  },
  {
    id: "populaire",
    name: tr("Populaires"),
    color: HUE.rose,
    days: (y, countryId) => {
      const country = countryOf(countryId);
      const french = countryId === "fr" || countryId.startsWith("fr-");
      const list: Holiday[] = [
        on(y, 2, 2, tr("Chandeleur"), HUE.jaune, "fete"),
        on(y, 2, 14, tr("Saint-Valentin"), HUE.rose, "fete"),
        fete(easterDays(y).mardiGras, tr("Mardi gras"), HUE.prune),
        on(y, 4, 1, tr("Poisson d'avril"), HUE.cyan, "fete"),
        on(y, 6, 21, tr("Fête de la musique"), HUE.violet, "fete"),
        on(y, 10, 31, tr("Halloween"), HUE.orange, "fete"),
        on(y, 12, 31, tr("Saint-Sylvestre"), HUE.ambre, "fete"),
      ];
      if (french) list.push(fete(nthWeekday(y, 3, 0, 1), tr("Fête des grands-mères"), HUE.corail));
      if (country.mothers) list.push(fete(country.mothers(y), tr("Fête des mères"), HUE.rose));
      if (country.fathers) list.push(fete(country.fathers(y), tr("Fête des pères"), HUE.bleu));
      if (country.clock === "europe") {
        list.push(fete(nthWeekday(y, 3, 0, -1), tr("Passage à l'heure d'été"), HUE.jaune, tr("On avance d'une heure : à 2 h, il est 3 h.")));
        list.push(fete(nthWeekday(y, 10, 0, -1), tr("Passage à l'heure d'hiver"), HUE.ardoise, tr("On recule d'une heure : à 3 h, il est 2 h.")));
      } else if (country.clock === "amerique") {
        list.push(fete(nthWeekday(y, 3, 0, 2), tr("Passage à l'heure d'été"), HUE.jaune, tr("On avance d'une heure : à 2 h, il est 3 h.")));
        list.push(fete(nthWeekday(y, 11, 0, 1), tr("Passage à l'heure d'hiver"), HUE.ardoise, tr("On recule d'une heure : à 2 h, il est 1 h.")));
      }
      return list;
    },
  },
];

export const isTraditionId = (value: unknown): value is TraditionId => TRADITIONS.some((t) => t.id === value);
