/**
 * Calendriers lunaires (hégirien Umm al-Qura, hébraïque, chinois) ramenés au calendrier grégorien
 * grâce aux calendriers d'Intl, sans table ni connexion. Chaque année grégorienne est parcourue
 * une fois par calendrier, puis gardée en mémoire.
 */
import { dayKey, type DayKey } from "../tasks/day";
import { tr } from "../i18n/i18n";

export type LunarCalendar = "islamic-umalqura" | "hebrew" | "chinese";

const cache = new Map<string, Map<string, DayKey[]>>();

/**
 * Mois (numéro pour l'hégirien et le chinois, nom anglais d'Intl pour l'hébreu : « Tishri »,
 * « Adar II »…) et jour, pour chaque date de l'année grégorienne.
 */
function yearIndex(calendar: LunarCalendar, year: number): Map<string, DayKey[]> {
  const id = `${calendar}:${year}`;
  const known = cache.get(id);
  if (known) return known;
  const format = new Intl.DateTimeFormat(`en-u-ca-${calendar}`, {
    month: calendar === "hebrew" ? "long" : "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
  const index = new Map<string, DayKey[]>();
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 86_400_000) {
    let month = "";
    let day = "";
    for (const part of format.formatToParts(new Date(t))) {
      if (part.type === "month") month = part.value;
      else if (part.type === "day") day = part.value;
    }
    const date = new Date(t);
    const key = `${month}|${day}`;
    const list = index.get(key) ?? [];
    list.push(dayKey(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())));
    index.set(key, list);
  }
  cache.set(id, index);
  return index;
}

/**
 * Jours de l'année grégorienne `year` qui tombent le `day` du mois lunaire `month` (souvent un,
 * parfois deux pour l'hégirien, aucun certaines années). Un mois intercalaire chinois (« 6bis »)
 * n'est jamais pris pour le mois ordinaire.
 */
export function lunarDays(calendar: LunarCalendar, year: number, month: string | number, day: number): DayKey[] {
  return yearIndex(calendar, year).get(`${month}|${day}`) ?? [];
}

/** Purim et les fêtes d'Adar : Adar II les années embolismiques, Adar les autres. */
export function adarDays(year: number, day: number): DayKey[] {
  return [...lunarDays("hebrew", year, tr("Adar"), day), ...lunarDays("hebrew", year, tr("Adar II"), day)];
}
