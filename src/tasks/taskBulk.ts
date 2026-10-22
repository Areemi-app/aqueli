/** Actions sur plusieurs tâches sélectionnées (Ctrl+clic, Maj+clic) : barre et clic droit. */
import { useBulk } from "../app/bulk";
import { ICONS } from "../components/icons";
import type { SelectionAction } from "../components/SelectionBar";
import { KEYS } from "../lib/itemKeys";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays } from "./day";
import type { Priority } from "./quickAdd";
import { PRIORITY_LABELS, type Task } from "./tasks";
import { useTasks } from "./TasksProvider";
import { tr, trn } from "../i18n/i18n";

export function useTaskBulk(): (tasks: readonly Task[], options?: { onDone?: (ids: string[]) => void }) => SelectionAction[] {
  const { setDone, update, remove, today } = useTasks();
  const { spaces } = useSpaces();
  const bulk = useBulk();
  return (tasks, options = {}) => {
    const open = tasks.filter((t) => t.doneAt === null);
    const each = (list: readonly Task[], fn: (t: Task) => Promise<unknown>) => async () => {
      for (const t of list) await fn(t);
    };
    // « Tâche terminée. », « 3 tâches terminées. »
    const act = (list: readonly Task[], said: (n: number) => string, undo: string, fn: (t: Task) => Promise<unknown>) => () =>
      void bulk(said(list.length), undo, each(list, fn));
    const reopen = open.length === 0;
    return [
      {
        label: reopen ? tr("Rouvrir") : tr("Terminer"),
        icon: ICONS.check,
        run: () => {
          const list = reopen ? tasks : open;
          options.onDone?.(list.map((t) => t.id));
          act(list, reopen ? (n) => trn(n, "Tâche rouverte.", "{n} tâches rouvertes.") : (n) => trn(n, "Tâche terminée.", "{n} tâches terminées."), reopen ? tr("réouverture des tâches") : tr("tâches terminées"), (t) => setDone(t, !reopen))();
        },
      },
      {
        label: tr("Planifier"),
        icon: ICONS.calendar,
        disabled: open.length === 0,
        run: () => {},
        menu: () => [
          { label: tr("Pour aujourd'hui"), icon: ICONS.today, run: act(open, (n) => trn(n, "Tâche prévue.", "{n} tâches prévues."), tr("changement de date"), (t) => update(t, { dueDate: today })) },
          { label: tr("Pour demain"), icon: ICONS.arrowRight, run: act(open, (n) => trn(n, "Tâche prévue.", "{n} tâches prévues."), tr("changement de date"), (t) => update(t, { dueDate: addDays(today, 1) })) },
          { label: tr("Retirer la date"), icon: ICONS.noDate, run: act(open, (n) => trn(n, "Tâche modifiée.", "{n} tâches modifiées."), tr("changement de date"), (t) => update(t, { dueDate: null, dueTime: null })) },
        ],
      },
      {
        label: tr("Priorité"),
        icon: ICONS.flag,
        run: () => {},
        menu: () =>
          ([3, 2, 1, 0] as Priority[]).map((p) => ({
            label: p === 0 ? tr("Sans priorité") : tr("Priorité {x}", { x: PRIORITY_LABELS[p].toLowerCase() }),
            icon: ICONS.flag,
            run: act(tasks, (n) => trn(n, "Tâche modifiée.", "{n} tâches modifiées."), tr("changement de priorité"), (t) => update(t, { priority: p })),
          })),
      },
      ...(spaces.length > 0
        ? [
            {
              label: tr("Espace"),
              icon: ICONS.spaces,
              run: () => {},
              menu: () => [
                ...spaces.map((s) => ({
                  label: tr("Espace « {name} »", { name: s.name }),
                  icon: ICONS.spaces,
                  run: act(tasks, (n) => trn(n, "Tâche déplacée.", "{n} tâches déplacées."), tr("changement d'espace"), (t) => update(t, { spaceId: s.id })),
                })),
                { label: tr("Sans espace"), icon: ICONS.spaces, run: act(tasks, (n) => trn(n, "Tâche déplacée.", "{n} tâches déplacées."), tr("changement d'espace"), (t) => update(t, { spaceId: null })) },
              ],
            },
          ]
        : []),
      {
        label: tr("Supprimer"),
        icon: ICONS.trash,
        shortcut: KEYS.remove,
        danger: true,
        run: act(tasks, (n) => trn(n, "Tâche supprimée.", "{n} tâches supprimées."), tr("suppression des tâches"), (t) => remove(t)),
      },
    ];
  };
}
