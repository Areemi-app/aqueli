/**
 * Journal côté interface (src-tauri/src/data/journal.rs) : humeurs et énergie, activités du
 * jour, questions d'écriture, calendrier du mois, série de jours écrits, tendances (humeur dans
 * le temps, humeur selon les activités), souvenirs des années passées, humeur transmise au
 * moteur de thèmes. Fonctions pures.
 */
import type { Mood } from "../theme/engine";
import { addDays, dayKey, fromDayKey, makeDay, type DayKey } from "../tasks/day";
import { lang, locale, tr } from "../i18n/i18n";

export interface JournalSummary {
  day: DayKey;
  /** 1 (difficile) à 5 (très bien). */
  mood: number | null;
  /** 1 (très faible) à 5 (débordante). */
  energy: number | null;
  gratitudes: string[];
  excerpt: string;
  updatedAt: number;
  /** Activités du jour (identifiants de `ACTIVITIES`). */
  activities: string[];
}

export interface JournalEntry extends JournalSummary {
  /** Document de l'éditeur (JSON) ; vide : page sans texte. */
  content: string;
}

/** Page envoyée au cœur. */
export interface JournalPage {
  mood: number | null;
  energy: number | null;
  gratitudes: string[];
  content: string;
  plain: string;
  activities: string[];
}

export interface Activity {
  id: string;
  label: string;
  /** Symbole (src/components/symbols.ts). */
  icon: string;
  group: string;
}

/** Activités du jour, par groupes ; l'humeur de chaque jour se compare selon ce qu'il contenait. */
export const ACTIVITIES: readonly Activity[] = [
  { id: "famille", label: tr("Famille"), icon: "famille", group: tr("Entourage") },
  { id: "amis", label: tr("Amis"), icon: "amis", group: tr("Entourage") },
  { id: "couple", label: tr("Couple"), icon: "couple", group: tr("Entourage") },
  { id: "travail", label: tr("Travail"), icon: "valise", group: tr("Obligations") },
  { id: "etudes", label: tr("Études"), icon: "ecole", group: tr("Obligations") },
  { id: "menage", label: tr("Ménage"), icon: "balai", group: tr("Obligations") },
  { id: "courses", label: tr("Courses"), icon: "panier", group: tr("Obligations") },
  { id: "lecture", label: tr("Lecture"), icon: "lecture", group: tr("Loisirs") },
  { id: "ecrans", label: tr("Films"), icon: "film", group: tr("Loisirs") },
  { id: "musique", label: tr("Musique"), icon: "musique", group: tr("Loisirs") },
  { id: "jeux", label: tr("Jeux"), icon: "jeu", group: tr("Loisirs") },
  { id: "cuisine", label: tr("Cuisine"), icon: "cuisine", group: tr("Loisirs") },
  { id: "sortie", label: tr("Sortie"), icon: "fete", group: tr("Loisirs") },
  { id: "voyage", label: tr("Voyage"), icon: "avion", group: tr("Loisirs") },
  { id: "creativite", label: tr("Créativité"), icon: "palette", group: tr("Loisirs") },
  { id: "sport", label: tr("Sport"), icon: "sport", group: tr("Corps et esprit") },
  { id: "balade", label: tr("Balade"), icon: "arbre", group: tr("Corps et esprit") },
  { id: "meditation", label: tr("Méditation"), icon: "yoga", group: tr("Corps et esprit") },
  { id: "repos", label: tr("Repos"), icon: "canape", group: tr("Corps et esprit") },
  { id: "sommeil", label: tr("Bien dormi"), icon: "sommeil", group: tr("Corps et esprit") },
  { id: "sante", label: tr("Santé"), icon: "sante", group: tr("Corps et esprit") },
];

export function activityOf(id: string): Activity | undefined {
  return ACTIVITIES.find((a) => a.id === id);
}

/** Activités rangées dans l'ordre de la liste (les inconnues sont ignorées). */
export function sortActivities(ids: readonly string[]): string[] {
  return ACTIVITIES.filter((a) => ids.includes(a.id)).map((a) => a.id);
}

/** Cinq humeurs, de la plus difficile à la meilleure ; couleurs sans jugement (violet à or). */
export const MOODS = [
  { value: 1, label: tr("Difficile"), color: "#7e6bd6" },
  { value: 2, label: tr("Bof"), color: "#4c8fe0" },
  { value: 3, label: tr("Neutre"), color: "#27b3c4" },
  { value: 4, label: tr("Bien"), color: "#45b85a" },
  { value: 5, label: tr("Très bien"), color: "#f0a52c" },
] as const;

