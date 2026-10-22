/**
 * Jours spéciaux affichés partout où des dates s'affichent : jours fériés du pays choisi, fêtes des
 * traditions cochées et périodes (vacances scolaires des zones choisies, ramadan, carême…).
 * Le réglage est gardé dans la base chiffrée (`SpecialDaysProvider`) : les fêtes religieuses
 * affichées peuvent en dire beaucoup sur une personne.
 */
import { addDays, type DayKey } from "../tasks/day";
import { countryHolidays, countryOf, DEFAULT_COUNTRY, isCountryId, type CountryId } from "./countries";
import { byDay, type Holiday, type Period } from "./holidays";
import { isSchoolZone, schoolHolidays, type SchoolZone } from "./school";
import { isTraditionId, TRADITIONS, type TraditionId } from "./traditions";
import { tr } from "../i18n/i18n";

export interface DaySettings {
  country: CountryId;
  /** Zones des vacances scolaires affichées (France métropolitaine). */
  zones: SchoolZone[];
  traditions: TraditionId[];
}

export const DEFAULT_DAY_SETTINGS: DaySettings = { country: DEFAULT_COUNTRY, zones: [], traditions: [] };

/** Réglage relu de la base : tout ce qui n'est pas reconnu est ignoré. */
export function parseDaySettings(value: unknown): DaySettings {
  if (typeof value !== "object" || value === null) return DEFAULT_DAY_SETTINGS;
  const v = value as Record<string, unknown>;
  const list = <T>(raw: unknown, ok: (x: unknown) => x is T): T[] => (Array.isArray(raw) ? [...new Set(raw.filter(ok))] : []);
  return {
    country: isCountryId(v.country) ? v.country : DEFAULT_COUNTRY,
    zones: list(v.zones, isSchoolZone).sort(),
    traditions: list(v.traditions, isTraditionId),
  };
}

const settingsKey = (s: DaySettings) => `${s.country}|${s.zones.join("")}|${s.traditions.join(",")}`;

const yearCache = new Map<string, { holidays: Holiday[]; periods: Period[] }>();

/** Jours fériés, fêtes et périodes de l'année (périodes commencées l'année d'avant comprises). */
function yearOf(settings: DaySettings, year: number) {
  const id = `${settingsKey(settings)}|${year}`;
  const known = yearCache.get(id);
  if (known) return known;
  const holidays = countryHolidays(settings.country, year);
  // Une fête déjà fériée dans le pays (Ascension, Noël, Tabaski…) n'est pas répétée.
  const keyOf = (h: Holiday) => `${h.day}|${h.id ?? h.name}`;
  const taken = new Set(holidays.map(keyOf));
  for (const tradition of TRADITIONS) {
    if (!settings.traditions.includes(tradition.id)) continue;
    for (const h of tradition.days(year, settings.country)) if (!taken.has(keyOf(h))) holidays.push(h);
  }
  holidays.sort((a, b) => byDay(a, b) || (a.kind === b.kind ? 0 : a.kind === "ferie" ? -1 : 1));
  const periods = TRADITIONS.filter((t) => settings.traditions.includes(t.id)).flatMap((t) => t.periods?.(year) ?? []);
  const result = { holidays, periods };
  if (yearCache.size > 200) yearCache.clear();
  yearCache.set(id, result);
  return result;
}

const yearsOf = (from: DayKey, to: DayKey) => {
  const years: number[] = [];
  for (let y = Number(from.slice(0, 4)) - 1; y <= Number(to.slice(0, 4)); y++) years.push(y);
  return years;
};

/** Jours fériés et fêtes de `from` à `to` compris, dans l'ordre (les fériés d'abord pour un même jour). */
export function holidaysBetween(settings: DaySettings, from: DayKey, to: DayKey): Holiday[] {
  return yearsOf(from, to).flatMap((y) => yearOf(settings, y).holidays.filter((h) => h.day >= from && h.day <= to));
}

/** Périodes qui touchent `from`…`to` : vacances scolaires des zones choisies, puis périodes des traditions. */
export function periodsBetween(settings: DaySettings, from: DayKey, to: DayKey): Period[] {
  const school = countryOf(settings.country).school ? schoolHolidays(settings.zones, from, to) : [];
  const seen = new Set<string>();
  const traditions = yearsOf(from, to)
    .flatMap((y) => yearOf(settings, y).periods)
    .filter((p) => p.to >= from && p.from <= to)
    .filter((p) => {
      const id = `${p.name}|${p.from}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  return [...school, ...traditions];
}

export interface PeriodLabel {
  /** « Vacances d'hiver · Zones A et B », « Ramadan ». */
  label: string;
  color: string;
  /** Premier jour de la période. */
  starts: boolean;
}

export interface DayMark {
  /** Couleur de la journée : celle du jour férié, sinon de la fête, sinon de la période. */
  color: string;
  /** « ferie » : bulle pleine ; « fete » : bulle cerclée ; « periode » : teinte seule. */
  level: "ferie" | "fete" | "periode";
  holidays: Holiday[];
  periods: PeriodLabel[];
  /** Tout ce que dit la journée, pour l'infobulle et la lecture d'écran. */
  label: string;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** « Zone A », « Zones A et B », « Zones A, B et C ». */
function zonesLabel(details: string[]): string {
  if (details.includes(tr("Toutes zones"))) return tr("Toutes zones");
  // « Zone A » : la lettre de la zone termine le libellé.
  const zones = details.map((d) => d.slice(-1)).sort();
  if (zones.length <= 1) return details[0] ?? "";
  return tr("Zones {list} et {last}", { list: zones.slice(0, -1).join(", "), last: zones[zones.length - 1] });
}

/** Ce qui marque chaque jour de `from` à `to` (les jours ordinaires sont absents). */
export function dayMarks(settings: DaySettings, from: DayKey, to: DayKey): Map<DayKey, DayMark> {
  const marks = new Map<DayKey, DayMark>();
  const byDayList = new Map<DayKey, Holiday[]>();
  for (const h of holidaysBetween(settings, from, to)) byDayList.set(h.day, [...(byDayList.get(h.day) ?? []), h]);
  const periods = periodsBetween(settings, from, to);
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const holidays = byDayList.get(day) ?? [];
    const current = periods.filter((p) => p.from <= day && day <= p.to);
    if (holidays.length === 0 && current.length === 0) continue;
    // Les mêmes vacances de plusieurs zones forment un seul libellé.
    const grouped = new Map<string, Period[]>();
    for (const p of current) grouped.set(p.name, [...(grouped.get(p.name) ?? []), p]);
    const labels: PeriodLabel[] = [...grouped.values()].map((group) => {
      const detail = zonesLabel(group.map((p) => p.detail).filter(Boolean));
      return { label: detail ? `${group[0]!.name} · ${detail}` : group[0]!.name, color: group[0]!.color, starts: group.some((p) => p.from === day) };
    });
    const first = holidays[0];
    marks.set(day, {
      color: first?.color ?? labels[0]!.color,
      level: first ? first.kind : "periode",
      holidays,
      periods: labels,
      label: [...holidays.map((h) => (h.note ? `${h.name} (${lowerFirst(h.note.replace(/\.$/, ""))})` : h.name)), ...labels.map((l) => l.label)].join(" · "),
    });
  }
  return marks;
}

/** Nom court d'une journée : ses fêtes, sinon ses périodes (« Toussaint · Halloween »). */
export const markTitle = (mark: DayMark | undefined): string =>
  !mark ? "" : mark.holidays.length > 0 ? mark.holidays.map((h) => h.name).join(" · ") : mark.periods.map((p) => p.label).join(" · ");
