import { addDays, type DayKey } from "../tasks/day";
import type { CalItem } from "./items";
import { MiniMonth } from "./MiniMonth";
import type { DayMark } from "./specialDays";
import { monthLabel, yearMonths } from "./view";

interface YearViewProps {
  anchor: DayKey;
  /** Jours fériés, fêtes et périodes de l'année. */
  special: ReadonlyMap<DayKey, DayMark>;
  today: DayKey;
  items: CalItem[];
  pickDay: (day: DayKey) => void;
  id: string;
  labelledBy: string;
}

/** Jours qui ont au moins un élément (événement ou tâche ; les jours fériés sont à part). */
function markedDays(items: readonly CalItem[]): Set<DayKey> {
  const days = new Set<DayKey>();
  for (const item of items) {
    if (item.kind === "holiday") continue;
    let day = item.startDate;
    for (let i = 0; i < 366 && day <= item.endDate; i++) {
      days.add(day);
      day = addDays(day, 1);
    }
  }
  return days;
}

/** Vue Année : les 12 mois ; un point marque les jours occupés. */
export function YearView({ anchor, special, today, items, pickDay, id, labelledBy }: YearViewProps) {
  const marks = markedDays(items);
  return (
    <div className="yv" id={id} role="tabpanel" aria-labelledby={labelledBy}>
      {yearMonths(anchor).map((first) => (
        <section key={first} className="yv-month" aria-label={monthLabel(first)}>
          <h3 className="yv-title">{monthLabel(first).replace(/ \d{4}$/, "")}</h3>
          <MiniMonth month={first} today={today} marks={marks} special={special} onPick={pickDay} label={monthLabel(first)} />
        </section>
      ))}
    </div>
  );
}
