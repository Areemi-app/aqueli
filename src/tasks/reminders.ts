/**
 * Rappels des tâches : heure du rappel (en minutes avant l'échéance, 9 h pour une tâche sans
 * heure), libellés, et liste des rappels à programmer dans le cœur, qui affiche les
 * notifications Windows.
 */
import { fromDayKey, relativeDay, type DayKey } from "./day";
import type { Task } from "./tasks";
import { tr, trn } from "../i18n/i18n";

/** Heure retenue pour une tâche datée sans heure précise. */
export const DEFAULT_REMINDER_TIME = "09:00";

/** Les rappels des 35 prochains jours sont confiés au cœur (les suivants plus tard). */
const HORIZON_MS = 35 * 24 * 3600 * 1000;

export function reminderChoices(timed: boolean): number[] {
  return timed ? [0, 5, 15, 30, 60, 120, 1440] : [0, 1440];
}

function duration(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return trn(days, "{n} jour", "{n} jours");
  }
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function reminderLabel(minutes: number, timed: boolean): string {
  if (!timed) {
    if (minutes === 0) return tr("Le jour même à 9 h");
    if (minutes === 1440) return tr("La veille à 9 h");
    return tr("{duration} avant, à 9 h", { duration: duration(minutes) });
  }
  if (minutes === 0) return tr("À l'échéance");
  if (minutes === 1440) return tr("La veille");
  return tr("{duration} avant", { duration: duration(minutes) });
}

/** Instant du rappel, en heure locale (le calcul suit l'horloge murale : « la veille » reste à 9 h). */
export function reminderAt(task: Task): Date | null {
  if (task.reminder === null || task.dueDate === null) return null;
  const [h = 9, m = 0] = (task.dueTime ?? DEFAULT_REMINDER_TIME).split(":").map(Number);
  const at = fromDayKey(task.dueDate);
  at.setHours(h, m - task.reminder, 0, 0);
  return at;
}

/**
 * Rappel d'une tâche qui reçoit une heure : le rappel par défaut (Paramètres › Rappels) si
 * elle n'en avait pas et n'avait pas d'heure ; sinon, son rappel actuel.
 */
export function defaultReminderFor(
  before: Pick<Task, "dueTime" | "reminder">,
  dueTime: string | null,
  fallback: number | null,
): number | null {
  if (before.reminder !== null || before.dueTime !== null || dueTime === null) return before.reminder;
  return fallback;
}

export interface ScheduledReminder {
  /** Secondes Unix. */
  at: number;
  taskId: string;
  title: string;
  /** Échéance lisible : « Aujourd'hui · 14:00 ». */
  when: string;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Rappels des tâches à faire, de maintenant (à une minute près) aux 35 prochains jours. */
export function scheduleFor(tasks: readonly Task[], now: Date, today: DayKey): ScheduledReminder[] {
  const from = now.getTime() - 60_000;
  const until = now.getTime() + HORIZON_MS;
  const list: ScheduledReminder[] = [];
  for (const t of tasks) {
    const at = t.doneAt === null ? reminderAt(t) : null;
    if (!at || at.getTime() < from || at.getTime() > until || t.dueDate === null) continue;
    list.push({
      at: Math.floor(at.getTime() / 1000),
      taskId: t.id,
      title: t.title,
      when: capitalize(relativeDay(t.dueDate, today)) + (t.dueTime ? ` · ${t.dueTime}` : ""),
    });
  }
  return list.sort((a, b) => a.at - b.at);
}

/** Tâches à faire dont le rappel tombait entre `from` et `to` (secondes Unix). */
export function missedBetween(tasks: readonly Task[], from: number, to: number): Task[] {
  return tasks.filter((t) => {
    const at = t.doneAt === null ? reminderAt(t) : null;
    if (!at) return false;
    const s = Math.floor(at.getTime() / 1000);
    return s > from && s <= to;
  });
}
