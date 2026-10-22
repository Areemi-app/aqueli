/**
 * Options d'affichage d'une liste de tâches (menu « Affichage ») : tri, regroupement, priorité
 * minimale et tâches terminées, gardés pour chaque liste. Comme les « options d'affichage » de
 * Todoist ou de TickTick. Fonctions pures.
 */
import { readPref, writePref } from "../lib/storage";
import type { Priority } from "./quickAdd";
import { dayTitle, PRIORITY_LABELS, sectionsFor, sortTasks, type SmartListId, type Task, type TaskInput, type TaskSection } from "./tasks";
import { addDays, type DayKey } from "./day";
import { tr } from "../i18n/i18n";

export type TaskSort = "auto" | "echeance" | "priorite" | "titre" | "creation";
export type TaskGroup = "auto" | "aucun" | "echeance" | "priorite" | "espace" | "projet" | "etiquette";

export interface ListDisplay {
  sort: TaskSort;
  group: TaskGroup;
  /** Priorité minimale affichée (0 : toutes). */
  minPriority: 0 | 2 | 3;
  /** Tâches terminées (des 30 derniers jours) montrées sous les autres. */
  showDone: boolean;
}

export const DEFAULT_DISPLAY: ListDisplay = { sort: "auto", group: "auto", minPriority: 0, showDone: false };

export const SORTS: readonly { value: TaskSort; label: string }[] = [
  { value: "auto", label: tr("Automatique") },
  { value: "echeance", label: tr("Échéance") },
  { value: "priorite", label: tr("Priorité") },
  { value: "titre", label: tr("Titre") },
  { value: "creation", label: tr("Date de création") },
];

export const GROUPS: readonly { value: TaskGroup; label: string }[] = [
  { value: "auto", label: tr("Automatique") },
  { value: "aucun", label: tr("Aucun") },
  { value: "echeance", label: tr("Échéance") },
  { value: "priorite", label: tr("Priorité") },
  { value: "espace", label: tr("Espace") },
  { value: "projet", label: tr("Projet") },
  { value: "etiquette", label: tr("Étiquette") },
];

export const PRIORITY_FILTERS: readonly { value: ListDisplay["minPriority"]; label: string }[] = [
  { value: 0, label: tr("Toutes") },
  { value: 2, label: tr("Moyenne ou haute") },
  { value: 3, label: tr("Haute") },
];

export const isDefaultDisplay = (d: ListDisplay) =>
  d.sort === "auto" && d.group === "auto" && d.minPriority === 0 && !d.showDone;

const KEY = "affichageTaches";

