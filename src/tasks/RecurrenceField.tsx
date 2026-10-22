import { useId, useState } from "react";
import { Select, type SelectOption } from "../components/SelectRow";
import { fromDayKey, type DayKey } from "./day";
import { presetsFor, recurrenceLabel, sameRecurrence, sortWeekdays, WEEKDAY_NAMES, type Recurrence } from "./recurrence";
import { tr } from "../i18n/i18n";

type Unit = "jours" | "semaines" | "mois" | "ans" | "apres";

const UNIT_OPTIONS: SelectOption<Unit>[] = [
  { value: "jours", label: tr("jours") },
  { value: "semaines", label: tr("semaines") },
  { value: "mois", label: tr("mois") },
  { value: "ans", label: tr("ans") },
  { value: "apres", label: tr("jours après achèvement") },
];

/** Du lundi au dimanche, initiale et nom complet. */
const WEEK = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ day: d, short: (WEEKDAY_NAMES[d] ?? "").charAt(0).toUpperCase() }));

function editorState(rule: Recurrence | null, base: DayKey): { every: number; unit: Unit; days: number[] } {
  const weekday = fromDayKey(base).getDay();
  switch (rule?.kind) {
    case "daily":
      return { every: rule.interval, unit: "jours", days: [weekday] };
    case "weekdays":
      return { every: 1, unit: "semaines", days: [1, 2, 3, 4, 5] };
    case "weekly":
      return { every: rule.interval, unit: "semaines", days: rule.days };
    case "monthly":
    case "monthlyNth":
      return { every: rule.interval, unit: "mois", days: [weekday] };
    case "yearly":
      return { every: rule.interval, unit: "ans", days: [weekday] };
    case "afterDone":
      return { every: rule.days, unit: "apres", days: [weekday] };
    default:
      return { every: 1, unit: "semaines", days: [weekday] };
  }
}

interface RecurrenceFieldProps {
  id: string;
  value: Recurrence | null;
  /** Échéance de la tâche, ou aujourd'hui : base des répétitions proposées. */
  base: DayKey;
  onChange: (rule: Recurrence | null) => void;
  /** « jours après achèvement » : pour les tâches seulement. */
  allowAfterDone?: boolean;
}

/** Choix de la répétition : propositions tirées de l'échéance, ou réglage personnalisé. */
export function RecurrenceField({ id, value, base, onChange, allowAfterDone = true }: RecurrenceFieldProps) {
  const units = allowAfterDone ? UNIT_OPTIONS : UNIT_OPTIONS.filter((u) => u.value !== "apres");
  const presets = presetsFor(base);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => editorState(value, base));
  const ids = useId();

  const presetIndex = value ? presets.findIndex((p) => sameRecurrence(p.rule, value)) : -1;
  const selected = value === null ? "" : presetIndex >= 0 ? `p${presetIndex}` : "actuelle";
  const options: SelectOption<string>[] = [
    { value: "", label: tr("Aucune") },
    ...presets.map((p, i) => ({ value: `p${i}`, label: p.label })),
    ...(value && presetIndex < 0 ? [{ value: "actuelle", label: recurrenceLabel(value) }] : []),
    { value: "perso", label: tr("Personnalisée…") },
  ];

  const apply = () => {
    const every = Math.min(Math.max(Math.round(draft.every) || 1, 1), draft.unit === "apres" ? 365 : 99);
    const date = fromDayKey(base);
    let rule: Recurrence;
    switch (draft.unit) {
      case "jours":
        rule = { kind: "daily", interval: every };
        break;
      case "semaines":
        rule = { kind: "weekly", interval: Math.min(every, 52), days: draft.days.length ? sortWeekdays(draft.days) : [date.getDay()] };
        break;
      case "mois":
        rule = { kind: "monthly", interval: Math.min(every, 24), day: date.getDate() };
        break;
      case "ans":
        rule = { kind: "yearly", interval: Math.min(every, 10), month: date.getMonth() + 1, day: date.getDate() };
        break;
      case "apres":
        rule = { kind: "afterDone", days: every };
        break;
    }
    onChange(rule);
    setEditing(false);
  };

  return (
    <>
      <Select
        id={id}
        value={editing ? "perso" : selected}
        options={options}
        onChange={(v) => {
          if (v === "perso") {
            setDraft(editorState(value, base));
            setEditing(true);
            return;
          }
          setEditing(false);
          if (v === "") onChange(null);
          else if (v.startsWith("p")) onChange(presets[Number(v.slice(1))]?.rule ?? null);
        }}
      />
      {editing && (
        <div className="recurrence-editor" role="group" aria-label={tr("Répétition personnalisée")}>
          <div className="recurrence-line">
            <label htmlFor={`${ids}-n`}>{draft.unit === "apres" ? tr("Après") : tr("Tous les")}</label>
            <input
              id={`${ids}-n`}
              type="number"
              min={1}
              max={draft.unit === "apres" ? 365 : 99}
              className="detail-input recurrence-every"
              value={draft.every}
              onChange={(e) => setDraft((d) => ({ ...d, every: Number(e.target.value) }))}
            />
            <Select
              label={tr("Unité")}
              value={draft.unit}
              options={units}
              onChange={(unit) => setDraft((d) => ({ ...d, unit }))}
            />
          </div>
          {draft.unit === "semaines" && (
            <div className="recurrence-days" role="group" aria-label={tr("Jours de la semaine")}>
              {WEEK.map((w) => {
                const on = draft.days.includes(w.day);
                return (
                  <button
                    key={w.day}
                    type="button"
                    className="recurrence-day"
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAMES[w.day]}
                    title={WEEKDAY_NAMES[w.day]}
                    onClick={() =>
                      setDraft((d) => ({ ...d, days: on ? d.days.filter((x) => x !== w.day) : [...d.days, w.day] }))
                    }
                  >
                    {w.short}
                  </button>
                );
              })}
            </div>
          )}
          <div className="recurrence-actions">
            <button type="button" className="btn-glass btn-glass--sm" onClick={() => setEditing(false)}>
              {tr("Annuler")}
            </button>
            <button type="button" className="btn-gel btn-gel--sm" onClick={apply}>
              {tr("Appliquer")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
