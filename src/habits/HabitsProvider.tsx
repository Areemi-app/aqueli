import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { mergeOrder } from "../lib/dragDrop";
import { useNow } from "../lib/useNow";
import { useSound } from "../sound/SoundProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, dayKey, type DayKey } from "../tasks/day";
import { habitsApi } from "./api";
import { indexChecks, isDoneOn, isDue, isPaused, sortHabits, toInput, valueOn, type CheckIndex, type Habit, type HabitCheck, type HabitInput } from "./habits";
import { tr } from "../i18n/i18n";

/** Historique chargé : un peu plus d'un an (carte de l'année, record). */
const HISTORY_DAYS = 400;

interface HabitsContextValue {
  /** Toutes les habitudes, archivées comprises, dans l'ordre choisi. */
  habits: readonly Habit[];
  /** Habitudes de l'espace choisi dans la barre de titre. */
  visible: readonly Habit[];
  checks: CheckIndex;
  loaded: boolean;
  today: DayKey;
  create: (input: HabitInput) => Promise<Habit | null>;
  update: (habit: Habit, changes: Partial<HabitInput>) => Promise<void>;
  archive: (habit: Habit, archived: boolean) => Promise<void>;
  /** Met l'habitude à la corbeille, avec « Annuler ». */
  remove: (habit: Habit) => Promise<void>;
  move: (habit: Habit, direction: -1 | 1) => Promise<void>;
  /** Nouvel ordre d'une partie des habitudes (glisser-déposer) ; les autres gardent leur place. */
  reorder: (ids: string[]) => Promise<void>;
  /** Valeur atteinte un jour (0 décoche). */
  setValue: (habit: Habit, day: DayKey, value: number) => Promise<void>;
  /** Oui/non : coche ou décoche ; quantité : objectif atteint, ou remis à zéro. */
  toggle: (habit: Habit, day: DayKey) => Promise<void>;
  /** Jour de pause (vacances, maladie), ou retrait de la pause. */
  setPaused: (habit: Habit, day: DayKey, paused: boolean) => Promise<void>;
  /** Pause de toutes les journées prévues d'aujourd'hui à `until` (pas encore cochées) ; rend leur nombre. */
  pauseUntil: (habit: Habit, until: DayKey) => Promise<number>;
}

const HabitsContext = createContext<HabitsContextValue | null>(null);

