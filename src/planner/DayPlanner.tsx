import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { formatLongDate } from "../lib/dates";
import { autoScroll, trackDrag } from "../lib/pointerDrag";
import { useNow } from "../lib/useNow";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, relativeDay } from "../tasks/day";
import type { Task } from "../tasks/tasks";
import { useTasks } from "../tasks/TasksProvider";
import { useTaskMenu } from "../tasks/taskMenu";
import { useContextMenu } from "../components/ContextMenu";
import { useEvents } from "../calendar/EventsProvider";
import { itemsBetween, timedSegments } from "../calendar/items";
import { inkOn } from "../lib/colorInk";
import { withLanes } from "../lib/lanes";
import {
  blocksFor,
  candidates,
  DAY,
  DAY_END,
  DAY_START,
  durationOf,
  formatDuration,
  nextFreeStart,
  plannedMinutes,
  snap,
  STEP,
  toTime,
  type Block,
} from "./plan";
import { tr } from "../i18n/i18n";

/** Hauteur d'une heure dans l'agenda, en pixels. */
const HOUR_PX = 64;
const PX = HOUR_PX / 60;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface DragState {
  kind: "place" | "move" | "resize";
  task: Task;
  x: number;
  y: number;
  start: number;
  duration: number;
  /** Le pointeur est au-dessus de l'agenda. */
  over: boolean;
}

/** Bloc court : titre et heure sur une ligne (moins de 45 min), titre seul (moins de 30 min). */
const blockSize = (duration: number) => (duration < 30 ? "xs" : duration < 45 ? "sm" : undefined);

/** Heure de fin lisible (minuit s'écrit 00:00). */
const endTime = (end: number) => toTime(end % DAY);

const clampStart = (start: number, duration: number) => Math.min(Math.max(start, 0), DAY - duration);

function blockStyle(start: number, duration: number, lane: number, lanes: number, color: string | null): CSSProperties {
  return {
    top: start * PX + 1,
    height: Math.max(duration * PX - 2, 14),
    left: `calc(var(--agenda-gutter) + (100% - var(--agenda-gutter)) * ${lane / lanes})`,
    width: `calc((100% - var(--agenda-gutter)) / ${lanes} - 4px)`,
    ...(color ? { "--row-color": color } : {}),
  } as CSSProperties;
}

