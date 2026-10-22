import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { mergeOrder } from "../lib/dragDrop";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useSpaces } from "../spaces/SpacesProvider";
import { goalsApi } from "./api";
import { toGoalInput, type Goal, type GoalEntry, type GoalInput, type GoalStep } from "./goals";
import { tr } from "../i18n/i18n";

interface GoalsContextValue {
  goals: readonly Goal[];
  /** Objectifs de l'espace choisi dans la barre de titre. */
  visible: readonly Goal[];
  steps: ReadonlyMap<string, readonly GoalStep[]>;
  entries: ReadonlyMap<string, readonly GoalEntry[]>;
  loaded: boolean;
  create: (input: GoalInput) => Promise<Goal | null>;
  update: (goal: Goal, changes: Partial<GoalInput>) => Promise<void>;
  /** Met l'objectif à la corbeille, avec « Annuler ». */
  remove: (goal: Goal) => Promise<void>;
  /** Nouvel ordre d'une partie (glisser-déposer) ; les autres gardent leur place. Ctrl+Z le défait. */
  reorder: (ids: string[]) => Promise<void>;
  addStep: (goal: Goal, title: string, dueDate: string | null) => Promise<void>;
  setStepDone: (step: GoalStep, done: boolean) => Promise<void>;
  renameStep: (step: GoalStep, title: string, dueDate: string | null) => Promise<void>;
  removeStep: (step: GoalStep) => Promise<void>;
  addEntry: (goal: Goal, day: string, value: number, note: string) => Promise<void>;
  removeEntry: (entry: GoalEntry) => Promise<void>;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

function group<T extends { goalId: string }>(list: readonly T[], order: (a: T, b: T) => number): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const x of list) map.set(x.goalId, [...(map.get(x.goalId) ?? []), x]);
  for (const [k, v] of map) map.set(k, v.sort(order));
  return map;
}

export function GoalsProvider({ children }: { children: ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [stepList, setStepList] = useState<GoalStep[]>([]);
  const [entryList, setEntryList] = useState<GoalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const { filter } = useSpaces();

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const reload = useCallback(async () => {
    const [g, s, e] = await enqueue(() => Promise.all([goalsApi.list(), goalsApi.steps(), goalsApi.entries()]));
    setGoals([...g].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt));
    setStepList(s);
    setEntryList(e);
  }, [enqueue]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);
  useEffect(() => onDataAdded("goal", () => void reload().catch(() => undefined)), [reload]);

  const steps = useMemo(() => group(stepList, (a, b) => a.position - b.position), [stepList]);
  const entries = useMemo(() => group(entryList, (a, b) => a.day.localeCompare(b.day) || a.createdAt - b.createdAt), [entryList]);
  const ref = useRef(goals);
  ref.current = goals;

  const value = useMemo<GoalsContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const put = (g: Goal) => setGoals((list) => (list.some((x) => x.id === g.id) ? list.map((x) => (x.id === g.id ? g : x)) : [...list, g]));
    const putStep = (s: GoalStep) => setStepList((list) => (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s]));
    const remove = async (goal: Goal) => {
      try {
        await enqueue(() => goalsApi.remove(goal.id));
      } catch (err) {
        fail(err);
        return;
      }
      setGoals((list) => list.filter((g) => g.id !== goal.id));
      notify(tr("Objectif supprimé."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de l'objectif"),
        run: () => {
          enqueue(() => goalsApi.restore(goal.id))
            .then(() => reload())
            .catch(fail);
        },
      });
    };
    const update = async (goal: Goal, changes: Partial<GoalInput>) => {
      const base = ref.current.find((g) => g.id === goal.id) ?? goal;
      recordUndo(tr("modification de l'objectif"), () => update(base, toGoalInput(base)), `goal:${base.id}`);
      put({ ...base, ...changes });
      try {
        put(await enqueue(() => goalsApi.update(base.id, { ...toGoalInput(base), ...changes })));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    const removeStep = async (step: GoalStep) => {
      setStepList((list) => list.filter((s) => s.id !== step.id));
      try {
        await enqueue(() => goalsApi.removeStep(step.id));
        recordUndo(tr("suppression de l'étape"), () => enqueue(() => goalsApi.createStep(step.goalId, { title: step.title, dueDate: step.dueDate })).then(putStep));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    const removeEntry = async (entry: GoalEntry) => {
      setEntryList((list) => list.filter((e) => e.id !== entry.id));
      try {
        await enqueue(() => goalsApi.removeEntry(entry.id));
        recordUndo(tr("suppression de la saisie"), () =>
          enqueue(() => goalsApi.createEntry(entry.goalId, { day: entry.day, value: entry.value, note: entry.note })).then((e) => setEntryList((list) => [...list, e])),
        );
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    return {
      reorder: async (part: string[]) => {
        const before = goals.map((x) => x.id);
        const ids = mergeOrder(before, part);
        if (ids.join() === before.join()) return;
        const apply = async (order: string[]) => {
          setGoals((list) => [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((x, position) => ({ ...x, position })));
          await enqueue(() => goalsApi.reorder(order));
        };
        try {
          await apply(ids);
          recordUndo(tr("déplacement de l'objectif"), () => apply(before));
        } catch (err) {
          fail(err);
        }
      },
      goals,
      visible: filter === "tous" ? goals : goals.filter((g) => g.spaceId === filter || g.spaceId === null),
      steps,
      entries,
      loaded,
      create: async (input) => {
        try {
          const g = await enqueue(() => goalsApi.create(input));
          put(g);
          recordUndo(tr("ajout de l'objectif"), () => remove(g));
          return g;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      update,
      remove,
      addStep: async (goal, title, dueDate) => {
        try {
          const s = await enqueue(() => goalsApi.createStep(goal.id, { title, dueDate }));
          putStep(s);
          recordUndo(tr("ajout de l'étape"), () => removeStep(s));
        } catch (err) {
          fail(err);
        }
      },
      setStepDone: async (step, done) => {
        putStep({ ...step, doneAt: done ? Math.floor(Date.now() / 1000) : null });
        try {
          putStep(await enqueue(() => goalsApi.setStepDone(step.id, done)));
          recordUndo(done ? tr("étape franchie") : tr("étape rouverte"), () => enqueue(() => goalsApi.setStepDone(step.id, !done)).then(putStep));
        } catch (err) {
          fail(err);
          await reload().catch(() => undefined);
        }
      },
      renameStep: async (step, title, dueDate) => {
        try {
          putStep(await enqueue(() => goalsApi.updateStep(step.id, { title, dueDate })));
          recordUndo(tr("modification de l'étape"), () => enqueue(() => goalsApi.updateStep(step.id, { title: step.title, dueDate: step.dueDate })).then(putStep), `goal-step:${step.id}`);
        } catch (err) {
          fail(err);
        }
      },
      removeStep,
      addEntry: async (goal, day, val, note) => {
        try {
          const e = await enqueue(() => goalsApi.createEntry(goal.id, { day, value: val, note }));
          setEntryList((list) => [...list, e]);
          recordUndo(tr("ajout de la saisie"), () => removeEntry(e));
        } catch (err) {
          fail(err);
        }
      },
      removeEntry,
    };
  }, [goals, steps, entries, loaded, filter, enqueue, notify, reload]);

  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
}

export function useGoals(): GoalsContextValue {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error("useGoals doit être utilisé dans GoalsProvider");
  return ctx;
}

export function useGoalsIfAny(): GoalsContextValue | null {
  return useContext(GoalsContext);
}
