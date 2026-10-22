import { useId, useState, type FormEvent } from "react";
import { Checkbox } from "../components/Checkbox";
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
import { HABIT_TEMPLATES, MOMENTS, toInput, WEEK_ORDER, WEEKDAY_SHORT, type Frequency, type Habit, type HabitInput } from "./habits";
import { useHabits } from "./HabitsProvider";
import { TimeField } from "../components/TimeField";
import { tr, trn } from "../i18n/i18n";

type FrequencyKind = Frequency["kind"];

const FREQUENCIES = [
  { value: "quotidien" as const, label: tr("Chaque jour") },
  { value: "jours" as const, label: tr("Certains jours") },
  { value: "semaine" as const, label: tr("Par semaine") },
];

const KINDS = [
  { value: "oui-non" as const, label: tr("Oui ou non") },
  { value: "quantite" as const, label: tr("Quantité") },
];

const TIMES = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: trn(n, "{n} fois par semaine|une", "{n} fois par semaine") }));

interface HabitEditorProps {
  /** Habitude à modifier ; sans elle, une nouvelle. */
  habit?: Habit;
  onClose: () => void;
}

/** Création ou modification d'une habitude. */
export function HabitEditor({ habit, onClose }: HabitEditorProps) {
  const { create, update } = useHabits();
  const { spaces, filter } = useSpaces();
  const ids = useId();
  const m = getModule("habitudes");
  const [form, setForm] = useState<HabitInput>(
    () =>
      (habit ? toInput(habit) : null) ?? {
        name: "",
        icon: "repetition",
        color: m.color,
        kind: "oui-non",
        negative: false,
        target: 1,
        unit: "",
        frequency: { kind: "quotidien" },
        reminder: null,
        spaceId: filter !== "tous" ? filter : (spaces[0]?.id ?? null),
      },
  );
  const [busy, setBusy] = useState(false);
  const set = (changes: Partial<HabitInput>) => setForm((f) => ({ ...f, ...changes }));

  const setFrequency = (kind: FrequencyKind) =>
    set({ frequency: kind === "quotidien" ? { kind } : kind === "jours" ? { kind, days: [1, 3, 5] } : { kind, times: 3 } });

  const toggleDay = (day: number) => {
    if (form.frequency.kind !== "jours") return;
    const days = form.frequency.days.includes(day) ? form.frequency.days.filter((d) => d !== day) : [...form.frequency.days, day];
    set({ frequency: { kind: "jours", days } });
  };

  // Ce qui manque : affiché au clic sur « Créer », comme dans les autres fenêtres.
  const problem =
    form.name.trim() === ""
      ? tr("Saisissez un nom.")
      : form.kind !== "oui-non" && !(form.target >= 1 && form.target <= 1000)
        ? tr("Objectif entre 1 et 1000.")
        : form.frequency.kind === "jours" && form.frequency.days.length === 0
          ? tr("Choisissez au moins un jour.")
          : null;
  const [tried, setTried] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) {
      setTried(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const input = { ...form, name: form.name.trim(), unit: form.unit.trim() };
    if (habit) await update(habit, input);
    else await create(input);
    setBusy(false);
    onClose();
  };

  return (
    <Dialog title={habit ? tr("Modifier l'habitude") : tr("Nouvelle habitude")} onClose={onClose} className="dialog--habit">
      <form className="event-form habit-editor" onSubmit={(e) => void submit(e)} noValidate>
        {!habit && (
          <div className="habit-templates" aria-label={tr("Modèles")}>
            {HABIT_TEMPLATES.map((t) => (
              <button key={t.label} type="button" className="chip-btn" onClick={() => setForm({ ...t, spaceId: form.spaceId })}>
                <Icon d={symbolPath(t.icon, ICONS.repeat)} size={14} stroke={2.2} />
                {t.label}
              </button>
            ))}
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
                maxLength={60}
                autoComplete="off"
                placeholder={tr("Boire de l'eau, lire, marcher…")}
                onChange={(e) => set({ name: e.target.value })}
                data-autofocus
              />
            </div>
          </div>
        </div>

        <div className="habit-grid">
          <div className="field">
            <span className="field-label">{tr("Suivi")}</span>
            <Segmented
              value={form.kind}
              options={KINDS}
              label={tr("Suivi")}
              onChange={(kind) => set({ kind, target: kind === "oui-non" ? 1 : Math.max(form.target, 2), unit: kind === "oui-non" ? "" : form.unit })}
            />
          </div>
          {form.kind === "quantite" && (
            <div className="habit-target">
              <div className="field">
                <label htmlFor={`${ids}-objectif`} className="field-label">
                  {tr("Objectif")}
                </label>
                <div className="field-box habit-number">
                  <input
                    id={`${ids}-objectif`}
                    className="field-input"
                    type="number"
                    min={1}
                    max={1000}
                    value={form.target}
                    onChange={(e) => set({ target: Math.max(0, Math.min(1000, Math.round(Number(e.target.value) || 0))) })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor={`${ids}-unite`} className="field-label">
                  {tr("Unité")}
                </label>
                <div className="field-box">
                  <input
                    id={`${ids}-unite`}
                    className="field-input"
                    value={form.unit}
                    maxLength={20}
                    placeholder={tr("verres, pages, minutes…")}
                    onChange={(e) => set({ unit: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <span className="field-label">{tr("Fréquence")}</span>
          <Segmented value={form.frequency.kind} options={FREQUENCIES} label={tr("Fréquence")} onChange={setFrequency} />
          {form.frequency.kind === "jours" && (
            <div className="habit-days" role="group" aria-label={tr("Jours")}>
              {WEEK_ORDER.map((d) => {
                const on = form.frequency.kind === "jours" && form.frequency.days.includes(d);
                return (
                  <button key={d} type="button" className="day-chip" aria-pressed={on} onClick={() => toggleDay(d)}>
                    {WEEKDAY_SHORT[d]}
                  </button>
                );
              })}
            </div>
          )}
          {form.frequency.kind === "semaine" && (
            <Select
              value={String(form.frequency.times)}
              options={TIMES}
              label={tr("Nombre de fois par semaine")}
              onChange={(v) => set({ frequency: { kind: "semaine", times: Number(v) } })}
            />
          )}
        </div>

        <div className="habit-options">
          <Checkbox
            checked={form.negative}
            onChange={(negative) => set({ negative })}
            label={tr("Habitude à arrêter")}
            note={tr("Chaque jour coché est un jour tenu.")}
          />
          <div className="habit-reminder">
            <Checkbox checked={form.reminder !== null} onChange={(on) => set({ reminder: on ? (form.reminder ?? "20:00") : null })} label={tr("Rappel")} />
            {form.reminder !== null && (
              <TimeField
                className="detail-input detail-input--time"
                label={tr("Heure du rappel")}
                value={form.reminder}
                onChange={(v) => v && set({ reminder: v })}
              />
            )}
          </div>
          <div className="habit-space">
            <span className="field-label">{tr("Moment")}</span>
            <Select
              value={form.moment ?? ""}
              options={MOMENTS.map((m) => ({ value: m.value ?? "", label: m.label }))}
              label={tr("Moment de la journée")}
              onChange={(v) => set({ moment: (v || null) as HabitInput["moment"] })}
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
          <SymbolPicker value={form.icon} onChange={(icon) => set({ icon })} label={tr("Symbole de l'habitude")} color={form.color} />
        </fieldset>

        {tried && problem && (
          <p className="form-error" role="alert">
            {problem}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel" disabled={busy}>
            {habit ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