export const ENERGIES = [
  { value: 1, label: tr("Très faible") },
  { value: 2, label: tr("Faible") },
  { value: 3, label: tr("Moyenne") },
  { value: 4, label: tr("Bonne") },
  { value: 5, label: tr("Débordante") },
] as const;

export function moodOf(value: number | null): (typeof MOODS)[number] | null {
  return MOODS.find((m) => m.value === value) ?? null;
}

/**
 * Humeur pour le changement automatique de thème : Cocon (douceur) quand l'humeur ou l'énergie
 * est basse, Énergie quand l'énergie est haute, Zen sinon.
 */
export function themeMood(entry: Pick<JournalSummary, "mood" | "energy"> | null | undefined): Mood | null {
  if (!entry || (entry.mood === null && entry.energy === null)) return null;
  if ((entry.mood !== null && entry.mood <= 2) || (entry.energy !== null && entry.energy <= 2)) return "fatigue";
  if (entry.energy !== null && entry.energy >= 4) return "motive";
  return "calme";
}

/** Questions d'écriture : une par jour, toujours la même pour un jour donné ; chacune se comprend seule. */
export const PROMPTS = [
  tr("Qu'est-ce qui a compté aujourd'hui ?"),
  tr("Quel moment de la journée aimeriez-vous garder en mémoire ?"),
  tr("Qu'avez-vous appris aujourd'hui ?"),
  tr("Qu'est-ce qui vous a fait sourire ?"),
  tr("Qu'est-ce qui vous a demandé du courage aujourd'hui ?"),
  tr("Quelle conversation vous a marqué ?"),
  tr("Qu'auriez-vous aimé faire autrement ?"),
  tr("Qu'est-ce qui vous a donné de l'énergie ?"),
  tr("De quoi êtes-vous fier aujourd'hui ?"),
  tr("Qu'attendez-vous de demain ?"),
  tr("Quel petit plaisir vous êtes-vous offert aujourd'hui ?"),
  tr("Qu'avez-vous remarqué autour de vous ?"),
  tr("Qu'est-ce qui vous préoccupe en ce moment ?"),
  tr("À qui avez-vous pensé aujourd'hui ?"),
  tr("Quelle décision avez-vous prise aujourd'hui ?"),
  tr("Qu'est-ce qui s'est passé mieux que prévu ?"),
  tr("De quoi avez-vous besoin en ce moment ?"),
  tr("Qu'est-ce qui vous a fatigué aujourd'hui ?"),
  tr("Quelle idée vous trotte dans la tête ?"),
  tr("Comment avez-vous pris soin de vous ?"),
  tr("Qu'est-ce qui vous a surpris aujourd'hui ?"),
  tr("Quel objectif a avancé aujourd'hui, même un peu ?"),
  tr("Quel conseil vous donneriez-vous pour demain ?"),
  tr("Qui ou quoi mérite un merci aujourd'hui ?"),
];

export function promptFor(day: DayKey): string {
  const index = Math.floor(fromDayKey(day).getTime() / 86_400_000);
  return PROMPTS[((index % PROMPTS.length) + PROMPTS.length) % PROMPTS.length]!;
}