/** « Planifier ma journée » : tâches en retard et du jour, à glisser sur les heures de la journée. */
export function DayPlanner({ onClose }: { onClose: () => void }) {
  const { tasks, visible, today, update, setDone } = useTasks();
  const openMenu = useContextMenu();
  const taskMenu = useTaskMenu();
  const { spaces, filter } = useSpaces();
  const { events } = useEvents();
  const now = useNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const { late, today: dayTasks } = candidates(visible, today);
  // Rendez-vous du jour : dans l'agenda, à côté des tâches, sans se déplacer ici.
  const eventLayers = { events, tasks: [], spaces, hiddenSpaces: [], showTasks: false };
  const dayEvents = itemsBetween({ ...eventLayers, filter }, today, today);
  const allDayEvents = dayEvents.filter((i) => i.start === null || i.startDate < today);
  const laid = withLanes([
    ...blocksFor(visible, today).map((b) => ({ start: b.start, end: b.end, task: b.task, item: null })),
    ...timedSegments(dayEvents, today).map((s) => ({ start: s.start, end: s.end, task: null, item: s.item })),
  ]);
  const blocks: Block[] = laid.flatMap((l) => (l.task ? [{ task: l.task, start: l.start, end: l.end, lane: l.lane, lanes: l.lanes }] : []));
  const eventBlocks = laid.flatMap((l) => (l.item ? [{ ...l, item: l.item }] : []));
  // Occupé : les tâches et les rendez-vous de tous les espaces.
  const busy = () => [
    ...blocksFor(tasks, today),
    ...timedSegments(itemsBetween({ ...eventLayers, filter: "tous" }, today, today), today),
  ];
  const [drag, setDrag] = useState<DragState | null>(null);
  const [status, setStatus] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const agendaRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const agendaId = useId();
  const helpId = useId();

  // À l'ouverture, l'agenda montre l'heure actuelle (au plus tôt 7 h) ou la première tâche.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const first = Math.min(DAY, ...laid.map((l) => l.start));
    const focus = Math.min(first, Math.max(DAY_START, nowMin - 60));
    scroller.scrollTop = Math.max(0, focus - 30) * PX;
    // Une seule fois, à l'ouverture : ensuite, l'agenda reste où la personne l'a mis.
  }, []);

  const minuteAt = (y: number) => {
    const rect = agendaRef.current?.getBoundingClientRect();
    return rect ? (y - rect.top) / PX : 0;
  };
  const isOver = (x: number, y: number) => {
    const r = scrollerRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const scrollNear = (y: number) => {
    if (scrollerRef.current) autoScroll(scrollerRef.current, y);
  };

  const placeAt = (task: Task, start: number) => {
    void update(task, { dueDate: today, dueTime: toTime(start) });
    setStatus(tr("« {title} » placée à {toTime}.", { title: task.title, toTime: toTime(start) }));
  };
  const unplace = (task: Task) => {
    void update(task, { dueTime: null });
    setStatus(tr("« {title} » retirée de l'agenda.", { title: task.title }));
  };
  const placeNext = (task: Task) => {
    const start = nextFreeStart(busy(), Math.max(nowMin, DAY_START), durationOf(task));
    if (start === null) setStatus(tr("Aucun créneau libre aujourd'hui."));
    else placeAt(task, start);
  };
  const postpone = (task: Task) => {
    void update(task, { dueDate: addDays(today, 1) });
    setStatus(tr("« {title} » reportée à demain.", { title: task.title }));
  };

  const startPlace = (e: ReactPointerEvent, task: Task) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const duration = durationOf(task);
    // Le pointeur tient la tâche près de son bord haut.
    const startAt = (y: number) => clampStart(snap(minuteAt(y) - STEP / 2), duration);
    trackDrag(e, {
      onMove: (x, y) => {
        const over = isOver(x, y);
        if (over) scrollNear(y);
        setDrag({ kind: "place", task, x, y, start: startAt(y), duration, over });
      },
      onEnd: (x, y, cancelled) => {
        setDrag(null);
        if (!cancelled && isOver(x, y)) placeAt(task, startAt(y));
      },
    });
  };

  const startMove = (e: ReactPointerEvent, block: Block) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const offset = minuteAt(e.clientY) - block.start;
    const duration = block.end - block.start;
    const startAt = (y: number) => clampStart(snap(minuteAt(y) - offset), duration);
    trackDrag(e, {
      onMove: (x, y) => {
        scrollNear(y);
        setDrag({ kind: "move", task: block.task, x, y, start: startAt(y), duration, over: true });
      },
      onEnd: (_x, y, cancelled) => {
        setDrag(null);
        const start = startAt(y);
        if (!cancelled && start !== block.start) placeAt(block.task, start);
      },
    });
  };

  const startResize = (e: ReactPointerEvent, block: Block) => {
    e.stopPropagation();
    const durationAt = (y: number) => Math.min(Math.max(snap(minuteAt(y)) - block.start, STEP), DAY - block.start);
    trackDrag(e, {
      onMove: (x, y) => {
        scrollNear(y);
        setDrag({ kind: "resize", task: block.task, x, y, start: block.start, duration: durationAt(y), over: true });
      },
      onEnd: (_x, y, cancelled) => {
        setDrag(null);
        const duration = durationAt(y);
        if (cancelled || duration === block.end - block.start) return;
        void update(block.task, { estimate: duration });
        setStatus(tr("Durée de « {title} » : {formatDuration}.", { title: block.task.title, formatDuration: formatDuration(duration) }));
      },
    });
  };

  const onBlockKey = (e: KeyboardEvent, block: Block) => {
    const duration = block.end - block.start;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const delta = e.key === "ArrowUp" ? -STEP : STEP;
      if (e.shiftKey) {
        const next = Math.min(Math.max(duration + delta, STEP), DAY - block.start);
        if (next !== duration) void update(block.task, { estimate: next });
      } else {
        const start = clampStart(block.start + delta, duration);
        if (start !== block.start) placeAt(block.task, start);
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      unplace(block.task);
    }
  };

  const planned = plannedMinutes(blocks);
  const toPlan = late.length + dayTasks.length;

  const row = (task: Task, isLate: boolean) => {
    const space = spaces.find((s) => s.id === task.spaceId);
    return (
      <li
        key={task.id}
        className="plan-row"
        data-dragging={drag?.kind === "place" && drag.task.id === task.id ? "" : undefined}
        style={task.color ? ({ "--row-color": task.color } as CSSProperties) : undefined}
        onPointerDown={(e) => startPlace(e, task)}
        onContextMenu={(e) =>
          openMenu(
            e,
            taskMenu(task, {
              extra: [{ label: tr("Placer au prochain créneau libre"), icon: ICONS.clock, run: () => placeNext(task) }],
            }),
          )
        }
      >
        <button
          type="button"
          className="task-check"
          data-sans-son
          aria-label={tr("Terminer la tâche « {title} »", { title: task.title })}
          onClick={() => void setDone(task, true)}
        />
        <span className="plan-row-title">{task.title}</span>
        {isLate && task.dueDate && (
          <span className="task-meta" data-late>
            {relativeDay(task.dueDate, today)}
          </span>
        )}
        <span className="plan-row-duration">{formatDuration(durationOf(task))}</span>
        <span
          className="space-dot"
          style={{ "--space-color": space?.color ?? "transparent" } as CSSProperties}
          aria-hidden="true"
        />
        <button
          type="button"
          className="icon-btn icon-btn--sm plan-row-action"
          aria-label={tr("Placer « {title} » au prochain créneau libre", { title: task.title })}
          title={tr("Placer au prochain créneau libre")}
          onClick={() => placeNext(task)}
        >
          <Icon d={ICONS.clock} size={15} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--sm plan-row-action"
          aria-label={tr("Reporter « {title} » à demain", { title: task.title })}
          title={tr("Reporter à demain")}
          onClick={() => postpone(task)}
        >
          <Icon d={ICONS.arrowRight} size={15} />
        </button>
      </li>
    );
  };

  return (
    <Dialog title={tr("Planifier ma journée")} onClose={onClose} className="dialog--wide">
      <div className="planner">
        <section className="planner-side" aria-labelledby={listId}>
          <h3 id={listId} className="planner-heading">
            {tr("À planifier")}
          </h3>
          <div className="planner-list">
            {toPlan === 0 ? (
              <p className="planner-empty">{tr("Aucune tâche à planifier.")}</p>
            ) : (
              <>
                {late.length > 0 && (
                  <>
                    <h4 className="planner-group">{tr("En retard · ")}{late.length}</h4>
                    <ul className="plan-rows">{late.map((t) => row(t, true))}</ul>
                  </>
                )}
                {dayTasks.length > 0 && (
                  <>
                    <h4 className="planner-group">{tr("Aujourd'hui · ")}{dayTasks.length}</h4>
                    <ul className="plan-rows">{dayTasks.map((t) => row(t, false))}</ul>
                  </>
                )}
              </>
            )}
          </div>
          {toPlan > 0 && <p className="planner-hint">{tr("Glissez une tâche sur une heure de l'agenda.")}</p>}
        </section>

        <section className="planner-agenda" aria-labelledby={agendaId}>
          <h3 id={agendaId} className="planner-heading">
            {formatLongDate(now)}
          </h3>
          {allDayEvents.length > 0 && (
            <ul className="planner-allday" aria-label={tr("Rendez-vous de la journée")}>
              {allDayEvents.map((i) => (
                <li
                  key={i.key}
                  className="planner-allday-chip"
                  style={i.color ? ({ "--row-color": i.color } as CSSProperties) : undefined}
                >
                  {i.title}
                </li>
              ))}
            </ul>
          )}
          <p id={helpId} className="sr-only">
            {tr("Flèches haut et bas : déplacer d'un quart d'heure. Maj et flèches : modifier la durée. Suppr : retirer de l'agenda.")}
          </p>
          <div className="agenda-scroll" ref={scrollerRef} data-drop={drag?.kind === "place" && drag.over ? "" : undefined}>
            <div className="agenda" ref={agendaRef} style={{ height: 24 * HOUR_PX }}>
              <div className="agenda-off" style={{ top: 0, height: DAY_START * PX }} />
              <div className="agenda-off" style={{ top: DAY_END * PX, height: (DAY - DAY_END) * PX }} />
              {HOURS.map((h) => (
                <div key={h} className="agenda-hour" style={{ top: h * HOUR_PX }}>
                  <span className="agenda-hour-label">{`${String(h).padStart(2, "0")}:00`}</span>
                </div>
              ))}
              <div className="agenda-now" style={{ top: nowMin * PX }} aria-hidden="true" />
              {eventBlocks.map((b) => (
                <div
                  key={b.item.key}
                  className="agenda-event"
                  data-ink={b.item.color ? inkOn(b.item.color) : "light"}
                  data-default={b.item.color === null || undefined}
                  data-size={blockSize(b.end - b.start)}
                  style={blockStyle(b.start, b.end - b.start, b.lane, b.lanes, b.item.color)}
                  title={tr("Rendez-vous")}
                >
                  <span className="agenda-block-title">{b.item.title}</span>
                  <span className="agenda-block-time">
                    {tr("Rendez-vous · ")}{toTime(b.start)} – {endTime(b.end)}
                  </span>
                </div>
              ))}
              {blocks.map((b) => {
                const resizing = drag?.kind === "resize" && drag.task.id === b.task.id;
                const end = resizing ? b.start + drag.duration : b.end;
                return (
                  <div
                    key={b.task.id}
                    className="agenda-block"
                    data-dragging={drag?.kind === "move" && drag.task.id === b.task.id ? "" : undefined}
                    data-size={blockSize(end - b.start)}
                    style={blockStyle(b.start, end - b.start, b.lane, b.lanes, b.task.color)}
                    tabIndex={0}
                    aria-label={tr("{title}, de {toTime} à {endTime}", { title: b.task.title, toTime: toTime(b.start), endTime: endTime(end) })}
                    aria-describedby={helpId}
                    onPointerDown={(e) => startMove(e, b)}
                    onContextMenu={(e) =>
                      openMenu(
                        e,
                        taskMenu(b.task, {
                          extra: [{ label: tr("Retirer de l'agenda"), icon: ICONS.close, shortcut: tr("Suppr"), run: () => unplace(b.task) }],
                        }),
                      )
                    }
                    onKeyDown={(e) => onBlockKey(e, b)}
                  >
                    <span className="agenda-block-title">{b.task.title}</span>
                    <span className="agenda-block-time">
                      {toTime(b.start)} – {endTime(end)}
                    </span>
                    <button
                      type="button"
                      className="agenda-block-remove"
                      aria-label={tr("Retirer « {title} » de l'agenda", { title: b.task.title })}
                      title={tr("Retirer de l'agenda")}
                      onClick={() => unplace(b.task)}
                    >
                      <Icon d={ICONS.close} size={11} stroke={2.6} />
                    </button>
                    <span className="agenda-resize" aria-hidden="true" onPointerDown={(e) => startResize(e, b)} />
                  </div>
                );
              })}
              {drag && drag.kind !== "resize" && drag.over && (
                <div
                  className="agenda-block agenda-block--preview"
                  data-size={blockSize(drag.duration)}
                  style={blockStyle(drag.start, drag.duration, 0, 1, drag.task.color)}
                  aria-hidden="true"
                >
                  <span className="agenda-block-title">{drag.task.title}</span>
                  <span className="agenda-block-time">
                    {toTime(drag.start)} – {endTime(drag.start + drag.duration)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="planner-foot">
        <p className="planner-status" aria-live="polite">
          {status || (planned > 0 ? tr("Temps planifié : {formatDuration}.", { formatDuration: formatDuration(planned) }) : tr("Aucune tâche dans l'agenda."))}
        </p>
        <button type="button" className="btn-gel" onClick={onClose}>
          {tr("Fermer")}
        </button>
      </div>

      {drag?.kind === "place" &&
        !drag.over &&
        createPortal(
          <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
            {drag.task.title}
          </div>,
          document.body,
        )}
    </Dialog>
  );
}
