import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useNow } from "../lib/useNow";
import { useSound } from "../sound/SoundProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { tasksApi, type DoneTask } from "./api";
import { dayKey, formatShortDay, type DayKey } from "./day";
import { readDefaultReminder } from "./reminderPrefs";
import { defaultReminderFor } from "./reminders";
import { toInput, type Task, type TaskInput } from "./tasks";
import { tr } from "../i18n/i18n";

/** Les tâches terminées depuis moins de 30 jours restent chargées (liste « Terminées »). */
const DONE_WINDOW_SECONDS = 30 * 24 * 3600;

interface TasksContextValue {
  /** Toutes les tâches chargées, tous espaces confondus. */
  tasks: readonly Task[];
  /** Tâches de l'espace choisi dans la barre de titre. */
  visible: readonly Task[];
  loaded: boolean;
  today: DayKey;
  /** Tâches terminées avant la fenêtre chargée (30 jours) : avancement des projets et objectifs, Bilan. */
  olderDone: readonly DoneTask[];
  create: (input: TaskInput) => Promise<Task>;
  /** Modifie une tâche ; l'affichage suit tout de suite, puis la base confirme. */
  update: (task: Task, changes: Partial<TaskInput>) => Promise<void>;
  setDone: (task: Task, done: boolean) => Promise<void>;
  /** Met la tâche à la corbeille, avec « Annuler » pendant 8 secondes. */
  remove: (task: Task) => Promise<void>;
  /** Copie de la tâche (à faire), juste après elle. */
  duplicate: (task: Task) => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

const doneSince = () => Math.floor(Date.now() / 1000) - DONE_WINDOW_SECONDS;
/** Date du jour sur ce PC, au moment de l'enregistrement. */
const todayNow = () => dayKey(new Date());

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [olderDone, setOlderDone] = useState<DoneTask[]>([]);
  const { filter } = useSpaces();
  const notify = useToast();
  const { play } = useSound();
  const now = useNow();
  const today = dayKey(now);

  // Liste à jour sans attendre l'affichage : deux changements rapprochés partent chacun
  // de l'état laissé par le précédent.
  const tasksRef = useRef<Task[]>([]);
  const setAll = useCallback((change: (list: Task[]) => Task[]) => {
    tasksRef.current = change(tasksRef.current);
    setTasks(tasksRef.current);
  }, []);
  const latest = (task: Task) => tasksRef.current.find((t) => t.id === task.id) ?? task;

  // Les enregistrements partent un par un, dans l'ordre des changements.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);
  // Version locale de chaque tâche : une réponse ancienne n'écrase pas un changement récent.
  const versions = useRef(new Map<string, number>());
  const bump = (id: string) => {
    const version = (versions.current.get(id) ?? 0) + 1;
    versions.current.set(id, version);
    return version;
  };

  const reload = useCallback(async () => {
    const since = doneSince();
    const list = await enqueue(() => tasksApi.list(since));
    setAll(() => list);
    // Une erreur ici n'empêche pas d'afficher les tâches.
    const older = await enqueue(() => tasksApi.doneBefore(since)).catch(() => null);
    if (older) setOlderDone(older);
  }, [enqueue, setAll]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);

  // Élément ajouté par la capture rapide : la liste est relue.
  useEffect(
    () =>
      onDataAdded("task", () => {
        reload().catch(() => undefined);
      }),
    [reload],
  );

  /** Affiche le changement tout de suite ; en cas de refus, relit la base et prévient. */
  const optimistic = useCallback(
    async (after: Task, save: () => Promise<Task>) => {
      const version = bump(after.id);
      setAll((list) => list.map((t) => (t.id === after.id ? after : t)));
      try {
        const saved = await enqueue(save);
        if (versions.current.get(after.id) === version) {
          setAll((list) => list.map((t) => (t.id === saved.id ? saved : t)));
        }
      } catch (err) {
        notify(dataErrorMessage(err as DataError));
        await reload().catch(() => undefined);
      }
    },
    [enqueue, setAll, notify, reload],
  );

