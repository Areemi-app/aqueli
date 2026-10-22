/**
 * Vacances scolaires de la France métropolitaine, par zone (arrêtés du ministère de l'Éducation
 * nationale, vérifiés le 08/10/2026). Chaque période va du samedi de fin des cours à la veille de
 * la reprise. À compléter à la publication de chaque nouveau calendrier (en général en juillet,
 * pour l'année scolaire qui suit la prochaine).
 */
import { addDays, type DayKey } from "../tasks/day";
import { HUE, type Period } from "./holidays";
import { tr } from "../i18n/i18n";

export type SchoolZone = "A" | "B" | "C";

export const SCHOOL_ZONES: readonly { id: SchoolZone; label: string; cities: string }[] = [
  { id: "A", label: tr("Zone A"), cities: "Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers" },
  { id: "B", label: tr("Zone B"), cities: "Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg" },
  { id: "C", label: tr("Zone C"), cities: "Créteil, Montpellier, Paris, Toulouse, Versailles" },
];

export const isSchoolZone = (value: unknown): value is SchoolZone => value === "A" || value === "B" || value === "C";

type Kind = "toussaint" | "noel" | "hiver" | "printemps" | "ascension" | "ete";

const NAMES: Record<Kind, [string, string]> = {
  toussaint: [tr("Vacances de la Toussaint"), HUE.orange],
  noel: [tr("Vacances de Noël"), HUE.emeraude],
  hiver: [tr("Vacances d'hiver"), HUE.cyan],
  printemps: [tr("Vacances de printemps"), HUE.pomme],
  ascension: [tr("Pont de l'Ascension"), HUE.ciel],
  ete: [tr("Vacances d'été"), HUE.jaune],
};

/** Zones concernées (« ABC » : toutes), fin des cours, reprise des cours. */
const CALENDAR: readonly [Kind, string, DayKey, DayKey][] = [
  ["ete", "ABC", "2025-07-05", "2025-09-01"],
  // 2025-2026
  ["toussaint", "ABC", "2025-10-18", "2025-11-03"],
  ["noel", "ABC", "2025-12-20", "2026-01-05"],
  ["hiver", "A", "2026-02-07", "2026-02-23"],
  ["hiver", "B", "2026-02-14", "2026-03-02"],
  ["hiver", "C", "2026-02-21", "2026-03-09"],
  ["printemps", "A", "2026-04-04", "2026-04-20"],
  ["printemps", "B", "2026-04-11", "2026-04-27"],
  ["printemps", "C", "2026-04-18", "2026-05-04"],
  ["ascension", "ABC", "2026-05-14", "2026-05-18"],
  ["ete", "ABC", "2026-07-04", "2026-09-01"],
  // 2026-2027
  ["toussaint", "ABC", "2026-10-17", "2026-11-02"],
  ["noel", "ABC", "2026-12-19", "2027-01-04"],
  ["hiver", "A", "2027-02-13", "2027-03-01"],
  ["hiver", "B", "2027-02-20", "2027-03-08"],
  ["hiver", "C", "2027-02-06", "2027-02-22"],
  ["printemps", "A", "2027-04-10", "2027-04-26"],
  ["printemps", "B", "2027-04-17", "2027-05-03"],
  ["printemps", "C", "2027-04-03", "2027-04-19"],
  ["ascension", "ABC", "2027-05-06", "2027-05-10"],
  ["ete", "ABC", "2027-07-03", "2027-09-02"],
  // 2027-2028
  ["toussaint", "ABC", "2027-10-23", "2027-11-08"],
  ["noel", "ABC", "2027-12-18", "2028-01-03"],
  ["hiver", "A", "2028-02-19", "2028-03-06"],
  ["hiver", "B", "2028-02-05", "2028-02-21"],
  ["hiver", "C", "2028-02-12", "2028-02-28"],
  ["printemps", "A", "2028-04-22", "2028-05-09"],
  ["printemps", "B", "2028-04-08", "2028-04-24"],
  ["printemps", "C", "2028-04-15", "2028-05-02"],
  ["ascension", "ABC", "2028-05-25", "2028-05-29"],
  // Fin des cours le mardi 4 juillet ; reprise de septembre 2028 pas encore publiée.
  ["ete", "ABC", "2028-07-05", "2028-09-01"],
];

/** Dernière date connue : au-delà, le calendrier n'est pas encore publié. */
export const SCHOOL_KNOWN_UNTIL: DayKey = "2028-08-31";

/** Vacances des zones choisies qui touchent la période de `from` à `to`. */
export function schoolHolidays(zones: readonly SchoolZone[], from: DayKey, to: DayKey): Period[] {
  if (zones.length === 0) return [];
  const periods: Period[] = [];
  for (const [kind, concerned, end, resume] of CALENDAR) {
    const last = addDays(resume, -1);
    if (last < from || end > to) continue;
    const [name, color] = NAMES[kind];
    if (concerned === "ABC") {
      periods.push({ name, detail: tr("Toutes zones"), from: end, to: last, color });
      continue;
    }
    for (const zone of zones) {
      if (concerned.includes(zone)) periods.push({ name, detail: tr("Zone {zone}", { zone }), from: end, to: last, color });
    }
  }
  return periods;
}
