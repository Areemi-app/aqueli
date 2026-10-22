import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { formatShortDay, fromDayKey, type DayKey } from "../tasks/day";
import { dueDatesBetween, formatAmount, type Obligation } from "./obligations";
import { useObligations } from "./ObligationsProvider";
import { tr } from "../i18n/i18n";
import { monthNames } from "../i18n/calendarNames";

const MONTHS = monthNames("short");

/** Position dans l'année (0 à 100 %), sur 12 colonnes égales. */
function position(day: DayKey): number {
  const date = fromDayKey(day);
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return ((date.getMonth() + (date.getDate() - 0.5) / days) / 12) * 100;
}

interface TimelineProps {
  obligations: readonly Obligation[];
  year: number;
  onYear: (year: number) => void;
  today: DayKey;
  open: (obligation: Obligation) => void;
  /** Clic droit et raccourcis de l'obligation (useItemMenu). */
  item: (obligation: Obligation) => { onContextMenu: (e: MouseEvent) => void; onKeyDown: (e: KeyboardEvent) => void };
  id: string;
  labelledBy: string;
}

/** Frise de l'année : les échéances de chaque obligation sur 12 mois, et le total de chaque mois. */
export function Timeline({ obligations, year, onYear, today, open, item, id, labelledBy }: TimelineProps) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const { categories, categoryOf } = useObligations();
  const order = (o: Obligation) => categories.findIndex((c) => c.id === o.category);
  const rows = obligations
    .filter((o) => o.status !== "resilie")
    .map((o) => ({
      o,
      dates: o.status === "paye" ? (o.dueDate >= from && o.dueDate <= to ? [o.dueDate] : []) : dueDatesBetween(o, from, to),
      cancel: o.status === "a-faire" && o.cancelBy && o.cancelBy >= from && o.cancelBy <= to ? o.cancelBy : null,
    }))
    .filter((r) => r.dates.length > 0 || r.cancel)
    .sort((a, b) => order(a.o) - order(b.o) || a.o.title.localeCompare(b.o.title, "fr"));
  const totals = Array.from({ length: 12 }, () => 0);
  for (const r of rows) {
    for (const d of r.dates) totals[fromDayKey(d).getMonth()]! += r.o.amountCents ?? 0;
  }
  const todayLeft = today.startsWith(String(year)) ? position(today) : null;

  return (
    <section className="frise glass" id={id} role="tabpanel" aria-labelledby={labelledBy}>
      <div className="frise-head">
        <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Année précédente")} onClick={() => onYear(year - 1)}>
          <Icon d={ICONS.arrowLeft} size={15} />
        </button>
        <span className="frise-year">{year}</span>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Année suivante")} onClick={() => onYear(year + 1)}>
          <Icon d={ICONS.arrowRight} size={15} />
        </button>
      </div>
      <div className="frise-scroll">
        <div className="frise-row frise-months" aria-hidden="true">
          <span className="frise-label" />
          <div className="frise-track frise-track--months">
            {MONTHS.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
        {rows.length === 0 && <p className="tasks-empty">{tr("Aucune échéance en {year}.", { year })}</p>}
        {rows.map(({ o, dates, cancel }) => {
          const category = categoryOf(o.category);
          const color = o.color ?? category.color;
          return (
            <div key={o.id} className="frise-row" style={{ "--row-color": color } as CSSProperties}>
              <button type="button" className="frise-label" onClick={() => open(o)} {...item(o)}>
                <ModuleChip color={category.color} icon={category.icon} size={22} />
                <span className="frise-title">{o.title}</span>
              </button>
              <div className="frise-track">
                {todayLeft !== null && <span className="frise-today" style={{ left: `${todayLeft}%` }} aria-hidden="true" />}
                {dates.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="frise-dot"
                    data-paid={o.status === "paye" || undefined}
                    data-late={(o.status === "a-faire" && d < today) || undefined}
                    style={{ left: `${position(d)}%` }}
                    title={`${o.title} · ${formatShortDay(d, today)}${o.amountCents !== null ? ` · ${formatAmount(o.amountCents)}` : ""}`}
                    aria-label={tr("{title}, échéance {formatShortDay}", { title: o.title, formatShortDay: formatShortDay(d, today) })}
                    onClick={() => open(o)}
                    {...item(o)}
                  />
                ))}
                {cancel && (
                  <span
                    className="frise-cancel"
                    style={{ left: `${position(cancel)}%` }}
                    title={tr("Date limite de résiliation : {formatShortDay}", { formatShortDay: formatShortDay(cancel, today) })}
                    role="img"
                    aria-label={tr("Date limite de résiliation : {formatShortDay}", { formatShortDay: formatShortDay(cancel, today) })}
                  />
                )}
              </div>
            </div>
          );
        })}
        {rows.length > 0 && (
          <div className="frise-row frise-totals">
            <span className="frise-label">{tr("Total du mois")}</span>
            <div className="frise-track frise-track--months">
              {totals.map((cents, i) => (
                <span key={MONTHS[i]}>{cents > 0 ? formatAmount(cents) : "—"}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
