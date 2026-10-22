import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { announceData, type DataKind } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { useItemMenu, useScreenMenu } from "../components/ContextMenu";
import { SelectionBar, selectionEntries, useSelection, type SelectionAction } from "../components/SelectionBar";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Tabs, type TabItem } from "../components/Tabs";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { KEYS } from "../lib/itemKeys";
import { getModule, type ModuleKey } from "../modules/modules";
import { fromDayKey } from "../tasks/day";
import { daysLeft, trashApi, type TrashItem, type TrashKind } from "./trashApi";
import { locale, tr, trn } from "../i18n/i18n";

type Filter = "tout" | "taches" | "agenda" | "obligations" | "notes" | "journal" | "habitudes" | "projets" | "contacts" | "documents" | "listes" | "objectifs" | "budget";

const FILTERS: readonly TabItem<Filter>[] = [
  { id: "tout", label: tr("Tout") },
  { id: "taches", label: tr("Tâches") },
  { id: "agenda", label: tr("Agenda") },
  { id: "obligations", label: tr("Obligations") },
  { id: "notes", label: tr("Notes") },
  { id: "journal", label: tr("Journal") },
  { id: "habitudes", label: tr("Habitudes") },
  { id: "projets", label: tr("Projets") },
  { id: "contacts", label: tr("Contacts") },
  { id: "documents", label: tr("Documents") },
  { id: "listes", label: tr("Listes") },
  { id: "objectifs", label: tr("Objectifs") },
  { id: "budget", label: tr("Budget") },
];

const KIND_FILTER: Record<TrashKind, Filter> = {
  task: "taches",
  event: "agenda",
  obligation: "obligations",
  note: "notes",
  notebook: "notes",
  journal: "journal",
  habit: "habitudes",
  project: "projets",
  contact: "contacts",
  document: "documents",
  list: "listes",
  goal: "objectifs",
  transaction: "budget",
};

const KIND_MODULE: Record<TrashKind, ModuleKey> = {
  task: "taches",
  event: "calendrier",
  obligation: "obligations",
  note: "notes",
  notebook: "notes",
  journal: "journal",
  habit: "habitudes",
  project: "projets",
  contact: "contacts",
  document: "documents",
  list: "listes",
  goal: "objectifs",
  transaction: "budget",
};

/** Liste à relire après une restauration. */
const KIND_DATA: Record<TrashKind, DataKind> = {
  task: "task",
  event: "event",
  obligation: "obligation",
  note: "note",
  notebook: "note",
  journal: "journal",
  habit: "habit",
  project: "project",
  contact: "contact",
  document: "document",
  list: "list",
  goal: "goal",
  transaction: "transaction",
};

const DATE = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" });
const LONG_DAY = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Titre affiché : « Journal · jeudi 1 octobre 2026 », « Carnet Maison », « Sans titre ». */
export function trashTitle(item: TrashItem): string {
  if (item.kind === "journal") return tr("Journal · {date}", { date: LONG_DAY.format(fromDayKey(item.title)) });
  if (item.kind === "notebook") return tr("Carnet « {name} »", { name: item.title });
  if (item.kind === "list") return tr("Liste « {name} »", { name: item.title });
  if (item.kind === "transaction") return item.title.trim() || tr("Opération sans libellé");
  return item.title.trim() || tr("Sans titre");
}

/** « Supprimé le 30 sept. · 28 jours restants » (« avec 3 notes » pour un carnet). */
export function trashDetail(item: TrashItem, now: number): string {
  const left = daysLeft(item.deletedAt, now);
  const parts = [tr("Supprimé le {date}", { date: DATE.format(new Date(item.deletedAt * 1000)) }), trn(left, "{n} jour restant", "{n} jours restants")];
  if (item.kind === "notebook" && item.count > 0) parts.push(trn(item.count, "avec {n} note", "avec {n} notes"));
  if (item.kind === "project" && item.count > 0) parts.push(trn(item.count, "avec {n} tâche", "avec {n} tâches"));
  if (item.kind === "list" && item.count > 0) parts.push(trn(item.count, "avec {n} élément", "avec {n} éléments"));
  return parts.join(" · ");
}

