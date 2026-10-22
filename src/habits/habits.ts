/**
 * Habitudes côté interface (src-tauri/src/data/habits.rs) : jours prévus, jours réussis,
 * séries en cours et record, taux de réussite, carte de l'année, libellés. Fonctions pures.
 */
import { addDays, weekday, type DayKey } from "../tasks/day";
import { tr, trn } from "../i18n/i18n";
import { capitalize, weekdayNames, withoutDot } from "../i18n/calendarNames";

export type Frequency = { kind: "quotidien" } | { kind: "jours"; days: number[] } | { kind: "semaine"; times: number };

export type HabitKind = "oui-non" | "quantite";

/** Moment de la journée : la liste du jour se range par moments. */
export type HabitMoment = "matin" | "midi" | "soir";

export const MOMENTS: readonly { value: HabitMoment | null; label: string }[] = [
  { value: "matin", label: tr("Matin") },
  { value: "midi", label: tr("Midi") },
  { value: "soir", label: tr("Soir") },
  { value: null, label: tr("Dans la journée") },
];

export interface Habit {
  id: string;
  name: string;
  /** Symbole (src/components/symbols.ts). */
  icon: string;
  color: string | null;
  kind: HabitKind;
  /** Habitude à arrêter : un jour coché est un jour tenu. */
  negative: boolean;
  /** Quantité visée (1 pour oui/non). */
  target: number;
  unit: string;
  frequency: Frequency;
  /** Heure du rappel (« HH:MM »). */
  reminder: string | null;
  /** Matin, midi ou soir ; aucun : dans la journée. */
  moment: HabitMoment | null;
  spaceId: string | null;
  position: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export type HabitInput = Pick<Habit, "name" | "icon" | "color" | "kind" | "negative" | "target" | "unit" | "frequency" | "reminder" | "spaceId"> &
  Partial<Pick<Habit, "moment">>;

export interface HabitCheck {
  habitId: string;
  day: DayKey;
  value: number;
  /** Jour de pause (vacances, maladie) : ni réussi ni manqué. */
  skipped?: boolean;
}

/** Valeur gardée dans l'index pour un jour de pause. */
const PAUSE = -1;

/** Valeur cochée de chaque jour, par habitude. */
export type CheckIndex = ReadonlyMap<string, ReadonlyMap<DayKey, number>>;

export function indexChecks(checks: readonly HabitCheck[]): Map<string, Map<DayKey, number>> {
  const index = new Map<string, Map<DayKey, number>>();
  for (const c of checks) {
    let days = index.get(c.habitId);
    if (!days) index.set(c.habitId, (days = new Map()));
    days.set(c.day, c.skipped ? PAUSE : c.value);
  }
  return index;
}

export function toInput(h: Habit): HabitInput {
  const { name, icon, color, kind, negative, target, unit, frequency, reminder, spaceId, moment } = h;
  return { name, icon, color, kind, negative, target, unit, frequency, reminder, spaceId, moment };
}

export const WEEKDAY_SHORT = weekdayNames("short").map((d) => capitalize(withoutDot(d)));
/** Jours dans l'ordre français (lundi d'abord). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** « Chaque jour », « Lun, Mer, Ven », « 3 fois par semaine ». */
export function frequencyLabel(f: Frequency): string {
  if (f.kind === "quotidien") return tr("Chaque jour");
  if (f.kind === "semaine") return trn(f.times, "{n} fois par semaine|une", "{n} fois par semaine");
  const days = WEEK_ORDER.filter((d) => f.days.includes(d));
  if (days.length === 5 && !days.includes(0) && !days.includes(6)) return tr("En semaine");
  if (days.length === 2 && days.includes(0) && days.includes(6)) return tr("Le week-end");
  return days.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

/** « 8 verres », « oui/non ». */
export function targetLabel(h: Pick<Habit, "kind" | "target" | "unit">): string {
  if (h.kind === "oui-non") return "";
  return h.unit ? `${h.target} ${h.unit}` : `${h.target}`;
}

/** Jour prévu pour cette habitude (toujours vrai pour « X fois par semaine »). */
export function isDue(h: Pick<Habit, "frequency">, day: DayKey): boolean {
  return h.frequency.kind !== "jours" || h.frequency.days.includes(weekday(day));
}

export function valueOn(index: CheckIndex, habitId: string, day: DayKey): number {
  return Math.max(0, index.get(habitId)?.get(day) ?? 0);
}

/** Jour de pause : ni réussi ni manqué, la série continue. */
export function isPaused(index: CheckIndex, habitId: string, day: DayKey): boolean {
  return index.get(habitId)?.get(day) === PAUSE;
}

/** Jours de pause dans la semaine du jour. */
function pausedInWeek(h: Pick<Habit, "id">, index: CheckIndex, day: DayKey): number {
  const start = weekStart(day);
  let n = 0;
  for (let i = 0; i < 7; i++) if (isPaused(index, h.id, addDays(start, i))) n += 1;
  return n;
}

/**
 * Semaine d'une habitude « X fois par semaine » : réussie, manquée, ou en pause (assez de jours
 * de pause pour que l'objectif ne puisse pas compter). Chaque jour de pause réduit l'objectif.
 */
function weekState(h: Habit & { frequency: { kind: "semaine"; times: number } }, index: CheckIndex, week: DayKey): "ok" | "manquee" | "pause" {
  const required = h.frequency.times - pausedInWeek(h, index, week);
  if (required <= 0) return "pause";
  return weekCount(h, index, week) >= required ? "ok" : "manquee";
}

const isWeekly = (h: Habit): h is Habit & { frequency: { kind: "semaine"; times: number } } => h.frequency.kind === "semaine";

export function isDoneOn(h: Pick<Habit, "id" | "target">, index: CheckIndex, day: DayKey): boolean {
  return valueOn(index, h.id, day) >= Math.max(1, h.target);
}

/** Lundi de la semaine du jour. */
export function weekStart(day: DayKey): DayKey {
  return addDays(day, -((weekday(day) + 6) % 7));
}

/** Jours réussis dans la semaine du jour. */
export function weekCount(h: Pick<Habit, "id" | "target">, index: CheckIndex, day: DayKey): number {
  const start = weekStart(day);
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDoneOn(h, index, addDays(start, i))) n += 1;
  return n;
}

/** Jour de création de l'habitude (secondes Unix → jour local). */
export function createdDay(h: Pick<Habit, "createdAt">): DayKey {
  const d = new Date(h.createdAt * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Plus ancien jour à considérer : la création, ou le premier jour coché s'il est antérieur. */
function firstDay(h: Habit, index: CheckIndex): DayKey {
  let first = createdDay(h);
  for (const day of index.get(h.id)?.keys() ?? []) if (day < first) first = day;
  return first;
}

export interface Streak {
  count: number;
  /** Jours, ou semaines pour « X fois par semaine ». */
  unit: "jour" | "semaine";
}

/**
 * Série en cours : jours prévus réussis d'affilée (un jour prévu pas encore coché aujourd'hui
 * ne la coupe pas) ; semaines réussies d'affilée pour « X fois par semaine ».
 */
export function currentStreak(h: Habit, index: CheckIndex, today: DayKey): Streak {
  const first = firstDay(h, index);
  if (isWeekly(h)) {
    let week = weekStart(today);
    if (weekState(h, index, week) !== "ok") week = addDays(week, -7);
    let n = 0;
    while (week >= weekStart(first)) {
      const state = weekState(h, index, week);
      if (state === "manquee") break;
      if (state === "ok") n += 1;
      week = addDays(week, -7);
    }
    return { count: n, unit: "semaine" };
  }
  let day = today;
  if (isDue(h, day) && !isDoneOn(h, index, day)) day = addDays(day, -1);
  let n = 0;
  while (day >= first) {
    if (isDue(h, day) && !isPaused(index, h.id, day)) {
      if (!isDoneOn(h, index, day)) break;
      n += 1;
    }
    day = addDays(day, -1);
  }
  return { count: n, unit: "jour" };
}

/** Meilleure série depuis la création. */
export function bestStreak(h: Habit, index: CheckIndex, today: DayKey): Streak {
  const first = firstDay(h, index);
  let best = 0;
  let run = 0;
  if (isWeekly(h)) {
    for (let week = weekStart(first); week <= today; week = addDays(week, 7)) {
      const state = weekState(h, index, week);
      if (state === "ok") best = Math.max(best, (run += 1));
      else if (state === "manquee" && week < weekStart(today)) run = 0;
    }
    return { count: best, unit: "semaine" };
  }
  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (!isDue(h, day) || isPaused(index, h.id, day)) continue;
    if (isDoneOn(h, index, day)) best = Math.max(best, (run += 1));
    else if (day < today) run = 0;
  }
  return { count: best, unit: "jour" };
}

export function streakLabel(s: Streak): string {
  return s.unit === "semaine" ? trn(s.count, "{n} semaine", "{n} semaines") : trn(s.count, "{n} jour", "{n} jours");
}

/**
 * Taux de réussite sur les 30 derniers jours (en %), depuis la création : jours prévus réussis,
 * ou semaines réussies (la semaine en cours seulement si elle l'est déjà).
 */
export function successRate(h: Habit, index: CheckIndex, today: DayKey, days = 30): number {
  const first = firstDay(h, index);
  const from = [addDays(today, -(days - 1)), first].sort().at(-1)!;
  if (isWeekly(h)) {
    let met = 0;
    let total = 0;
    for (let week = weekStart(from); week <= today; week = addDays(week, 7)) {
      const state = weekState(h, index, week);
      const ok = state === "ok";
      if (state === "pause" || (week === weekStart(today) && !ok)) continue;
      total += 1;
      if (ok) met += 1;
    }
    return total === 0 ? 0 : Math.round((100 * met) / total);
  }
  let done = 0;
  let due = 0;
  for (let day = from; day <= today; day = addDays(day, 1)) {
    if (!isDue(h, day) || isPaused(index, h.id, day)) continue;
    const ok = isDoneOn(h, index, day);
    if (day === today && !ok) continue;
    due += 1;
    if (ok) done += 1;
  }
  return due === 0 ? 0 : Math.round((100 * done) / due);
}

export interface HeatCell {
  day: DayKey;
  /** 0 (rien) à 4 (objectif atteint). */
  level: number;
  /** Jour hors de l'historique (avant la création, ou à venir). */
  outside: boolean;
  /** Jour de pause. */
  paused: boolean;
}

/** Carte de l'année : 53 semaines (du lundi au dimanche) se terminant par celle d'aujourd'hui. */
export function heatmap(h: Habit, index: CheckIndex, today: DayKey): HeatCell[][] {
  const first = firstDay(h, index);
  const start = addDays(weekStart(today), -52 * 7);
  const weeks: HeatCell[][] = [];
  for (let w = 0; w < 53; w++) {
    const week: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w * 7 + d);
      const value = valueOn(index, h.id, day);
      const ratio = Math.min(1, value / Math.max(1, h.target));
      week.push({ day, level: value === 0 ? 0 : ratio >= 1 ? 4 : Math.max(1, Math.ceil(ratio * 3)), outside: day > today || day < first, paused: isPaused(index, h.id, day) });
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * Force de l'habitude (de 0 à 100), comme dans Loop : elle monte quand l'habitude est tenue et
 * baisse doucement après un oubli, au lieu de repartir de zéro comme la série. Chaque jour prévu
 * compte (de moitié au bout de sept), une quantité en partie atteinte compte en partie ; les jours
 * de pause ne comptent pas. « X fois par semaine » : semaine par semaine.
 */
export function strength(h: Habit, index: CheckIndex, today: DayKey): number {
  const first = firstDay(h, index);
  let score = 0;
  if (isWeekly(h)) {
    const alpha = 0.25;
    for (let week = weekStart(first); week <= today; week = addDays(week, 7)) {
      const required = h.frequency.times - pausedInWeek(h, index, week);
      if (required <= 0) continue;
      const ratio = Math.min(1, weekCount(h, index, week) / required);
      if (week === weekStart(today) && ratio < 1) continue;
      score = score * (1 - alpha) + alpha * ratio;
    }
    return Math.round(score * 100);
  }
  const alpha = 1 - Math.pow(0.5, 1 / 7);
  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (!isDue(h, day) || isPaused(index, h.id, day)) continue;
    const ratio = Math.min(1, valueOn(index, h.id, day) / Math.max(1, h.target));
    if (day === today && ratio < 1) continue;
    score = score * (1 - alpha) + alpha * ratio;
  }
  return Math.round(score * 100);
}

/** Habitude à proposer aujourd'hui : prévue ce jour, ou objectif de la semaine pas encore atteint. */
export function isForToday(h: Habit, index: CheckIndex, today: DayKey): boolean {
  if (h.archived) return false;
  if (isPaused(index, h.id, today)) return false;
  if (h.frequency.kind === "semaine") return weekCount(h, index, today) < h.frequency.times || isDoneOn(h, index, today);
  return isDue(h, today);
}

/** Les 7 derniers jours, du plus ancien à aujourd'hui. */
export function lastDays(today: DayKey, count = 7): DayKey[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - count + 1));
}

