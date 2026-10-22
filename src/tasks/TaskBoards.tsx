/**
 * Vues Kanban, Matrice et Chronologie de l'écran Tâches (cahier des charges § 4.2). Les cartes
 * se glissent d'une colonne ou d'un quadrant à l'autre ; un clic ouvre la tâche à droite.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useItemMenu, type MenuEntry } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Segmented } from "../components/Segmented";
import { readPref, writePref } from "../lib/storage";
import { useSpaces } from "../spaces/SpacesProvider";
import { relativeDay } from "./day";
import { useTaskMenu } from "./taskMenu";
import { PRIORITY_LABELS, type Task, type TaskInput } from "./tasks";
import { useTasks } from "./TasksProvider";
import { isKanbanGrouping, KANBAN_GROUPINGS, kanbanColumns, kanbanMove, QUADRANTS, quadrantMove, quadrantOf, timeline, type KanbanGrouping, type Quadrant } from "./taskViews";
import { tr } from "../i18n/i18n";

interface ViewProps {
  tasks: readonly Task[];
  selectedId: string | null;
  onOpen: (task: Task) => void;
}

/** Glisser une carte vers une zone marquée « data-drop ». */
function useCardDrag(onDrop: (task: Task, target: string) => void) {
  const [drag, setDrag] = useState<{ task: Task; x: number; y: number; over: string | null } | null>(null);
  const pending = useRef<{ task: Task; x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  useEffect(() => {
    const targetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null;
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!dragged.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      dragged.current = true;
      setDrag({ task: p.task, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY) });
    };
    const onUp = (e: PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      if (p && dragged.current) {
        const target = targetAt(e.clientX, e.clientY);
        if (target) drop.current(p.task, target);
        // Le clic qui suit un glisser n'ouvre pas la tâche.
        window.setTimeout(() => (dragged.current = false), 0);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);
  const start = (task: Task) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input")) return;
    pending.current = { task, x: e.clientX, y: e.clientY };
  };
  const ghost = drag
    ? createPortal(
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }} aria-hidden="true">
          {drag.task.title}
        </div>,
        document.body,
      )
    : null;
  return { over: drag?.over ?? null, dragging: drag !== null, start, wasDragged: () => dragged.current, ghost };
}

/** Carte d'une tâche : case à cocher, titre, échéance, priorité, espace. */
function TaskCard({ task, selected, extra, onOpen, onPointerDown }: { task: Task; selected: boolean; extra: MenuEntry[]; onOpen: () => void; onPointerDown: (e: ReactPointerEvent) => void }) {
  const { today, setDone } = useTasks();
  const { spaces } = useSpaces();
  const taskMenu = useTaskMenu();
  const itemMenu = useItemMenu();
  const menu = itemMenu(() => taskMenu(task, { open: onOpen, extra }));
  const done = task.doneAt !== null;
  const late = !done && task.dueDate !== null && task.dueDate < today;
  const space = spaces.find((s) => s.id === task.spaceId);
  return (
    <li
      className="board-card task-card"
      data-done={done || undefined}
      data-selected={selected || undefined}
      style={task.color ? ({ "--row-color": task.color } as CSSProperties) : undefined}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
        menu.onKeyDown(e);
      }}
      onContextMenu={menu.onContextMenu}
    >
      <span className="task-card-head">
        <button
          type="button"
          className="task-check"
          data-sans-son
          aria-label={done ? tr("Rouvrir la tâche « {title} »", { title: task.title }) : tr("Terminer la tâche « {title} »", { title: task.title })}
          onClick={(e) => {
            e.stopPropagation();
            void setDone(task, !done);
          }}
        >
          {done && <Icon d={ICONS.check} size={12} stroke={3.5} />}
        </button>
        <span className="board-card-title">{task.title}</span>
      </span>
      {(task.dueDate || task.priority > 0 || space) && (
        <span className="board-card-meta">
          {task.dueDate && (
            <span className="task-meta" data-late={late || undefined}>
              {relativeDay(task.dueDate, today)}
              {task.dueTime ? ` · ${task.dueTime}` : ""}
            </span>
          )}
          {task.priority > 0 && (
            <span className="task-flag" data-priority={task.priority} role="img" aria-label={tr("Priorité {x}", { x: PRIORITY_LABELS[task.priority].toLowerCase() })}>
              <Icon d={ICONS.flag} size={13} filled />
            </span>
          )}
          {space && <span className="space-dot" style={{ "--space-color": space.color } as CSSProperties} title={space.name} aria-label={space.name} />}
        </span>
      )}
    </li>
  );
}

