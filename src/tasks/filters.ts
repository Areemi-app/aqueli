/**
 * Filtres de tâches enregistrés (cahier des charges § 4.2) : critères gardés par le cœur
 * (src-tauri/src/data/filters.rs), appliqués ici aux tâches chargées. Fonctions pures et accès au cœur.
 */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { fold } from "../lib/fold";
import { inTauri } from "../lib/windowControls";
import { addDays, type DayKey } from "./day";
import type { Priority } from "./quickAdd";
import type { Task } from "./tasks";
import { tr } from "../i18n/i18n";

export type DueWindow = "toutes" | "retard" | "aujourdhui" | "semaine" | "datees" | "sans-date";

export const DUE_WINDOWS: readonly { id: DueWindow; label: string }[] = [
  { id: "toutes", label: tr("Toutes les échéances") },
  { id: "retard", label: tr("En retard") },
  { id: "aujourdhui", label: tr("Aujourd'hui ou en retard") },
  { id: "semaine", label: tr("D'ici 7 jours, retard compris") },
  { id: "datees", label: tr("Avec une échéance") },
  { id: "sans-date", label: tr("Sans échéance") },
];

export const MIN_PRIORITIES: readonly { value: Priority; label: string }[] = [
  { value: 0, label: tr("Toutes les priorités") },
  { value: 1, label: tr("Basse ou plus") },
  { value: 2, label: tr("Moyenne ou haute") },
  { value: 3, label: tr("Haute") },
];

export interface FilterCriteria {
  /** Au moins une de ces étiquettes (sous-étiquettes « maison/jardin » comprises). */
  tags: string[];
  minPriority: Priority;
  spaceId: string | null;
  projectId: string | null;
  due: DueWindow;
  includeDone: boolean;
  /** Texte cherché dans le titre et la description. */
  text: string;
}

export const EMPTY_CRITERIA: FilterCriteria = { tags: [], minPriority: 0, spaceId: null, projectId: null, due: "toutes", includeDone: false, text: "" };

export interface TaskFilter {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  criteria: FilterCriteria;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export type TaskFilterInput = Pick<TaskFilter, "name" | "icon" | "color" | "criteria">;

/** Liste des tâches d'un filtre : « filtre:<id> ». */
export const filterListId = (id: string) => `filtre:${id}` as const;

function hasTagUnder(t: Task, wanted: readonly string[]): boolean {
  const own = t.tags.map(fold);
  return wanted.some((w) => {
    const f = fold(w);
    return own.some((x) => x === f || x.startsWith(`${f}/`));
  });
}

export function matchesFilter(t: Task, c: FilterCriteria, today: DayKey): boolean {
  if (!c.includeDone && t.doneAt !== null) return false;
  if (t.priority < c.minPriority) return false;
  if (c.spaceId && t.spaceId !== c.spaceId) return false;
  if (c.projectId && t.projectId !== c.projectId) return false;
  if (c.tags.length > 0 && !hasTagUnder(t, c.tags)) return false;
  const due = t.dueDate;
  switch (c.due) {
    case "retard":
      if (!(due !== null && due < today)) return false;
      break;
    case "aujourdhui":
      if (!(due !== null && due <= today)) return false;
      break;
    case "semaine":
      if (!(due !== null && due <= addDays(today, 6))) return false;
      break;
    case "datees":
      if (due === null) return false;
      break;
    case "sans-date":
      if (due !== null) return false;
      break;
  }
  if (c.text.trim() && !fold(`${t.title} ${t.notes}`).includes(fold(c.text.trim()))) return false;
  return true;
}

/** Résumé des critères : « #maison · Moyenne ou haute · D'ici 7 jours, retard compris ». */
export function describeCriteria(c: FilterCriteria, names: { space: (id: string) => string | null; project: (id: string) => string | null }): string {
  const parts = [
    c.tags.length > 0 ? c.tags.map((t) => `#${t}`).join(" ") : null,
    c.minPriority > 0 ? MIN_PRIORITIES.find((p) => p.value === c.minPriority)!.label : null,
    c.spaceId ? (names.space(c.spaceId) !== null ? tr("Espace {name}", { name: names.space(c.spaceId) }) : tr("Espace supprimé")) : null,
    c.projectId ? (names.project(c.projectId) !== null ? tr("Projet {name}", { name: names.project(c.projectId) }) : tr("Projet supprimé")) : null,
    c.due !== "toutes" ? DUE_WINDOWS.find((d) => d.id === c.due)!.label : null,
    c.text.trim() ? `« ${c.text.trim()} »` : null,
    c.includeDone ? tr("Terminées comprises") : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : tr("Toutes les tâches à faire");
}

// ——— Cœur ———

export interface FiltersApi {
  list(): Promise<TaskFilter[]>;
  create(filter: TaskFilterInput): Promise<TaskFilter>;
  update(id: string, filter: TaskFilterInput): Promise<TaskFilter>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<TaskFilter[]>;
}

const call = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
};

const tauriApi: FiltersApi = {
  list: () => call("task_filters_list"),
  create: (filter) => call("task_filters_create", { filter }),
  update: (id, filter) => call("task_filters_update", { id, filter }),
  remove: (id) => call("task_filters_delete", { id }),
  reorder: (ids) => call("task_filters_reorder", { ids }),
};

/** Aperçu dans le navigateur : un filtre d'exemple, gardé en mémoire. */
function createPreviewApi(): FiltersApi {
  let n = 0;
  const now = () => Math.floor(Date.now() / 1000);
  let filters: TaskFilter[] = [
    { id: "apercuf1", name: tr("Urgent"), icon: "eclair", color: "#e0508a", criteria: { ...EMPTY_CRITERIA, minPriority: 2, due: "semaine" }, position: 0, createdAt: now(), updatedAt: now() },
  ];
  return {
    list: async () => [...filters],
    create: async (f) => {
      const created = { ...f, id: `apercuf${++n + 1}`, position: filters.length, createdAt: now(), updatedAt: now() };
      filters = [...filters, created];
      return created;
    },
    update: async (id, f) => {
      const current = filters.find((x) => x.id === id);
      if (!current) throw { code: "notFound" };
      const updated = { ...current, ...f, updatedAt: now() };
      filters = filters.map((x) => (x.id === id ? updated : x));
      return updated;
    },
    remove: async (id) => {
      filters = filters.filter((x) => x.id !== id);
    },
    reorder: async (ids) => {
      filters = ids.flatMap((id, position) => filters.filter((f) => f.id === id).map((f) => ({ ...f, position })));
      return [...filters];
    },
  };
}

export const filtersApi: FiltersApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
