import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useToast } from "../app/ToastProvider";
import { useBulk } from "../app/bulk";
import { dragLabel, dropTarget, startDrag } from "../lib/dragDrop";
import { Icon } from "../components/Icon";
import { EmptyState } from "../components/EmptyState";
import { getModule } from "../modules/modules";
import { ScreenTitle } from "../components/ScreenTitle";
import { ICONS } from "../components/icons";
import { Tabs } from "../components/Tabs";
import { readPref, writePref } from "../lib/storage";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, type DayKey } from "./day";
import { ListsPanel } from "./ListsPanel";
import { QuickAddField } from "./QuickAddField";
import { onQuickAddRequest, takePendingQuickAdd } from "./quickAddFocus";
import { onTaskOpenRequest, takePendingTaskOpen } from "./taskFocus";
import { TaskDetail } from "./TaskDetail";
import { TaskRow, type RowDateMode } from "./TaskRow";
import { useTaskBulk } from "./taskBulk";
import { SelectionBar, selectionEntries, useSelection } from "../components/SelectionBar";
import { pickedIn } from "../lib/selection";
import { useTaskMenu } from "./taskMenu";
import { submenuEntry, useItemMenu, useScreenMenu } from "../components/ContextMenu";
import { useNavigation } from "../navigation/NavigationProvider";
import { requestDayPlanner } from "../planner/plannerRequest";
import { inList, isSmartListId, listLabel, sortTasks, type SmartListId, type Task } from "./tasks";
import { changesTask, displaySections, listChanges, PRIORITY_FILTERS, readDisplay, sectionChanges, writeDisplay, type ListDisplay } from "./taskDisplay";
import { TaskDisplayMenu } from "./TaskDisplayMenu";
import { toTasksCsv } from "./exportCsv";
import { exportFile } from "../lib/exportFile";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useTasks } from "./TasksProvider";
import { useTaskFilters } from "./TaskFiltersProvider";
import { tr, trn } from "../i18n/i18n";

const FilterDialog = lazy(() => import("./FilterDialog").then((m) => ({ default: m.FilterDialog })));
const KanbanView = lazy(() => import("./TaskBoards").then((m) => ({ default: m.KanbanView })));
const MatrixView = lazy(() => import("./TaskBoards").then((m) => ({ default: m.MatrixView })));
const TimelineView = lazy(() => import("./TaskBoards").then((m) => ({ default: m.TimelineView })));
import { describeCriteria, matchesFilter, type FilterCriteria, type TaskFilter } from "./filters";
import { useProjectsIfAny } from "../projects/ProjectsProvider";
import { ModuleChip } from "../components/ModuleChip";
import { symbolPath } from "../components/symbols";
import { printDoc, usePrint } from "../print/print";
import { tasksPrintDoc } from "./taskPrint";
import { isKanbanGrouping, KANBAN_GROUPINGS, kanbanColumns, QUADRANTS, quadrantOf, timeline } from "./taskViews";
import { KEYS } from "../lib/itemKeys";

type ViewId = "liste" | "kanban" | "matrice" | "chronologie";
const VIEWS: readonly { id: ViewId; label: string }[] = [
  { id: "liste", label: tr("Liste") },
  { id: "kanban", label: tr("Kanban") },
  { id: "matrice", label: tr("Matrice") },
  { id: "chronologie", label: tr("Chronologie") },
];

const isViewId = (v: unknown): v is ViewId => VIEWS.some((x) => x.id === v);

const EMPTY_TEXT: Record<string, string> = {
  boite: tr("Aucune tâche dans la boîte de réception."),
  aujourdhui: tr("Aucune tâche pour aujourd'hui."),
  "a-venir": tr("Aucune tâche à venir."),
  "en-retard": tr("Aucune tâche en retard."),
  "sans-date": tr("Aucune tâche sans date."),
  terminees: tr("Aucune tâche terminée ces 30 derniers jours."),
};

function dateModeFor(list: SmartListId): RowDateMode {
  if (list === "aujourdhui" || list === "a-venir") return "time";
  if (list === "boite" || list === "sans-date") return "none";
  return "relative";
}

/** La liste où une tâche nouvellement ajoutée se trouve. */
function homeList(task: Task, today: DayKey): SmartListId {
  if (task.inbox) return "boite";
  if (task.dueDate === null) return "sans-date";
  if (task.dueDate <= addDays(today, 1)) return "aujourdhui";
  return "a-venir";
}