/** Applique un changement de colonne ou de quadrant. */
function useApply() {
  const { update, setDone } = useTasks();
  return async (task: Task, done: boolean | undefined, changes: Partial<TaskInput> | undefined) => {
    if (done !== undefined) await setDone(task, done);
    if (changes) await update(task, changes);
  };
}

// ——— Kanban ———

export function KanbanView({ tasks, selectedId, onOpen }: ViewProps) {
  const { spaces } = useSpaces();
  const apply = useApply();
  const [grouping, setGrouping] = useState<KanbanGrouping>(() => readPref("kanbanTaches", "avancement", isKanbanGrouping));
  const columns = kanbanColumns(tasks, grouping, spaces, Math.floor(Date.now() / 1000));
  const move = (task: Task, columnId: string) => {
    const m = kanbanMove(task, columnId);
    if (m) void apply(task, "done" in m ? m.done : undefined, m.changes);
  };
  const drag = useCardDrag(move);
  return (
    <section className="task-view glass" aria-label={tr("Kanban")}>
      <div className="task-view-bar">
        <span className="task-view-label">{tr("Colonnes")}</span>
        <Segmented
          value={grouping}
          options={KANBAN_GROUPINGS.map((g) => ({ value: g.id, label: g.label }))}
          label={tr("Colonnes")}
          onChange={(g) => {
            setGrouping(g);
            writePref("kanbanTaches", g);
          }}
        />
        <span className="task-view-hint">{tr("Glisser une carte d'une colonne à l'autre.")}</span>
      </div>
      <div className="board task-board" data-dragging={drag.dragging || undefined} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(200px, 1fr))` }}>
        {columns.map((col) => (
          <section
            key={col.id}
            className="board-column"
            data-drop={col.id}
            data-over={drag.over === col.id || undefined}
            aria-label={col.label}
            style={col.color ? ({ "--row-color": col.color } as CSSProperties) : undefined}
          >
            <h3 className="board-column-title">
              {col.label}
              <span className="board-count">{col.tasks.length}</span>
            </h3>
            <ul className="board-cards">
              {col.tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  selected={t.id === selectedId}
                  extra={columns.filter((c) => c.id !== col.id).map((c) => ({ label: tr("Vers « {label} »", { label: c.label }), icon: ICONS.arrowRight, run: () => move(t, c.id) }))}
                  onOpen={() => !drag.wasDragged() && onOpen(t)}
                  onPointerDown={drag.start(t)}
                />
              ))}
            </ul>
            {col.tasks.length === 0 && <p className="board-empty">{tr("Glisser une tâche ici.")}</p>}
          </section>
        ))}
      </div>
      {drag.ghost}
    </section>
  );
}

// ——— Matrice ———

export function MatrixView({ tasks, selectedId, onOpen }: ViewProps) {
  const { today } = useTasks();
  const apply = useApply();
  const open = tasks.filter((t) => t.doneAt === null);
  const move = (task: Task, target: string) => {
    const changes = quadrantMove(task, target as Quadrant, today);
    if (changes) void apply(task, undefined, changes);
  };
  const drag = useCardDrag(move);
  return (
    <section className="task-view glass" aria-label={tr("Matrice")}>
      <div className="task-view-bar">
        <span className="task-view-hint">{tr("Urgent : échéance dans les deux jours ou dépassée. Important : priorité moyenne ou haute. Glisser une carte change sa priorité ou son échéance.")}</span>
      </div>
      <div className="matrix" data-dragging={drag.dragging || undefined}>
        <span className="matrix-axis matrix-axis--top" aria-hidden="true">
          <span>{tr("Urgent")}</span>
          <span>{tr("Pas urgent")}</span>
        </span>
        <span className="matrix-axis matrix-axis--side" aria-hidden="true">
          <span>{tr("Important")}</span>
          <span>{tr("Peu important")}</span>
        </span>
        {(["maintenant", "planifier", "expedier", "reconsiderer"] as Quadrant[]).map((id) => {
          const q = QUADRANTS.find((x) => x.id === id)!;
          const list = open.filter((t) => quadrantOf(t, today) === id);
          return (
            <section key={id} className="matrix-cell board-column" data-quadrant={id} data-drop={id} data-over={drag.over === id || undefined} aria-label={tr("{label} : {value}", { label: q.label, value: q.hint })}>
              <h3 className="board-column-title">
                <span className="matrix-title">
                  {q.label}
                  <small>{q.hint}</small>
                </span>
                <span className="board-count">{list.length}</span>
              </h3>
              <ul className="board-cards">
                {list.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    selected={t.id === selectedId}
                    extra={QUADRANTS.filter((x) => x.id !== id).map((x) => ({ label: tr("Vers « {label} »", { label: x.label }), icon: ICONS.arrowRight, run: () => move(t, x.id) }))}
                    onOpen={() => !drag.wasDragged() && onOpen(t)}
                    onPointerDown={drag.start(t)}
                  />
                ))}
              </ul>
              {list.length === 0 && <p className="board-empty">{tr("Aucune tâche.")}</p>}
            </section>
          );
        })}
      </div>
      {drag.ghost}
    </section>
  );
}

// ——— Chronologie ———

export function TimelineView({ tasks, selectedId, onOpen, onShowUndated }: ViewProps & { onShowUndated: () => void }) {
  const { today, setDone } = useTasks();
  const { spaces } = useSpaces();
  const taskMenu = useTaskMenu();
  const itemMenu = useItemMenu();
  const groups = timeline(tasks, today);
  const undated = tasks.filter((t) => t.doneAt === null && t.dueDate === null).length;
  return (
    <section className="task-view glass" aria-label={tr("Chronologie")}>
      <div className="task-scroll timeline-scroll">
        {groups.length === 0 && <p className="tasks-empty">{tr("Aucune tâche datée à venir.")}</p>}
        <ol className="timeline">
          {groups.map((g) => (
            <li key={g.key} className="timeline-group" data-tone={g.tone}>
              <span className="timeline-dot" aria-hidden="true" />
              <h3 className="timeline-label">
                {g.label}
                <span className="task-section-sub"> · {g.tasks.length}</span>
              </h3>
              <ul className="timeline-tasks">
                {g.tasks.map((t) => {
                  const space = spaces.find((s) => s.id === t.spaceId);
                  const menu = itemMenu(() => taskMenu(t, { open: () => onOpen(t) }));
                  return (
                    <li key={t.id} className="timeline-task" data-selected={t.id === selectedId || undefined} style={t.color ? ({ "--row-color": t.color } as CSSProperties) : undefined} {...menu}>
                      <button type="button" className="task-check" data-sans-son aria-label={tr("Terminer la tâche « {title} »", { title: t.title })} onClick={() => void setDone(t, true)} />
                      <button type="button" className="timeline-title" onClick={() => onOpen(t)}>
                        {t.title}
                      </button>
                      {g.key.startsWith("s:") || g.key === "retard" ? <span className="task-meta" data-late={g.key === "retard" || undefined}>{relativeDay(t.dueDate!, today)}</span> : null}
                      {t.dueTime && <span className="pill">{t.dueTime}</span>}
                      {t.priority > 0 && (
                        <span className="task-flag" data-priority={t.priority} role="img" aria-label={tr("Priorité {x}", { x: PRIORITY_LABELS[t.priority].toLowerCase() })}>
                          <Icon d={ICONS.flag} size={13} filled />
                        </span>
                      )}
                      {space && <span className="space-dot" style={{ "--space-color": space.color } as CSSProperties} title={space.name} aria-label={space.name} />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
        {undated > 0 && (
          <p className="timeline-undated">
            {undated > 1 ? tr("{undated} tâches sans date ne figurent pas sur la chronologie.", { undated }) : tr("1 tâche sans date ne figure pas sur la chronologie.")}{" "}
            <button type="button" className="link-btn" onClick={onShowUndated}>
              {tr("Afficher")}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
