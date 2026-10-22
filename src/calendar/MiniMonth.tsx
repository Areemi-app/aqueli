import { fromDayKey, type DayKey } from "../tasks/day";
import { dayMarkAttributes } from "./dayMarkStyle";
import type { DayMark } from "./specialDays";
import { monthGrid } from "./view";
import { locale } from "../i18n/i18n";
import { weekdayInitials } from "../i18n/calendarNames";

const FULL = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

interface MiniMonthProps {
  /** Un jour du mois montré. */
  month: DayKey;
  today: DayKey;
  /** Période affichée dans la vue principale, surlignée. */
  highlight?: { from: DayKey; to: DayKey };
  /** Jours qui ont au moins un élément (point sous le numéro). */
  marks?: ReadonlySet<DayKey>;
  /** Jours fériés, fêtes et périodes (vacances…) du mois montré. */
  special?: ReadonlyMap<DayKey, DayMark>;
  onPick: (day: DayKey) => void;
  label: string;
}

/** Petit mois (barre latérale du calendrier, vue Année). */
export function MiniMonth({ month, today, highlight, marks, special, onPick, label }: MiniMonthProps) {
  const monthKey = month.slice(0, 7);
  return (
    <div className="mini-month" role="group" aria-label={label}>
      <div className="mini-month-head" aria-hidden="true">
        {weekdayInitials().map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mini-month-grid">
        {monthGrid(month).map((day) => {
          const inMonth = day.slice(0, 7) === monthKey;
          const inRange = highlight && day >= highlight.from && day <= highlight.to;
          const mark = special?.get(day);
          const label = FULL.format(fromDayKey(day));
          return (
            <button
              key={day}
              type="button"
              className="mini-day"
              data-out={!inMonth || undefined}
              data-today={day === today || undefined}
              data-range={inRange || undefined}
              data-mark={marks?.has(day) || undefined}
              {...dayMarkAttributes(mark)}
              title={mark?.label}
              aria-label={mark ? `${label}, ${mark.label}` : label}
              aria-current={day === today ? "date" : undefined}
              tabIndex={inMonth ? 0 : -1}
              onClick={() => onPick(day)}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
