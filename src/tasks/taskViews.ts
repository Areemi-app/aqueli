/**
 * Vues Kanban, Matrice et Chronologie de l'écran Tâches (cahier des charges § 4.2) : colonnes
 * selon l'avancement, la priorité ou l'espace ; quadrants « urgent / important » ; frise des
 * échéances. Fonctions pures.
 */
import type { Space } from "../spaces/spaces";
import { addDays, daysBetween, weekday, type DayKey } from "./day";
import type { Priority } from "./quickAdd";
import { PRIORITY_LABELS, sortTasks, type Task, type TaskInput } from "./tasks";
import { locale, tr } from "../i18n/i18n";

// ——— Kanban ———

export type KanbanGrouping = "avancement" | "priorite" | "espace";

export const KANBAN_GROUPINGS: readonly { id: KanbanGrouping; label: string }[] = [
  { id: "avancement", label: tr("Avancement") },
  { id: "priorite", label: tr("Priorité") },
  { id: "espace", label: tr("Espace") },
];

export const isKanbanGrouping = (v: unknown): v is KanbanGrouping => KANBAN_GROUPINGS.some((g) => g.id === v);

export interface KanbanColumn {
  id: string;
  label: string;
  tasks: Task[];
  /** Couleur de la colonne (espace) ; nulle : celle du thème. */
  color: string | null;
}

/** Tâches terminées montrées dans la colonne « Terminé » : les 7 derniers jours. */
const DONE_DAYS = 7;

export function kanbanColumns(tasks: readonly Task[], grouping: KanbanGrouping, spaces: readonly Pick<Space, "id" | "name" | "color">[], now: number): KanbanColumn[] {
  const recent = (t: Task) => t.doneAt === null || now - t.doneAt <= DONE_DAYS * 86_400;
  const open = sortTasks(tasks.filter((t) => t.doneAt === null));
  if (grouping === "avancement") {
    return [
      { id: "a-faire", label: tr("À faire"), tasks: open.filter((t) => !t.doing), color: null },
      { id: "en-cours", label: tr("En cours"), tasks: open.filter((t) => t.doing), color: null },
      { id: "termine", label: tr("Terminé"), tasks: sortTasks(tasks.filter((t) => t.doneAt !== null && recent(t))), color: null },
    ];
  }
  if (grouping === "priorite") {
    return ([3, 2, 1, 0] as Priority[]).map((p) => ({ id: `p${p}`, label: p === 0 ? tr("Sans priorité") : tr("Priorité {x}", { x: PRIORITY_LABELS[p].toLowerCase() }), tasks: open.filter((t) => t.priority === p), color: null }));
  }
  const columns = spaces.map((s) => ({ id: `e:${s.id}`, label: s.name, tasks: open.filter((t) => t.spaceId === s.id), color: s.color }));
  const loose = open.filter((t) => t.spaceId === null || !spaces.some((s) => s.id === t.spaceId));
  return loose.length > 0 ? [...columns, { id: "e:", label: tr("Sans espace"), tasks: loose, color: null }] : columns;
}

/** Ce qui change quand une tâche est posée dans une colonne ; `null` : rien à changer. */
export type KanbanMove = { done: boolean; changes?: Partial<TaskInput> } | { changes: Partial<TaskInput> } | null;

export function kanbanMove(task: Task, columnId: string): KanbanMove {
  if (columnId === "termine") return task.doneAt === null ? { done: true } : null;
  if (columnId === "a-faire" || columnId === "en-cours") {
    const doing = columnId === "en-cours";
    if (task.doneAt !== null) return { done: false, changes: { doing } };
    return task.doing === doing ? null : { changes: { doing } };
  }
  if (columnId.startsWith("p")) {
    const priority = Number(columnId.slice(1)) as Priority;
    return task.priority === priority ? null : { changes: { priority } };
  }
  if (columnId.startsWith("e:")) {
    const spaceId = columnId.slice(2) || null;
    return task.spaceId === spaceId ? null : { changes: { spaceId } };
  }
  return null;
}

