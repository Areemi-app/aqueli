/** Cartes de l'Accueil des Objectifs et du Budget. */
import { useId, type CSSProperties } from "react";
import { budgetUse, monthOf, plannedPayments, summarize } from "../budget/budget";
import { useBudget } from "../budget/BudgetProvider";
import { useItemMenu } from "../components/ContextMenu";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { expectedRatio, paceOf, periodLabel } from "../goals/goals";
import { Ring, useGoalProgress } from "../goals/GoalProgress";
import { useGoals } from "../goals/GoalsProvider";
import { KEYS } from "../lib/itemKeys";
import { goalRequest, NEW_ITEM, transactionRequest } from "../lib/request";
import { getModule } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { formatAmount } from "../obligations/obligations";
import { useObligations } from "../obligations/ObligationsProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { useTasks } from "../tasks/TasksProvider";
import { tr } from "../i18n/i18n";

const MAX_GOALS = 4;
const PACE_LABELS = { avance: tr("En avance"), temps: tr("Dans les temps"), retard: tr("En retard|rythme") } as const;

/** Objectifs en cours, avec leur anneau d'avancement. */
export function GoalsWidget() {
  const m = getModule("objectifs");
  const { go } = useNavigation();
  const { visible, loaded } = useGoals();
  const { today } = useTasks();
  const progress = useGoalProgress();
  const itemMenu = useItemMenu();
  const headingId = useId();
  const goals = visible.filter((g) => g.status === "en-cours");
  const open = (id: string) => {
    go("objectifs");
    goalRequest.request(id);
  };
  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Objectifs")}
        </h2>
        <button type="button" className="link-btn" onClick={() => go("objectifs")}>
          {m.label}
        </button>
      </div>
      {loaded && goals.length === 0 ? (
        <div className="widget-empty">
          <Orb color={m.color} icon={m.icon} size={64} />
          <p>{tr("Aucun objectif en cours.")}</p>
          <button type="button" className="link-btn" onClick={() => open(NEW_ITEM)}>
            {tr("Nouvel objectif")}
          </button>
        </div>
      ) : (
        <>
          <ul className="widget-goals">
            {goals.slice(0, MAX_GOALS).map((g) => {
              const p = progress(g);
              const pace = paceOf(p, expectedRatio(g, today));
              const color = g.color ?? m.color;
              return (
                <li key={g.id} style={{ "--goal-color": color } as CSSProperties} {...itemMenu(() => [{ label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => open(g.id) }])}>
                  <button type="button" className="widget-goal" onClick={() => open(g.id)}>
                    <Ring ratio={p.ratio} color={color} size={40} />
                    <span className="widget-goal-text">
                      <span className="widget-goal-title">{g.title}</span>
                      <span className="widget-goal-meta">
                        {p.label} · {periodLabel(g)}
                      </span>
                    </span>
                    {pace && (
                      <span className="goal-pace" data-pace={pace}>
                        {PACE_LABELS[pace]}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {goals.length > MAX_GOALS && (
            <button type="button" className="link-btn today-more" onClick={() => go("objectifs")}>
              {tr("{n} de plus", { n: goals.length - MAX_GOALS })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Dépenses, revenus et solde du mois, et les budgets les plus entamés. */
export function BudgetWidget() {
  const m = getModule("budget");
  const { go } = useNavigation();
  const { visible, categories } = useBudget();
  const { obligations } = useObligations();
  const { filter } = useSpaces();
  const { today } = useTasks();
  const headingId = useId();
  const month = monthOf(today);
  const shown = obligations.filter((o) => filter === "tous" || o.spaceId === filter || o.spaceId === null);
  const s = summarize(visible, plannedPayments(shown, month), month);
  const budgets = categories
    .filter((c) => c.kind === "depense" && c.monthlyCents)
    .map((c) => ({ c, spent: s.byCategory.get(c.id) ?? 0 }))
    .map((x) => ({ ...x, use: Math.round(100 * (budgetUse(x.c, x.spent) ?? 0)) }))
    .sort((a, b) => b.use - a.use)
    .slice(0, 3);
  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Budget du mois")}
        </h2>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            go("budget");
            transactionRequest.request(NEW_ITEM);
          }}
        >
          {tr("Nouvelle dépense")}
        </button>
      </div>
      <button type="button" className="widget-budget" onClick={() => go("budget")}>
        <span className="widget-budget-main">
          <span className="widget-budget-label">{tr("Dépenses")}</span>
          <strong>{formatAmount(s.spent + s.planned)}</strong>
        </span>
        <span className="widget-budget-side">
          <span>{tr("Revenus : {amount}", { amount: formatAmount(s.income) })}</span>
          <span data-tone={s.balance >= 0 ? "bon" : "mauvais"}>
            {tr("Solde : {amount}", { amount: `${s.balance >= 0 ? "+" : "−"} ${formatAmount(Math.abs(s.balance))}` })}
          </span>
        </span>
      </button>
      {budgets.length > 0 && (
        <ul className="widget-budgets">
          {budgets.map(({ c, spent, use }) => (
            <li key={c.id} style={{ "--row-color": c.color ?? m.color } as CSSProperties}>
              <span className="widget-budgets-name">{c.name}</span>
              <span className="widget-budgets-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, use)}%` }} data-over={use > 100 || undefined} />
              </span>
              <span className="widget-budgets-value">
                {formatAmount(spent)} / {formatAmount(c.monthlyCents ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
