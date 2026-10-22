import { onItemKeys, type ItemActions } from "../lib/itemKeys";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { inkOn } from "../lib/colorInk";
import { trackDrag } from "../lib/pointerDrag";
import { toTime } from "../planner/plan";
import { daysBetween, fromDayKey, weekday, type DayKey } from "../tasks/day";
import { dayMarkAttributes } from "./dayMarkStyle";
import { dayItems, isMovable, type CalItem } from "./items";
import type { DayMark } from "./specialDays";
import { isoWeek } from "./calendarSettings";
import { monthGrid } from "./view";
import { locale, tr, trn } from "../i18n/i18n";

const HEADS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
/** Hauteurs d'une case (calendar.css) : numéro du jour, puis une ligne par élément. */
const NUM_HEIGHT = 28;
const CHIP_HEIGHT = 21;
const DAY = 24 * 60;
const FULL = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });

interface MonthViewProps {
  anchor: DayKey;
  today: DayKey;
  items: CalItem[];
  open: (item: CalItem) => void;
  shift: (item: CalItem, minutes: number) => void;
  /** Double-clic sur une case : nouvel événement ce jour-là. */
  createOn: (day: DayKey) => void;
  pickDay: (day: DayKey) => void;
  menu: (e: MouseEvent, item: CalItem) => void;
  /** Raccourcis du menu de l'élément (Suppr, Ctrl+D…). */
  keys: (item: CalItem) => ItemActions;
  slotMenu: (e: MouseEvent, day: DayKey, minute: null) => void;
  /** Jours fériés, fêtes et périodes (vacances…) de la grille. */
  special?: ReadonlyMap<DayKey, DayMark>;
  /** Numéro de semaine au début de chaque rangée. */
  weekNumbers?: boolean;
  id: string;
  labelledBy: string;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface DayPanelProps {
  day: DayKey;
  items: CalItem[];
  anchor: DOMRect;
  open: (item: CalItem) => void;
  pickDay: (day: DayKey) => void;
  onClose: () => void;
}

/** Tous les éléments d'un jour (« N de plus »), dans un panneau qui défile. */
function DayPanel({ day, items, anchor, open, pickDay, onClose }: DayPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = 280;
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 8);
  const below = anchor.top + 320 < window.innerHeight;
  const title = capitalize(FULL.format(fromDayKey(day)));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onPointer = (e: globalThis.PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="day-panel glass-popover"
      role="dialog"
      aria-label={title}
      style={below ? { left, width, top: anchor.top } : { left, width, bottom: window.innerHeight - anchor.bottom }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="day-panel-head">
        <span className="day-panel-title">{title}</span>
        <button type="button" className="link-btn" onClick={() => pickDay(day)}>
          {tr("Afficher le jour")}
        </button>
      </div>
      <ul className="day-panel-list">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="av-row day-panel-row"
              data-kind={item.kind}
              style={item.color ? ({ "--ev-color": item.color } as CSSProperties) : undefined}
              disabled={item.kind === "holiday"}
              onClick={() => {
                onClose();
                open(item);
              }}
            >
              <span className="day-panel-time">
                {item.start === null || item.startDate < day ? tr("Journée") : toTime(item.start)}
              </span>
              <span className="av-dot" aria-hidden="true" />
              <span className="av-title">{item.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vue Mois : 6 semaines, trois éléments par jour au plus. */
export function MonthView({ anchor, today, items, open, shift, createOn, pickDay, menu, keys, slotMenu, special, weekNumbers, id, labelledBy }: MonthViewProps) {
  const [drag, setDrag] = useState<{ item: CalItem; day: DayKey | null; x: number; y: number } | null>(null);
  const [more, setMore] = useState<{ day: DayKey; rect: DOMRect } | null>(null);
  const cells = useRef(new Map<DayKey, HTMLDivElement>());
  const gridRef = useRef<HTMLDivElement>(null);
  // Autant d'éléments par case que la hauteur le permet, « N de plus » compris.
  const [capacity, setCapacity] = useState(3);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const rowHeight = grid.clientHeight / 6;
      setCapacity(Math.max(0, Math.floor((rowHeight - NUM_HEIGHT) / CHIP_HEIGHT)));
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  const month = anchor.slice(0, 7);

  const dayAt = (x: number, y: number): DayKey | null => {
    for (const [day, el] of cells.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return day;
    }
    return null;
  };

  const startDrag = (e: PointerEvent, item: CalItem, from: DayKey) => {
    if (!isMovable(item)) return;
    trackDrag(e, {
      onMove: (x, y) => setDrag({ item, day: dayAt(x, y), x, y }),
      onEnd: (x, y, cancelled) => {
        setDrag(null);
        const day = dayAt(x, y);
        if (!cancelled && day && day !== from) shift(item, daysBetween(from, day) * DAY);
      },
    });
  };

  const onChipKey = (e: KeyboardEvent, item: CalItem) => {
    if (item.kind !== "holiday") onItemKeys(keys(item))(e);
    if (e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(item);
    } else if (isMovable(item) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      shift(item, e.key === "ArrowLeft" ? -DAY : DAY);
    }
  };

  return (
    <div className="mv" id={id} role="tabpanel" aria-labelledby={labelledBy}>
      <div className="mv-head" aria-hidden="true">
        {HEADS.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <div className="mv-grid" ref={gridRef}>
        {monthGrid(anchor).map((day) => {
          const list = dayItems(items, day);
          // Case trop basse pour une ligne : un compteur à côté du numéro ouvre la liste.
          const compact = capacity === 0;
          const shown = compact ? [] : list.slice(0, list.length > capacity ? capacity - 1 : capacity);
          const hidden = list.length - shown.length;
          const mark = special?.get(day);
          // Période : son nom au premier jour, et au début de chaque semaine.
          const periodLabel = mark?.periods.filter((p) => p.starts || weekday(day) === 1).map((p) => p.label).join(" · ");
          return (
            <div
              key={day}
              ref={(el) => {
                if (el) cells.current.set(day, el);
                else cells.current.delete(day);
              }}
              className="mv-cell"
              data-out={day.slice(0, 7) !== month || undefined}
              data-today={day === today || undefined}
              data-weekend={weekday(day) % 6 === 0 || undefined}
              {...dayMarkAttributes(mark)}
              title={mark?.label}
              data-drop={(drag && drag.day === day) || undefined}
              onDoubleClick={(e) => {
                if (e.target === e.currentTarget) createOn(day);
              }}
              onContextMenu={(e) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("mv-num")) slotMenu(e, day, null);
              }}
            >
              <button
                type="button"
                className="mv-num"
                aria-label={tr("Afficher le {date}", { date: FULL.format(fromDayKey(day)) }) + (mark ? `, ${mark.label}` : "")}
                onClick={() => pickDay(day)}
              >
                {Number(day.slice(8))}
              </button>
              {periodLabel && (
                <span className="mv-period" aria-hidden="true">
                  {periodLabel}
                </span>
              )}
              {weekNumbers && weekday(day) === 1 && (
                <span className="mv-week" title={tr("Semaine {isoWeek}", { isoWeek: isoWeek(day) })}>
                  S{isoWeek(day)}
                </span>
              )}
              {shown.map((item) => {
                const timed = item.start !== null && item.startDate === day;
                return (
                  <div
                    key={item.key}
                    className="mv-chip"
                    data-kind={item.kind}
                    data-timed={timed || undefined}
                    data-ink={item.kind === "event" && !timed ? (item.color ? inkOn(item.color) : "light") : undefined}
                    data-default={item.color === null || undefined}
                    data-dragging={(drag && drag.item.key === item.key) || undefined}
                    style={item.color ? ({ "--ev-color": item.color } as CSSProperties) : undefined}
                    tabIndex={item.kind === "holiday" ? undefined : 0}
                    role={item.kind === "holiday" ? undefined : "button"}
                    onPointerDown={(e) => startDrag(e, item, day)}
                    onContextMenu={(e) => (item.kind === "holiday" ? slotMenu(e, day, null) : menu(e, item))}
                    onKeyDown={(e) => onChipKey(e, item)}
                    onClick={() => item.kind !== "holiday" && open(item)}
                  >
                    {timed && <span className="mv-chip-time">{toTime(item.start ?? 0)}</span>}
                    <span className="mv-chip-title">{item.title}</span>
                  </div>
                );
              })}
              {hidden > 0 && (
                <button
                  type="button"
                  className="mv-more"
                  data-compact={compact || undefined}
                  aria-label={compact ? trn(hidden, "{n} élément", "{n} éléments") : undefined}
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    const cell = e.currentTarget.closest(".mv-cell");
                    if (cell) setMore({ day, rect: cell.getBoundingClientRect() });
                  }}
                >
                  {compact ? hidden : tr("{n} de plus", { n: hidden })}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {more &&
        createPortal(
          <DayPanel
            day={more.day}
            items={dayItems(items, more.day)}
            anchor={more.rect}
            open={open}
            pickDay={(day) => {
              setMore(null);
              pickDay(day);
            }}
            onClose={() => setMore(null)}
          />,
          document.body,
        )}
      {drag &&
        createPortal(
          <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
            {drag.item.title}
          </div>,
          document.body,
        )}
    </div>
  );
}
