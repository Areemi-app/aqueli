/**
 * Objectifs (cahier des charges § 4.8) côté interface : horizons et périodes, sortes de
 * progression, calcul de l'avancement à partir des saisies, des tâches liées, d'une habitude ou
 * des étapes. Fonctions pures ; les données sont vérifiées par le cœur (src-tauri/src/data/goals.rs).
 */
import { addDays, dayKey, daysBetween, makeDay, type DayKey } from "../tasks/day";
import { locale, tr, trn } from "../i18n/i18n";

export type Horizon = "annee" | "trimestre" | "mois" | "libre";
export type Metric = "manuel" | "taches" | "habitude" | "etapes";
export type GoalStatus = "en-cours" | "atteint" | "abandonne";

export interface Goal {
  id: string;
  title: string;
  why: string;
  horizon: Horizon;
  startDate: DayKey;
  targetDate: DayKey | null;
  metric: Metric;
  /** Valeur à atteindre (20 livres) ; nulle si l'objectif n'est pas chiffré. */
  target: number | null;
  unit: string;
  habitId: string | null;
  status: GoalStatus;
  color: string | null;
  icon: string;
  spaceId: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export type GoalInput = Omit<Goal, "id" | "position" | "createdAt" | "updatedAt">;

export interface GoalStep {
  id: string;
  goalId: string;
  title: string;
  dueDate: DayKey | null;
  doneAt: number | null;
  position: number;
}

export interface GoalEntry {
  id: string;
  goalId: string;
  day: DayKey;
  value: number;
  note: string;
  createdAt: number;
}

export function toGoalInput(g: Goal): GoalInput {
  const { id: _i, position: _p, createdAt: _c, updatedAt: _u, ...input } = g;
  return input;
}

export const HORIZONS: readonly { id: Horizon; label: string }[] = [
  { id: "annee", label: tr("Année") },
  { id: "trimestre", label: tr("Trimestre") },
  { id: "mois", label: tr("Mois") },
  { id: "libre", label: tr("Sans horizon") },
];

export const METRICS: readonly { id: Metric; label: string; description: string }[] = [
  { id: "manuel", label: tr("Valeur chiffrée"), description: tr("Ajouter des saisies (3 livres lus, 12 km courus).") },
  { id: "taches", label: tr("Tâches liées"), description: tr("Avance à chaque tâche liée terminée.") },
  { id: "habitude", label: tr("Habitude"), description: tr("Compte les jours où l'habitude est tenue.") },
  { id: "etapes", label: tr("Étapes"), description: tr("Avance à chaque étape franchie.") },
];

export const STATUS_LABELS: Record<GoalStatus, string> = { "en-cours": tr("En cours"), atteint: tr("Atteint"), abandonne: tr("Abandonné") };

/** Période d'un horizon autour d'un jour : l'année, le trimestre ou le mois en cours. */
export function periodOf(horizon: Horizon, day: DayKey): { start: DayKey; end: DayKey | null } {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  if (horizon === "annee") return { start: `${year}-01-01`, end: `${year}-12-31` };
  if (horizon === "trimestre") {
    const first = Math.floor((month - 1) / 3) * 3 + 1;
    return { start: makeDay(year, first, 1)!, end: makeDay(year, first + 2, new Date(year, first + 2, 0).getDate())! };
  }
  if (horizon === "mois") return { start: makeDay(year, month, 1)!, end: makeDay(year, month, new Date(year, month, 0).getDate())! };
  return { start: day, end: null };
}

/** « Année 2026 », « 4e trimestre 2026 », « Octobre 2026 », « Sans horizon ». */
export function periodLabel(goal: Pick<Goal, "horizon" | "startDate">): string {
  const year = goal.startDate.slice(0, 4);
  const month = Number(goal.startDate.slice(5, 7));
  if (goal.horizon === "annee") return tr("Année {year}", { year });
  if (goal.horizon === "trimestre") {
    const q = Math.floor((month - 1) / 3) + 1;
    return q === 1 ? tr("1er trimestre {year}", { year }) : tr("{q}e trimestre {year}", { q, year });
  }
  if (goal.horizon === "mois") {
    const text = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }).format(new Date(`${goal.startDate}T12:00:00`));
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return tr("Sans horizon");
}

export interface ProgressInput {
  steps: readonly GoalStep[];
  entries: readonly GoalEntry[];
  /** Tâches liées à l'objectif : terminées ou non. */
  tasks: readonly { done: boolean }[];
  /** L'habitude est-elle tenue ce jour-là ? */
  habitDone?: (day: DayKey) => boolean;
  today: DayKey;
}

export interface Progress {
  value: number;
  /** Ce qu'il faut atteindre (nombre de tâches, d'étapes, ou la cible chiffrée). */
  total: number;
  /** 0 à 1 (plafonné). */
  ratio: number;
  /** « 7 / 20 livres », « 3 tâches sur 5 ». */
  label: string;
}

const NUMBER = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });

