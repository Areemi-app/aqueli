/** Fenêtre « Nouveau filtre » / « Filtre » : nom, symbole, couleur et critères, avec le nombre de tâches retenues. */
import { useId, useState, type FormEvent } from "react";
import { Checkbox } from "../components/Checkbox";
import { Dialog } from "../components/Dialog";
import { Select } from "../components/SelectRow";
import { SymbolPicker } from "../components/SymbolPicker";
import { ColorChoices } from "../components/ColorChoices";
import { useProjectsIfAny } from "../projects/ProjectsProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { DUE_WINDOWS, EMPTY_CRITERIA, matchesFilter, MIN_PRIORITIES, type DueWindow, type FilterCriteria, type TaskFilter } from "./filters";
import type { Priority } from "./quickAdd";
import { tagsInUse } from "./tasks";
import { useTaskFilters } from "./TaskFiltersProvider";
import { useTasks } from "./TasksProvider";
import { tr } from "../i18n/i18n";

interface FilterDialogProps {
  filter?: TaskFilter;
  /** Critères de départ d'un nouveau filtre (étiquette affichée, priorité choisie…). */
  initial?: Partial<FilterCriteria>;
  onClose: () => void;
  onSaved: (filter: TaskFilter) => void;
}

export function FilterDialog({ filter, initial, onClose, onSaved }: FilterDialogProps) {
  const { create, update } = useTaskFilters();
  const { tasks, today } = useTasks();
  const { spaces } = useSpaces();
  const projects = (useProjectsIfAny()?.projects ?? []).filter((p) => !p.archived || p.id === filter?.criteria.projectId);
  const [name, setName] = useState(filter?.name ?? "");
  const [icon, setIcon] = useState(filter?.icon ?? "etoile");
  const [color, setColor] = useState<string | null>(filter?.color ?? null);
  const [criteria, setCriteria] = useState<FilterCriteria>(filter?.criteria ?? { ...EMPTY_CRITERIA, ...initial });
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const set = (changes: Partial<FilterCriteria>) => setCriteria((c) => ({ ...c, ...changes }));

  // Étiquettes proposées : celles des tâches à faire, et celles déjà retenues.
  const tags = [...new Set([...tagsInUse(tasks), ...criteria.tags])];
  const hasTag = (tag: string) => criteria.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
  const toggleTag = (tag: string) => set({ tags: hasTag(tag) ? criteria.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...criteria.tags, tag] });
  const count = tasks.filter((t) => matchesFilter(t, criteria, today)).length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError(tr("Saisissez un nom."));
      return;
    }
    const input = { name: clean, icon, color, criteria: { ...criteria, text: criteria.text.trim() } };
    if (filter) {
      await update(filter, input);
      onSaved({ ...filter, ...input });
    } else {
      const created = await create(input);
      if (created) onSaved(created);
    }
    onClose();
  };

  return (
    <Dialog title={filter ? tr("Filtre") : tr("Nouveau filtre")} className="dialog--filter" onClose={onClose}>
      <form className="settings-form filter-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor={`${ids}-nom`} className="field-label">
            {tr("Nom")}
          </label>
          <div className="field-box" data-invalid={error ? true : undefined}>
            <input
              id={`${ids}-nom`}
              className="field-input"
              value={name}
              maxLength={60}
              autoComplete="off"
              placeholder={tr("Urgent au travail, Maison ce week-end…")}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
        </div>
        <div className="field">
          <span className="field-label">{tr("Symbole")}</span>
          <SymbolPicker value={icon} onChange={setIcon} label={tr("Symbole du filtre")} color={color} />
        </div>
        <div className="field">
          <span className="field-label">{tr("Couleur")}</span>
          <ColorChoices value={color} onChange={setColor} label={tr("Couleur du filtre")} />
        </div>

        <h3 className="filter-heading">{tr("Tâches retenues")}</h3>
        {tags.length > 0 && (
          <div className="field">
            <span className="field-label">{tr("Étiquettes (au moins une)")}</span>
            <div className="filter-tags">
              {tags.map((tag) => (
                <button key={tag} type="button" className="pill pill--button" aria-pressed={hasTag(tag)} onClick={() => toggleTag(tag)}>
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="filter-grid">
          <div className="field">
            <label htmlFor={`${ids}-priorite`} className="field-label">
              {tr("Priorité")}
            </label>
            <Select
              id={`${ids}-priorite`}
              value={String(criteria.minPriority)}
              options={MIN_PRIORITIES.map((p) => ({ value: String(p.value), label: p.label }))}
              onChange={(v) => set({ minPriority: Number(v) as Priority })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-echeance`} className="field-label">
              {tr("Échéance")}
            </label>
            <Select id={`${ids}-echeance`} value={criteria.due} options={DUE_WINDOWS.map((d) => ({ value: d.id, label: d.label }))} onChange={(v) => set({ due: v as DueWindow })} />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-espace`} className="field-label">
              {tr("Espace")}
            </label>
            <Select
              id={`${ids}-espace`}
              value={criteria.spaceId ?? ""}
              options={[{ value: "", label: tr("Tous les espaces") }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]}
              onChange={(v) => set({ spaceId: v || null })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-projet`} className="field-label">
              {tr("Projet")}
            </label>
            <Select
              id={`${ids}-projet`}
              value={criteria.projectId ?? ""}
              options={[{ value: "", label: tr("Tous les projets") }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              onChange={(v) => set({ projectId: v || null })}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-texte`} className="field-label">
            {tr("Texte contenu")}
          </label>
          <div className="field-box">
            <input
              id={`${ids}-texte`}
              className="field-input"
              value={criteria.text}
              maxLength={100}
              autoComplete="off"
              placeholder={tr("Dans le titre ou la description")}
              onChange={(e) => set({ text: e.target.value })}
            />
          </div>
        </div>
        <Checkbox label={tr("Tâches terminées comprises (30 derniers jours)")} checked={criteria.includeDone} onChange={(v) => set({ includeDone: v })} />
        <p className="filter-count" aria-live="polite">
          {count === 0 ? tr("Aucune tâche ne correspond.") : count === 1 ? tr("1 tâche correspond.") : tr("{count} tâches correspondent.", { count })}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel">
            {filter ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
