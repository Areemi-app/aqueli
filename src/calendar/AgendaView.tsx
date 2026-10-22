import { onItemKeys, type ItemActions } from "../lib/itemKeys";
import type { CSSProperties, MouseEvent } from "react";
import { toTime } from "../planner/plan";
import { addDays, daysBetween, fromDayKey, relativeDay, type DayKey } from "../tasks/day";
import { dayItems, type CalItem } from "./items";
import type { DayMark } from "./specialDays";
import { AGENDA_DAYS } from "./view";
import { locale, tr } from "../i18n/i18n";

const LONG = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function when(item: CalItem, day: DayKey): string {
  if (item.start === null) return tr("Journée");
  const start = item.startDate === day ? toTime(item.start) : "00:00";
  const end = item.endDate === day ? toTime((item.end ?? 0) % (24 * 60)) : "00:00";
  return `${start} – ${end}`;
}

interface AgendaViewProps {
  anchor: DayKey;
  today: DayKey;
  items: CalItem[];
  /** Jours fériés, fêtes et périodes : une période est annoncée à son premier jour. */
  special?: ReadonlyMap<DayKey, DayMark>;
  open: (item: CalItem) => void;
  menu: (e: MouseEvent, item: CalItem) => void;
  /** Raccourcis du menu de l'élément (Suppr, Ctrl+D…). */
  keys: (item: CalItem) => ItemActions;
  id: string;
  labelledBy: string;
}

/** Vue Agenda : liste chronologique des 4 semaines à venir. */
export function AgendaView({ anchor, today, items, special, open, menu, keys, id, labelledBy }: AgendaViewProps) {
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(anchor, i))
    .map((day) => ({
      day,
      list: dayItems(items, day),
      // Périodes qui commencent ce jour-là, ou déjà en cours au début de l'agenda.
      periods: special?.get(day)?.periods.filter((p) => p.starts || day === anchor) ?? [],
    }))
    .filter((d) => d.list.length > 0 || d.periods.length > 0);

  return (
    <div className="av" id={id} role="tabpanel" aria-labelledby={labelledBy}>
      {days.length === 0 ? (
        <p className="av-empty">{tr("Aucun événement sur cette période.")}</p>
      ) : (
        days.map(({ day, list, periods }) => {
          const near = Math.abs(daysBetween(today, day)) <= 1;
          return (
            <section key={day} className="av-day" data-today={day === today || undefined} aria-label={LONG.format(fromDayKey(day))}>
              <h3 className="av-date">
                {capitalize(LONG.format(fromDayKey(day)))}
                {near && <span className="av-relative"> · {relativeDay(day, today)}</span>}
              </h3>
              {periods.map((p) => (
                <p key={p.label} className="av-period" style={{ "--period-color": p.color } as CSSProperties}>
                  {p.starts ? p.label : tr("{label} (en cours)", { label: p.label })}
                </p>
              ))}
              <ul className="av-list">
                {list.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      className="av-row"
                      data-kind={item.kind}
                      style={item.color ? ({ "--ev-color": item.color } as CSSProperties) : undefined}
                      disabled={item.kind === "holiday"}
                      onClick={() => open(item)}
                      onContextMenu={(e) => item.kind !== "holiday" && menu(e, item)}
                      onKeyDown={item.kind === "holiday" ? undefined : onItemKeys(keys(item))}
                    >
                      <span className="av-time">{when(item, day)}</span>
                      <span className="av-dot" aria-hidden="true" />
                      <span className="av-title">{item.title}</span>
                      {item.kind === "task" && <span className="pill av-pill">{tr("Tâche")}</span>}
                      {item.kind === "holiday" && <span className="pill av-pill">{item.special?.kind === "fete" ? tr("Fête") : tr("Jour férié")}</span>}
                      {item.kind === "obligation" && <span className="pill av-pill">{tr("Échéance")}</span>}
                      {item.kind === "birthday" && <span className="pill av-pill">{tr("Anniversaire")}</span>}
                      {item.location && <span className="av-location">{item.location}</span>}
                      {item.special?.note && <span className="av-location">{item.special.note}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
