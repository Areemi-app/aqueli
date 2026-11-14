/**
 * Sous-tâches d'une tâche, dans leur propre panneau : avancement, ajout, coche, renommage
 * (double-clic ou F2), ordre (glisser-déposer ou clic droit), suppression. Elles s'organisent sur
 * plusieurs niveaux (src/tasks/subtaskTree.ts) : Alt+Maj+→ range une sous-tâche sous celle du
 * dessus, Alt+Maj+← la remonte, et une branche se replie d'un clic.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useItemMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { startDrag } from "../lib/dragDrop";
import { KEYS } from "../lib/itemKeys";
import {
  canIndent,
  canMove,
  canOutdent,
  hasChildren,
  hiddenByFold,
  indent,
  insertChild,
  levelOf,
  MAX_SUBTASK_LEVEL,
  move,
  outdent,
  removeBranch,
  reorderBranch,
  setDone,
} from "./subtaskTree";
import type { Subtask, Task } from "./tasks";
import { useTasks } from "./TasksProvider";
import { readingKey, tr } from "../i18n/i18n";

function newSubtaskId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Alt+Maj+→ et Alt+Maj+← : le retrait, comme dans Word. */
const INDENT_KEYS = () => tr("Alt+Maj+→");
const OUTDENT_KEYS = () => tr("Alt+Maj+←");

interface RowProps {
  list: readonly Subtask[];
  index: number;
  editing: boolean;
  folded: boolean;
  /** Une branche existe dans la liste : chaque ligne garde la place de la flèche, pour aligner les cases. */
  tree: boolean;
  onEditing: (on: boolean) => void;
  onFold: () => void;
  onSave: (list: Subtask[]) => void;
  onDrag: (e: PointerEvent<HTMLElement>) => void;
}