export function HabitsProvider({ children }: { children: ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkList, setCheckList] = useState<HabitCheck[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const { play } = useSound();
  const { filter } = useSpaces();
  const today = dayKey(useNow());

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const reload = useCallback(async () => {
    const since = addDays(dayKey(new Date()), -HISTORY_DAYS);
    const [list, checks] = await enqueue(() => Promise.all([habitsApi.list(), habitsApi.checks(since)]));
    setHabits(sortHabits(list));
    setCheckList(checks);
  }, [enqueue]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);
  useEffect(() => onDataAdded("habit", () => void reload().catch(() => undefined)), [reload]);

  const checks = useMemo(() => indexChecks(checkList), [checkList]);
  const checksRef = useRef(checks);
  checksRef.current = checks;
  const habitsRef = useRef(habits);
  habitsRef.current = habits;

  const value = useMemo<HabitsContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const put = (h: Habit) => setHabits((list) => sortHabits(list.some((x) => x.id === h.id) ? list.map((x) => (x.id === h.id ? h : x)) : [...list, h]));
    const setValue = async (habit: Habit, day: DayKey, v: number) => {
      const before = checksRef.current.get(habit.id)?.get(day) ?? 0;
      if (before === v) return;
      recordUndo(tr("habitude cochée"), () => setValue(habit, day, before), `habit:${habit.id}:${day}`);
      // Affichage immédiat, puis la base confirme.
      setCheckList((list) => [...list.filter((c) => !(c.habitId === habit.id && c.day === day)), ...(v > 0 ? [{ habitId: habit.id, day, value: v }] : [])]);
      if (v >= habit.target && before < habit.target) play("bulle");
      try {
        await enqueue(() => habitsApi.check(habit.id, day, v));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    const setPaused = async (habit: Habit, day: DayKey, paused: boolean, undoable = true) => {
      if (isPaused(checksRef.current, habit.id, day) === paused) return;
      if (paused && valueOn(checksRef.current, habit.id, day) > 0) return;
      if (undoable) recordUndo(paused ? tr("jour de pause") : tr("pause retirée"), () => setPaused(habit, day, !paused), `habit:${habit.id}:${day}`);
      setCheckList((list) => [...list.filter((c) => !(c.habitId === habit.id && c.day === day)), ...(paused ? [{ habitId: habit.id, day, value: 0, skipped: true }] : [])]);
      try {
        await enqueue(() => habitsApi.skip(habit.id, day, paused));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    const remove = async (habit: Habit) => {
      try {
        await enqueue(() => habitsApi.remove(habit.id));
      } catch (err) {
        fail(err);
        return;
      }
      setHabits((list) => list.filter((h) => h.id !== habit.id));
      notify(tr("Habitude supprimée."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de l'habitude"),
        run: () => {
          enqueue(() => habitsApi.restore(habit.id))
            .then(put)
            .catch(fail);
        },
      });
    };
    const update = async (habit: Habit, changes: Partial<HabitInput>) => {
      const base = habitsRef.current.find((h) => h.id === habit.id) ?? habit;
      recordUndo(tr("modification de l'habitude"), () => update(base, toInput(base)), `habit:${base.id}`);
      put({ ...base, ...changes });
      try {
        put(await enqueue(() => habitsApi.update(base.id, { ...toInput(base), ...changes })));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    return {
      habits,
      visible: filter === "tous" ? habits : habits.filter((h) => h.spaceId === filter),
      checks,
      loaded,
      today,
      create: async (input) => {
        try {
          const h = await enqueue(() => habitsApi.create(input));
          put(h);
          recordUndo(tr("ajout de l'habitude"), () => remove(h));
          return h;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      update,
      archive: async (habit, archived) => {
        try {
          put(await enqueue(() => habitsApi.archive(habit.id, archived)));
          recordUndo(archived ? tr("archivage de l'habitude") : tr("retour de l'habitude"), () => enqueue(() => habitsApi.archive(habit.id, !archived)).then(put));
          notify(archived ? tr("Habitude archivée.") : tr("Habitude ressortie des archives."));
        } catch (err) {
          fail(err);
        }
      },
      remove,
      move: async (habit, direction) => {
        const list = habitsRef.current.filter((h) => h.archived === habit.archived);
        const i = list.findIndex((h) => h.id === habit.id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= list.length) return;
        const ordered = [...list];
        [ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!];
        const all = [...ordered, ...habitsRef.current.filter((h) => h.archived !== habit.archived)];
        const ids = all.map((h) => h.id);
        setHabits(sortHabits(all.map((h) => ({ ...h, position: ids.indexOf(h.id) }))));
        try {
          await enqueue(() => habitsApi.reorder(ids));
        } catch (err) {
          fail(err);
        }
      },
      reorder: async (part) => {
        const before = habitsRef.current.map((h) => h.id);
        const ids = mergeOrder(before, part);
        if (ids.join() === before.join()) return;
        const apply = async (order: string[]) => {
          setHabits(sortHabits(habitsRef.current.map((h) => ({ ...h, position: order.indexOf(h.id) }))));
          await enqueue(() => habitsApi.reorder(order));
        };
        try {
          await apply(ids);
          recordUndo(tr("déplacement de l'habitude"), () => apply(before));
        } catch (err) {
          fail(err);
        }
      },
      setValue,
      toggle: (habit, day) => {
        const done = isDoneOn(habit, checksRef.current, day);
        return setValue(habit, day, done ? 0 : Math.max(1, habit.target));
      },
      setPaused,
      pauseUntil: async (habit, until) => {
        const days: DayKey[] = [];
        for (let day = today; day <= until; day = addDays(day, 1)) {
          if (isDue(habit, day) && !isPaused(checksRef.current, habit.id, day) && valueOn(checksRef.current, habit.id, day) === 0) days.push(day);
        }
        if (days.length === 0) return 0;
        // Un seul « Annuler » pour toute la pause.
        recordUndo(tr("pause de l'habitude"), () => Promise.all(days.map((d) => setPaused(habit, d, false, false))).then(() => undefined), `habit-pause:${habit.id}`);
        for (const day of days) await setPaused(habit, day, true, false);
        return days.length;
      },
    };
  }, [habits, checks, loaded, today, filter, enqueue, notify, play, reload]);

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits(): HabitsContextValue {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error("useHabits doit être utilisé dans HabitsProvider");
  return ctx;
}
