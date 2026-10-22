/**
 * Écran Projets (cahier des charges § 4.9) : liste des projets avec leur avancement ; projet
 * ouvert avec son tableau (À faire, En cours, Terminé), ses tâches en liste, ses étapes et
 * ses éléments liés.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { submenuEntry, useItemMenu, useScreenMenu } from "../components/ContextMenu";
import { ScreenTitle } from "../components/ScreenTitle";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { Select } from "../components/SelectRow";
import { symbolPath } from "../components/symbols";
import { Tabs, type TabItem } from "../components/Tabs";
import { KEYS } from "../lib/itemKeys";
import { useContactRefs, useLinkContacts } from "../contacts/contactRefs";
import { startDrag } from "../lib/dragDrop";
import { usePinEntry } from "../pins/pins";
import { NEW_ITEM, projectRequest } from "../lib/request";
import { LinksSection } from "../links/LinksSection";
import { getModule } from "../modules/modules";
import { useNewItem } from "../shell/newItem";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, fromDayKey, relativeDay, type DayKey } from "../tasks/day";
import { parseQuickAdd } from "../tasks/quickAdd";
import { SubtasksPanel } from "../tasks/SubtasksPanel";
import { SubtaskChecklist } from "./SubtaskChecklist";
import { TaskDetail } from "../tasks/TaskDetail";
import { useTaskMenu } from "../tasks/taskMenu";
import { PRIORITY_LABELS, sortTasks, type Task } from "../tasks/tasks";
import { useTasks } from "../tasks/TasksProvider";
import { ProjectEditor } from "./ProjectEditor";
import {
  deadlineLabel,
  HEALTH_LABELS,
  healthOf,
  nextMilestone,
  progressOf,
  sortMilestones,
  stageOf,
  STAGES,
  STATUS_LABELS,
  timelinePosition,
  type Milestone,
  type Project,
  type ProjectStatus,
  type Stage,
} from "./projects";
import { useProjects } from "./ProjectsProvider";
import { DateField } from "../components/DateField";
import { locale, tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

type View = "actifs" | "archives";
const VIEWS: readonly TabItem<View>[] = [
  { id: "actifs", label: tr("Projets") },
  { id: "archives", label: tr("Archivés") },
];

type Pane = "tableau" | "liste" | "jalons" | "liens";
const PANES: readonly TabItem<Pane>[] = [
  { id: "tableau", label: tr("Tableau|vue") },
  { id: "liste", label: tr("Liste") },
  { id: "jalons", label: tr("Étapes") },
  { id: "liens", label: tr("Éléments liés") },
];

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as ProjectStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] }));
const SHORT_DATE = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" });

const colorOf = (p: Pick<Project, "color">) => p.color ?? getModule("projets").color;

/** Tâches de chaque projet. */
function useProjectTasks(): Map<string, Task[]> {
  const { tasks } = useTasks();
  return useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) if (t.projectId) map.set(t.projectId, [...(map.get(t.projectId) ?? []), t]);
    return map;
  }, [tasks]);
}

