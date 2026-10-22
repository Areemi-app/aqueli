import { useItemMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { symbolPath } from "../components/symbols";
import { KEYS } from "../lib/itemKeys";
import { dropTarget, startDrag } from "../lib/dragDrop";
import { useProjectsIfAny } from "../projects/ProjectsProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { describeCriteria, filterListId, matchesFilter, type TaskFilter } from "./filters";
import { useTaskFilters } from "./TaskFiltersProvider";
import { countFor, SMART_LISTS, tagsInUse, type SmartListId } from "./tasks";
import { useTasks } from "./TasksProvider";
import { tr } from "../i18n/i18n";

const LIST_ICONS: Record<(typeof SMART_LISTS)[number]["id"], string> = {
  boite: ICONS.inbox,
  aujourdhui: ICONS.today,
  "a-venir": ICONS.calendar,
  "en-retard": ICONS.overdue,
  "sans-date": ICONS.noDate,
  terminees: ICONS.check,
};

interface ListsPanelProps {
  value: SmartListId;
  onChange: (list: SmartListId) => void;
  /** « Nouveau filtre… » ; « Modifier… » d'un filtre enregistré. */
  onEditFilter: (filter: TaskFilter | null) => void;
}

/** Listes intelligentes et étiquettes (maquette Tâches, colonne de gauche). */
export function ListsPanel({ value, onChange, onEditFilter }: ListsPanelProps) {
  const { visible, today } = useTasks();
  const tags = tagsInUse(visible);
  const { filters, move, remove, reorder } = useTaskFilters();
  const { spaces } = useSpaces();
  const projects = useProjectsIfAny()?.projects ?? [];
  const itemMenu = useItemMenu();
  const names = {
    space: (id: string) => spaces.find((s) => s.id === id)?.name ?? null,
    project: (id: string) => projects.find((p) => p.id === id)?.name ?? null,
  };

  return (
    <nav className="task-lists glass" aria-label={tr("Listes de tâches")}>
      <div className="section-label">{tr("Listes")}</div>
      {SMART_LISTS.map((l) => {
        const count = countFor(visible, l.id, today);
        return (
          <button
            key={l.id}
            type="button"
            className="task-list-item"
            aria-current={value === l.id ? "page" : undefined}
            onClick={() => onChange(l.id)}
            {...(l.id === "en-retard" ? {} : dropTarget(`liste:${l.id}`, "tache"))}
          >
            <ModuleChip color={l.color} icon={LIST_ICONS[l.id]} size={20} />
            <span className="task-list-label">{l.label}</span>
            {count > 0 &&
              (l.id === "en-retard" ? (
                <span className="count-badge count-badge--danger">{count}</span>
              ) : (
                <span className="task-list-count" data-current={value === l.id || undefined}>
                  {count}
                </span>
              ))}
          </button>
        );
      })}
      <div className="section-label task-lists-tags-label task-filters-head">
        {tr("Filtres")}
        <button type="button" className="notes-nav-add" aria-label={tr("Nouveau filtre")} title={tr("Nouveau filtre")} onClick={() => onEditFilter(null)}>
          <Icon d={ICONS.plus} size={13} stroke={2.6} />
        </button>
      </div>
      <div className="task-filters" data-sort="filtres">
      {filters.map((f, i) => {
        const id = filterListId(f.id);
        const count = visible.filter((t) => t.doneAt === null && matchesFilter(t, f.criteria, today)).length;
        const menu = itemMenu(() => [
          { label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => onChange(id) },
          { label: tr("Modifier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => onEditFilter(f) },
          "separator",
          { label: tr("Monter"), icon: ICONS.arrowUp, disabled: i === 0, run: () => void move(f, -1) },
          { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: i === filters.length - 1, run: () => void move(f, 1) },
          "separator",
          {
            label: tr("Supprimer le filtre"),
            icon: ICONS.trash,
            shortcut: KEYS.remove,
            danger: true,
            run: () => {
              if (value === id) onChange("aujourdhui");
              void remove(f);
            },
          },
        ]);
        return (
          <button
            key={f.id}
            type="button"
            className="task-list-item"
            aria-current={value === id ? "page" : undefined}
            title={describeCriteria(f.criteria, names)}
            onClick={() => onChange(id)}
            data-sort-id={f.id}
            onPointerDown={(e) =>
              startDrag(e, { kind: "filtre", ids: [f.id], label: f.name, color: f.color }, { sort: { group: "filtres", onSort: (ids) => void reorder(ids) } })
            }
            {...menu}
          >
            <ModuleChip color={f.color ?? "var(--aq-accent)"} icon={symbolPath(f.icon, ICONS.filter)} size={20} />
            <span className="task-list-label">{f.name}</span>
            {count > 0 && (
              <span className="task-list-count" data-current={value === id || undefined}>
                {count}
              </span>
            )}
          </button>
        );
      })}
      </div>
      {filters.length === 0 && <p className="notes-nav-empty">{tr("Aucun filtre enregistré.")}</p>}
      {tags.length > 0 && (
        <>
          <div className="section-label task-lists-tags-label">{tr("Étiquettes")}</div>
          <div className="task-tags-cloud">
            {tags.map((tag) => {
              const id: SmartListId = `tag:${tag}`;
              return (
                <button
                  key={tag}
                  type="button"
                  className="pill pill--button"
                  aria-current={value.toLowerCase() === id.toLowerCase() ? "page" : undefined}
                  onClick={() => onChange(id)}
                  {...dropTarget(`liste:${id}`, "tache")}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </>
      )}
    </nav>
  );
}