function SubtaskRow({ list, index, editing, folded, tree, onEditing, onFold, onSave, onDrag }: RowProps) {
  const subtask = list[index]!;
  const [title, setTitle] = useState(subtask.title);
  const itemMenu = useItemMenu();
  const level = levelOf(subtask);
  const parent = hasChildren(list, index);
  const toggle = () => onSave(setDone(list, index, !subtask.done));
  const addInside = () => {
    const child = { id: newSubtaskId(), title: tr("Nouvelle sous-tâche"), done: false };
    onSave(insertChild(list, index, child));
    return child.id;
  };
  const menu = itemMenu(() => [
    { label: subtask.done ? tr("Rouvrir") : tr("Terminer"), icon: ICONS.check, run: toggle },
    { label: tr("Renommer"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => onEditing(true) },
    { label: tr("Ajouter une sous-tâche dedans"), icon: ICONS.plus, disabled: level >= MAX_SUBTASK_LEVEL, run: addInside },
    ...(parent ? [{ label: folded ? tr("Déplier") : tr("Replier"), icon: ICONS.chevronDown, run: onFold }] : []),
    "separator",
    { label: tr("Augmenter le retrait"), icon: ICONS.arrowRight, shortcut: INDENT_KEYS(), disabled: !canIndent(list, index), run: () => onSave(indent(list, index)) },
    { label: tr("Diminuer le retrait"), icon: ICONS.arrowLeft, shortcut: OUTDENT_KEYS(), disabled: !canOutdent(list, index), run: () => onSave(outdent(list, index)) },
    { label: tr("Monter"), icon: ICONS.arrowUp, disabled: !canMove(list, index, -1), run: () => onSave(move(list, index, -1)) },
    { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: !canMove(list, index, 1), run: () => onSave(move(list, index, 1)) },
    "separator",
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => onSave(removeBranch(list, index)) },
  ]);
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && (readingKey(e.key) === "ArrowRight" || readingKey(e.key) === "ArrowLeft") && e.target === e.currentTarget) {
      e.preventDefault();
      if (readingKey(e.key) === "ArrowRight" && canIndent(list, index)) onSave(indent(list, index));
      if (readingKey(e.key) === "ArrowLeft" && canOutdent(list, index)) onSave(outdent(list, index));
      return;
    }
    menu.onKeyDown(e);
  };
  const commit = () => {
    onEditing(false);
    const t = title.trim();
    if (t && t !== subtask.title) onSave(list.map((s, k) => (k === index ? { ...s, title: t.slice(0, 300) } : s)));
    else setTitle(subtask.title);
  };
  return (
    <li
      className="subtask-card"
      data-done={subtask.done || undefined}
      data-level={level || undefined}
      style={{ "--subtask-level": level } as CSSProperties}
      data-sort-id={subtask.id}
      aria-level={level + 1}
      tabIndex={editing ? -1 : 0}
      onPointerDown={editing ? undefined : onDrag}
      onContextMenu={menu.onContextMenu}
      onKeyDown={editing ? undefined : onKeyDown}
    >
      {parent ? (
        <button
          type="button"
          className="subtask-fold"
          aria-expanded={!folded}
          aria-label={folded ? tr("Déplier « {title} »", { title: subtask.title }) : tr("Replier « {title} »", { title: subtask.title })}
          onClick={onFold}
        >
          <Icon d={ICONS.chevronDown} size={11} stroke={2.8} />
        </button>
      ) : (
        tree && <span className="subtask-fold-space" aria-hidden="true" />
      )}
      <button type="button" className="subtask-check" role="checkbox" aria-checked={subtask.done} aria-label={subtask.title} onClick={toggle}>
        {subtask.done && <Icon d={ICONS.check} size={11} stroke={4} />}
      </button>
      {editing ? (
        <input
          className="subtask-edit"
          value={title}
          maxLength={300}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          aria-label={tr("Nom de la sous-tâche")}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              e.stopPropagation();
              setTitle(subtask.title);
              onEditing(false);
            }
          }}
        />
      ) : (
        <span className="subtask-card-title" onDoubleClick={() => onEditing(true)}>
          {subtask.title}
        </span>
      )}
      <button type="button" className="subtask-remove" aria-label={tr("Supprimer la sous-tâche « {title} »", { title: subtask.title })} onClick={() => onSave(removeBranch(list, index))}>
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const list = task.subtasks;
  const hidden = hiddenByFold(list, folded);
  const tree = list.some((s) => levelOf(s) > 0);
  const done = list.filter((s) => s.done).length;
  const percent = list.length ? Math.round((100 * done) / list.length) : 0;
  const save = (subtasks: Subtask[]) => {
    // Une sous-tâche ajoutée dedans s'ouvre en renommage.
    const added = subtasks.find((s) => !list.some((x) => x.id === s.id));
    if (added) setEditingId(added.id);
    void update(task, { subtasks });
  };
  const add = () => {
    const t = text.trim();
    if (!t || list.length >= 100) return;
    void update(task, { subtasks: [...list, { id: newSubtaskId(), title: t.slice(0, 300), done: false }] });
    setText("");
    inputRef.current?.focus();
  };
  const toggleFold = (id: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <section
      className={separate ? "subtasks-panel subtasks-panel--separate glass" : "subtasks-panel"}
      style={task.color ? ({ "--row-color": task.color } as CSSProperties) : undefined}
      aria-label={tr("Sous-tâches")}
    >
      <header className="subtasks-head">
        <Icon d={ICONS.listCheck} size={16} stroke={2.2} />
        <h3 className="subtasks-title">{tr("Sous-tâches")}</h3>
        {list.length > 0 && <span className="subtasks-count">{tr("{done} sur {total}", { done, total: list.length })}</span>}
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
          {list.map((s, i) =>
            hidden.has(s.id) ? null : (
              <SubtaskRow
                key={s.id}
                list={list}
                index={i}
                editing={editingId === s.id}
                folded={folded.has(s.id)}
                tree={tree}
                onEditing={(on) => setEditingId(on ? s.id : null)}
                onFold={() => toggleFold(s.id)}
                onSave={save}
                onDrag={(e) =>
                  startDrag(e, { kind: "sous-tache", ids: [s.id], label: s.title, color: task.color }, {
                    sort: { group: `sous-taches:${task.id}`, onSort: (ids) => save(reorderBranch(list, s.id, ids)) },
                  })
                }
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
}
