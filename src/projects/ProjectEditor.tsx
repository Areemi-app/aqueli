import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Segmented } from "../components/Segmented";
import { Select } from "../components/SelectRow";
import { symbolPath } from "../components/symbols";
import { SymbolPicker } from "../components/SymbolPicker";
import { getModule } from "../modules/modules";
import { useSpaces } from "../spaces/SpacesProvider";
import { TASK_COLORS } from "../tasks/colors";
import { dayKey } from "../tasks/day";
import { fromTemplate, PROJECT_TEMPLATES, STATUS_LABELS, toInput, type Project, type ProjectInput, type ProjectStatus, type ProjectTemplate } from "./projects";
import { useProjects } from "./ProjectsProvider";
import { DateField } from "../components/DateField";
import { tr, trn } from "../i18n/i18n";

const STATUSES = (Object.keys(STATUS_LABELS) as ProjectStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] }));

interface ProjectEditorProps {
  /** Projet à modifier ; sans lui, un nouveau. */
  project?: Project;
  onClose: (created?: Project) => void;
}

/** Création ou modification d'un projet ; un nouveau projet peut partir d'un modèle. */
export function ProjectEditor({ project, onClose }: ProjectEditorProps) {
  const { create, createFrom, update } = useProjects();
  const { spaces, filter } = useSpaces();
  const ids = useId();
  const m = getModule("projets");
  const [form, setForm] = useState<ProjectInput>(
    () =>
      (project ? toInput(project) : null) ?? {
        name: "",
        description: "",
        status: "en-cours",
        startDate: dayKey(new Date()),
        endDate: null,
        icon: "drapeau",
        color: m.color,
        spaceId: filter !== "tous" ? filter : (spaces[0]?.id ?? null),
      },
  );
  const [template, setTemplate] = useState<ProjectTemplate | null>(null);
  /** Nouveau projet : d'abord le choix d'un modèle ou d'un projet personnalisé. */
  const [step, setStep] = useState<"choix" | "details">(project ? "details" : "choix");
  const [busy, setBusy] = useState(false);
  const set = (changes: Partial<ProjectInput>) => setForm((f) => ({ ...f, ...changes }));

  const choose = (t: ProjectTemplate | null) => {
    setTemplate(t);
    const start = form.startDate ?? dayKey(new Date());
    if (t) set({ ...fromTemplate(t, start, form.spaceId).project });
    else set({ name: "", description: "", icon: "drapeau", color: m.color, endDate: null });
    setStep("details");
  };

  const valid = form.name.trim() !== "" && (!form.startDate || !form.endDate || form.endDate >= form.startDate);

  // Nom manquant : dit au clic sur « Créer », comme dans les autres fenêtres.
  const [tried, setTried] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setTried(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const input = { ...form, name: form.name.trim(), description: form.description.trim() };
    let created: Project | null = null;
    if (project) await update(project, input);
    else if (template) {
      const t = fromTemplate(template, input.startDate ?? dayKey(new Date()), input.spaceId);
      created = await createFrom(input, t.tasks, t.milestones);
    } else created = await create(input);
    setBusy(false);
    onClose(created ?? undefined);
  };

  if (step === "choix") {
    return (
      <Dialog title={tr("Nouveau projet")} onClose={() => onClose()} className="dialog--templates">
        <div className="template-picker">
          <button type="button" className="template-custom" onClick={() => choose(null)} data-autofocus>
            <span className="template-custom-icon">
              <Icon d={ICONS.plus} size={22} stroke={2.6} />
            </span>
            <span className="template-text">
              <span className="template-name">{tr("Projet personnalisé")}</span>
              <span className="template-desc">{tr("Un projet vide, à remplir soi-même.")}</span>
            </span>
          </button>
          <h3 className="template-heading">{tr("Modèles")}</h3>
          <ul className="template-list" aria-label={tr("Modèles de projets")}>
            {PROJECT_TEMPLATES.map((t) => (
              <li key={t.id}>
                <button type="button" className="template-card" style={{ "--row-color": t.color } as CSSProperties} onClick={() => choose(t)}>
                  <ModuleChip color={t.color} icon={symbolPath(t.icon, ICONS.flag)} size={36} />
                  <span className="template-text">
                    <span className="template-name">{t.label}</span>
                    <span className="template-desc">{t.description}</span>
                    <span className="template-count">
                      {trn(t.tasks.length, "{n} tâche", "{n} tâches")} · {t.milestones.length > 1 ? tr("{length} étapes", { length: t.milestones.length }) : tr("1 étape")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={project ? tr("Modifier le projet") : tr("Nouveau projet")} onClose={() => onClose()} className="dialog--habit">
      <form className="event-form habit-editor" onSubmit={(e) => void submit(e)} noValidate>
        {!project && (
          <div className="template-chosen">
            <span>
              {template
                ? template.milestones.length > 1
                  ? tr("Modèle « {name} » : {tasks} tâches et {steps} étapes, datées à partir du début.", { name: template.label, tasks: template.tasks.length, steps: template.milestones.length })
                  : tr("Modèle « {name} » : {tasks} tâches et 1 étape, datées à partir du début.", { name: template.label, tasks: template.tasks.length })
                : tr("Projet personnalisé.")}
            </span>
            <button type="button" className="link-btn" onClick={() => setStep("choix")}>
              {tr("Changer")}
            </button>
          </div>
        )}

        <div className="habit-name-row">
          <ModuleChip color={form.color ?? m.color} icon={symbolPath(form.icon, m.icon)} size={40} />
          <div className="field habit-name">
            <label htmlFor={`${ids}-nom`} className="field-label">
              {tr("Nom")}
            </label>
            <div className="field-box">
              <input
                id={`${ids}-nom`}
                className="field-input"
                value={form.name}
                maxLength={120}
                autoComplete="off"
                placeholder={tr("Déménagement, voyage, travaux…")}
                onChange={(e) => set({ name: e.target.value })}
                data-autofocus
              />
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${ids}-description`} className="field-label">
            {tr("Description")}
          </label>
          <textarea
            id={`${ids}-description`}
            className="detail-notes project-description-input"
            rows={2}
            maxLength={5000}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>

        <div className="habit-grid">
          {project && (
            <div className="field">
              <span className="field-label">{tr("Statut")}</span>
              <Segmented value={form.status} options={STATUSES} label={tr("Statut")} onChange={(status) => set({ status })} />
            </div>
          )}
          <div className="field">
            <label htmlFor={`${ids}-debut`} className="field-label">
              {tr("Début")}
            </label>
            <DateField id={`${ids}-debut`} className="detail-input" clearable value={form.startDate} onChange={(v) => set({ startDate: v || null })} />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-fin`} className="field-label">
              {tr("Fin prévue")}
            </label>
            <DateField
              id={`${ids}-fin`}
              className="detail-input"
              clearable
              value={form.endDate}
              min={form.startDate ?? undefined}
              onChange={(v) => set({ endDate: v || null })}
            />
          </div>
          <div className="habit-space">
            <span className="field-label">{tr("Espace")}</span>
            <Select
              value={form.spaceId ?? ""}
              options={[{ value: "", label: tr("Aucun espace") }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]}
              label={tr("Espace")}
              onChange={(v) => set({ spaceId: v || null })}
            />
          </div>
        </div>
        {form.startDate && form.endDate && form.endDate < form.startDate && <p className="form-error">{tr("La fin précède le début.")}</p>}

        <fieldset className="picker">
          <legend className="field-label">{tr("Couleur")}</legend>
          <div className="picker-grid" role="radiogroup" aria-label={tr("Couleur")}>
            {TASK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={form.color === c.value}
                aria-label={c.label}
                title={c.label}
                className="swatch-button"
                style={{ background: c.value }}
                onClick={() => set({ color: c.value })}
              >
                {form.color === c.value && <Icon d={ICONS.check} size={14} stroke={3.4} />}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="picker">
          <legend className="field-label">{tr("Symbole")}</legend>
          <SymbolPicker value={form.icon} onChange={(icon) => set({ icon })} label={tr("Symbole du projet")} color={form.color} />
        </fieldset>

        {tried && form.name.trim() === "" && (
          <p className="form-error" role="alert">
            {tr("Saisissez un nom.")}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={() => onClose()}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel" disabled={busy}>
            {project ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
