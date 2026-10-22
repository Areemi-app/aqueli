import { useEffect, useId, useState, type CSSProperties } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select, type SelectOption } from "../components/SelectRow";
import { useFocusIfAny } from "../focus/FocusProvider";
import { durationLabel } from "../focus/timer";
import { LinksSection } from "../links/LinksSection";
import { useProjectsIfAny } from "../projects/ProjectsProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { TASK_COLORS } from "./colors";
import type { Priority } from "./quickAdd";
import { RecurrenceField } from "./RecurrenceField";
import { SubtasksPanel } from "./SubtasksPanel";
import { reminderChoices, reminderLabel } from "./reminders";
import { PRIORITY_LABELS, type Task, type TaskInput } from "./tasks";
import { useTasks } from "./TasksProvider";
import { DateField } from "../components/DateField";
import { TimeField } from "../components/TimeField";
import { locale, tr } from "../i18n/i18n";

const PRIORITY_OPTIONS: SelectOption<string>[] = ([3, 2, 1, 0] as const).map((p) => ({
  value: String(p),
  label: PRIORITY_LABELS[p],
}));

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240, 480];

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

const ESTIMATE_OPTIONS: SelectOption<string>[] = [
  { value: "", label: tr("Aucune") },
  ...ESTIMATES.map((m) => ({ value: String(m), label: formatMinutes(m) })),
];

/** Texte modifiable, enregistré quand on quitte le champ (ou Entrée pour une ligne). */
function useDraft(value: string, save: (v: string) => void) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return {
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    commit: () => {
      if (draft !== value) save(draft);
    },
    reset: () => setDraft(value),
  };
}

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  /** Les sous-tâches sont montrées dans leur propre panneau, à côté. */
  separateSubtasks?: boolean;
}