/** Avancement de l'objectif, selon sa sorte de progression. */
export function progressOf(goal: Pick<Goal, "metric" | "target" | "unit" | "startDate" | "targetDate" | "status">, p: ProgressInput): Progress {
  const make = (value: number, total: number, label: string): Progress => ({ value, total, ratio: total > 0 ? Math.min(1, Math.max(0, value / total)) : 0, label });
  switch (goal.metric) {
    case "manuel": {
      const total = goal.target ?? 0;
      const value = p.entries.reduce((s, e) => s + e.value, 0);
      return make(value, total, `${NUMBER.format(value)} / ${NUMBER.format(total)}${goal.unit ? ` ${goal.unit}` : ""}`);
    }
    case "taches": {
      const done = p.tasks.filter((t) => t.done).length;
      return make(done, p.tasks.length, p.tasks.length === 0 ? tr("Aucune tâche liée") : trn(done, "{n} tâche sur {total}", "{n} tâches sur {total}", { total: p.tasks.length }));
    }
    case "etapes": {
      const done = p.steps.filter((s) => s.doneAt !== null).length;
      return make(done, p.steps.length, p.steps.length === 0 ? tr("Aucune étape") : trn(done, "{n} étape sur {total}", "{n} étapes sur {total}", { total: p.steps.length }));
    }
    case "habitude": {
      const total = goal.target ?? 0;
      const end = goal.targetDate && goal.targetDate < p.today ? goal.targetDate : p.today;
      let value = 0;
      if (p.habitDone) for (let day = goal.startDate; day <= end && value < 10_000; day = addDays(day, 1)) if (p.habitDone(day)) value += 1;
      return make(value, total, `${value} / ${NUMBER.format(total)} ${goal.unit || "jours"}`);
    }
  }
}

/** Avance attendue à ce jour (part du temps écoulé), pour dire si l'objectif est en avance ou en retard. */
export function expectedRatio(goal: Pick<Goal, "startDate" | "targetDate">, today: DayKey): number | null {
  if (!goal.targetDate) return null;
  const span = daysBetween(goal.startDate, goal.targetDate);
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, daysBetween(goal.startDate, today) / span));
}

/** « En avance », « Dans les temps », « En retard » (écart de plus de 10 %). */
export function paceOf(progress: Progress, expected: number | null): "avance" | "temps" | "retard" | null {
  if (expected === null || progress.total === 0) return null;
  if (progress.ratio >= expected + 0.1) return "avance";
  if (progress.ratio <= expected - 0.1) return "retard";
  return "temps";
}

/**
 * Dates de la période suivante, pour reconduire un objectif : l'année, le trimestre ou le mois
 * d'après ; sans horizon, une durée égale qui commence le lendemain de l'échéance.
 */
export function nextPeriod(goal: Pick<Goal, "horizon" | "startDate" | "targetDate">): { start: DayKey; end: DayKey | null } {
  const end = goal.targetDate ?? periodOf(goal.horizon, goal.startDate).end;
  if (goal.horizon !== "libre") return periodOf(goal.horizon, addDays(end ?? goal.startDate, 1));
  if (!goal.targetDate) return { start: goal.startDate, end: null };
  const start = addDays(goal.targetDate, 1);
  return { start, end: addDays(start, daysBetween(goal.startDate, goal.targetDate)) };
}

/** Ce qui reste, le rythme pour tenir l'échéance et la date estimée au rythme actuel. */
export interface Outlook {
  remaining: number;
  /** À faire par semaine d'ici l'échéance (nul sans échéance à venir). */
  perWeek: number | null;
  /** Date estimée au rythme suivi depuis le début (nulle si rien n'est encore fait). */
  eta: DayKey | null;
}

export function outlookOf(goal: Pick<Goal, "startDate" | "targetDate">, progress: Pick<Progress, "value" | "total">, today: DayKey): Outlook | null {
  if (progress.total <= 0 || progress.value >= progress.total || today < goal.startDate) return null;
  const remaining = progress.total - progress.value;
  const left = goal.targetDate ? daysBetween(today, goal.targetDate) : null;
  const perWeek = left !== null && left > 0 ? (remaining / left) * 7 : null;
  const rate = progress.value / Math.max(1, daysBetween(goal.startDate, today) + 1);
  const eta = rate > 0 ? addDays(today, Math.ceil(remaining / rate)) : null;
  return { remaining, perWeek, eta };
}

/**
 * Avancement cumulé jour après jour (saisies, étapes cochées, jours où l'habitude est tenue),
 * du début à aujourd'hui ; nul pour les tâches liées (leurs dates ne sont pas toutes connues).
 */
export function progressSeries(goal: Pick<Goal, "metric" | "startDate" | "targetDate">, p: ProgressInput): { day: DayKey; value: number }[] | null {
  const byDay = new Map<DayKey, number>();
  const add = (day: DayKey, n: number) => byDay.set(day, (byDay.get(day) ?? 0) + n);
  if (goal.metric === "manuel") {
    for (const e of p.entries) add(e.day, e.value);
  } else if (goal.metric === "etapes") {
    for (const s of p.steps) if (s.doneAt !== null) add(dayKey(new Date(s.doneAt * 1000)), 1);
  } else if (goal.metric === "habitude") {
    const end = goal.targetDate && goal.targetDate < p.today ? goal.targetDate : p.today;
    if (p.habitDone) for (let day = goal.startDate; day <= end && byDay.size < 10_000; day = addDays(day, 1)) if (p.habitDone(day)) add(day, 1);
  } else return null;
  let total = 0;
  const points = [{ day: goal.startDate, value: 0 }];
  for (const day of [...byDay.keys()].sort()) {
    total += byDay.get(day)!;
    points.push({ day: day < goal.startDate ? goal.startDate : day, value: total });
  }
  return points;
}

/** Jours restants avant l'échéance (négatif : dépassée), ou nul sans échéance. */
export function daysLeft(goal: Pick<Goal, "targetDate">, today: DayKey): number | null {
  return goal.targetDate ? daysBetween(today, goal.targetDate) : null;
}
