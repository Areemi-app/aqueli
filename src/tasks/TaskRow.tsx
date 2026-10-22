import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import type { Space } from "../spaces/spaces";
import { relativeDay, type DayKey } from "./day";
import { recurrenceLabel } from "./recurrence";
import { reminderLabel } from "./reminders";
import { PRIORITY_LABELS, waiting, type Task } from "./tasks";
import { tr } from "../i18n/i18n";

/** Ce que la ligne montre à côté du titre, selon la liste affichée. */
export type RowDateMode = "none" | "time" | "relative";

interface TaskRowProps {
  task: Task;
  today: DayKey;
  space: Space | undefined;
  dateMode: RowDateMode;
  selected: boolean;
  /** Pris dans une sélection de plusieurs tâches (Ctrl+clic, Maj+clic). */
  picked?: boolean;
  onSelect: (e: MouseEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
  onKeyNav: (e: KeyboardEvent<HTMLButtonElement>) => void;
  /** Clic droit (ou touche Menu) et raccourcis de son menu (useItemMenu). */
  menu: { onContextMenu: (e: MouseEvent) => void; onKeyDown: (e: KeyboardEvent) => void };
  /** Glisser la tâche vers une liste, une étiquette ou une autre section. */
  onDrag?: (e: PointerEvent<HTMLElement>) => void;
}

/** Ligne de tâche (maquette Tâches) : case ronde, titre, étiquettes, échéance, priorité, espace. */
export function TaskRow({ task, today, space, dateMode, selected, picked = false, onSelect, onToggle, onKeyNav, menu, onDrag }: TaskRowProps) {
  const done = task.doneAt !== null;
  const [popping, setPopping] = useState(false);
  const late = !done && task.dueDate !== null && task.dueDate < today;
  const subDone = task.subtasks.filter((s) => s.done).length;

  let dateText: string | null = null;
  // Pas encore commencée : le jour où elle le sera.
  const later = waiting(task, today);
  if (later) {
    dateText = tr("Dès {day}", { day: relativeDay(task.startDate!, today).replace(/^./, (c) => c.toLowerCase()) });
  } else if (task.dueDate && (dateMode === "relative" || late)) {
    dateText = relativeDay(task.dueDate, today) + (task.dueTime ? ` · ${task.dueTime}` : "");
  } else if (dateMode === "time" && task.dueTime) {
    dateText = task.dueTime;
  }

  return (
    <li
      className="task-row"
      data-selected={selected || undefined}
      data-picked={picked || undefined}
      data-done={done || undefined}
      style={task.color ? ({ "--row-color": task.color } as CSSProperties) : undefined}
      onPointerDown={onDrag}
      {...menu}
    >
      <button
        type="button"
        className="task-check"
        data-popping={popping || undefined}
        data-sans-son
        aria-label={done ? tr("Rouvrir la tâche « {title} »", { title: task.title }) : tr("Terminer la tâche « {title} »", { title: task.title })}
        onClick={() => {
          if (!done) {
            setPopping(true);
            window.setTimeout(() => setPopping(false), 600);
          }
          onToggle();
        }}
      >
        {done && <Icon d={ICONS.check} size={12} stroke={3.5} />}
      </button>
      <button
        type="button"
        className="task-main"
        aria-pressed={selected || picked}
        onClick={onSelect}
        onKeyDown={onKeyNav}
      >
        <span className="task-title">{task.title}</span>
        {task.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="pill task-tag">
            #{tag}
          </span>
        ))}
        {task.subtasks.length > 0 && (
          <span className="task-meta" aria-label={tr("{subDone} sous-tâches terminées sur {length}", { subDone, length: task.subtasks.length })}>
            {subDone}/{task.subtasks.length}
          </span>
        )}
        {task.notes && (
          <span className="task-meta" title={tr("Description")}>
            <Icon d={ICONS.notes} size={14} stroke={2.2} />
          </span>
        )}
        {task.reminder !== null && task.dueDate && !done && (
          <span
            className="task-repeat"
            title={tr("Rappel : {reminderLabel}", { reminderLabel: reminderLabel(task.reminder, task.dueTime !== null) })}
            role="img"
            aria-label={tr("Rappel : {reminderLabel}", { reminderLabel: reminderLabel(task.reminder, task.dueTime !== null) })}
          >
            <Icon d={ICONS.bell} size={14} stroke={2.2} />
          </span>
        )}
        {task.recurrence && (
          <span
            className="task-repeat"
            title={recurrenceLabel(task.recurrence)}
            role="img"
            aria-label={tr("Répétition : {recurrenceLabel}", { recurrenceLabel: recurrenceLabel(task.recurrence) })}
          >
            <Icon d={ICONS.repeat} size={14} stroke={2.2} />
          </span>
        )}
        {dateText && (
          <span className="task-meta" data-late={late || undefined} data-later={later || undefined} title={later && task.dueDate ? tr("Échéance : {relativeDay}", { relativeDay: relativeDay(task.dueDate, today) }) : undefined}>
            {dateText}
          </span>
        )}
        {task.priority > 0 && (
          <span
            className="task-flag"
            data-priority={task.priority}
            role="img"
            aria-label={tr("Priorité {x}", { x: PRIORITY_LABELS[task.priority].toLowerCase() })}
          >
            <Icon d={ICONS.flag} size={14} filled />
          </span>
        )}
        <span
          className="space-dot"
          style={{ "--space-color": space?.color ?? "transparent" } as CSSProperties}
          title={space ? tr("Espace {name}", { name: space.name }) : undefined}
          aria-hidden="true"
        />
      </button>
    </li>
  );
}