/** Tâches terminées il y a plus de 30 jours, par projet : elles comptent dans l'avancement. */
function useOlderDone(): Map<string, { doneAt: number }[]> {
  const { olderDone } = useTasks();
  return useMemo(() => {
    const map = new Map<string, { doneAt: number }[]>();
    for (const t of olderDone) if (t.projectId) map.set(t.projectId, [...(map.get(t.projectId) ?? []), t]);
    return map;
  }, [olderDone]);
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="project-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="project-progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

// ——— Liste des projets ———

function ProjectRow({ project, selected, onSelect, onEdit }: { project: Project; selected: boolean; onSelect: () => void; onEdit: () => void }) {
  const { milestones, update, archive, remove, move, reorder } = useProjects();
  const { today } = useTasks();
  const tasks = useProjectTasks().get(project.id) ?? [];
  const older = useOlderDone().get(project.id) ?? [];
  const ms = milestones.get(project.id) ?? [];
  const progress = progressOf([...tasks, ...older], ms);
  const next = nextMilestone(ms);
  const health = healthOf(project, tasks, ms, today);
  const itemMenu = useItemMenu();
  const pinEntry = usePinEntry();
  const menu = itemMenu(() => [
    { label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: onSelect },
    { label: tr("Modifier"), icon: ICONS.pencil, shortcut: KEYS.rename, run: onEdit },
    pinEntry({ kind: "project", id: project.id }),
    "separator",
    submenuEntry(tr("Statut"), ICONS.flag, STATUS_OPTIONS.map((s) => ({ label: s.label, checked: project.status === s.value, run: () => void update(project, { status: s.value }) }))),
    { label: tr("Monter"), icon: ICONS.arrowUp, run: () => void move(project, -1) },
    { label: tr("Descendre"), icon: ICONS.arrowDown, run: () => void move(project, 1) },
    { label: project.archived ? tr("Ressortir des archives") : tr("Archiver"), icon: ICONS.layers, run: () => void archive(project, !project.archived) },
    "separator",
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void remove(project) },
  ]);
  const when = next?.dueDate ? tr("{label} : {value}", { label: next.title, value: deadlineLabel(next.dueDate, today).toLowerCase() }) : project.endDate ? tr("Fin : {when}", { when: deadlineLabel(project.endDate, today).toLowerCase() }) : null;
  return (
    <li
      className="project-row"
      data-selected={selected || undefined}
      data-status={project.status}
      style={{ "--row-color": colorOf(project) } as CSSProperties}
      tabIndex={0}
      onClick={onSelect}
      onFocus={onSelect}
      data-sort-id={project.id}
      // Glisser pour remettre en ordre ; « Monter » et « Descendre » (clic droit) au clavier.
      onPointerDown={(e) =>
        startDrag(e, { kind: "projet", ids: [project.id], label: project.name, color: colorOf(project) }, { sort: { group: "projets", onSort: (ids) => void reorder(ids) } })
      }
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      <ModuleChip color={colorOf(project)} icon={symbolPath(project.icon, ICONS.flag)} size={34} />
      <span className="project-row-text">
        <span className="project-row-name">
          {project.name}
          {health && health.level !== "bon" && (
            <span className="project-health project-health--small" data-level={health.level} title={health.reasons.join(" · ")}>
              {HEALTH_LABELS[health.level]}
            </span>
          )}
        </span>
        <span className="project-row-meta">{[project.status !== "en-cours" ? STATUS_LABELS[project.status] : null, when].filter(Boolean).join(" · ") || tr("Aucune échéance")}</span>
        <span className="project-row-progress">
          <ProgressBar percent={progress.percent} label={tr("Avancement de {name}", { name: project.name })} />
          <span className="project-row-percent">{progress.total ? `${progress.percent} %` : "–"}</span>
        </span>
      </span>
    </li>
  );
}

// ——— Tableau ———

interface DragState {
  task: Task;
  x: number;
  y: number;
  over: Stage | null;
}

function stageAt(x: number, y: number): Stage | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-stage]");
  return (el?.dataset.stage as Stage | undefined) ?? null;
}

/** Déplace une tâche d'une colonne à l'autre. */
function useMoveTask() {
  const { update, setDone } = useTasks();
  return async (task: Task, stage: Stage) => {
    if (stage === stageOf(task)) return;
    if (stage === "termine") {
      await setDone(task, true);
      return;
    }
    if (task.doneAt !== null) await setDone(task, false);
    await update(task, { doing: stage === "en-cours" });
  };
}

