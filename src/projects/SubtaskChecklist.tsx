/**
 * Sous-tâches d'une tâche de projet, visibles sans l'ouvrir : barre d'avancement, cases à cocher
 * (cochées sur place) ; au-delà de `max`, « N de plus » ouvre la tâche.
 */
import type { CSSProperties } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import type { Task } from "../tasks/tasks";
import { useTasks } from "../tasks/TasksProvider";
import { tr } from "../i18n/i18n";

export function SubtaskChecklist({ task, max = 4, onOpen }: { task: Task; max?: number; onOpen: () => void }) {
  const { update } = useTasks();
  const subtasks = task.subtasks;
  if (subtasks.length === 0) return null;
  const done = subtasks.filter((s) => s.done).length;
  const percent = Math.round((done / subtasks.length) * 100);
  const shown = subtasks.slice(0, max);
  const toggle = (id: string) => void update(task, { subtasks: subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  return (
    <div className="subtask-checklist" data-complete={done === subtasks.length || undefined}>
      <div className="subtask-progress" role="img" aria-label={tr("{done} sous-tâches terminées sur {length}", { done, length: subtasks.length })}>
        <span className="subtask-progress-bar">
          <span style={{ "--progress": `${percent}%` } as CSSProperties} />
        </span>
        <span className="subtask-progress-text">
          {done}/{subtasks.length}
        </span>
      </div>
      <ul className="subtask-items">
        {shown.map((s) => (
          <li key={s.id} className="subtask-item" data-done={s.done || undefined}>
            <button
              type="button"
              className="subtask-tick"
              data-sans-son
              aria-pressed={s.done}
              aria-label={s.done ? tr("Rouvrir la sous-tâche « {title} »", { title: s.title }) : tr("Terminer la sous-tâche « {title} »", { title: s.title })}
              onClick={(e) => {
                e.stopPropagation();
                toggle(s.id);
              }}
            >
              {s.done && <Icon d={ICONS.check} size={10} stroke={3.6} />}
            </button>
            <span className="subtask-text">{s.title}</span>
          </li>
        ))}
      </ul>
      {subtasks.length > max && (
        <button
          type="button"
          className="link-btn subtask-more"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {tr("{n} de plus", { n: subtasks.length - max })}
        </button>
      )}
    </div>
  );
}
