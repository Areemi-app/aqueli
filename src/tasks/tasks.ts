/**
 * Tâches côté interface : listes intelligentes (maquette Taches.dc.html), tri et sections.
 * Fonctions pures, sans accès à la base.
 */
import { addDays, dayKey, formatShortDay, type DayKey } from "./day";
import type { Priority } from "./quickAdd";
import type { Recurrence } from "./recurrence";
import { tr } from "../i18n/i18n";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** Tâche telle que renvoyée par le cœur (src-tauri/src/data/tasks.rs). */
export interface Task {
  id: string;
  title: string;
  notes: string;
  spaceId: string | null;
  dueDate: DayKey | null;
  dueTime: string | null;
  /** Date de début : la tâche reste à l'écart des listes (sauf « À venir ») jusqu'à ce jour-là. */
  startDate: DayKey | null;
  priority: Priority;
  /** Durée estimée, en minutes. */
  estimate: number | null;
  tags: string[];
  subtasks: Subtask[];
  recurrence: Recurrence | null;
  /** Couleur choisie (« #rrggbb »), sinon celle du thème. */
  color: string | null;
  /** Rappel, en minutes avant l'échéance (0 = à l'échéance ; 9 h sans heure). */
  reminder: number | null;
  inbox: boolean;
  /** Projet de la tâche. */
  projectId: string | null;
  /** Commencée : colonne « En cours » du tableau d'un projet. */
  doing: boolean;
  /** Achèvement, en secondes Unix. */
  doneAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Champs modifiables envoyés au cœur (sans projet ni « En cours » : hors projet, à faire). */
export type TaskInput = Pick<
  Task,
  "title" | "notes" | "spaceId" | "dueDate" | "dueTime" | "priority" | "estimate" | "tags" | "subtasks" | "recurrence" | "color" | "reminder" | "inbox"
> &
  Partial<Pick<Task, "projectId" | "doing" | "startDate">>;

export function toInput(task: Task): TaskInput {
  const { title, notes, spaceId, dueDate, dueTime, startDate, priority, estimate, tags, subtasks, recurrence, color, reminder, inbox, projectId, doing } = task;
  return { title, notes, spaceId, dueDate, dueTime, startDate, priority, estimate, tags, subtasks, recurrence, color, reminder, inbox, projectId, doing };
}

/** Listes intelligentes, chacune avec sa couleur (palette des tâches) pour sa pastille. */
export const SMART_LISTS = [
  { id: "boite", label: tr("Boîte de réception"), color: "#0a9fd8" },
  { id: "aujourdhui", label: tr("Aujourd'hui"), color: "#e89a1c" },
  { id: "a-venir", label: tr("À venir"), color: "#7a5ce6" },
  { id: "en-retard", label: tr("En retard"), color: "#e04848" },
  { id: "sans-date", label: tr("Sans date"), color: "#64788c" },
  { id: "terminees", label: tr("Terminées"), color: "#2fae4a" },
] as const;

type SmartListKey = (typeof SMART_LISTS)[number]["id"];
/** Une liste intelligente, les tâches d'une étiquette (« tag:voiture ») ou d'un filtre enregistré (« filtre:<id> »). */
export type SmartListId = SmartListKey | `tag:${string}` | `filtre:${string}`;

export function isSmartListId(value: unknown): value is SmartListId {
  if (typeof value !== "string") return false;
  return SMART_LISTS.some((l) => l.id === value) || (value.startsWith("tag:") && value.length > 4) || (value.startsWith("filtre:") && value.length > 7);
}

export function listLabel(list: SmartListId): string {
  if (list.startsWith("tag:")) return `#${list.slice(4)}`;
  if (list.startsWith("filtre:")) return tr("Filtre");
  return SMART_LISTS.find((l) => l.id === list)?.label ?? "";
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: tr("Aucune"),
  1: tr("Basse"),
  2: tr("Moyenne"),
  3: tr("Haute"),
};

const isOpen = (t: Task) => t.doneAt === null;

/** Jour local d'achèvement. */
export function doneDay(t: Task): DayKey | null {
  return t.doneAt === null ? null : dayKey(new Date(t.doneAt * 1000));
}

const doneOn = (t: Task, day: DayKey) => doneDay(t) === day;

/** Pas encore commencée : sa date de début est à venir. */
export const waiting = (t: Pick<Task, "doneAt" | "startDate">, today: DayKey) => t.doneAt === null && t.startDate !== null && t.startDate > today;

/** Sans échéance mais commencée : elle rejoint « Aujourd'hui », comme le « Quand » de Things. */
const started = (t: Task, today: DayKey) => t.dueDate === null && t.startDate !== null && t.startDate <= today;

/** Étiquette ou l'une de ses sous-étiquettes (« maison » retient « maison/jardin »). */
function hasTag(t: Task, tag: string): boolean {
  const wanted = tag.toLowerCase();
  return t.tags.some((x) => x.toLowerCase() === wanted || x.toLowerCase().startsWith(`${wanted}/`));
}

/**
 * Appartenance à une liste. Une tâche terminée aujourd'hui reste visible (barrée) là où
 * elle se trouvait, pour voir le travail du jour. Une tâche pas encore commencée n'est que
 * dans « À venir », à sa date de début.
 */
export function inList(t: Task, list: SmartListId, today: DayKey): boolean {
  const visible = isOpen(t) || doneOn(t, today);
  const due = t.dueDate;
  const later = waiting(t, today);
  if (list.startsWith("tag:")) return visible && !later && hasTag(t, list.slice(4));
  switch (list) {
    case "boite":
      return isOpen(t) && t.inbox && !later;
    case "aujourdhui":
      return visible && !later && ((due !== null && due <= addDays(today, 1)) || started(t, today));
    case "a-venir":
      return visible && ((due !== null && due > today) || later);
    case "en-retard":
      return isOpen(t) && due !== null && due < today;
    case "sans-date":
      return visible && due === null && !later;
    case "terminees":
      return !isOpen(t);
  }
  return false;
}

/** Nombre de tâches à faire affiché à côté de chaque liste. */
export function countFor(tasks: readonly Task[], list: SmartListId, today: DayKey): number {
  if (list === "terminees") return 0;
  if (list === "aujourdhui") return tasks.filter((t) => isOpen(t) && (t.dueDate === today || started(t, today))).length;
  return tasks.filter((t) => isOpen(t) && inList(t, list, today)).length;
}

/** Étiquettes des tâches à faire, par ordre alphabétique. */
export function tagsInUse(tasks: readonly Task[]): string[] {
  const seen = new Map<string, string>();
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    for (const tag of t.tags) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

/**
 * À faire d'abord (par date, heure — sans heure en dernier —, priorité, création), puis
 * terminées (les plus récentes d'abord).
 */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
    if (!isOpen(a)) return (b.doneAt ?? 0) - (a.doneAt ?? 0);
    const da = a.dueDate ?? "9999-99-99";
    const db = b.dueDate ?? "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    const ta = a.dueTime ?? "99:99";
    const tb = b.dueTime ?? "99:99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt - b.createdAt;
  });
}

