import { printDoc, usePrint } from "../print/print";
import { obligationsPrintDoc } from "./obligationPrint";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useBulk } from "../app/bulk";
import { dragLabel, dropTarget, startDrag } from "../lib/dragDrop";
import { submenuEntry, useItemMenu, useScreenMenu, type MenuEntry } from "../components/ContextMenu";
import { EmptyState } from "../components/EmptyState";
import { getModule } from "../modules/modules";
import { ScreenTitle } from "../components/ScreenTitle";
import { KEYS } from "../lib/itemKeys";
import { useNewItem } from "../shell/newItem";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Tabs } from "../components/Tabs";
import { readPref, writePref } from "../lib/storage";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, formatShortDay } from "../tasks/day";
import { useTasks } from "../tasks/TasksProvider";
import { ObligationEditor } from "./ObligationEditor";
import { useObligationMenu } from "./obligationMenu";
import { useObligationBulk } from "./obligationBulk";
import { SelectionBar, selectionEntries, useSelection } from "../components/SelectionBar";
import { onObligationRequest, takePendingObligation, type ObligationRequest } from "./obligationRequest";
import { ObligationsSettings, type SettingsTab } from "./ObligationsSettings";
import {
  cancelSoon,
  dueLabel,
  formatAmount,
  sectionsOf,
  STATUS_LABELS,
  subscriptionsPerMonth,
  subscriptionsPerYear,
  type Obligation,
  type ObligationCategory,
  type ObligationInput,
} from "./obligations";
import { useObligations } from "./ObligationsProvider";
import { Timeline } from "./Timeline";
import { tr, trn } from "../i18n/i18n";

type View = "liste" | "frise";
const VIEWS: readonly { id: View; label: string }[] = [
  { id: "liste", label: tr("Liste") },
  { id: "frise", label: tr("Frise de l'année") },
];
const isView = (v: unknown): v is View => v === "liste" || v === "frise";

const PER: Record<number, string> = { 1: tr(" / mois"), 2: tr(" / 2 mois"), 3: tr(" / trimestre"), 6: tr(" / semestre"), 12: tr(" / an") };

type Editing = { obligation: Obligation } | { draft: ObligationInput };
type Settings = { tab: SettingsTab; category?: ObligationCategory };