/** Panneau de détail d'une tâche (maquette Tâches), modifiable directement. */
export function TaskDetail({ task, onClose, separateSubtasks }: TaskDetailProps) {
  const { update, setDone, remove, today } = useTasks();
  const focusMinutes = useFocusIfAny()?.byTask.get(task.id) ?? 0;
  const projects = useProjectsIfAny()?.projects ?? [];
  const project = projects.find((p) => p.id === task.projectId);
  const projectOptions: SelectOption<string>[] = [
    { value: "", label: tr("Aucun projet") },
    ...projects.filter((p) => !p.archived || p.id === task.projectId).map((p) => ({ value: p.id, label: p.name })),
    ...(task.projectId && !project ? [{ value: task.projectId, label: tr("Projet supprimé") }] : []),
  ];
  const { spaces } = useSpaces();
  const done = task.doneAt !== null;
  const ids = useId();
  const change = (changes: Partial<TaskInput>) => void update(task, changes);

  const title = useDraft(task.title, (v) => (v.trim() ? change({ title: v }) : title.reset()));
  const notes = useDraft(task.notes, (v) => change({ notes: v }));
  const [newTag, setNewTag] = useState("");
  const space = spaces.find((s) => s.id === task.spaceId);

  const addTag = () => {
    const tag = newTag.trim().replace(/^#/, "");
    if (!tag) return;
    if (!task.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) change({ tags: [...task.tags, tag] });
    setNewTag("");
  };

  const spaceOptions: SelectOption<string>[] = [
    ...spaces.map((s) => ({ value: s.id, label: s.name })),
    ...(task.spaceId && !space ? [{ value: task.spaceId, label: tr("Espace supprimé") }] : []),
    { value: "", label: tr("Aucun espace") },
  ];

  return (
    <aside className="task-detail glass" aria-label={tr("Détail de la tâche")}>
      <div className="detail-head">
        <button
          type="button"
          className="task-check task-check--lg"
          data-sans-son
          aria-label={done ? tr("Rouvrir la tâche") : tr("Terminer la tâche")}
          onClick={() => void setDone(task, !done)}
        >
          {done && <Icon d={ICONS.check} size={13} stroke={3.5} />}
        </button>
        <div className="detail-heading">
          <label htmlFor={`${ids}-titre`} className="sr-only">
            {tr("Titre")}
          </label>
          <textarea
            id={`${ids}-titre`}
            className="detail-title"
            rows={1}
            value={title.value}
            onChange={title.onChange}
            onBlur={title.commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                title.reset();
              }
            }}
            data-done={done || undefined}
          />
          <div className="detail-space">
            <span
              className="space-dot"
              style={{ "--space-color": space?.color ?? "transparent" } as CSSProperties}
              aria-hidden="true"
            />
            <Select
              label={tr("Espace")}
              value={task.spaceId ?? ""}
              options={spaceOptions}
              onChange={(v) => change({ spaceId: v || null })}
            />
          </div>
        </div>
        <button type="button" className="icon-btn icon-btn--sm detail-close" aria-label={tr("Fermer le panneau (Échap)")} onClick={onClose}>
          <Icon d={ICONS.close} size={14} stroke={2.4} />
        </button>
      </div>

      <div className="detail-scroll">
        <div className="detail-grid">
          {projectOptions.length > 1 && (
            <>
              <label htmlFor={`${ids}-projet`} className="detail-label">
                {tr("Projet")}
              </label>
              <Select id={`${ids}-projet`} value={task.projectId ?? ""} options={projectOptions} onChange={(v) => change({ projectId: v || null })} />
            </>
          )}

          <label htmlFor={`${ids}-date`} className="detail-label detail-label--block">
            {tr("Échéance")}
          </label>
          <div className="detail-when">
            <DateField
              id={`${ids}-date`}
              className="detail-input"
              clearable
              value={task.dueDate}
              onChange={(v) => change({ dueDate: v || null, dueTime: v ? task.dueTime : null, ...(v && task.startDate && task.startDate > v ? { startDate: v } : {}) })}
            />
            <TimeField
              className="detail-input detail-input--time"
              label={tr("Heure")}
              clearable
              placeholder={tr("Heure")}
              value={task.dueTime}
              disabled={!task.dueDate}
              onChange={(v) => change({ dueTime: v || null })}
            />
            {task.dueDate && !task.recurrence && (
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={tr("Retirer l'échéance")}
                title={tr("Retirer l'échéance")}
                onClick={() => change({ dueDate: null, dueTime: null, startDate: task.startDate && task.dueDate && task.startDate > task.dueDate ? null : task.startDate })}
              >
                <Icon d={ICONS.close} size={12} stroke={2.4} />
              </button>
            )}
          </div>

          <label htmlFor={`${ids}-debut`} className="detail-label detail-label--block" title={tr("Jusqu'à ce jour, la tâche n'apparaît que dans « À venir ».")}>
            {tr("Commencer le")}
          </label>
          <div className="detail-when">
            <DateField
              id={`${ids}-debut`}
              className="detail-input"
              clearable
              placeholder={tr("Dès maintenant")}
              max={task.dueDate ?? undefined}
              value={task.startDate}
              onChange={(v) => change({ startDate: v || null })}
            />
          </div>

          <label htmlFor={`${ids}-repetition`} className="detail-label">
            {tr("Répétition")}
          </label>
          <RecurrenceField
            id={`${ids}-repetition`}
            value={task.recurrence}
            base={task.dueDate ?? today}
            onChange={(recurrence) => change({ recurrence })}
          />

          <label htmlFor={`${ids}-rappel`} className="detail-label">
            {tr("Rappel")}
          </label>
          <Select
            id={`${ids}-rappel`}
            value={task.reminder === null ? "" : String(task.reminder)}
            disabled={!task.dueDate}
            options={[
              { value: "", label: task.dueDate ? tr("Aucun") : tr("Aucun (sans échéance)") },
              ...reminderChoices(task.dueTime !== null).map((m) => ({ value: String(m), label: reminderLabel(m, task.dueTime !== null) })),
              ...(task.reminder !== null && !reminderChoices(task.dueTime !== null).includes(task.reminder)
                ? [{ value: String(task.reminder), label: reminderLabel(task.reminder, task.dueTime !== null) }]
                : []),
            ]}
            onChange={(v) => change({ reminder: v === "" ? null : Number(v) })}
          />

          <label htmlFor={`${ids}-priorite`} className="detail-label">
            {tr("Priorité")}
          </label>
          <div className="detail-priority" data-priority={task.priority}>
            <Icon d={ICONS.flag} size={14} filled className="detail-flag" />
            <Select
              id={`${ids}-priorite`}
              value={String(task.priority)}
              options={PRIORITY_OPTIONS}
              onChange={(v) => change({ priority: Number(v) as Priority })}
            />
          </div>

          <label htmlFor={`${ids}-duree`} className="detail-label">
            {tr("Durée")}
          </label>
          <Select
            id={`${ids}-duree`}
            value={task.estimate ? String(task.estimate) : ""}
            options={
              task.estimate && !ESTIMATES.includes(task.estimate)
                ? [...ESTIMATE_OPTIONS, { value: String(task.estimate), label: formatMinutes(task.estimate) }]
                : ESTIMATE_OPTIONS
            }
            onChange={(v) => change({ estimate: v ? Number(v) : null })}
          />

          <span className="detail-label" id={`${ids}-couleur`}>
            {tr("Couleur")}
          </span>
          <div className="color-choices" role="radiogroup" aria-labelledby={`${ids}-couleur`}>
            <button
              type="button"
              role="radio"
              aria-checked={task.color === null}
              className="color-choice color-choice--theme"
              title={tr("Couleur du thème")}
              aria-label={tr("Couleur du thème")}
              onClick={() => change({ color: null })}
            />
            {TASK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={task.color === c.value}
                className="color-choice"
                title={c.label}
                aria-label={c.label}
                style={{ "--swatch": c.value } as CSSProperties}
                onClick={() => change({ color: c.value })}
              />
            ))}
          </div>

          <span className="detail-label">{tr("Étiquettes")}</span>
          <div className="detail-tags">
            {task.tags.map((tag) => (
              <span key={tag} className="pill pill--removable">
                #{tag}
                <button
                  type="button"
                  className="pill-remove"
                  aria-label={tr("Retirer l'étiquette {tag}", { tag })}
                  onClick={() => change({ tags: task.tags.filter((t) => t !== tag) })}
                >
                  <Icon d={ICONS.close} size={10} stroke={3} />
                </button>
              </span>
            ))}
            <input
              className="detail-tag-input"
              aria-label={tr("Ajouter une étiquette")}
              placeholder={tr("+ étiquette")}
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onBlur={addTag}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " " || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
          </div>
        </div>

        {task.inbox && (
          <button type="button" className="link-btn detail-inbox" onClick={() => change({ inbox: false })}>
            {tr("Retirer de la boîte de réception")}
          </button>
        )}

        <div className="detail-sep" />

        {!separateSubtasks && (
          <>
            <SubtasksPanel task={task} />
            <div className="detail-sep" />
          </>
        )}

        <label htmlFor={`${ids}-notes`} className="detail-section-title">
          {tr("Description")}
        </label>
        <textarea
          id={`${ids}-notes`}
          className="detail-notes"
          placeholder={tr("Ajouter une description")}
          value={notes.value}
          onChange={notes.onChange}
          onBlur={notes.commit}
          rows={4}
        />

        <LinksSection item={{ kind: "task", id: task.id }} />
      </div>

      <div className="detail-foot">
        <span className="detail-created">
          {tr("Créée le")}{" "}
          {new Date(task.createdAt * 1000).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" })}
          {focusMinutes > 0 && <>{tr(" · Focus : {duration}", { duration: durationLabel(focusMinutes) })}</>}
        </span>
        <button type="button" className="btn-glass btn-glass--sm btn-danger" onClick={() => void remove(task)}>
          <Icon d={ICONS.trash} size={14} />
          {tr("Supprimer")}
        </button>
      </div>
    </aside>
  );
}