// ——— Matrice d'Eisenhower ———

export type Quadrant = "maintenant" | "planifier" | "expedier" | "reconsiderer";

export const QUADRANTS: readonly { id: Quadrant; label: string; hint: string; urgent: boolean; important: boolean }[] = [
  { id: "maintenant", label: tr("À faire maintenant"), hint: tr("Urgent et important"), urgent: true, important: true },
  { id: "planifier", label: tr("À planifier"), hint: tr("Important, pas urgent"), urgent: false, important: true },
  { id: "expedier", label: tr("À expédier"), hint: tr("Urgent, peu important"), urgent: true, important: false },
  { id: "reconsiderer", label: tr("À reconsidérer"), hint: tr("Ni urgent ni important"), urgent: false, important: false },
];

/** Urgente : échéance passée ou dans les deux jours. Importante : priorité moyenne ou haute. */
export const isUrgent = (t: Pick<Task, "dueDate">, today: DayKey) => t.dueDate !== null && t.dueDate <= addDays(today, 2);
export const isImportant = (t: Pick<Task, "priority">) => t.priority >= 2;

export function quadrantOf(t: Pick<Task, "dueDate" | "priority">, today: DayKey): Quadrant {
  return QUADRANTS.find((q) => q.urgent === isUrgent(t, today) && q.important === isImportant(t))!.id;
}

/**
 * Changements pour poser une tâche dans un quadrant : la priorité suit l'importance (moyenne au
 * moins, ou basse), l'échéance l'urgence (aujourd'hui, ou dans une semaine).
 */
export function quadrantMove(t: Task, target: Quadrant, today: DayKey): Partial<TaskInput> | null {
  const q = QUADRANTS.find((x) => x.id === target)!;
  const changes: Partial<TaskInput> = {};
  if (q.important && !isImportant(t)) changes.priority = 2;
  if (!q.important && isImportant(t)) changes.priority = 1;
  if (q.urgent && !isUrgent(t, today)) changes.dueDate = today;
  if (!q.urgent && isUrgent(t, today)) changes.dueDate = addDays(today, 7);
  return Object.keys(changes).length > 0 ? changes : null;
}

// ——— Chronologie ———

export interface TimelineGroup {
  key: string;
  label: string;
  /** Jour de la tranche (premier jour d'une semaine plus lointaine). */
  day: DayKey | null;
  tone?: "late" | "today";
  tasks: Task[];
}

const LONG = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });
const SHORT = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lundi de la semaine du jour. */
const mondayOf = (day: DayKey) => addDays(day, -((weekday(day) + 6) % 7));

/**
 * Frise des tâches à faire datées : en retard, puis jour par jour sur deux semaines, puis
 * semaine par semaine. Les tâches sans date n'y figurent pas.
 */
export function timeline(tasks: readonly Task[], today: DayKey): TimelineGroup[] {
  const dated = sortTasks(tasks.filter((t) => t.doneAt === null && t.dueDate !== null)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99"));
  const groups = new Map<string, TimelineGroup>();
  const horizon = addDays(today, 13);
  for (const t of dated) {
    const due = t.dueDate!;
    let g: TimelineGroup;
    if (due < today) g = groups.get("retard") ?? { key: "retard", label: tr("En retard"), day: null, tone: "late", tasks: [] };
    else if (due <= horizon) {
      const n = daysBetween(today, due);
      const label = n === 0 ? tr("Aujourd'hui") : n === 1 ? tr("Demain") : cap(LONG.format(new Date(`${due}T12:00:00`)));
      g = groups.get(due) ?? { key: due, label, day: due, tone: n === 0 ? "today" : undefined, tasks: [] };
    } else {
      const monday = mondayOf(due);
      g = groups.get(`s:${monday}`) ?? { key: `s:${monday}`, label: tr("Semaine du {date}", { date: SHORT.format(new Date(`${monday}T12:00:00`)) }), day: monday, tasks: [] };
    }
    g.tasks.push(t);
    groups.set(g.key, g);
  }
  return [...groups.values()];
}
