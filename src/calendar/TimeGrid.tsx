import { onItemKeys, type ItemActions } from "../lib/itemKeys";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { inkOn } from "../lib/colorInk";
import { autoScroll, trackDrag } from "../lib/pointerDrag";
import { snap, STEP, toTime } from "../planner/plan";
import { fromDayKey, weekday, type DayKey } from "../tasks/day";
import { dayMarkAttributes } from "./dayMarkStyle";
import { allDaySpans, isMovable, timedSegments, type CalItem, type Segment, type Span } from "./items";
import type { DayMark } from "./specialDays";
import { locale, tr } from "../i18n/i18n";
import { weekdayNames, withoutDot } from "../i18n/calendarNames";

/** Hauteur d'une heure, en pixels (maquette Calendrier.dc.html : 45). */
const HOUR_PX = 48;
const PX = HOUR_PX / 60;
const DAY = 24 * 60;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DAY_NAMES = weekdayNames("short").map((d) => withoutDot(d).toLocaleUpperCase(locale()));
/** Largeur de la colonne des heures (--tg-gutter dans calendar.css). */
const GUTTER_PX = 52;
const DAY_LABEL = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });
/** Lignes « Journée » montrées avant « N de plus » (au-delà de 3 lignes). */
const COLLAPSED_ROWS = 2;

export interface GridActions {
  open: (item: CalItem) => void;
  /** Nouveau créneau glissé dans la grille (minutes du jour). */
  create: (day: DayKey, start: number, end: number) => void;
  /** Décale l'élément de `minutes` (plusieurs jours : multiple de 1 440). */
  shift: (item: CalItem, minutes: number) => void;
  /** Nouvelle heure de fin, le jour où l'élément finit. */
  resize: (item: CalItem, end: number) => void;
  /** Élément de la journée entière posé sur une heure. */
  placeAt: (item: CalItem, day: DayKey, start: number) => void;
  pickDay: (day: DayKey) => void;
  /** Clic droit sur un élément. */
  menu: (e: MouseEvent, item: CalItem) => void;
  /** Clic droit dans une case vide : heure visée, ou `null` pour la journée entière. */
  slotMenu: (e: MouseEvent, day: DayKey, minute: number | null) => void;
  /** Raccourcis du menu de l'élément (Suppr, Ctrl+D…). */
  keys: (item: CalItem) => ItemActions;
}

type Drag =
  | { kind: "create"; col: number; from: number; to: number }
  | { kind: "move"; key: string; col: number; start: number; end: number; item: CalItem }
  | { kind: "resize"; key: string; end: number }
  | { kind: "allday"; key: string; offset: number; grid: { col: number; start: number } | null; item: CalItem };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function colorStyle(item: CalItem): CSSProperties {
  return item.color ? ({ "--ev-color": item.color } as CSSProperties) : {};
}

function inkOf(item: CalItem): "light" | "dark" | undefined {
  if (item.kind !== "event") return undefined;
  return item.color ? inkOn(item.color) : "light";
}

function timeRange(start: number, end: number): string {
  return `${toTime(start)} – ${toTime(end % DAY)}`;
}

interface TimeGridProps {
  days: DayKey[];
  items: CalItem[];
  today: DayKey;
  now: Date;
  actions: GridActions;
  /** Jours fériés, fêtes et périodes (vacances…) des jours affichés. */
  special?: ReadonlyMap<DayKey, DayMark>;
  /** Heures de travail (minutes) : le reste de la journée est grisé. */
  workHours?: { start: number; end: number } | null;
  /** Durée d'un événement créé d'un double-clic, en minutes. */
  defaultDuration?: number;
  /** Identifiant du panneau (onglets de vue). */
  id: string;
  labelledBy: string;
}

/** Texte en filigrane d'une colonne : les fêtes du jour, puis les périodes (« Vacances d'hiver · Zone A »). */
export const watermarkOf = (mark: DayMark) => [...mark.holidays.map((h) => h.name), ...mark.periods.map((p) => p.label)].join(" · ");

