/** Filtres de tâches enregistrés, chargés une fois le compte déverrouillé ; Ctrl+Z et « Annuler » comme ailleurs. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { filtersApi, type TaskFilter, type TaskFilterInput } from "./filters";
import { tr } from "../i18n/i18n";

interface TaskFiltersContextValue {
  filters: readonly TaskFilter[];
  loaded: boolean;
  create: (input: TaskFilterInput) => Promise<TaskFilter | null>;
  update: (filter: TaskFilter, input: TaskFilterInput) => Promise<void>;
  remove: (filter: TaskFilter) => Promise<void>;
  move: (filter: TaskFilter, by: -1 | 1) => Promise<void>;
  /** Nouvel ordre (glisser-déposer), avec Ctrl+Z. */
  reorder: (ids: string[]) => Promise<void>;
}

const TaskFiltersContext = createContext<TaskFiltersContextValue | null>(null);

const inputOf = (f: TaskFilter): TaskFilterInput => ({ name: f.name, icon: f.icon, color: f.color, criteria: f.criteria });

export function TaskFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<TaskFilter[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const ref = useRef(filters);
  ref.current = filters;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  useEffect(() => {
    filtersApi
      .list()
      .then((list) => {
        setFilters(list);
        setLoaded(true);
      })
      .catch((err: DataError) => notify(dataErrorMessage(err)));
  }, [notify]);

  const value = useMemo<TaskFiltersContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const put = (f: TaskFilter) => setFilters((list) => (list.some((x) => x.id === f.id) ? list.map((x) => (x.id === f.id ? f : x)) : [...list, f]));
    const create = async (input: TaskFilterInput): Promise<TaskFilter | null> => {
      try {
        const f = await enqueue(() => filtersApi.create(input));
        put(f);
        recordUndo(tr("ajout du filtre"), () => remove(f));
        return f;
      } catch (err) {
        fail(err);
        return null;
      }
    };
    const update = async (filter: TaskFilter, input: TaskFilterInput) => {
      const base = ref.current.find((f) => f.id === filter.id) ?? filter;
      try {
        put(await enqueue(() => filtersApi.update(filter.id, input)));
        recordUndo(tr("modification du filtre"), () => update(base, inputOf(base)), `filter:${filter.id}`);
      } catch (err) {
        fail(err);
      }
    };
    const remove = async (filter: TaskFilter) => {
      try {
        await enqueue(() => filtersApi.remove(filter.id));
      } catch (err) {
        fail(err);
        return;
      }
      setFilters((list) => list.filter((f) => f.id !== filter.id));
      notify(tr("Filtre « {name} » supprimé.", { name: filter.name }), {
        label: tr("Annuler|action"),
        undo: tr("suppression du filtre"),
        run: () => void create(inputOf(filter)),
      });
    };
    const move = async (filter: TaskFilter, by: -1 | 1) => {
      const ids = ref.current.map((f) => f.id);
      const i = ids.indexOf(filter.id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
      try {
        setFilters(await enqueue(() => filtersApi.reorder(ids)));
      } catch (err) {
        fail(err);
      }
    };
    const reorder = async (ids: string[]) => {
      const before = ref.current.map((f) => f.id);
      try {
        setFilters(await enqueue(() => filtersApi.reorder(ids)));
        recordUndo(tr("déplacement du filtre"), () => enqueue(() => filtersApi.reorder(before)).then(setFilters));
      } catch (err) {
        fail(err);
      }
    };
    return { filters, loaded, create, update, remove, move, reorder };
  }, [filters, loaded, enqueue, notify]);

  return <TaskFiltersContext.Provider value={value}>{children}</TaskFiltersContext.Provider>;
}

export function useTaskFilters(): TaskFiltersContextValue {
  const ctx = useContext(TaskFiltersContext);
  if (!ctx) throw new Error("useTaskFilters doit être utilisé dans TaskFiltersProvider");
  return ctx;
}