function Card({ task, onOpen, onPointerDown }: { task: Task; onOpen: () => void; onPointerDown: (e: ReactPointerEvent) => void }) {
  const { today } = useTasks();
  const taskMenu = useTaskMenu();
  const itemMenu = useItemMenu();
  const moveTask = useMoveTask();
  const stage = stageOf(task);
  const menu = itemMenu(() =>
    taskMenu(task, {
      open: onOpen,
      extra: STAGES.filter((s) => s.id !== stage).map((s) => ({ label: tr("Vers « {label} »", { label: s.label }), icon: ICONS.arrowRight, run: () => void moveTask(task, s.id) })),
    }),
  );
  const late = task.doneAt === null && task.dueDate !== null && task.dueDate < today;
  return (
    <li
      className="board-card"
      data-done={task.doneAt !== null || undefined}
      style={task.color ? ({ "--row-color": task.color } as CSSProperties) : undefined}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={onOpen}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      <span className="board-card-title">{task.title}</span>
      {(task.dueDate || task.priority > 0) && (
        <span className="board-card-meta">
          {task.dueDate && (
            <span className="task-meta" data-late={late || undefined}>
              {relativeDay(task.dueDate, today)}
              {task.dueTime ? ` · ${task.dueTime}` : ""}
            </span>
          )}
          {task.priority > 0 && (
            <span className="task-flag" data-priority={task.priority} role="img" aria-label={tr("Priorité {x}", { x: PRIORITY_LABELS[task.priority].toLowerCase() })}>
              <Icon d={ICONS.flag} size={13} filled />
            </span>
          )}
        </span>
      )}
      <SubtaskChecklist task={task} onOpen={onOpen} />
    </li>
  );
}

function AddTask({ project }: { project: Project }) {
  const { create } = useTasks();
  const { spaces } = useSpaces();
  const contacts = useContactRefs();
  const linkContacts = useLinkContacts();
  const [text, setText] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const q = parseQuickAdd(text.trim(), new Date(), spaces, contacts);
    if (!q.title) return;
    setText("");
    const task = await create({
      title: q.title,
      notes: "",
      spaceId: q.spaceId ?? project.spaceId,
      dueDate: q.dueDate,
      dueTime: q.dueTime,
      priority: q.priority,
      estimate: null,
      tags: q.tags,
      subtasks: [],
      recurrence: q.recurrence,
      color: null,
      reminder: null,
      inbox: false,
      projectId: project.id,
    });
    await linkContacts({ kind: "task", id: task.id }, q.contactIds);
  };
  return (
    <form className="board-add" onSubmit={(e) => void submit(e)}>
      <Icon d={ICONS.plus} size={14} stroke={2.6} />
      <input className="board-add-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("Ajouter une tâche")} aria-label={tr("Ajouter une tâche au projet")} />
    </form>
  );
}

