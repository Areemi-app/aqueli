/** Formats de date à la française (JJ/MM/AAAA, semaine du lundi, 24 h). */
import { locale, tr } from "../i18n/i18n";

/** Message d'accueil selon l'heure, avec le prénom choisi s'il y en a un. */
export function greeting(date: Date, name = ""): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return name ? tr("Bonjour, {name}", { name }) : tr("Bonjour");
  if (h >= 12 && h < 18) return name ? tr("Bon après-midi, {name}", { name }) : tr("Bon après-midi");
  return name ? tr("Bonsoir, {name}", { name }) : tr("Bonsoir");
}

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // lundi = 1 … dimanche = 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // jeudi de la même semaine
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

const LONG_DATE = new Intl.DateTimeFormat(locale(), {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « Dimanche 27 septembre 2026 ». */
export function formatLongDate(date: Date): string {
  return capitalize(LONG_DATE.format(date));
}

/** « Dimanche 27 septembre 2026 · semaine 39 ». */
export function formatDateLine(date: Date): string {
  return tr("{date} · semaine {week}", { date: formatLongDate(date), week: isoWeek(date) });
}