/** Obligations (cahier des charges § 4.4) : liste par catégorie et frise de l'année. */
export function ObligationsScreen() {
  const { obligations, loaded, pay, categories, categoryOf, update } = useObligations();
  const bulk = useBulk();
  const { today } = useTasks();
  const { spaces, filter } = useSpaces();
  const itemMenu = useItemMenu();
  const obligationMenu = useObligationMenu();
  const obligationBulk = useObligationBulk();
  const [view, setViewState] = useState<View>(() => readPref("vueObligations", "liste", isView));
  const [category, setCategory] = useState<ObligationCategory | "toutes">("toutes");
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const setView = (v: View) => {
    setViewState(v);
    writePref("vueObligations", v);
  };
  const visible = obligations.filter((o) => filter === "tous" || o.spaceId === filter);
  const shown = category === "toutes" ? visible : visible.filter((o) => o.category === category);
  const sections = sectionsOf(shown, today);
  const open = (obligation: Obligation) => setEditing({ obligation });
  // Plusieurs obligations à la fois (liste) : Ctrl+clic, Maj+clic, Ctrl+A.
  const listed = sections.flatMap((s) => s.obligations);
  const pick = useSelection(view === "liste" ? listed.map((o) => o.id) : []);
  const bulkActions = obligationBulk(listed.filter((o) => pick.has(o.id)));
  // Clic droit et raccourcis de son menu (Entrée, Suppr, Ctrl+D), partout où l'obligation figure.
  const item = (o: Obligation) =>
    itemMenu(() => (pick.has(o.id) && pick.count > 1 ? selectionEntries(bulkActions) : obligationMenu(o, () => open(o))));
  const newDraft = (inCategory = category): ObligationInput => ({
    autoPay: false,
    title: "",
    category: inCategory === "toutes" ? "factures" : inCategory,
    organization: "",
    reference: "",
    amountCents: null,
    periodMonths: null,
    dueDate: addDays(today, 7),
    cancelBy: null,
    status: "a-faire",
    spaceId: filter !== "tous" ? filter : (spaces[0]?.id ?? null),
    color: null,
    notes: "",
  });

  // Demandes venues d'une notification, de l'Accueil, du calendrier ou de la palette ;
  // celle qui attendait est traitée une fois la liste chargée.
  const latest = useRef({ obligations, newDraft });
  latest.current = { obligations, newDraft };
  useEffect(() => {
    if (!loaded) return;
    const handle = (request: ObligationRequest) => {
      const found = request.id ? latest.current.obligations.find((o) => o.id === request.id) : undefined;
      if (found) setEditing({ obligation: found });
      else if (request.create) setEditing({ draft: latest.current.newDraft() });
      else if (request.settings) setSettings({ tab: request.settings });
    };
    const pending = takePendingObligation();
    if (pending) handle(pending);
    return onObligationRequest(handle);
  }, [loaded]);

  // Clic droit ailleurs dans l'écran : ses propres actions.
  useNewItem(() => setEditing({ draft: newDraft() }));
  // Ctrl+P : les obligations de la catégorie affichée, par section.
  const printObligations = () =>
    printDoc(
      obligationsPrintDoc(
        category === "toutes" ? tr("Obligations") : tr("Obligations · {label}", { label: categoryOf(category).label }),
        shown,
        today,
        filter !== "tous" ? tr("Espace : {name}", { name: spaces.find((s) => s.id === filter)?.name }) : undefined,
      ),
    );
  usePrint(() => printObligations);
  useScreenMenu(() => [
    { label: tr("Nouvelle obligation"), icon: ICONS.plus, shortcut: KEYS.create, run: () => setEditing({ draft: newDraft() }) },
    "separator",
    submenuEntry(tr("Affichage"), ICONS.layers, VIEWS.map((v) => ({ label: v.label, checked: view === v.id, run: () => setView(v.id) }))),
    "separator",
    { label: tr("Imprimer…"), icon: ICONS.printer, shortcut: KEYS.print, run: printObligations },
    "separator",
    { label: tr("Réglages des obligations"), icon: ICONS.settings, run: () => setSettings({ tab: "categories" }) },
  ]);
  const categoryEntries = (id: ObligationCategory | "toutes"): MenuEntry[] => {
    const label = id === "toutes" ? null : categoryOf(id).label;
    return [
      {
        label: label ? tr("Nouvelle obligation dans « {label} »", { label }) : tr("Nouvelle obligation"),
        icon: ICONS.plus,
        run: () => setEditing({ draft: newDraft(id) }),
      },
      "separator",
      ...(id === "toutes"
        ? [{ label: tr("Réglages des obligations"), icon: ICONS.settings, run: () => setSettings({ tab: "categories" as const }) }]
        : [
            {
              label: tr("Renommer la catégorie…"),
              icon: ICONS.pencil,
              shortcut: KEYS.rename,
              run: () => setSettings({ tab: "categories" as const, category: id }),
            },
            { label: tr("Rappels de la catégorie…"), icon: ICONS.bell, run: () => setSettings({ tab: "rappels" as const, category: id }) },
          ]),
    ];
  };

  // Chiffres du bandeau : à payer sous 30 jours, abonnements par mois, résiliations proches.
  const soon = visible.filter((o) => o.status === "a-faire" && o.dueDate <= addDays(today, 30));
  const soonTotal = soon.reduce((sum, o) => sum + (o.amountCents ?? 0), 0);
  const cancels = visible.filter((o) => cancelSoon(o, today)).length;
  const openCount = (c: ObligationCategory | "toutes") =>
    visible.filter((o) => o.status === "a-faire" && (c === "toutes" || o.category === c)).length;

  // Glisser des obligations (ou la sélection) sur une catégorie de la colonne de gauche.
  // « Modifier » (clic droit) reste l'équivalent au clavier.
  const dragObligations = (o: Obligation) => (e: PointerEvent<HTMLElement>) => {
    const moved = pick.has(o.id) && pick.count > 1 ? shown.filter((x) => pick.has(x.id)) : [o];
    const target = (key: string) => key.slice("categorie:".length) as ObligationCategory;
    startDrag(
      e,
      { kind: "obligation", ids: moved.map((x) => x.id), label: dragLabel(moved.length, o.title, "obligations"), color: o.color ?? categoryOf(o.category).color },
      {
        canDrop: (key) => moved.some((x) => x.category !== target(key)),
        onDrop: (key) => {
          const cat = categoryOf(target(key));
          const many = moved.length > 1;
          void bulk(many ? tr("{n} obligations rangées dans « {name} ».", { n: moved.length, name: cat.label }) : tr("Obligation rangée dans « {name} ».", { name: cat.label }), tr("déplacement des obligations"), async () => {
            for (const x of moved) if (x.category !== cat.id) await update(x, { category: cat.id });
          });
        },
      },
    );
  };

  return (
    <div className="screen obligations-screen">
      <header className="tasks-header">
        <ScreenTitle module="obligations" />
        <Tabs items={VIEWS} value={view} onChange={setView} label={tr("Vue")} idPrefix="obligations" />
        <span className="tasks-header-spacer" />
        <button
          type="button"
          className="icon-btn"
          aria-label={tr("Réglages des obligations")}
          title={tr("Réglages des obligations")}
          onClick={() => setSettings({ tab: "categories" })}
        >
          <Icon d={ICONS.settings} size={18} />
        </button>
        <button type="button" className="btn-gel" title={tr("Nouvelle obligation ({create})", { create: KEYS.create })} onClick={() => setEditing({ draft: newDraft() })}>
          <Icon d={ICONS.plus} size={16} stroke={2.8} />
          <span>{tr("Nouvelle obligation")}</span>
        </button>
      </header>

      <div className="obl-summary">
        <div className="obl-stat glass">
          <span className="obl-stat-label">{tr("À payer sous 30 jours")}</span>
          <span className="obl-stat-value">{soon.length === 0 ? tr("Rien") : formatAmount(soonTotal)}</span>
          {soon.length > 0 && <span className="obl-stat-sub">{trn(soon.length, "{n} échéance", "{n} échéances")}</span>}
        </div>
        <div className="obl-stat glass">
          <span className="obl-stat-label">{tr("Abonnements")}</span>
          <span className="obl-stat-value">{tr("{amount} par mois", { amount: formatAmount(subscriptionsPerMonth(visible)) })}</span>
          {subscriptionsPerYear(visible) > 0 && <span className="obl-stat-sub">{tr("soit {amount} par an", { amount: formatAmount(subscriptionsPerYear(visible)) })}</span>}
        </div>
        <div className="obl-stat glass" data-alert={cancels > 0 || undefined}>
          <span className="obl-stat-label">{tr("Résiliations à prévoir")}</span>
          <span className="obl-stat-value">{cancels === 0 ? tr("Aucune") : cancels}</span>
        </div>
      </div>

      {view === "frise" ? (
        <Timeline
          obligations={visible}
          year={year}
          onYear={setYear}
          today={today}
          open={open}
          item={item}
          id="obligations-panel-frise"
          labelledBy="obligations-tab-frise"
        />
      ) : (
        <div className="tasks-body" id="obligations-panel-liste" role="tabpanel" aria-labelledby="obligations-tab-liste">
          <nav className="task-lists glass" aria-label={tr("Catégories")}>
            <div className="section-label">{tr("Catégories")}</div>
            {[{ id: "toutes" as const, label: tr("Toutes"), icon: ICONS.layers, color: null }, ...categories].map((c) => {
              const count = openCount(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="task-list-item"
                  aria-current={category === c.id ? "page" : undefined}
                  onClick={() => setCategory(c.id)}
                  {...(c.id === "toutes" ? {} : dropTarget(`categorie:${c.id}`, "obligation"))}
                  {...itemMenu(() => categoryEntries(c.id))}
                >
                  {c.color ? <ModuleChip color={c.color} icon={c.icon} size={20} /> : <Icon d={c.icon} size={16} />}
                  <span className="task-list-label">{c.label}</span>
                  {count > 0 && (
                    <span className="task-list-count" data-current={category === c.id || undefined}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <section className="task-panel glass" aria-label={category === "toutes" ? tr("Toutes les obligations") : categoryOf(category).label}>
            <div className="task-scroll" onKeyDown={pick.onListKeyDown}>
              {loaded && sections.length === 0 && (
                <EmptyState
                  color={getModule("obligations").color}
                  icon={getModule("obligations").icon}
                  text={category === "toutes" ? tr("Aucune obligation.") : tr("Aucune obligation dans cette catégorie.")}
                  action={{ label: tr("Nouvelle obligation"), run: () => setEditing({ draft: newDraft() }) }}
                />
              )}
              {sections.map((s) => (
                <div key={s.id} className="task-section">
                  <h2 className="task-section-title" data-tone={s.id === "retard" ? "danger" : undefined}>
                    {s.title}
                    <span className="task-section-sub"> · {s.obligations.length}</span>
                  </h2>
                  <ul className="task-rows">
                    {s.obligations.map((o) => {
                      const cat = categoryOf(o.category);
                      const late = o.status === "a-faire" && o.dueDate < today;
                      return (
                        <li
                          key={o.id}
                          className="obl-row"
                          data-status={o.status}
                          data-picked={pick.has(o.id) || undefined}
                          style={{ "--row-color": o.color ?? cat.color } as CSSProperties}
                          onPointerDown={dragObligations(o)}
                          {...item(o)}
                        >
                          <ModuleChip color={cat.color} icon={cat.icon} size={24} />
                          <button
                            type="button"
                            className="obl-main"
                            aria-pressed={pick.has(o.id) || undefined}
                            onClick={(e) => {
                              if (!pick.click(e, o.id)) open(o);
                            }}
                          >
                            <span className="obl-title">{o.title}</span>
                            {o.organization && <span className="obl-org">{o.organization}</span>}
                            {o.autoPay && o.status === "a-faire" && (
                              <span className="obl-auto" title={tr("Prélèvement automatique : payée d'elle-même à l'échéance")}>
                                <Icon d={ICONS.repeat} size={11} stroke={2.4} />
                                {tr("Prélèvement")}
                              </span>
                            )}
                          </button>
                          {cancelSoon(o, today) && o.cancelBy && (
                            <span
                              className="pill obl-cancel"
                              title={tr("Date limite de résiliation : {formatShortDay}", { formatShortDay: formatShortDay(o.cancelBy, today) })}
                            >
                              <Icon d={ICONS.warning} size={12} stroke={2.4} />
                              <span className="obl-cancel-text">
                                {tr("Résiliation avant le {date}", { date: formatShortDay(o.cancelBy, today).replace(/^\S+ /, "") })}
                              </span>
                            </span>
                          )}
                          {o.amountCents !== null && (
                            <span className="obl-amount">
                              {formatAmount(o.amountCents)}
                              {o.periodMonths ? <span className="obl-per">{PER[o.periodMonths] ?? ""}</span> : null}
                            </span>
                          )}
                          <span className="obl-due" data-late={late || undefined}>
                            {o.status === "a-faire" ? dueLabel(o.dueDate, today) : STATUS_LABELS[o.status]}
                          </span>
                          {o.status === "a-faire" && (
                            <button
                              type="button"
                              className="icon-btn icon-btn--sm obl-pay"
                              aria-label={tr("Marquer « {title} » comme payée", { title: o.title })}
                              title={tr("Marquer comme payée")}
                              onClick={() => void pay(o)}
                            >
                              <Icon d={ICONS.check} size={15} stroke={2.6} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <SelectionBar count={pick.count} label={[tr("obligation sélectionnée"), tr("obligations sélectionnées")]} actions={bulkActions} onClear={pick.clear} />
          </section>
        </div>
      )}

      {editing && <ObligationEditor {...editing} onClose={() => setEditing(null)} />}
      {settings && <ObligationsSettings {...settings} onClose={() => setSettings(null)} />}
    </div>
  );
}
