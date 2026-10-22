/** Menu du clic droit d'une tâche, le même partout où elle apparaît (liste, Accueil, calendrier). */
import { submenuEntry, type MenuEntry } from "../components/ContextMenu";
import { ICONS } from "../components/icons";
import { useFocusIfAny } from "../focus/FocusProvider";
import { KEYS } from "../lib/itemKeys";
import { usePinEntry } from "../pins/pins";
import { useNavigation } from "../navigation/NavigationProvider";
import { addDays, weekday } from "./day";
import { requestTaskOpen } from "./taskFocus";
import type { Task } from "./tasks";
import { useTasks } from "./TasksProvider";
import { tr } from "../i18n/i18n";

interface TaskMenuOptions {
  /** Ouvrir la tâche : dans l'écran Tâches, par défaut. */
  open?: () => void;
  /** Supprimer : met la tâche à la corbeille, par défaut. */
  remove?: () => void;
  /** Actions propres à l'endroit (planificateur, calendrier…), après « Terminer ». */
  extra?: MenuEntry[];
}

export function useTaskMenu(): (task: Task, options?: TaskMenuOptions) => MenuEntry[] {
  const { setDone, update, remove, duplicate, today } = useTasks();
  const { go } = useNavigation();
  const focus = useFocusIfAny();
  const pinEntry = usePinEntry();
  return (task, options = {}) => {
    const done = task.doneAt !== null;
    const tomorrow = addDays(today, 1);
    // Lundi prochain (le lundi suivant, même si l'on est lundi).
    const nextWeek = addDays(today, (8 - weekday(today)) % 7 || 7);
    const open =
      options.open ??
      (() => {
        requestTaskOpen(task.id);
        go("taches");
      });
    return [
      { label: tr("Ouvrir"), icon: ICONS.pencil, shortcut: KEYS.open, run: open },
      { label: done ? tr("Rouvrir") : tr("Terminer"), icon: ICONS.check, run: () => void setDone(task, !done) },
      ...(options.extra ?? []),
      ...(focus && !done
        ? [
            {
              label: tr("Démarrer une séance Focus"),
              icon: ICONS.play,
              run: () => {
                focus.startWith(task.id);
                go("focus");
              },
            },
          ]
        : []),
      "separator",
      ...(done
        ? []
        : [
            submenuEntry(tr("Planifier"), ICONS.today, [
              { label: tr("Aujourd'hui"), icon: ICONS.today, checked: task.dueDate === today, run: () => void update(task, { dueDate: today }) },
              { label: tr("Demain"), icon: ICONS.arrowRight, checked: task.dueDate === tomorrow, run: () => void update(task, { dueDate: tomorrow }) },
              { label: tr("Semaine prochaine"), icon: ICONS.calendar, checked: task.dueDate === nextWeek, run: () => void update(task, { dueDate: nextWeek }) },
              ...(task.dueDate !== null
                ? ["separator" as const, { label: tr("Retirer la date"), icon: ICONS.noDate, run: () => void update(task, { dueDate: null, dueTime: null }) }]
                : []),
            ]),
          ]),
      "separator",
      { label: tr("Dupliquer"), icon: ICONS.layers, shortcut: KEYS.duplicate, run: () => void duplicate(task) },
      pinEntry({ kind: "task", id: task.id }),
      {
        label: tr("Supprimer"),
        icon: ICONS.trash,
        shortcut: KEYS.remove,
        danger: true,
        run: options.remove ?? (() => void remove(task)),
      },
    ];
  };
}