/** Écran Tâches (maquette Taches.dc.html). */
export function TasksScreen() {
  const { tasks, visible, loaded, today, setDone, remove, update } = useTasks();
  const bulk = useBulk();
  const { spaces, filter, setFilter } = useSpaces();
  const notify = useToast();
  const [list, setListState] = useState<SmartListId>(() => readPref("listeTaches", "aujourdhui", isSmartListId));
  const [view, setViewState] = useState<ViewId>(() => readPref("vueTaches", "liste", isViewId));
  const setView = useCallback((v: ViewId) => {
    setViewState(v);
    writePref("vueTaches", v);
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const itemMenu = useItemMenu();
  const taskMenu = useTaskMenu();
  const taskBulk = useTaskBulk();
  // Tâches cochées dans cette liste : elles restent visibles (barrées) jusqu'au changement de liste.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  // Affichage de la liste (tri, regroupement, priorité, terminées), gardé pour chaque liste.
  const [display, setDisplayState] = useState<ListDisplay>(() => readDisplay(list));
  useEffect(() => setDisplayState(readDisplay(list)), [list]);
  const setDisplay = (next: ListDisplay) => {
    setDisplayState(next);
    writeDisplay(list, next);
  };
  const minPriority = display.minPriority;
  const setMinPriority = (value: ListDisplay["minPriority"]) => setDisplay({ ...display, minPriority: value });
  const inputRef = useRef<HTMLInputElement>(null);
  const [callout, setCallout] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const setList = useCallback((next: SmartListId) => {
    setListState(next);
    setKept(new Set());
    writePref("listeTaches", next);
  }, []);

  const focusQuickAdd = useCallback(() => {
    setView("liste");
    setCallout((n) => n + 1);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (takePendingQuickAdd()) focusQuickAdd();
    return onQuickAddRequest(focusQuickAdd);
  }, [focusQuickAdd]);

  const { go } = useNavigation();
  const { filters: savedFilters, loaded: filtersLoaded } = useTaskFilters();
  const [filterDialog, setFilterDialog] = useState<{ filter: TaskFilter | null; initial?: Partial<FilterCriteria> } | null>(null);
  const projects = useProjectsIfAny()?.projects ?? [];
  const criteriaNames = {
    space: (id: string) => spaces.find((s) => s.id === id)?.name ?? null,
    project: (id: string) => projects.find((p) => p.id === id)?.name ?? null,
  };
  // Filtre supprimé (ou d'un autre compte) : retour à « Aujourd'hui ».
  useEffect(() => {
    if (filtersLoaded && list.startsWith("filtre:") && !savedFilters.some((f) => f.id === list.slice(7))) setList("aujourdhui");
  }, [filtersLoaded, savedFilters, list, setList]);

  // Ctrl+P : la liste ou la vue affichée, telle qu'à l'écran.
  const printTasks = () => {
    const spaceName = (id: string | null) => spaces.find((s) => s.id === id)?.name ?? null;
    const subtitle =
      [
        filter !== "tous" ? tr("Espace : {name}", { name: spaceName(filter) }) : null,
        minPriority > 0 ? tr("Priorité : {priority}", { priority: PRIORITY_FILTERS.find((f) => f.value === minPriority)!.label.toLowerCase() }) : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined;
    let title: string;
    let groups: { title: string; tasks: readonly Task[] }[];
    if (view === "liste") {
      title = currentLabel;
      groups = sections.map((s) => ({ title: [s.title, s.subtitle].filter(Boolean).join(" · "), tasks: s.tasks }));
    } else if (view === "kanban") {
      const grouping = readPref("kanbanTaches", "avancement", isKanbanGrouping);
      title = tr("Kanban par {grouping}", { grouping: KANBAN_GROUPINGS.find((g) => g.id === grouping)!.label.toLowerCase() });
      groups = kanbanColumns(viewTasks, grouping, spaces, Math.floor(Date.now() / 1000)).map((c) => ({ title: c.label, tasks: c.tasks }));
    } else if (view === "matrice") {
      title = tr("Matrice urgent / important");
      groups = QUADRANTS.map((q) => ({
        title: `${q.label} · ${q.hint.toLowerCase()}`,
        tasks: viewTasks.filter((t) => t.doneAt === null && quadrantOf(t, today) === q.id),
      }));
    } else {
      title = tr("Chronologie");
      groups = timeline(viewTasks, today).map((g) => ({ title: g.label, tasks: g.tasks }));
    }
    printDoc(tasksPrintDoc(tr("Tâches · {title}", { title }), groups, today, { subtitle, spaceName: filter === "tous" ? spaceName : undefined }));
  };
  usePrint(() => printTasks);

  // Tâches à faire de la liste ou de la vue affichée, en tableau réimportable.
  const exportTasks = async () => {
    const open = (view === "liste" ? sections.flatMap((s) => s.tasks) : sortTasks(viewTasks)).filter((t) => t.doneAt === null);
    if (open.length === 0) {
      notify(tr("Aucune tâche à exporter."));
      return;
    }
    try {
      const path = await exportFile(tr("Tâches - {name}", { name: view === "liste" ? currentLabel : VIEWS.find((v) => v.id === view)!.label }), "csv", toTasksCsv(open, spaces));
      if (path) notify(open.length > 1 ? tr("{length} tâches exportées.", { length: open.length }) : tr("Tâche exportée."));
    } catch (err) {
      notify(dataErrorMessage(err as DataError));
    }
  };

  useScreenMenu(() => [
    { label: tr("Nouvelle tâche"), icon: ICONS.plus, shortcut: KEYS.create, run: focusQuickAdd },
    {
      label: tr("Nouveau filtre…"),
      icon: ICONS.filter,
      // Depuis une étiquette ou avec une priorité choisie : le filtre part de ce qui est affiché.
      run: () => setFilterDialog({ filter: null, initial: { tags: list.startsWith("tag:") ? [list.slice(4)] : [], minPriority } }),
    },
    {
      label: tr("Planifier ma journée"),
      icon: ICONS.sun,
      run: () => {
        go("accueil");
        requestDayPlanner();
      },
    },
    "separator",
    submenuEntry(tr("Affichage"), ICONS.layers, [
      ...VIEWS.map((v) => ({ label: v.label, checked: view === v.id, run: () => setView(v.id) })),
      "separator",
      ...PRIORITY_FILTERS.map((f) => ({ label: tr("Priorité : {label}", { label: f.label.toLowerCase() }), checked: minPriority === f.value, run: () => setMinPriority(f.value) })),
    ]),
    "separator",
    { label: tr("Imprimer…"), icon: ICONS.printer, shortcut: KEYS.print, run: printTasks },
    { label: tr("Exporter les tâches (.csv)…"), icon: ICONS.save, run: () => void exportTasks() },
  ]);

  // Tâche à ouvrir (notification, rappel manqué) : sa liste s'affiche et elle est sélectionnée.
  const [openId, setOpenId] = useState<string | null>(() => takePendingTaskOpen());
  useEffect(() => onTaskOpenRequest(setOpenId), []);
  useEffect(() => {
    if (!openId || !loaded) return;
    const task = tasks.find((t) => t.id === openId);
    setOpenId(null);
    if (!task) return;
    if (filter !== "tous" && task.spaceId !== filter) setFilter("tous");
    setView("liste");
    setList(task.doneAt !== null ? "terminees" : homeList(task, today));
    setSelectedId(task.id);
  }, [openId, loaded, tasks, filter, setFilter, setList, today]);

  // Filtre enregistré affiché (« filtre:<id> ») : ses critères remplacent ceux d'une liste.
  const activeFilter = list.startsWith("filtre:") ? (savedFilters.find((f) => f.id === list.slice(7)) ?? null) : null;
  const belongs = (t: Task) => (activeFilter ? matchesFilter(t, activeFilter.criteria, today) : inList(t, list, today));
  const currentLabel = activeFilter?.name ?? listLabel(list);
  // Avec « Afficher les tâches terminées », celles de la liste restent visibles sous les autres.
  const belongsOpen = (t: Task) => belongs({ ...t, doneAt: null });
  const shown = visible.filter((t) => belongs(t) || kept.has(t.id) || (display.showDone && t.doneAt !== null && belongsOpen(t)));
  // Kanban, Matrice et Chronologie : toutes les tâches de l'espace affiché, au filtre de priorité.
  const viewTasks = visible.filter((t) => t.priority >= minPriority);
  const openInView = (t: Task) => setSelectedId((id) => (id === t.id ? null : t.id));
  const sections = displaySections(list, shown, today, display, criteriaNames);
  const selected = visible.find((t) => t.id === selectedId) ?? null;
  const dateMode = dateModeFor(list);
  // Plusieurs tâches à la fois : Ctrl+clic, Maj+clic, Ctrl+A dans la liste.
  const order = sections.flatMap((s) => s.tasks.map((t) => t.id));
  const pick = useSelection(order, selectedId);
  const picked = pickedIn(shown, { ids: pick.ids, anchor: null });
  const bulkActions = taskBulk(picked, { onDone: (ids) => setKept((k) => new Set([...k, ...ids])) });

  const toggle = (task: Task) => {
    setKept((k) => new Set(k).add(task.id));
    void setDone(task, task.doneAt === null);
  };

  // Glisser des tâches (ou la sélection) sur une liste de gauche (Aujourd'hui, À venir : demain,
  // Sans date, Boîte de réception, Terminées), une étiquette, ou une autre section de la liste
  // (journée, priorité, espace, projet). Le clic droit reste l'équivalent au clavier.
  const changesFor = (task: Task, key: string) =>
    key.startsWith("liste:") ? listChanges(task, key.slice(6) as SmartListId, today) : key.startsWith("section:") ? sectionChanges(list, display.group, key.slice(8)) : null;
  const dropMessage = (key: string, n: number) => {
    if (key === "liste:aujourdhui") return trn(n, "Tâche prévue aujourd'hui.", "{n} tâches prévues aujourd'hui.");
    if (key === "liste:a-venir") return trn(n, "Tâche prévue demain.", "{n} tâches prévues demain.");
    if (key === "liste:sans-date") return trn(n, "Échéance retirée.", "Échéance retirée de {n} tâches.");
    if (key === "liste:boite") return trn(n, "Tâche placée dans la boîte de réception.", "{n} tâches placées dans la boîte de réception.");
    if (key === "liste:terminees") return trn(n, "Tâche terminée.", "{n} tâches terminées.");
    if (key.startsWith("liste:tag:")) return trn(n, "Étiquette « {tag} » ajoutée à la tâche.", "Étiquette « {tag} » ajoutée à {n} tâches.", { tag: key.slice(10) });
    const section = sections.find((s) => `section:${s.key}` === key);
    return section?.title
      ? trn(n, "Tâche déplacée dans « {name} ».", "{n} tâches déplacées dans « {name} ».", { name: section.title })
      : trn(n, "Tâche déplacée dans la section.", "{n} tâches déplacées dans la section.");
  };
  const dragTasks = (t: Task) => (e: PointerEvent<HTMLElement>) => {
    const moved = pick.has(t.id) && pick.count > 1 ? picked : [t];
    startDrag(
      e,
      { kind: "tache", ids: moved.map((x) => x.id), label: dragLabel(moved.length, t.title, tr("tâches")), color: t.color },
      {
        canDrop: (key) => moved.some((x) => changesTask(x, changesFor(x, key))),
        onDrop: (key) =>
          void bulk(dropMessage(key, moved.length), tr("déplacement des tâches"), async () => {
            for (const x of moved) {
              const changes = changesFor(x, key);
              if (!changesTask(x, changes)) continue;
              if (changes === "terminer") {
                setKept((k) => new Set(k).add(x.id));
                await setDone(x, true);
              } else if (changes) await update(x, changes);
            }
          }),
      },
    );
  };

  const onAdded = (task: Task) => {
    if (belongs(task)) return;
    const target = homeList(task, today);
    notify(tr("Tâche ajoutée à « {listLabel} ».", { listLabel: listLabel(target) }), { label: tr("Afficher"), run: () => setList(target) });
  };

  /** Flèches haut et bas : passer d'une tâche à l'autre. */
  const onKeyNav = (e: KeyboardEvent<HTMLButtonElement>) => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>(".task-main") ?? [])];
    const index = buttons.indexOf(e.currentTarget);
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(index + 1, buttons.length - 1);
    else if (e.key === "ArrowUp") next = Math.max(index - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = buttons.length - 1;
    if (next < 0) return;
    e.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <div
      className="screen tasks-screen"
      onKeyDown={(e) => {
        if (e.key === "Escape" && pick.count > 0 && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          pick.clear();
        } else if (e.key === "Escape" && selected && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          setSelectedId(null);
        }
      }}
    >
      <header className="tasks-header">
        <ScreenTitle module="taches" />
        <Tabs items={VIEWS} value={view} onChange={setView} label={tr("Vue")} idPrefix="taches" />
        <span className="tasks-header-spacer" />
        <TaskDisplayMenu display={display} onChange={setDisplay} listView={view === "liste"} />
        <button type="button" className="btn-gel" title={tr("Nouvelle tâche ({create})", { create: KEYS.create })} onClick={focusQuickAdd}>
          <Icon d={ICONS.plus} size={16} stroke={2.8} />
          <span>{tr("Nouvelle tâche")}</span>
        </button>
      </header>

      {view !== "liste" ? (
        <div className="tasks-body" id={`taches-panel-${view}`} role="tabpanel" aria-labelledby={`taches-tab-${view}`}>
          <Suspense fallback={null}>
          {view === "kanban" && <KanbanView tasks={viewTasks} selectedId={selectedId} onOpen={openInView} />}
          {view === "matrice" && <MatrixView tasks={viewTasks} selectedId={selectedId} onOpen={openInView} />}
          {view === "chronologie" && (
            <TimelineView
              tasks={viewTasks}
              selectedId={selectedId}
              onOpen={openInView}
              onShowUndated={() => {
                setView("liste");
                setList("sans-date");
              }}
            />
          )}
          </Suspense>
          {selected && <TaskDetail key={selected.id} task={selected} onClose={() => setSelectedId(null)} />}
        </div>
      ) : (
        <div className="tasks-body" id="taches-panel-liste" role="tabpanel" aria-labelledby="taches-tab-liste">
          <ListsPanel value={list} onChange={setList} onEditFilter={(f) => setFilterDialog({ filter: f })} />
          <section className="task-panel glass" aria-label={currentLabel}>
            {activeFilter && (
              <header className="task-filter-head">
                <ModuleChip color={activeFilter.color ?? "var(--aq-accent)"} icon={symbolPath(activeFilter.icon, ICONS.filter)} size={26} />
                <div className="task-filter-text">
                  <h2 className="task-filter-name">{activeFilter.name}</h2>
                  <p className="task-filter-desc">{describeCriteria(activeFilter.criteria, criteriaNames)}</p>
                </div>
                <button type="button" className="btn-glass btn-glass--sm" onClick={() => setFilterDialog({ filter: activeFilter })}>
                  <Icon d={ICONS.pencil} size={14} stroke={2.2} />
                  {tr("Modifier")}
                </button>
              </header>
            )}
            <QuickAddField list={list} inputRef={inputRef} onAdded={onAdded} callout={callout} />
            <div className="task-scroll" ref={listRef} onKeyDown={pick.onListKeyDown}>
              {loaded && sections.length === 0 && (
                <EmptyState
                  color={getModule("taches").color}
                  icon={getModule("taches").icon}
                  text={
                    minPriority > 0
                      ? tr("Aucune tâche avec ce filtre.")
                      : activeFilter
                        ? tr("Aucune tâche ne correspond à ce filtre.")
                        : (EMPTY_TEXT[list] ?? tr("Aucune tâche avec cette étiquette."))
                  }
                  action={list === "terminees" ? undefined : { label: tr("Nouvelle tâche"), run: focusQuickAdd }}
                />
              )}
              {sections.map((s) => (
                <div key={s.key} className="task-section" {...(sectionChanges(list, display.group, s.key) ? dropTarget(`section:${s.key}`, "tache") : {})}>
                  {s.title && (
                    <h2 className="task-section-title" data-tone={s.tone}>
                      {s.title}
                      <span className="task-section-sub">
                        {s.subtitle && ` · ${s.subtitle}`} · {s.tasks.length}
                      </span>
                    </h2>
                  )}
                  <ul className="task-rows">
                    {s.tasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        today={today}
                        space={spaces.find((sp) => sp.id === t.spaceId)}
                        dateMode={dateMode}
                        selected={t.id === selectedId}
                        picked={pick.has(t.id)}
                        onSelect={(e) => {
                          if (!pick.click(e, t.id)) setSelectedId((id) => (id === t.id ? null : t.id));
                        }}
                        onToggle={() => toggle(t)}
                        onKeyNav={onKeyNav}
                        onDrag={dragTasks(t)}
                        menu={itemMenu(() =>
                          pick.has(t.id) && pick.count > 1 ? selectionEntries(bulkActions) : taskMenu(t, {
                            open: () => setSelectedId(t.id),
                            remove: () => {
                              if (t.id === selectedId) setSelectedId(null);
                              void remove(t);
                            },
                          }),
                        )}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <SelectionBar count={pick.count} label={[tr("tâche sélectionnée"), tr("tâches sélectionnées")]} actions={bulkActions} onClear={pick.clear} />
            {shown.length > 0 && pick.count === 0 && (
              <p className="task-footer">
                {shown.length} {shown.length > 1 ? tr("tâches affichées") : tr("tâche affichée")}
              </p>
            )}
          </section>
          {/* Plusieurs tâches sélectionnées : la liste prend la place du détail. */}
          {selected && pick.count < 2 && (
            <TaskDetail
              key={selected.id}
              task={selected}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
      {filterDialog && (
        <Suspense fallback={null}>
        <FilterDialog
          filter={filterDialog.filter ?? undefined}
          initial={filterDialog.initial}
          onClose={() => setFilterDialog(null)}
          onSaved={(f) => {
            setView("liste");
            setList(`filtre:${f.id}`);
          }}
        />
        </Suspense>
      )}
    </div>
  );
}