  const value = useMemo<TasksContextValue>(() => {
    const visible = filter === "tous" ? tasks : tasks.filter((t) => t.spaceId === filter);
    const remove = async (task: Task) => {
      try {
        await enqueue(() => tasksApi.remove(task.id));
      } catch (err) {
        notify(dataErrorMessage(err as DataError));
        return;
      }
      setAll((list) => list.filter((t) => t.id !== task.id));
      notify(tr("Tâche supprimée."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de la tâche"),
        run: () => {
          enqueue(() => tasksApi.restore(task.id))
            .then((back) => setAll((list) => [...list.filter((t) => t.id !== back.id), back]))
            .catch((err: DataError) => notify(dataErrorMessage(err)));
        },
      });
    };
    const update = async (task: Task, changes: Partial<TaskInput>) => {
      const base = latest(task);
      // Ctrl+Z rend la tâche telle qu'avant (modifications rapprochées regroupées).
      recordUndo(tr("modification de la tâche"), () => update(base, toInput(base)), `task:${base.id}`);
      const input = { ...toInput(base), ...changes };
      // Une heure ajoutée apporte le rappel par défaut (Paramètres › Rappels).
      if (changes.dueTime !== undefined && changes.reminder === undefined) {
        input.reminder = defaultReminderFor(base, changes.dueTime, readDefaultReminder());
      }
      const after = { ...base, ...input, inbox: input.inbox && input.dueDate === null };
      await optimistic(after, () => tasksApi.update(task.id, input, todayNow()));
    };
    const setDone = async (task: Task, done: boolean) => {
      if (done) play("bulle");
      const base = latest(task);
      recordUndo(done ? tr("tâche terminée") : tr("tâche rouverte"), () => setDone(base, !done));
      const after = { ...base, doneAt: done ? Math.floor(Date.now() / 1000) : null, inbox: done ? false : base.inbox };
      const version = bump(after.id);
      setAll((list) => list.map((t) => (t.id === after.id ? after : t)));
      try {
        const result = await enqueue(() => tasksApi.setDone(task.id, done, todayNow()));
        setAll((list) => {
          let next = list.filter((t) => t.id !== result.removed);
          if (versions.current.get(after.id) === version) next = next.map((t) => (t.id === result.task.id ? result.task : t));
          if (result.created) next = [...next.filter((t) => t.id !== result.created?.id), result.created];
          return next;
        });
        // Tâche répétée : la suivante vient d'être créée.
        if (result.created?.dueDate) {
          // Le point de l'abréviation (« oct. ») sert aussi de point final.
          const when = formatShortDay(result.created.dueDate, todayNow());
          notify(tr("Prochaine échéance : {when}{x}", { when, x: when.endsWith(".") ? "" : "." }));
        }
      } catch (err) {
        notify(dataErrorMessage(err as DataError));
        await reload().catch(() => undefined);
      }
    };
    return {
      tasks,
      visible,
      loaded,
      today,
      olderDone,
      create: async (input) => {
        const task = await enqueue(() => tasksApi.create(input, todayNow()));
        setAll((list) => [...list, task]);
        recordUndo(tr("ajout de la tâche"), () => remove(task));
        return task;
      },
      update,
      setDone,
      duplicate: async (task) => {
        try {
          const copy = await enqueue(() => tasksApi.create(toInput(latest(task)), todayNow()));
          setAll((list) => [...list, copy]);
          recordUndo(tr("copie de la tâche"), () => remove(copy));
          notify(tr("Tâche dupliquée."));
        } catch (err) {
          notify(dataErrorMessage(err as DataError));
        }
      },
      remove,
    };
    // `latest` lit une référence : inutile de le suivre.
  }, [tasks, olderDone, loaded, today, filter, optimistic, enqueue, setAll, play, notify]);

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasks doit être utilisé dans TasksProvider");
  return ctx;
}
