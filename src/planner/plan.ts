/**
 * « Planifier ma journée » : tâches à placer, agenda du jour, chevauchements et créneaux
 * libres. Fonctions pures ; les heures sont en minutes depuis minuit.
 */
import { withLanes, type Laned } from "../lib/lanes";
import type { DayKey } from "../tasks/day";
import { sortTasks, type Task } from "../tasks/tasks";

/** Pas de l'agenda : le quart d'heure. */
export const STEP = 15;
/** Durée donnée à une tâche sans durée estimée. */
export const DEFAULT_DURATION = 30;
export const DAY = 24 * 60;
/** Journée habituelle, de 7 h à 22 h : le reste de l'agenda est grisé. */
export const DAY_START = 7 * 60;
export const DAY_END = 22 * 60;

export function toMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/** « 14:30 », dans la journée (au plus 23:45). */
export function toTime(minutes: number): string {
  const m = Math.min(Math.max(Math.round(minutes), 0), DAY - STEP);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function snap(minutes: number, step = STEP): number {
  return Math.round(minutes / step) * step;
}

export function durationOf(task: Pick<Task, "estimate">): number {
  return Math.min(Math.max(task.estimate ?? DEFAULT_DURATION, STEP), DAY);
}

/** « 45 min », « 2 h », « 2 h 30 ». */
export { durationLabel as formatDuration } from "../lib/duration";

export interface Candidates {
  /** Tâches en retard, avec ou sans heure. */
  late: Task[];
  /** Tâches du jour sans heure. */
  today: Task[];
}

export function candidates(tasks: readonly Task[], today: DayKey): Candidates {
  const open = sortTasks(tasks.filter((t) => t.doneAt === null && t.dueDate !== null));
  return {
    late: open.filter((t) => t.dueDate !== null && t.dueDate < today),
    today: open.filter((t) => t.dueDate === today && t.dueTime === null),
  };
}

export interface Block extends Laned {
  task: Task;
  start: number;
  end: number;
}

/** Tâches du jour qui ont une heure, rangées en colonnes quand elles se chevauchent. */
export function blocksFor(tasks: readonly Task[], today: DayKey): Block[] {
  return withLanes(
    tasks
      .filter((t) => t.doneAt === null && t.dueDate === today && t.dueTime !== null)
      .map((task) => {
        const start = toMinutes(task.dueTime ?? "00:00");
        return { task, start, end: Math.min(start + durationOf(task), DAY) };
      }),
  );
}

/** Premier créneau libre de `duration` minutes à partir de `from`, sinon `null`. */
export function nextFreeStart(
  blocks: readonly Pick<Block, "start" | "end">[],
  from: number,
  duration: number,
  limit = DAY,
): number | null {
  const ceil = (m: number) => Math.ceil(m / STEP) * STEP;
  let start = ceil(from);
  let moved = true;
  while (moved) {
    moved = false;
    for (const b of blocks) {
      if (b.start < start + duration && b.end > start) {
        start = ceil(b.end);
        moved = true;
      }
    }
  }
  return start + duration <= limit ? start : null;
}

/** Temps occupé dans l'agenda, chevauchements comptés une fois. */
export function plannedMinutes(blocks: readonly Pick<Block, "start" | "end">[]): number {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  let total = 0;
  let from = -1;
  let to = -1;
  for (const b of sorted) {
    if (b.start > to) {
      total += to - from;
      from = b.start;
      to = b.end;
    } else {
      to = Math.max(to, b.end);
    }
  }
  return total + (to - from);
}