function parse(value: unknown): ListDisplay {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return {
    sort: SORTS.some((s) => s.value === v.sort) ? (v.sort as TaskSort) : "auto",
    group: GROUPS.some((g) => g.value === v.group) ? (v.group as TaskGroup) : "auto",
    minPriority: v.minPriority === 2 || v.minPriority === 3 ? v.minPriority : 0,
    showDone: v.showDone === true,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Affichage gardé pour une liste (« aujourdhui », « tag:maison », « filtre:… »). */
export function readDisplay(list: SmartListId): ListDisplay {
  return parse(readPref<Record<string, unknown>>(KEY, {}, isRecord)[list]);
}

export function writeDisplay(list: SmartListId, display: ListDisplay): void {
  const all = readPref<Record<string, unknown>>(KEY, {}, isRecord);
  if (isDefaultDisplay(display)) delete all[list];
  else all[list] = display;
  writePref(KEY, all);
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Tâches à faire d'abord, triées ; puis les terminées, les plus récentes d'abord. */
export function sortBy(tasks: readonly Task[], sort: TaskSort): Task[] {
  if (sort === "auto" || sort === "echeance") return sortTasks(tasks);
  const open = tasks.filter((t) => t.doneAt === null);
  const done = sortTasks(tasks.filter((t) => t.doneAt !== null));
  const compare: Record<Exclude<TaskSort, "auto" | "echeance">, (a: Task, b: Task) => number> = {
    priorite: (a, b) => b.priority - a.priority,
    titre: (a, b) => collator.compare(a.title, b.title),
    creation: (a, b) => b.createdAt - a.createdAt,
  };
  // À égalité, l'ordre automatique (échéance, heure…) départage.
  const base = sortTasks(open);
  return [...base.sort((a, b) => compare[sort](a, b) || base.indexOf(a) - base.indexOf(b)), ...done];
}

interface Names {
  space: (id: string) => string | null;
  project: (id: string) => string | null;
}

/** Une section par valeur, dans l'ordre donné ; les tâches sans valeur à la fin (« Sans projet »). */
function groupBy(tasks: readonly Task[], keyOf: (t: Task) => string | null, titleOf: (key: string) => string, order: (a: string, b: string) => number, none: string): TaskSection[] {
  const groups = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const key = keyOf(t);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const keys = [...groups.keys()].filter((k): k is string => k !== null).sort(order);
  const sections = keys.map((k) => ({ key: k, title: titleOf(k), tasks: groups.get(k)! }));
  if (groups.has(null)) sections.push({ key: "sans", title: none, tasks: groups.get(null)! });
  return sections;
}

/** Sections d'une liste selon son affichage (tri, regroupement, priorité, terminées). */
export function displaySections(list: SmartListId, tasks: readonly Task[], today: DayKey, display: ListDisplay, names: Names): TaskSection[] {
  const shown = tasks.filter((t) => t.priority >= display.minPriority);
  if (shown.length === 0) return [];
  let sections: TaskSection[];
  switch (display.group) {
    case "auto":
      sections = sectionsFor(list, shown, today);
      break;
    case "aucun":
      sections = [{ key: "tout", title: "", tasks: [...shown] }];
      break;
    case "echeance":
      sections = groupBy(shown, (t) => t.dueDate, (d) => {
        const { title, subtitle } = dayTitle(d, today);
        return d < today ? tr("En retard · {title}", { title }) : subtitle && title !== subtitle ? `${title} · ${subtitle}` : title;
      }, (a, b) => (a < b ? -1 : 1), tr("Sans date"));
      break;
    case "priorite":
      sections = groupBy(shown, (t) => (t.priority > 0 ? String(t.priority) : null), (p) => tr("Priorité {priority}", { priority: PRIORITY_LABELS[Number(p) as Priority].toLowerCase() }), (a, b) => Number(b) - Number(a), tr("Sans priorité"));
      break;
    case "espace":
      sections = groupBy(shown, (t) => t.spaceId, (id) => names.space(id) ?? tr("Espace supprimé"), (a, b) => collator.compare(names.space(a) ?? "", names.space(b) ?? ""), tr("Sans espace"));
      break;
    case "projet":
      sections = groupBy(shown, (t) => t.projectId, (id) => names.project(id) ?? tr("Projet supprimé"), (a, b) => collator.compare(names.project(a) ?? "", names.project(b) ?? ""), tr("Sans projet"));
      break;
    case "etiquette":
      sections = groupBy(shown, (t) => [...t.tags].sort(collator.compare)[0] ?? null, (tag) => `#${tag}`, collator.compare, tr("Sans étiquette"));
      break;
  }
  return sections.map((s) => ({ ...s, tasks: sortBy(s.tasks, display.sort) }));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Glisser une tâche sur une section de la liste : ce qui change pour qu'elle y figure (date
 * d'une journée, priorité, espace, projet), ou `null` si la section ne se rejoint pas ainsi
 * (« En retard », une étiquette…).
 */
export function sectionChanges(list: SmartListId, group: TaskGroup, key: string): Partial<TaskInput> | null {
  const none = key === "sans";
  switch (group) {
    case "auto":
      return (list === "aujourdhui" || list === "a-venir") && DAY.test(key) ? { dueDate: key } : null;
    case "echeance":
      return none ? { dueDate: null, dueTime: null } : DAY.test(key) ? { dueDate: key } : null;
    case "priorite":
      return { priority: none ? 0 : (Number(key) as Priority) };
    case "espace":
      return { spaceId: none ? null : key };
    case "projet":
      return { projectId: none ? null : key };
    default:
      return null;
  }
}

/** Glisser une tâche sur une liste de la colonne de gauche : ce qui change (« terminer » à part). */
export function listChanges(task: Task, list: SmartListId, today: DayKey): Partial<TaskInput> | "terminer" | null {
  const waitingFor = task.startDate !== null && task.startDate > today ? { startDate: null } : {};
  if (list === "aujourdhui") return { dueDate: today, ...waitingFor };
  if (list === "a-venir") return { dueDate: addDays(today, 1) };
  if (list === "sans-date") return { dueDate: null, dueTime: null };
  if (list === "boite") return { inbox: true };
  if (list === "terminees") return "terminer";
  if (list.startsWith("tag:")) {
    const tag = list.slice(4);
    return task.tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? {} : { tags: [...task.tags, tag] };
  }
  return null;
}

/** La tâche changerait-elle ? (sinon, la cible ne s'éclaire pas). */
export function changesTask(task: Task, changes: Partial<TaskInput> | "terminer" | null): boolean {
  if (changes === null) return false;
  if (changes === "terminer") return task.doneAt === null;
  return Object.entries(changes).some(([k, v]) => JSON.stringify(task[k as keyof Task]) !== JSON.stringify(v));
}