export interface TaskSection {
  key: string;
  /** Vide pour une liste sans intertitre. */
  title: string;
  subtitle?: string;
  tone?: "danger";
  tasks: Task[];
}

/** « Aujourd'hui », « Demain », « Hier », ou « ven. 2 oct. ». */
export function dayTitle(day: DayKey, today: DayKey): { title: string; subtitle?: string } {
  const short = formatShortDay(day, today);
  if (day === today) return { title: tr("Aujourd'hui"), subtitle: short };
  if (day === addDays(today, 1)) return { title: tr("Demain"), subtitle: short };
  if (day === addDays(today, -1)) return { title: tr("Hier"), subtitle: short };
  return { title: short };
}

function byDay(tasks: readonly Task[], dayOf: (t: Task) => DayKey, today: DayKey, newestFirst = false): TaskSection[] {
  const groups = new Map<DayKey, Task[]>();
  for (const t of tasks) {
    const day = dayOf(t);
    groups.set(day, [...(groups.get(day) ?? []), t]);
  }
  const days = [...groups.keys()].sort();
  if (newestFirst) days.reverse();
  return days.map((day) => ({ key: day, ...dayTitle(day, today), tasks: sortTasks(groups.get(day)!) }));
}

/** Intertitres d'une liste (maquette : « En retard », « Aujourd'hui · dim. 27 sept. »…). */
export function sectionsFor(list: SmartListId, tasks: readonly Task[], today: DayKey): TaskSection[] {
  if (tasks.length === 0) return [];
  if (list === "aujourdhui" || list === "a-venir") {
    const late = list === "aujourdhui" ? tasks.filter((t) => isOpen(t) && t.dueDate! < today) : [];
    const rest = tasks.filter((t) => !late.includes(t));
    // Une tâche en retard terminée aujourd'hui rejoint la journée.
    // À venir : une tâche pas encore commencée se range à sa date de début.
    const sections = byDay(rest, (t) => (waiting(t, today) ? t.startDate! : !t.dueDate || t.dueDate < today ? today : t.dueDate), today);
    if (late.length > 0) sections.unshift({ key: "retard", title: tr("En retard"), tone: "danger", tasks: sortTasks(late) });
    return sections;
  }
  if (list === "terminees") {
    // Par jour d'achèvement ; la date seule suffit (« Hier », « ven. 25 sept. »).
    return byDay(tasks, (t) => doneDay(t)!, today, true).map(({ subtitle, ...section }) => section);
  }
  return [{ key: "tout", title: "", tasks: sortTasks(tasks) }];
}