const keyOf = (item: TrashItem) => `${item.kind}:${item.id}`;

/** Corbeille : éléments supprimés depuis moins de 30 jours, à restaurer ou à supprimer définitivement. */
export function TrashScreen() {
  const notify = useToast();
  const itemMenu = useItemMenu();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("tout");
  const [confirm, setConfirm] = useState<TrashItem | TrashItem[] | "tout" | null>(null);

  const refresh = useCallback(() => {
    trashApi
      .list()
      .then(setItems)
      .catch((e: DataError) => notify(dataErrorMessage(e)));
  }, [notify]);
  useEffect(refresh, [refresh]);
  useScreenMenu(() => [
    { label: tr("Vider la corbeille"), icon: ICONS.trash, danger: true, disabled: !items || items.length === 0, run: () => setConfirm("tout") },
  ]);

  const now = Math.floor(Date.now() / 1000);
  const shown = useMemo(() => (items ?? []).filter((i) => filter === "tout" || KIND_FILTER[i.kind] === filter), [items, filter]);
  // Plusieurs éléments à la fois : clic, Ctrl+clic, Maj+clic, Ctrl+A.
  const pick = useSelection(shown.map(keyOf));
  const picked = shown.filter((i) => pick.has(keyOf(i)));

  /** Restaure les éléments sélectionnés ; un seul message à la fin. */
  const restoreMany = async (list: readonly TrashItem[]) => {
    const kinds = new Set<DataKind>();
    let done = 0;
    for (const item of list) {
      try {
        await trashApi.restore(item.kind, item.id);
        done += 1;
        kinds.add(KIND_DATA[item.kind]);
        if (item.kind === "project") kinds.add("task");
      } catch (e) {
        notify(dataErrorMessage(e as DataError));
      }
    }
    if (kinds.size > 0) announceData([...kinds]);
    if (done > 0) notify(done > 1 ? tr("{done} éléments restaurés.", { done }) : tr("Élément restauré."));
    pick.clear();
    refresh();
  };
  const bulkActions: SelectionAction[] = [
    { label: tr("Restaurer"), icon: ICONS.undo, shortcut: KEYS.open, run: () => void restoreMany(picked) },
    { label: tr("Supprimer définitivement"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => setConfirm(picked) },
  ];

  const restore = async (item: TrashItem) => {
    try {
      await trashApi.restore(item.kind, item.id);
      announceData(item.kind === "project" ? ["project", "task"] : [KIND_DATA[item.kind]]);
      notify(tr("{trashTitle} : restauré.", { trashTitle: trashTitle(item) }));
      refresh();
    } catch (e) {
      notify(dataErrorMessage(e as DataError));
    }
  };

  const purge = async (target: TrashItem | TrashItem[] | "tout") => {
    setConfirm(null);
    try {
      if (Array.isArray(target)) {
        for (const item of target) await trashApi.purge(item.kind, item.id);
        notify(target.length > 1 ? tr("{length} éléments supprimés définitivement.", { length: target.length }) : tr("Élément supprimé définitivement."));
        pick.clear();
      } else if (target === "tout") {
        const n = await trashApi.empty();
        notify(n > 1 ? tr("{n} éléments supprimés définitivement.", { n }) : tr("Corbeille vidée."));
      } else {
        await trashApi.purge(target.kind, target.id);
        notify(tr("Élément supprimé définitivement."));
      }
      refresh();
    } catch (e) {
      notify(dataErrorMessage(e as DataError));
    }
  };

  return (
    <div className="screen trash-screen">
      <header className="tasks-header">
        <h1 className="tasks-title screen-title-chip">
          <ModuleChip color="var(--aq-chip-neutral)" icon={ICONS.trash} size={32} />
          <span>{tr("Corbeille")}</span>
        </h1>
        <Tabs items={FILTERS} value={filter} onChange={setFilter} label={tr("Type d'élément")} idPrefix="corbeille" />
        <span className="tasks-header-spacer" />
        <button type="button" className="btn-glass btn-danger" disabled={!items || items.length === 0} onClick={() => setConfirm("tout")}>
          <Icon d={ICONS.trash} size={16} stroke={2.2} />
          {tr("Vider la corbeille")}
        </button>
      </header>
      <p className="trash-intro">{tr("Les éléments supprimés restent ici 30 jours, puis sont supprimés définitivement.")}</p>

      <section className="task-panel glass" id={`corbeille-panel-${filter}`} role="tabpanel" aria-labelledby={`corbeille-tab-${filter}`}>
        <div className="task-scroll" onKeyDown={pick.onListKeyDown}>
          {items && shown.length === 0 && <p className="tasks-empty">{filter === "tout" ? tr("La corbeille est vide.") : tr("Aucun élément de ce type.")}</p>}
          <ul className="task-rows">
            {shown.map((item) => {
              const m = getModule(KIND_MODULE[item.kind]);
              return (
                <li
                  key={`${item.kind}:${item.id}`}
                  className="trash-row"
                  style={{ "--row-color": m.color } as CSSProperties}
                  tabIndex={0}
                  data-picked={pick.has(keyOf(item)) || undefined}
                  aria-selected={pick.has(keyOf(item))}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    if (!pick.click(e, keyOf(item))) pick.only(keyOf(item));
                  }}
                  {...itemMenu(() => pick.has(keyOf(item)) && pick.count > 1 ? selectionEntries(bulkActions) : [
                    { label: tr("Restaurer"), icon: ICONS.undo, shortcut: KEYS.open, run: () => void restore(item) },
                    "separator",
                    { label: tr("Supprimer définitivement"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => setConfirm(item) },
                  ])}
                >
                  <ModuleChip color={m.color} icon={item.kind === "notebook" ? ICONS.notebook : m.icon} size={28} />
                  <span className="trash-text">
                    <span className="trash-title">{trashTitle(item)}</span>
                    <span className="trash-meta">
                      {m.label} · {trashDetail(item, now)}
                    </span>
                  </span>
                  <button type="button" className="btn-glass btn-glass--sm" onClick={() => void restore(item)}>
                    <Icon d={ICONS.undo} size={14} stroke={2.4} />
                    {tr("Restaurer")}
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    aria-label={tr("Supprimer définitivement : {trashTitle}", { trashTitle: trashTitle(item) })}
                    title={tr("Supprimer définitivement")}
                    onClick={() => setConfirm(item)}
                  >
                    <Icon d={ICONS.trash} size={15} stroke={2.2} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <SelectionBar count={pick.count} label={[tr("élément sélectionné"), tr("éléments sélectionnés")]} actions={bulkActions} onClear={pick.clear} />
      </section>

      {confirm && (
        <Dialog title={confirm === "tout" ? tr("Vider la corbeille") : tr("Supprimer définitivement")} onClose={() => setConfirm(null)}>
          <p className="settings-intro">
            {confirm === "tout"
              ? trn(items?.length ?? 0, "{n} élément est supprimé définitivement.", "{n} éléments sont supprimés définitivement.")
              : Array.isArray(confirm)
                ? trn(confirm.length, "{n} élément est supprimé définitivement.", "{n} éléments sont supprimés définitivement.")
                : tr("{trashTitle} est supprimé définitivement.", { trashTitle: trashTitle(confirm) })}
          </p>
          <div className="onb-actions">
            <button type="button" className="btn-glass" onClick={() => setConfirm(null)} data-autofocus>
              {tr("Annuler")}
            </button>
            <button type="button" className="btn-glass btn-danger" onClick={() => void purge(confirm)}>
              {tr("Supprimer")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
