/** Obligations imprimées (Ctrl+P) : par section (en retard, 30 prochains jours…), avec échéance, montant et préavis. */
import type { PrintDoc } from "../print/print";
import { formatShortDay, type DayKey } from "../tasks/day";
import { dueLabel, formatAmount, PERIODS, sectionsOf, subscriptionsPerMonth, type Obligation } from "./obligations";
import { tr } from "../i18n/i18n";

export function obligationsPrintDoc(title: string, list: readonly Obligation[], today: DayKey, subtitle?: string): PrintDoc {
  const perMonth = subscriptionsPerMonth(list.filter((o) => o.status === "a-faire"));
  const sub = [subtitle, perMonth > 0 ? tr("Abonnements : {amount} par mois", { amount: formatAmount(perMonth) }) : null].filter(Boolean).join(" · ") || undefined;
  return {
    title,
    subtitle: sub,
    empty: tr("Aucune obligation."),
    sections: sectionsOf(list, today).map((s) => ({
      heading: s.title,
      rows: s.obligations.map((o) => {
        const open = o.status === "a-faire";
        const period = PERIODS.find((p) => p.value === o.periodMonths)?.label ?? null;
        const meta = [
          open ? dueLabel(o.dueDate, today) : formatShortDay(o.dueDate, today),
          o.amountCents !== null ? formatAmount(o.amountCents) + (period ? ` (${period.toLowerCase()})` : "") : null,
          o.cancelBy && open ? tr("Résiliation avant le {date}", { date: formatShortDay(o.cancelBy, today) }) : null,
        ].filter(Boolean);
        return {
          text: o.organization ? `${o.title} · ${o.organization}` : o.title,
          meta: meta.join(" · "),
          tone: open && o.dueDate < today ? ("late" as const) : undefined,
        };
      }),
    })),
  };
}