function Board({ project, tasks, onOpen }: { project: Project; tasks: readonly Task[]; onOpen: (t: Task) => void }) {
  const moveTask = useMoveTask();
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<{ task: Task; x: number; y: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!dragged.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      dragged.current = true;
      setDrag({ task: p.task, x: e.clientX, y: e.clientY, over: stageAt(e.clientX, e.clientY) });
    };
    const onUp = (e: PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      if (p && dragged.current) {
        const stage = stageAt(e.clientX, e.clientY);
        if (stage) void moveTask(p.task, stage);
        // Le clic qui suit un glisser n'ouvre pas la tâche.
        window.setTimeout(() => (dragged.current = false), 0);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [moveTask]);

  const columns = STAGES.map((s) => ({
    ...s,
    tasks: sortTasks(tasks.filter((t) => stageOf(t) === s.id)).sort((a, b) => (s.id === "termine" ? (b.doneAt ?? 0) - (a.doneAt ?? 0) : 0)),
  }));

  return (
    <div className="board" data-dragging={drag ? true : undefined}>
      {columns.map((col) => (
        <section key={col.id} className="board-column" data-stage={col.id} data-over={drag?.over === col.id || undefined} aria-label={col.label}>
          <h3 className="board-column-title">
            {col.label}
            <span className="board-count">{col.tasks.length}</span>
          </h3>
          {col.id === "a-faire" && <AddTask project={project} />}
          <ul className="board-cards">
            {col.tasks.map((t) => (
              <Card
                key={t.id}
                task={t}
                onOpen={() => !dragged.current && onOpen(t)}
                onPointerDown={(e) => {
                  if (e.button !== 0 || (e.target as HTMLElement).closest("button, input")) return;
                  pending.current = { task: t, x: e.clientX, y: e.clientY };
                }}
              />
            ))}
          </ul>
          {col.tasks.length === 0 && col.id !== "a-faire" && <p className="board-empty">{col.id === "en-cours" ? tr("Glisser une tâche ici.") : tr("Aucune tâche terminée.")}</p>}
        </section>
      ))}
      {drag &&
        createPortal(
          <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }} aria-hidden="true">
            {drag.task.title}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ——— Liste ———

function TaskList({ tasks, onOpen }: { tasks: readonly Task[]; onOpen: (t: Task) => void }) {
  const { setDone, today } = useTasks();
  const taskMenu = useTaskMenu();
  const itemMenu = useItemMenu();
  const sorted = sortTasks(tasks);
  if (sorted.length === 0) return <p className="tasks-empty">{tr("Aucune tâche dans ce projet.")}</p>;
  return (
    <ul className="today-rows project-list">
      {sorted.map((t) => {
        const done = t.doneAt !== null;
        const menu = itemMenu(() => taskMenu(t, { open: () => onOpen(t) }));
        return (
          <li key={t.id} className="today-row project-list-row" data-done={done || undefined} onContextMenu={menu.onContextMenu} onKeyDown={menu.onKeyDown}>
            <button
              type="button"
              className="task-check"
              data-sans-son
              aria-label={done ? tr("Rouvrir la tâche « {title} »", { title: t.title }) : tr("Terminer la tâche « {title} »", { title: t.title })}
              onClick={() => void setDone(t, !done)}
            >
              {done && <Icon d={ICONS.check} size={12} stroke={3.5} />}
            </button>
            <button type="button" className="today-title" onClick={() => onOpen(t)}>
              {t.title}
            </button>
            {t.doing && !done && <span className="pill">{tr("En cours")}</span>}
            {t.dueDate && (
              <span className="task-meta" data-late={(!done && t.dueDate < today) || undefined}>
                {relativeDay(t.dueDate, today)}
              </span>
            )}
            {t.subtasks.length > 0 && (
              <div className="project-list-subtasks">
                <SubtaskChecklist task={t} max={8} onOpen={() => onOpen(t)} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ——— Étapes (jalons datés) ———

function MilestoneRow({ milestone, today }: { milestone: Milestone; today: DayKey }) {
  const { updateMilestone, setMilestoneDone, removeMilestone } = useProjects();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const itemMenu = useItemMenu();
  const done = milestone.doneAt !== null;
  const menu = itemMenu(() => [
    { label: done ? tr("Rouvrir") : tr("Marquer atteint"), icon: ICONS.check, run: () => void setMilestoneDone(milestone, !done) },
    { label: tr("Renommer"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setEditing(true) },
    "separator",
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void removeMilestone(milestone) },
  ]);
  const commit = () => {
    setEditing(false);
    if (title.trim() && title.trim() !== milestone.title) void updateMilestone(milestone, { title: title.trim(), dueDate: milestone.dueDate });
    else setTitle(milestone.title);
  };
  return (
    <li className="milestone-row" data-done={done || undefined} onContextMenu={menu.onContextMenu} onKeyDown={editing ? undefined : menu.onKeyDown}>
      <button
        type="button"
        className="milestone-check"
        aria-pressed={done}
        aria-label={done ? tr("Rouvrir l'étape « {title} »", { title: milestone.title }) : tr("Marquer l'étape « {title} » comme atteinte", { title: milestone.title })}
        onClick={() => void setMilestoneDone(milestone, !done)}
      >
        <Icon d={done ? ICONS.check : ICONS.flag} size={13} stroke={2.8} filled={!done} />
      </button>
      {editing ? (
        <input
          className="detail-input milestone-title-input"
          value={title}
          maxLength={200}
          autoFocus
          aria-label={tr("Nom de l'étape")}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setTitle(milestone.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button type="button" className="milestone-title" onDoubleClick={() => setEditing(true)} title={tr("Double-clic pour renommer")}>
          {milestone.title}
        </button>
      )}
      {milestone.dueDate && !done && <span className="task-meta" data-late={milestone.dueDate < today || undefined}>{deadlineLabel(milestone.dueDate, today)}</span>}
      <DateField
        className="detail-input milestone-date"
        label={tr("Date de l'étape « {title} »", { title: milestone.title })}
        clearable
        value={milestone.dueDate}
        onChange={(v) => void updateMilestone(milestone, { title: milestone.title, dueDate: v || null })}
      />
    </li>
  );
}

/** Frise du projet : début, échéance, aujourd'hui et les étapes datées. */
function ProjectTimeline({ project, milestones, today }: { project: Project; milestones: readonly Milestone[]; today: DayKey }) {
  const dated = sortMilestones(milestones).filter((m) => m.dueDate !== null);
  if (dated.length === 0 && !(project.startDate && project.endDate)) return null;
  const days = [project.startDate, project.endDate, ...dated.map((m) => m.dueDate!)].filter((d): d is DayKey => d !== null).sort();
  const from = project.startDate ?? (days[0]! < today ? days[0]! : today);
  let to = project.endDate ?? days[days.length - 1]!;
  if (to <= from) to = addDays(from, 7);
  const at = (d: DayKey) => `${timelinePosition(d, from, to) * 100}%`;
  const showToday = today >= from && today <= to;
  return (
    <div className="project-timeline" aria-label={tr("Frise du projet")} role="group">
      <div className="project-timeline-track">
        {showToday && <span className="project-timeline-done" style={{ width: at(today) }} />}
      </div>
      {showToday && (
        <span className="project-timeline-today" style={{ left: at(today) }} title={tr("Aujourd'hui, {date}", { date: SHORT_DATE.format(fromDayKey(today)) })}>
          <span className="sr-only">{tr("Aujourd'hui")}</span>
        </span>
      )}
      {dated.map((m, i) => {
        const late = m.doneAt === null && m.dueDate! < today;
        const label = `${m.title} · ${SHORT_DATE.format(fromDayKey(m.dueDate!))}${m.doneAt !== null ? tr(" · atteinte") : late ? tr(" · dépassée") : ""}`;
        return (
          <span key={m.id} className="project-timeline-step" data-done={m.doneAt !== null || undefined} data-late={late || undefined} data-below={i % 2 === 1 || undefined} style={{ left: at(m.dueDate!) }} title={label}>
            <span className="project-timeline-dot" />
            {dated.length <= 8 && <span className="project-timeline-label">{m.title}</span>}
            <span className="sr-only">{label}</span>
          </span>
        );
      })}
      <span className="project-timeline-edge project-timeline-edge--start">{SHORT_DATE.format(fromDayKey(from))}</span>
      <span className="project-timeline-edge project-timeline-edge--end">{SHORT_DATE.format(fromDayKey(to))}</span>
    </div>
  );
}

function Milestones({ project }: { project: Project }) {
  const { milestones, addMilestone } = useProjects();
  const { today } = useTasks();
  const ids = useId();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const list = milestones.get(project.id) ?? [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    void addMilestone(project, { title: title.trim(), dueDate: date || null });
    setTitle("");
    setDate("");
  };
  return (
    <div className="milestones">
      <ProjectTimeline project={project} milestones={list} today={today} />
      <form className="milestone-add" onSubmit={submit}>
        <div className="field-box milestone-add-title">
          <input id={`${ids}-titre`} className="field-input" value={title} maxLength={200} placeholder={tr("Nouvelle étape : signature, départ…")} aria-label={tr("Nouvelle étape")} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <DateField className="detail-input" label={tr("Date de la nouvelle étape")} clearable value={date} onChange={(v) => setDate(v)} />
        <button type="submit" className="btn-glass" disabled={!title.trim()}>
          {tr("Ajouter")}
        </button>
      </form>
      {list.length === 0 ? (
        <p className="tasks-empty">{tr("Aucune étape.")}</p>
      ) : (
        <ul className="milestone-list">
          {list.map((m) => (
            <MilestoneRow key={m.id} milestone={m} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ——— Projet ouvert ———

function ProjectView({ project, onEdit, onOpenTask }: { project: Project; onEdit: () => void; onOpenTask: (t: Task) => void }) {
  const { milestones, update, archive } = useProjects();
  const { today } = useTasks();
  const tasks = useProjectTasks().get(project.id) ?? [];
  const older = useOlderDone().get(project.id) ?? [];
  const ms = milestones.get(project.id) ?? [];
  const progress = progressOf([...tasks, ...older], ms);
  const health = healthOf(project, [...tasks, ...older.map((o) => ({ ...o, dueDate: null }))], ms, today);
  const [pane, setPane] = useState<Pane>("tableau");
  const next = nextMilestone(ms);
  const dates = [project.startDate && SHORT_DATE.format(fromDayKey(project.startDate)), project.endDate && SHORT_DATE.format(fromDayKey(project.endDate))].filter(Boolean).join(" → ");
  return (
    <section className="project-view glass" style={{ "--row-color": colorOf(project) } as CSSProperties} aria-label={project.name}>
      <header className="project-head">
        <ModuleChip color={colorOf(project)} icon={symbolPath(project.icon, ICONS.flag)} size={44} />
        <div className="project-title">
          <h2>{project.name}</h2>
          <span className="project-subtitle">
            {[dates || null, project.endDate && project.status !== "termine" ? deadlineLabel(project.endDate, today) : null, next ? tr("Prochaine étape : {title}", { title: next.title }) : null]
              .filter(Boolean)
              .join(" · ") || tr("Aucune date")}
          </span>
        </div>
        <span className="tasks-header-spacer" />
        <Select value={project.status} options={STATUS_OPTIONS} label={tr("Statut du projet")} onChange={(status) => void update(project, { status })} />
        <button type="button" className="btn-glass" onClick={onEdit} title={tr("Modifier ({rename})", { rename: KEYS.rename })}>
          <Icon d={ICONS.pencil} size={14} stroke={2.2} />
          {tr("Modifier")}
        </button>
      </header>
      <div className="project-summary">
        <ProgressBar percent={progress.percent} label={tr("Avancement du projet")} />
        <span className="project-summary-text">
          {progress.total === 0 ? tr("Aucune tâche ni étape.") : tr("{done} sur {total} · {percent} %", { done: progress.done, total: progress.total, percent: progress.percent })}
          {health && health.late > 0 && tr(" · {late} en retard", { late: health.late })}
          {health && health.week > 0 && tr(" · {week} cette semaine", { week: health.week })}
        </span>
        {health && (
          <span className="project-health" data-level={health.level} title={health.reasons.join(" · ") || tr("Aucune tâche ni étape en retard.")}>
            {HEALTH_LABELS[health.level]}
          </span>
        )}
        {project.archived && (
          <button type="button" className="link-btn" onClick={() => void archive(project, false)}>
            {tr("Ressortir des archives")}
          </button>
        )}
      </div>
      {project.description && <p className="project-description">{project.description}</p>}
      <Tabs items={PANES} value={pane} onChange={setPane} label={tr("Contenu du projet")} idPrefix="projet" />
      <div className="project-pane" id={`projet-panel-${pane}`} role="tabpanel" aria-labelledby={`projet-tab-${pane}`}>
        {pane === "tableau" && <Board project={project} tasks={tasks} onOpen={onOpenTask} />}
        {pane === "liste" && (
          <>
            <AddTask project={project} />
            <TaskList tasks={tasks} onOpen={onOpenTask} />
          </>
        )}
        {pane === "jalons" && <Milestones project={project} />}
        {pane === "liens" && (
          <LinksSection
            item={{ kind: "project", id: project.id }}
            kinds={["note", "event", "obligation", "contact", "document"]}
            title={tr("Notes, événements, contacts et documents")}
            empty={tr("Aucun élément lié.")}
          />
        )}
      </div>
    </section>
  );
}

export function ProjectsScreen() {
  const { visible, loaded } = useProjects();
  const { tasks } = useTasks();
  const [pending] = useState(projectRequest.take);
  const [selectedId, setSelectedId] = useState<string | null>(pending === NEW_ITEM ? null : pending);
  const [view, setView] = useState<View>(() => (pending && visible.find((p) => p.id === pending)?.archived ? "archives" : "actifs"));
  const [editing, setEditing] = useState<Project | "nouveau" | null>(pending === NEW_ITEM ? "nouveau" : null);
  const [taskId, setTaskId] = useState<string | null>(null);
  useNewItem(() => setEditing("nouveau"));
  useScreenMenu(() => [{ label: tr("Nouveau projet"), icon: ICONS.plus, shortcut: KEYS.create, run: () => setEditing("nouveau") }]);

  useEffect(
    () =>
      projectRequest.on((id) => {
        if (id === NEW_ITEM) {
          setEditing("nouveau");
          return;
        }
        setSelectedId(id);
        setTaskId(null);
      }),
    [],
  );

  const list = visible.filter((p) => (view === "archives" ? p.archived : !p.archived));
  const selected = visible.find((p) => p.id === selectedId) ?? list[0] ?? null;
  useEffect(() => {
    if (selected && selected.archived !== (view === "archives") && selected.id === selectedId) setView(selected.archived ? "archives" : "actifs");
  }, [selected, selectedId, view]);
  const openTask = tasks.find((t) => t.id === taskId && t.projectId === selected?.id) ?? null;

  const onListKeys = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(".project-row")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const m = getModule("projets");
  return (
    <div className="screen projects-screen">
      <header className="tasks-header">
        <ScreenTitle module="projets" />
        <Tabs items={VIEWS} value={view} onChange={setView} label={tr("Projets affichés")} idPrefix="projets" />
        <span className="tasks-header-spacer" />
        <button type="button" className="btn-gel" onClick={() => setEditing("nouveau")}>
          <Icon d={ICONS.plus} size={16} stroke={2.8} />
          <span>{tr("Nouveau projet")}</span>
        </button>
      </header>

      {loaded && visible.length === 0 ? (
        <section className="coming-soon glass habits-empty">
          <Orb color={m.color} icon={m.icon} size={110} />
          <h2 className="coming-title">{tr("Aucun projet")}</h2>
          <p className="settings-intro"><Sentences text={tr("Un projet rassemble les tâches, les étapes, les notes et les documents d'un même chantier. Par exemple : un déménagement, un voyage, des travaux.")} /></p>
          <button type="button" className="btn-gel" onClick={() => setEditing("nouveau")}>
            <Icon d={ICONS.plus} size={16} stroke={2.8} />
            {tr("Nouveau projet")}
          </button>
        </section>
      ) : (
        <div className="projects-body" data-task={openTask ? true : undefined}>
          <section className="task-panel glass" id={`projets-panel-${view}`} role="tabpanel" aria-labelledby={`projets-tab-${view}`}>
            <div className="task-scroll">
              {loaded && list.length === 0 && <p className="tasks-empty">{view === "archives" ? tr("Aucun projet archivé.") : tr("Aucun projet en cours.")}</p>}
              <ul className="project-rows" data-sort="projets" onKeyDown={onListKeys}>
                {list.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    selected={selected?.id === p.id}
                    onSelect={() => {
                      if (selected?.id !== p.id) setTaskId(null);
                      setSelectedId(p.id);
                    }}
                    onEdit={() => setEditing(p)}
                  />
                ))}
              </ul>
            </div>
          </section>
          {selected ? (
            <ProjectView key={selected.id} project={selected} onEdit={() => setEditing(selected)} onOpenTask={(t) => setTaskId(t.id)} />
          ) : (
            // Vue sans projet (archives vides) : pas de grand panneau vide sous la liste.
            list.length > 0 && <section className="project-view glass habit-detail--empty">{tr("Aucun projet sélectionné.")}</section>
          )}
          {openTask && (
            <div className="project-task-panel">
              <SubtasksPanel task={openTask} separate />
              <TaskDetail task={openTask} onClose={() => setTaskId(null)} separateSubtasks />
            </div>
          )}
        </div>
      )}

      {editing && (
        <ProjectEditor
          project={editing === "nouveau" ? undefined : editing}
          onClose={(created) => {
            setEditing(null);
            if (created) {
              setView("actifs");
              setSelectedId(created.id);
            }
          }}
        />
      )}
    </div>
  );
}