/** Modèles proposés à la création. */
export const HABIT_TEMPLATES: readonly (HabitInput & { label: string })[] = [
  { label: tr("Boire de l'eau"), name: tr("Boire de l'eau"), icon: "sante", color: "#2d9be0", kind: "quantite", negative: false, target: 8, unit: tr("verres"), frequency: { kind: "quotidien" }, reminder: null, spaceId: null },
  { label: tr("Marcher"), name: tr("Marcher 30 minutes"), icon: "sport", color: "#2fae4a", kind: "oui-non", negative: false, target: 1, unit: "", frequency: { kind: "quotidien" }, reminder: null, spaceId: null },
  { label: tr("Lire"), name: tr("Lire"), icon: "livre", color: "#7a5ce6", kind: "quantite", negative: false, target: 20, unit: tr("pages"), frequency: { kind: "quotidien" }, reminder: null, spaceId: null },
  { label: tr("Sport"), name: tr("Sport"), icon: "sport", color: "#e0671f", kind: "oui-non", negative: false, target: 1, unit: "", frequency: { kind: "semaine", times: 3 }, reminder: null, spaceId: null },
  { label: tr("Méditer"), name: tr("Méditer"), icon: "feuille", color: "#16a3a3", kind: "oui-non", negative: false, target: 1, unit: "", frequency: { kind: "quotidien" }, reminder: null, spaceId: null },
  { label: tr("Ne pas fumer"), name: tr("Ne pas fumer"), icon: "coeur", color: "#e0508a", kind: "oui-non", negative: true, target: 1, unit: "", frequency: { kind: "quotidien" }, reminder: null, spaceId: null },
];

/** Tri d'affichage : ordre choisi, archivées à la fin. */
export function sortHabits(list: readonly Habit[]): Habit[] {
  return [...list].sort((a, b) => Number(a.archived) - Number(b.archived) || a.position - b.position);
}