/** Vues Jour et Semaine : ligne « Journée », puis grille des heures. */
export function TimeGrid({ days, items, today, now, actions, special, workHours = null, defaultDuration = 60, id, labelledBy }: TimeGridProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [allDayOpen, setAllDayOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cols = days.length;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayCol = days.indexOf(today);
  const spans = allDaySpans(items, days);
  const rows = spans.reduce((n, s) => Math.max(n, s.row + 1), 0);
  const markOf = (day: DayKey) => special?.get(day);
  // Sous le numéro : les fêtes du jour (les périodes sont écrites en filigrane dans la colonne).
  const feastsOf = (day: DayKey) => (special?.get(day)?.holidays ?? []).map((h) => h.name).join(" · ");
  const anyFeast = days.some((d) => feastsOf(d) !== "");
  // Beaucoup d'éléments sur la journée entière : deux lignes, puis « N de plus » par jour.
  const collapsible = rows > COLLAPSED_ROWS + 1;
  const collapsed = collapsible && !allDayOpen;
  const hiddenPerDay = days.map((_, col) =>
    collapsed ? spans.filter((s) => s.row >= COLLAPSED_ROWS && s.col <= col && col < s.col + s.span).length : 0,
  );
  const segments = days.map((d) => timedSegments(items, d));

  // À l'ouverture : l'heure actuelle (au plus tôt 7 h) ou le premier élément de la période.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const first = Math.min(DAY, ...segments.flat().map((s) => s.start));
    const dayStart = workHours ? workHours.start : 7 * 60 + 30;
    const focus = Math.min(first, todayCol >= 0 ? Math.max(Math.min(dayStart, 7 * 60), nowMin - 60) : dayStart);
    scroller.scrollTop = Math.max(0, focus - 20) * PX;
    // Une seule fois : ensuite, la grille reste où la personne l'a mise.
  }, []);

  const pointAt = (x: number, y: number) => {
    const r = bodyRef.current?.getBoundingClientRect();
    if (!r) return { col: 0, minute: 0 };
    const width = (r.width - GUTTER_PX) / cols;
    return {
      col: clamp(Math.floor((x - r.left - GUTTER_PX) / width), 0, cols - 1),
      minute: clamp((y - r.top) / PX, 0, DAY),
    };
  };
  const overGrid = (x: number, y: number) => {
    const r = scrollRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const scrollNear = (y: number) => {
    if (scrollRef.current) autoScroll(scrollRef.current, y);
  };

  const startCreate = (e: PointerEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).classList.contains("tg-col")) return;
    const p = pointAt(e.clientX, e.clientY);
    const anchor = Math.floor(p.minute / STEP) * STEP;
    const range = (y: number) => {
      const m = snap(pointAt(e.clientX, y).minute);
      return { from: Math.min(anchor, m), to: Math.min(Math.max(anchor + STEP, m), DAY) };
    };
    trackDrag(e, {
      onMove: (_x, y) => {
        scrollNear(y);
        setDrag({ kind: "create", col: p.col, ...range(y) });
      },
      onEnd: (_x, y, cancelled) => {
        setDrag(null);
        const { from, to } = range(y);
        if (!cancelled) actions.create(days[p.col]!, from, to);
      },
    });
  };

  const createAt = (e: MouseEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).classList.contains("tg-col")) return;
    const p = pointAt(e.clientX, e.clientY);
    const start = Math.min(Math.floor(p.minute / 30) * 30, DAY - defaultDuration);
    actions.create(days[p.col]!, start, start + defaultDuration);
  };

  const startMove = (e: PointerEvent, seg: Segment, col: number) => {
    if (!isMovable(seg.item)) return;
    const grab = pointAt(e.clientX, e.clientY).minute - seg.start;
    const length = seg.end - seg.start;
    const target = (x: number, y: number) => {
      const q = pointAt(x, y);
      const start = clamp(snap(q.minute - grab), 0, DAY - length);
      return { col: q.col, start, delta: (q.col - col) * DAY + start - seg.start };
    };
    trackDrag(e, {
      onMove: (x, y) => {
        scrollNear(y);
        const t = target(x, y);
        setDrag({ kind: "move", key: seg.item.key, col: t.col, start: t.start, end: t.start + length, item: seg.item });
      },
      onEnd: (x, y, cancelled) => {
        setDrag(null);
        const t = target(x, y);
        if (!cancelled && t.delta !== 0) actions.shift(seg.item, t.delta);
      },
    });
  };

  const startResize = (e: PointerEvent, seg: Segment) => {
    e.stopPropagation();
    const endAt = (y: number) => clamp(snap(pointAt(0, y).minute), seg.start + STEP, DAY);
    trackDrag(e, {
      onMove: (_x, y) => {
        scrollNear(y);
        setDrag({ kind: "resize", key: seg.item.key, end: endAt(y) });
      },
      onEnd: (_x, y, cancelled) => {
        setDrag(null);
        const end = endAt(y);
        if (!cancelled && end !== seg.end) actions.resize(seg.item, end);
      },
    });
  };

  const startAllDay = (e: PointerEvent, span: Span) => {
    if (!isMovable(span.item)) return;
    const from = pointAt(e.clientX, e.clientY).col;
    const target = (x: number, y: number) => {
      const q = pointAt(x, y);
      return { offset: q.col - from, grid: overGrid(x, y) ? { col: q.col, start: clamp(snap(q.minute - STEP), 0, DAY - 60) } : null };
    };
    trackDrag(e, {
      onMove: (x, y) => setDrag({ kind: "allday", key: span.item.key, item: span.item, ...target(x, y) }),
      onEnd: (x, y, cancelled) => {
        setDrag(null);
        if (cancelled) return;
        const t = target(x, y);
        if (t.grid) actions.placeAt(span.item, days[t.grid.col]!, t.grid.start);
        else if (t.offset !== 0) actions.shift(span.item, t.offset * DAY);
      },
    });
  };

  const onBlockKey = (e: KeyboardEvent, seg: Segment) => {
    onItemKeys(actions.keys(seg.item))(e);
    if (e.defaultPrevented) return;
    const moves: Record<string, number> = { ArrowUp: -STEP, ArrowDown: STEP, ArrowLeft: -DAY, ArrowRight: DAY };
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      actions.open(seg.item);
      return;
    }
    const delta = moves[e.key];
    if (delta === undefined || !isMovable(seg.item)) return;
    e.preventDefault();
    if (e.shiftKey && Math.abs(delta) === STEP) {
      if (!seg.toAfter) actions.resize(seg.item, clamp(seg.end + delta, seg.start + STEP, DAY));
    } else {
      actions.shift(seg.item, delta);
    }
  };

  const onChipKey = (e: KeyboardEvent, span: Span) => {
    if (span.item.kind !== "holiday") onItemKeys(actions.keys(span.item))(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      actions.open(span.item);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && isMovable(span.item)) {
      e.preventDefault();
      actions.shift(span.item, e.key === "ArrowLeft" ? -DAY : DAY);
    }
  };

  const blockPosition = (col: number, start: number, end: number, lane: number, lanes: number): CSSProperties => ({
    top: start * PX + 1,
    height: Math.max((end - start) * PX - 2, 14),
    left: `calc(var(--tg-gutter) + (100% - var(--tg-gutter)) * ${(col + lane / lanes) / cols})`,
    width: `calc((100% - var(--tg-gutter)) / ${cols * lanes} - 4px)`,
  });

  const gridColumns = { "--tg-cols": cols } as CSSProperties;

  return (
    <div className="tg" style={gridColumns} id={id} role="tabpanel" aria-labelledby={labelledBy}>
      <div className="tg-head">
        <span className="tg-gutter" />
        {days.map((d) => (
          <button
            key={d}
            type="button"
            className="tg-day"
            data-today={d === today || undefined}
            data-weekend={weekday(d) % 6 === 0 || undefined}
            {...dayMarkAttributes(markOf(d))}
            title={markOf(d)?.label}
            onClick={() => actions.pickDay(d)}
            aria-label={tr("Afficher le {date}", { date: DAY_LABEL.format(fromDayKey(d)) }) + (markOf(d) ? `, ${markOf(d)!.label}` : "")}
          >
            <span className="tg-day-name">{DAY_NAMES[weekday(d)]}</span>
            <span className="tg-day-num">{Number(d.slice(8))}</span>
            {anyFeast && <span className="tg-day-note">{feastsOf(d)}</span>}
          </button>
        ))}
      </div>

      <div
        className="tg-allday"
        data-open={(collapsible && allDayOpen) || undefined}
        style={{ "--tg-rows": collapsed ? COLLAPSED_ROWS + 1 : Math.max(rows, 1) } as CSSProperties}
      >
        <span className="tg-allday-label">{tr("JOURNÉE")}</span>
        {collapsible && allDayOpen && (
          <button type="button" className="tg-allday-toggle" onClick={() => setAllDayOpen(false)}>
            {tr("Réduire")}
          </button>
        )}
        {hiddenPerDay.map(
          (n, col) =>
            n > 0 && (
              <button
                key={`plus-${days[col]}`}
                type="button"
                className="tg-allday-more"
                style={{ gridColumn: col + 2, gridRow: COLLAPSED_ROWS + 1 }}
                onClick={() => setAllDayOpen(true)}
              >
                {tr("{n} de plus", { n })}
              </button>
            ),
        )}
        {spans.filter((s) => !collapsed || s.row < COLLAPSED_ROWS).map((s) => {
          const moving = drag?.kind === "allday" && drag.key === s.item.key;
          const col = moving && !drag.grid ? clamp(s.col + drag.offset, 0, cols - 1) : s.col;
          return (
            <div
              key={s.item.key}
              className="tg-chip"
              data-kind={s.item.kind}
              data-ink={inkOf(s.item)}
              data-default={s.item.color === null || undefined}
              data-dragging={moving || undefined}
              data-clip-start={s.clippedStart || undefined}
              data-clip-end={s.clippedEnd || undefined}
              style={{ ...colorStyle(s.item), gridColumn: `${col + 2} / span ${Math.min(s.span, cols - col)}`, gridRow: s.row + 1 }}
              tabIndex={s.item.kind === "holiday" ? undefined : 0}
              role={s.item.kind === "holiday" ? undefined : "button"}
              aria-label={s.item.kind === "holiday" ? undefined : tr("{title}, journée entière", { title: s.item.title })}
              onPointerDown={(e) => startAllDay(e, s)}
              onContextMenu={(e) => (s.item.kind === "holiday" ? actions.slotMenu(e, s.item.startDate, null) : actions.menu(e, s.item))}
              onKeyDown={(e) => onChipKey(e, s)}
              onClick={() => s.item.kind !== "holiday" && actions.open(s.item)}
            >
              {s.item.title}
            </div>
          );
        })}
      </div>

      <div className="tg-scroll" ref={scrollRef}>
        <div
          className="tg-body"
          ref={bodyRef}
          style={{ height: DAY * PX }}
          onPointerDown={startCreate}
          onDoubleClick={createAt}
          onContextMenu={(e) => {
            if (!(e.target as HTMLElement).classList.contains("tg-col")) return;
            const p = pointAt(e.clientX, e.clientY);
            actions.slotMenu(e, days[p.col]!, Math.min(Math.floor(p.minute / 30) * 30, DAY - 60));
          }}
        >
          {days.map((d, col) => {
            const mark = markOf(d);
            const attributes = dayMarkAttributes(mark);
            return (
              <div
                key={d}
                className="tg-col"
                data-weekend={weekday(d) % 6 === 0 || undefined}
                {...attributes}
                style={{ ...attributes.style, left: `calc(var(--tg-gutter) + (100% - var(--tg-gutter)) * ${col / cols})`, width: `calc((100% - var(--tg-gutter)) / ${cols})` }}
              >
                {workHours && (
                  <>
                    <span className="tg-off" style={{ top: 0, height: workHours.start * PX }} aria-hidden="true" />
                    <span className="tg-off" style={{ top: workHours.end * PX, bottom: 0 }} aria-hidden="true" />
                  </>
                )}
                {mark && (
                  <span className="tg-col-mark" aria-hidden="true">
                    {watermarkOf(mark)}
                  </span>
                )}
              </div>
            );
          })}
          {HOURS.map((h) => (
            <div key={h} className="tg-hour" style={{ top: h * HOUR_PX }}>
              {h > 0 && <span className="tg-hour-label">{`${String(h).padStart(2, "0")}:00`}</span>}
            </div>
          ))}
          {todayCol >= 0 && (
            <div
              className="tg-now"
              style={{
                top: nowMin * PX,
                left: `calc(var(--tg-gutter) + (100% - var(--tg-gutter)) * ${todayCol / cols})`,
                width: `calc((100% - var(--tg-gutter)) / ${cols})`,
              }}
              aria-hidden="true"
            />
          )}

          {/* Une seule liste : un élément déplacé d'un jour à l'autre garde le focus. */}
          {segments
            .flatMap((daySegments, col) => daySegments.map((seg) => ({ seg, col })))
            .map(({ seg, col }) => {
              const { item } = seg;
              const resizing = drag?.kind === "resize" && drag.key === item.key && !seg.toAfter;
              const end = resizing ? drag.end : seg.end;
              const split = seg.fromBefore || seg.toAfter;
              return (
                <div
                  key={split ? `${item.key}@${days[col]}` : item.key}
                  className="tg-block"
                  data-kind={item.kind}
                  data-ink={inkOf(item)}
                  data-default={item.color === null || undefined}
                  data-short={end - seg.start < 45 || undefined}
                  data-dragging={(drag?.kind === "move" && drag.key === item.key) || undefined}
                  style={{ ...colorStyle(item), ...blockPosition(col, seg.start, end, seg.lane, seg.lanes) }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${item.title}, ${timeRange(seg.start, end)}${item.location ? `, ${item.location}` : ""}`}
                  onPointerDown={(e) => startMove(e, seg, col)}
                  onContextMenu={(e) => actions.menu(e, item)}
                  onKeyDown={(e) => onBlockKey(e, seg)}
                  onClick={() => actions.open(item)}
                >
                  <span className="tg-block-title">{item.title}</span>
                  <span className="tg-block-sub">
                    {item.kind === "task" ? tr("Tâche · ") : ""}
                    {timeRange(seg.start, end)}
                    {item.location ? ` · ${item.location}` : ""}
                  </span>
                  {!seg.toAfter && <span className="tg-resize" aria-hidden="true" onPointerDown={(e) => startResize(e, seg)} />}
                </div>
              );
            })}

          {drag?.kind === "create" && (
            <div className="tg-block tg-block--preview" style={blockPosition(drag.col, drag.from, drag.to, 0, 1)} aria-hidden="true">
              <span className="tg-block-title">{tr("Nouvel événement")}</span>
              <span className="tg-block-sub">{timeRange(drag.from, drag.to)}</span>
            </div>
          )}
          {drag?.kind === "move" && (
            <div
              className="tg-block tg-block--preview"
              data-kind={drag.item.kind}
              style={{ ...colorStyle(drag.item), ...blockPosition(drag.col, drag.start, drag.end, 0, 1) }}
              aria-hidden="true"
            >
              <span className="tg-block-title">{drag.item.title}</span>
              <span className="tg-block-sub">{timeRange(drag.start, drag.end)}</span>
            </div>
          )}
          {drag?.kind === "allday" && drag.grid && (
            <div
              className="tg-block tg-block--preview"
              data-kind={drag.item.kind}
              style={{
                ...colorStyle(drag.item),
                ...blockPosition(drag.grid.col, drag.grid.start, drag.grid.start + (drag.item.kind === "task" ? 30 : 60), 0, 1),
              }}
              aria-hidden="true"
            >
              <span className="tg-block-title">{drag.item.title}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