/** Semaines d'un mois (du lundi au dimanche) ; `null` hors du mois. */
export function monthGrid(year: number, month: number): (DayKey | null)[][] {
  const first = makeDay(year, month, 1)!;
  const offset = (fromDayKey(first).getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  const cells: (DayKey | null)[] = [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DayKey | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Jours d'affilée avec une page, jusqu'à aujourd'hui (ou hier si aujourd'hui n'est pas encore écrit). */
export function writingStreak(days: ReadonlySet<DayKey>, today: DayKey): number {
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

/** Même jour, un an plus tôt (le 28 février pour un 29 février). */
export function oneYearBefore(day: DayKey): DayKey {
  const d = fromDayKey(day);
  return makeDay(d.getFullYear() - 1, d.getMonth() + 1, d.getDate()) ?? makeDay(d.getFullYear() - 1, d.getMonth() + 1, d.getDate() - 1)!;
}

/** Humeur moyenne (arrondie) d'une liste de pages, ou `null`. */
export function averageMood(pages: readonly Pick<JournalSummary, "mood">[]): number | null {
  const moods = pages.map((p) => p.mood).filter((m): m is number => m !== null);
  if (moods.length === 0) return null;
  return Math.round(moods.reduce((a, b) => a + b, 0) / moods.length);
}

/** « jeudi 1er octobre 2026 ». */
export function longDay(day: DayKey): string {
  const d = fromDayKey(day);
  const text = d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return d.getDate() === 1 && lang() === "fr" ? text.replace(/ 1 /, " 1er ") : text;
}

export const todayKey = () => dayKey(new Date());

/** Page vide d'un jour. */
export const EMPTY_PAGE: JournalPage = { mood: null, energy: null, gratitudes: ["", "", ""], content: "", plain: "", activities: [] };

/** Même jour, `years` ans plus tôt (le 28 février pour un 29 février). */
export function yearsBefore(day: DayKey, years: number): DayKey {
  const d = fromDayKey(day);
  return makeDay(d.getFullYear() - years, d.getMonth() + 1, d.getDate()) ?? makeDay(d.getFullYear() - years, d.getMonth() + 1, d.getDate() - 1)!;
}

/** « Ce jour-là » : pages du même jour les années précédentes, de la plus récente à la plus ancienne. */
export function onThisDay(pages: ReadonlyMap<DayKey, JournalSummary>, day: DayKey, maxYears = 30): { years: number; page: JournalSummary }[] {
  const found: { years: number; page: JournalSummary }[] = [];
  for (let n = 1; n <= maxYears; n++) {
    const page = pages.get(yearsBefore(day, n));
    if (page) found.push({ years: n, page });
  }
  return found;
}

/** Humeur de chaque jour de la période (`null` : non notée), du plus ancien au plus récent. */
export function moodTrend(pages: ReadonlyMap<DayKey, JournalSummary>, today: DayKey, days: number): { day: DayKey; mood: number | null }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    return { day, mood: pages.get(day)?.mood ?? null };
  });
}

/** Nombre de jours pour chaque humeur (index 0 : « Difficile » … 4 : « Très bien »). */
export function moodCounts(pages: readonly Pick<JournalSummary, "mood">[]): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const p of pages) if (p.mood !== null && p.mood >= 1 && p.mood <= 5) counts[p.mood - 1]! += 1;
  return counts;
}

export interface ActivityEffect {
  activity: Activity;
  /** Jours notés avec cette activité. */
  days: number;
  /** Humeur moyenne ces jours-là. */
  mood: number;
  /** Écart avec l'humeur moyenne de la période (positif : jours meilleurs). */
  delta: number;
}

/**
 * Humeur selon les activités : pour chaque activité présente au moins `minDays` jours notés,
 * l'humeur moyenne ces jours-là comparée à la moyenne de la période. Plus grand écart en tête.
 */
export function activityEffects(pages: readonly Pick<JournalSummary, "mood" | "activities">[], minDays = 3): ActivityEffect[] {
  const rated = pages.filter((p) => p.mood !== null);
  if (rated.length === 0) return [];
  const overall = rated.reduce((a, p) => a + p.mood!, 0) / rated.length;
  const effects: ActivityEffect[] = [];
  for (const activity of ACTIVITIES) {
    const withIt = rated.filter((p) => p.activities.includes(activity.id));
    if (withIt.length < minDays) continue;
    const mood = withIt.reduce((a, p) => a + p.mood!, 0) / withIt.length;
    effects.push({ activity, days: withIt.length, mood, delta: mood - overall });
  }
  return effects.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.days - a.days);
}

/** Écart d'humeur affiché : « +0,6 », « −0,4 », « 0 ». */
export function deltaLabel(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

interface DocNode {
  type?: string;
  text?: string;
  content?: DocNode[];
}

/** Texte brut d'un document de l'éditeur (recherche), blocs séparés par un retour à la ligne. */
export function plainText(content: string): string {
  if (!content) return "";
  let doc: DocNode;
  try {
    doc = JSON.parse(content) as DocNode;
  } catch {
    return "";
  }
  const inline = (n: DocNode) => n.type === "text" || n.type === "hardBreak";
  const walk = (n: DocNode): string => {
    if (n.type === "text") return n.text ?? "";
    if (n.type === "hardBreak") return "\n";
    const children = n.content ?? [];
    return children.map(walk).join(children.every(inline) ? "" : "\n");
  };
  return walk(doc);
}
