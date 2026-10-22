/**
 * Sous-tâches d'une tâche, dans leur propre panneau : avancement, ajout, coche, renommage
 * (double-clic ou F2), ordre (glisser-déposer ou clic droit), suppression.
 */
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useItemMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { startDrag } from "../lib/dragDrop";
import { KEYS } from "../lib/itemKeys";
import type { Subtask, Task } from "./tasks";
import { useTasks } from "./TasksProvider";
import { tr } from "../i18n/i18n";

function newSubtaskId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function SubtaskRow({ subtask, index, count, onChange, onMove, onRemove, onDrag }: { subtask: Subtask; index: number; count: number; onChange: (s: Subtask) => void; onMove: (d: -1 | 1) => void; onRemove: () => void; onDrag: (e: PointerEvent<HTMLElement>) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(subtask.title);
  const itemMenu = useItemMenu();
  const menu = itemMenu(() => [
    { label: subtask.done ? tr("Rouvrir") : tr("Terminer"), icon: ICONS.check, run: () => onChange({ ...subtask, done: !subtask.done }) },
    { label: tr("Renommer"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setEditing(true) },
    "separator",
    { label: tr("Monter"), icon: ICONS.arrowUp, disabled: index === 0, run: () => onMove(-1) },
    { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: index === count - 1, run: () => onMove(1) },
    "separator",
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: onRemove },
  ]);
  const commit = () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== subtask.title) onChange({ ...subtask, title: t.slice(0, 300) });
    else setTitle(subtask.title);
  };
  return (
    <li
      className="subtask-card"
      data-done={subtask.done || undefined}
      data-sort-id={subtask.id}
      tabIndex={editing ? -1 : 0}
      onPointerDown={editing ? undefined : onDrag}
      onContextMenu={menu.onContextMenu}
      onKeyDown={editing ? undefined : menu.onKeyDown}
    >
      <button
        type="button"
        className="subtask-check"
        role="checkbox"
        aria-checked={subtask.done}
        aria-label={subtask.title}
        onClick={() => onChange({ ...subtask, done: !subtask.done })}
      >
        {subtask.done && <Icon d={ICONS.check} size={11} stroke={4} />}
      </button>
      {editing ? (
        <input
          className="subtask-edit"
          value={title}
          maxLength={300}
          autoFocus
          aria-label={tr("Nom de la sous-tâche")}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              e.stopPropagation();
              setTitle(subtask.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span className="subtask-card-title" onDoubleClick={() => setEditing(true)}>
          {subtask.title}
        </span>
      )}
      <button type="button" className="subtask-remove" aria-label={tr("Supprimer la sous-tâche « {title} »", { title: subtask.title })} onClick={onRemove}>
        <Icon d={ICONS.close} size={11} stroke={2.6} />
      </button>
    </li>
  );
}

interface SubtasksPanelProps {
  task: Task;
  /** Panneau à part (projets) ; sinon une carte dans le détail de la tâche. */
  separate?: boolean;
}

export function SubtasksPanel({ task, separate }: SubtasksPanelProps) {
  const { update } = useTasks();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const list = task.subtasks;
  const done = list.filter((s) => s.done).length;
  const percent = list.length ? Math.round((100 * done) / list.length) : 0;
  const save = (subtasks: Subtask[]) => void update(task, { subtasks });
  const add = () => {
    const t = text.trim();
    if (!t || list.length >= 100) return;
    save([...list, { id: newSubtaskId(), title: t.slice(0, 300), done: false }]);
    setText("");
    inputRef.current?.focus();
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    save(next);
  };
  return (
    <section
      className={separate ? "subtasks-panel subtasks-panel--separate glass" : "subtasks-panel"}
      style={task.color ? ({ "--row-color": task.color } as CSSProperties) : undefined}
      aria-label={tr("Sous-tâches")}
    >
      <header className="subtasks-head">
        <Icon d={ICONS.listCheck} size={16} stroke={2.2} />
        <h3 className="subtasks-title">{tr("Sous-tâches")}</h3>
        {list.length > 0 && (
          <span className="subtasks-count">
            {tr("{done} sur {total}", { done, total: list.length })}
          </span>
        )}
      </header>
      {list.length > 0 && (
        <div className="subtasks-progress" role="progressbar" aria-label={tr("Sous-tâches terminées")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="subtasks-progress-fill" style={{ width: `${percent}%` }} />
        </div>
      )}
      <div className="subtask-add">
        <Icon d={ICONS.plus} size={14} stroke={2.6} />
        <input
          ref={inputRef}
          className="subtask-input"
          aria-label={tr("Ajouter une sous-tâche")}
          placeholder={tr("Ajouter une sous-tâche")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
      </div>
      {list.length === 0 ? (
        <p className="subtasks-empty">{tr("Aucune sous-tâche.")}</p>
      ) : (
        <ul className="subtask-cards" data-sort={`sous-taches:${task.id}`}>
          {list.map((s, i) => (
            <SubtaskRow
              key={s.id}
              subtask={s}
              index={i}
              count={list.length}
              onChange={(next) => save(list.map((x) => (x.id === s.id ? next : x)))}
              onMove={(d) => move(i, d)}
              onRemove={() => save(list.filter((x) => x.id !== s.id))}
              onDrag={(e) =>
                startDrag(e, { kind: "sous-tache", ids: [s.id], label: s.title, color: task.color }, {
                  sort: { group: `sous-taches:${task.id}`, onSort: (ids) => save(ids.map((id) => list.find((x) => x.id === id)!).filter(Boolean)) },
                })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
