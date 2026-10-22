/**
 * Noms des jours (0 = dimanche) et des mois dans la langue de l'interface, fournis par Intl :
 * aucune liste écrite à la main, quelle que soit la langue.
 */
import { locale } from "./i18n";

export function weekdayNames(style: "long" | "short" | "narrow"): string[] {
  const format = new Intl.DateTimeFormat(locale(), { weekday: style });
  // Le 1er janvier 2023 est un dimanche.
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2023, 0, 1 + i)));
}

/** Initiales des jours, du lundi au dimanche (« L M M J V S D », « M T W T F S S »…). */
export function weekdayInitials(): string[] {
  const narrow = weekdayNames("narrow");
  return [...narrow.slice(1), narrow[0]!];
}

export function monthNames(style: "long" | "short"): string[] {
  const format = new Intl.DateTimeFormat(locale(), { month: style });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(2023, i, 15)));
}

/** Première lettre en majuscule (« lundi » → « Lundi »), selon la langue. */
export const capitalize = (text: string): string => text.charAt(0).toLocaleUpperCase(locale()) + text.slice(1);

/** Abréviation sans point final (« dim. » → « dim »). */
export const withoutDot = (text: string): string => text.replace(/\.$/, "");
