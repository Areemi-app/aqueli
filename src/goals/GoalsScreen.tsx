/**
 * Écran Objectifs (cahier des charges § 4.8) : objectifs par horizon (année, trimestre, mois),
 * anneau d'avancement, rythme (en avance, dans les temps, en retard), fiche : pourquoi, saisies,
 * tâches liées, habitude ou étapes, éléments liés.
 */
import { useToast } from "../app/ToastProvider";
import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import { BarChart } from "../components/Charts";
import { EmptyState } from "../components/EmptyState";
import { ScreenTitle } from "../components/ScreenTitle";
import { useItemMenu, useScreenMenu } from "../components/ContextMenu";
import { moved, startDrag } from "../lib/dragDrop";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { Segmented } from "../components/Segmented";
import { Select } from "../components/SelectRow";
import { SymbolPicker } from "../components/SymbolPicker";
import { symbolPath } from "../components/symbols";
import { Tabs, type TabItem } from "../components/Tabs";
import { ColorChoices } from "../components/ColorChoices";
import { useHabits } from "../habits/HabitsProvider";
import { KEYS } from "../lib/itemKeys";
import { usePinEntry } from "../pins/pins";
import { goalRequest, NEW_ITEM } from "../lib/request";
import { useNow } from "../lib/useNow";
import { LinksSection } from "../links/LinksSection";
import { getModule } from "../modules/modules";
import { useNewItem } from "../shell/newItem";
import { useSpaces } from "../spaces/SpacesProvider";
import { MoreOptions } from "../components/MoreOptions";
import { dayKey, daysBetween, formatShortDay, type DayKey } from "../tasks/day";
import {
  daysLeft,
  expectedRatio,
  HORIZONS,
  METRICS,
  nextPeriod,
  outlookOf,
  paceOf,
  periodLabel,
  periodOf,
  progressOf,
  progressSeries,
  STATUS_LABELS,
  toGoalInput,
  type Goal,
  type GoalInput,
  type GoalStatus,
  type Horizon,
  type Metric,
} from "./goals";
import { Ring, useGoalInputs, useGoalProgress } from "./GoalProgress";
import { useGoals } from "./GoalsProvider";
import { DateField } from "../components/DateField";
import { locale, tr, trn } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

type View = "tous" | Horizon | "termines";

const VIEWS: readonly TabItem<View>[] = [
  { id: "tous", label: tr("En cours") },
  { id: "annee", label: tr("Année") },
  { id: "trimestre", label: tr("Trimestre") },
  { id: "mois", label: tr("Mois") },
  { id: "termines", label: tr("Atteints") },
];

const GOAL_LINK_KINDS = ["task", "event", "note", "project", "contact", "document"] as const;
const PACE_LABELS = { avance: tr("En avance"), temps: tr("Dans les temps"), retard: tr("En retard|rythme") } as const;
const NUMBER = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });

// ——— Création et réglages ———

function GoalEditor({ goal, onClose, onSaved }: { goal?: Goal; onClose: () => void; onSaved: (g: Goal) => void }) {
  const { create, update } = useGoals();
  const { habits } = useHabits();
  const { spaces, filter } = useSpaces();
  const today = dayKey(useNow());
  const first = periodOf("annee", today);
  const [form, setForm] = useState<GoalInput>(
    goal
      ? { ...goal }
      : { title: "", why: "", horizon: "annee", startDate: first.start, targetDate: first.end, metric: "manuel", target: null, unit: "", habitId: null, status: "en-cours", color: "#e04848", icon: "cible", spaceId: filter !== "tous" ? filter : null },
  );
  const [targetText, setTargetText] = useState(goal?.target ? NUMBER.format(goal.target) : "");
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const set = (changes: Partial<GoalInput>) => setForm((f) => ({ ...f, ...changes }));
  const chooseHorizon = (horizon: Horizon) => {
    if (horizon === "libre") return set({ horizon });
    const p = periodOf(horizon, today);
    set({ horizon, startDate: p.start, targetDate: p.end });
  };
  const needsTarget = form.metric === "manuel" || form.metric === "habitude";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(tr("Saisissez un objectif."));
      return;
    }
    const target = targetText.trim() ? Number(targetText.replace(/\s/g, "").replace(",", ".")) : null;
    if (needsTarget && (target === null || !Number.isFinite(target) || target <= 0)) {
      setError(tr("Saisissez la valeur à atteindre (par exemple 20)."));
      return;
    }
    if (form.metric === "habitude" && !form.habitId) {
      setError(tr("Choisissez une habitude."));
      return;
    }
    if (form.targetDate && form.targetDate < form.startDate) {
      setError(tr("L'échéance précède le début."));
      return;
    }
    const input: GoalInput = { ...form, title: form.title.trim(), target: needsTarget ? target : null, habitId: form.metric === "habitude" ? form.habitId : null };
    if (goal) {
      await update(goal, input);
      onSaved(goal);
    } else {
      const created = await create(input);
      if (created) onSaved(created);
    }
    onClose();
  };
  return (
    <Dialog title={goal ? tr("Objectif") : tr("Nouvel objectif")} onClose={onClose}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor={`${ids}-titre`} className="field-label">
            {tr("Objectif")}
          </label>
          <div className="field-box" data-invalid={error === tr("Saisissez un objectif.") || undefined}>
            <input id={`${ids}-titre`} className="field-input" maxLength={150} placeholder={tr("Lire 20 livres, courir un semi-marathon…")} value={form.title} onChange={(e) => set({ title: e.target.value })} data-autofocus />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-pourquoi`} className="field-label">
            {tr("Pourquoi")}
          </label>
          <textarea id={`${ids}-pourquoi`} className="detail-notes" rows={2} maxLength={2000} placeholder={tr("Ce que cet objectif changera.")} value={form.why} onChange={(e) => set({ why: e.target.value })} />
        </div>
        <div className="field">
          <span className="field-label">{tr("Horizon")}</span>
          <Segmented value={form.horizon} options={HORIZONS.map((h) => ({ value: h.id, label: h.label }))} label={tr("Horizon")} onChange={chooseHorizon} />
        </div>
        <div className="budget-form-row">
          <div className="field">
            <label htmlFor={`${ids}-debut`} className="field-label">
              {tr("Début")}
            </label>
            <div className="field-box">
              <DateField id={`${ids}-debut`} className="field-input" value={form.startDate} onChange={(v) => v && set({ startDate: v })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${ids}-fin`} className="field-label">
              {tr("Échéance")}
            </label>
            <div className="field-box">
              <DateField id={`${ids}-fin`} className="field-input" clearable value={form.targetDate} min={form.startDate} onChange={(v) => set({ targetDate: v || null })} />
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-progression`} className="field-label">
            {tr("Progression")}
          </label>
          <Select id={`${ids}-progression`} value={form.metric} options={METRICS.map((m) => ({ value: m.id, label: m.label }))} onChange={(metric) => set({ metric: metric as Metric })} />
          <p className="settings-hint">{METRICS.find((m) => m.id === form.metric)?.description}</p>
        </div>
        {form.metric === "habitude" && (
          <div className="field">
            <label htmlFor={`${ids}-habitude`} className="field-label">
              {tr("Habitude")}
            </label>
            <Select
              id={`${ids}-habitude`}
              value={form.habitId ?? ""}
              options={[{ value: "", label: habits.length ? tr("Choisir une habitude") : tr("Aucune habitude") }, ...habits.filter((h) => !h.archived).map((h) => ({ value: h.id, label: h.name }))]}
              onChange={(v) => set({ habitId: v || null })}
            />
          </div>
        )}
        {needsTarget && (
          <div className="budget-form-row">
            <div className="field">
              <label htmlFor={`${ids}-cible`} className="field-label">
                {form.metric === "habitude" ? tr("Nombre de jours") : tr("Valeur à atteindre")}
              </label>
              <div className="field-box" data-invalid={error?.startsWith("Saisissez la valeur") || undefined}>
                <input id={`${ids}-cible`} className="field-input" inputMode="decimal" placeholder="20" value={targetText} onChange={(e) => setTargetText(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${ids}-unite`} className="field-label">
                {tr("Unité")}
              </label>
              <div className="field-box">
                <input id={`${ids}-unite`} className="field-input" maxLength={30} placeholder={form.metric === "habitude" ? "jours" : tr("livres, km, €…")} value={form.unit} onChange={(e) => set({ unit: e.target.value })} />
              </div>
            </div>
          </div>
        )}
        <MoreOptions>
          <div className="field">
            <span className="field-label">{tr("Symbole")}</span>
            <SymbolPicker value={form.icon} onChange={(icon) => set({ icon })} label={tr("Symbole de l'objectif")} color={form.color} />
          </div>
          <div className="field">
            <span className="field-label">{tr("Couleur")}</span>
            <ColorChoices value={form.color} onChange={(color) => set({ color })} label={tr("Couleur de l'objectif")} />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-espace`} className="field-label">
              {tr("Espace")}
            </label>
            <Select id={`${ids}-espace`} value={form.spaceId ?? ""} options={[{ value: "", label: tr("Tous les espaces") }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => set({ spaceId: v || null })} />
          </div>
        </MoreOptions>
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
            {goal ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ——— Fiche ———

function Entries({ goal }: { goal: Goal }) {
  const { entries, addEntry, removeEntry } = useGoals();
  const itemMenu = useItemMenu();
  const today = dayKey(useNow());
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(today);
  const list = entries.get(goal.id) ?? [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value.replace(/\s/g, "").replace(",", "."));
    if (!value.trim() || !Number.isFinite(n) || n === 0) return;
    void addEntry(goal, day, n, note.trim());
    setValue("");
    setNote("");
  };
  // Total par mois, sur les six derniers mois de saisies.
  const months = [...new Set(list.map((e) => e.day.slice(0, 7)))].slice(-6);
  return (
    <section className="goal-section" aria-label={tr("Saisies")}>
      <h3 className="goal-section-title">{tr("Saisies")}</h3>
      <form className="goal-entry-form" onSubmit={submit}>
        <div className="field-box goal-entry-value">
          <input className="field-input" inputMode="decimal" placeholder={`+ ${goal.unit || "valeur"}`} aria-label={tr("Valeur à ajouter")} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="field-box">
          <input className="field-input" placeholder={tr("Note (facultatif)")} aria-label={tr("Note")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="field-box goal-entry-day">
          <DateField className="field-input" label={tr("Date")} value={day} onChange={(v) => v && setDay(v)} />
        </div>
        <button type="submit" className="btn-gel btn-gel--sm">
          {tr("Ajouter")}
        </button>
      </form>
      {months.length > 1 && (
        <BarChart
          data={months.map((m) => ({ label: new Intl.DateTimeFormat(locale(), { month: "short" }).format(new Date(`${m}-15T12:00:00`)), value: list.filter((e) => e.day.startsWith(m)).reduce((s, e) => s + e.value, 0) }))}
          format={(n) => `${NUMBER.format(n)} ${goal.unit}`.trim()}
          series={[tr("Saisies")]}
          label={tr("Saisies par mois")}
          color={goal.color ?? undefined}
          height={90}
        />
      )}
      <ul className="goal-entries">
        {[...list].reverse().slice(0, 12).map((e) => (
          <li key={e.id} className="goal-entry" tabIndex={0} {...itemMenu(() => [{ label: tr("Supprimer la saisie"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void removeEntry(e) }])}>
            <span className="goal-entry-amount">
              {e.value > 0 ? "+" : ""}
              {NUMBER.format(e.value)} {goal.unit}
            </span>
            <span className="goal-entry-note">{e.note}</span>
            <span className="goal-entry-day">{formatShortDay(e.day, today)}</span>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="links-empty">{tr("Aucune saisie.")}</p>}
    </section>
  );
}

function Steps({ goal }: { goal: Goal }) {
  const { steps, addStep, setStepDone, removeStep, renameStep } = useGoals();
  const itemMenu = useItemMenu();
  const today = dayKey(useNow());
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const list = steps.get(goal.id) ?? [];
  return (
    <section className="goal-section" aria-label={tr("Étapes")}>
      <h3 className="goal-section-title">{tr("Étapes")}</h3>
      <ul className="goal-steps">
        {list.map((s) => (
          <li
            key={s.id}
            className="goal-step"
            data-done={s.doneAt !== null || undefined}
            {...itemMenu(() => [
              { label: s.doneAt ? tr("Rouvrir") : tr("Franchir"), icon: ICONS.check, run: () => void setStepDone(s, s.doneAt === null) },
              {
                label: tr("Renommer…"),
                icon: ICONS.pencil,
                shortcut: KEYS.rename,
                run: () => {
                  const next = window.prompt(tr("Nom de l'étape"), s.title)?.trim();
                  if (next) void renameStep(s, next, s.dueDate);
                },
              },
              "separator",
              { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void removeStep(s) },
            ])}
          >
            <button type="button" className="task-check" data-sans-son aria-label={s.doneAt ? tr("Rouvrir l'étape « {title} »", { title: s.title }) : tr("Franchir l'étape « {title} »", { title: s.title })} onClick={() => void setStepDone(s, s.doneAt === null)}>
              {s.doneAt !== null && <Icon d={ICONS.check} size={12} stroke={3.5} />}
            </button>
            <span className="goal-step-title">{s.title}</span>
            {s.dueDate && <span className="task-meta" data-late={(s.doneAt === null && s.dueDate < today) || undefined}>{formatShortDay(s.dueDate, today)}</span>}
          </li>
        ))}
      </ul>
      <form
        className="goal-entry-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void addStep(goal, title.trim(), due || null);
          setTitle("");
          setDue("");
        }}
      >
        <div className="field-box">
          <input className="field-input" placeholder={tr("Nouvelle étape")} aria-label={tr("Nouvelle étape")} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field-box goal-entry-day">
          <DateField className="field-input" label={tr("Date de l'étape")} clearable value={due} onChange={(v) => setDue(v)} />
        </div>
        <button type="submit" className="btn-glass btn-glass--sm">
          {tr("Ajouter")}
        </button>
      </form>
    </section>
  );
}

const LONG_DAY = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" });

/** Unité de ce qui reste à faire : « livres », « étapes », « jours »… */
function unitOf(goal: Goal, n: number): string {
  if (goal.metric === "etapes") return trn(n, "étape", "étapes");
  if (goal.metric === "taches") return trn(n, "tâche", "tâches");
  if (goal.metric === "habitude") return goal.unit || trn(n, "jour", "jours");
  return goal.unit;
}

/** Courbe de l'avancement, avec la ligne du rythme idéal jusqu'à l'échéance. */
function GoalChart({ goal, series, total, today }: { goal: Goal; series: { day: DayKey; value: number }[]; total: number; today: DayKey }) {
  const end = goal.targetDate && goal.targetDate > today ? goal.targetDate : today;
  const span = Math.max(1, daysBetween(goal.startDate, end));
  const W = 300;
  const H = 110;
  const last = series[series.length - 1]?.value ?? 0;
  const max = Math.max(total, last, 1);
  const x = (d: DayKey) => 6 + (Math.min(span, Math.max(0, daysBetween(goal.startDate, d))) / span) * (W - 12);
  const y = (v: number) => H - 6 - (v / max) * (H - 12);
  let path = `M${x(goal.startDate).toFixed(1)} ${y(0).toFixed(1)}`;
  for (const pt of series) path += ` H${x(pt.day).toFixed(1)} V${y(pt.value).toFixed(1)}`;
  path += ` H${x(today > end ? end : today).toFixed(1)}`;
  return (
    <svg className="goal-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={goal.targetDate ? tr("Avancement de {done} sur {total} depuis le début, comparé au rythme idéal jusqu'à l'échéance", { done: NUMBER.format(last), total: NUMBER.format(total) }) : tr("Avancement de {done} sur {total} depuis le début", { done: NUMBER.format(last), total: NUMBER.format(total) })}>
      <line x1="6" x2={W - 6} y1={y(total)} y2={y(total)} className="goal-chart-target" />
      {goal.targetDate && <line x1={x(goal.startDate)} y1={y(0)} x2={x(goal.targetDate)} y2={y(total)} className="goal-chart-ideal" />}
      {today < end && <line x1={x(today)} x2={x(today)} y1="4" y2={H - 4} className="goal-chart-today" />}
      <path d={path} className="goal-chart-line" />
    </svg>
  );
}

function GoalDetail({ goal, onEdit }: { goal: Goal | null; onEdit: (g: Goal) => void }) {
  const { update } = useGoals();
  const { habits } = useHabits();
  const inputOf = useGoalInputs();
  const today = dayKey(useNow());
  if (!goal) return <aside className="goal-detail glass habit-detail--empty">{tr("Aucun objectif sélectionné.")}</aside>;
  const input = inputOf(goal);
  const p = progressOf(goal, input);
  const series = progressSeries(goal, input);
  const outlook = goal.status === "en-cours" ? outlookOf(goal, p, today) : null;
  const pace = goal.status === "en-cours" ? paceOf(p, expectedRatio(goal, today)) : null;
  const left = daysLeft(goal, today);
  const color = goal.color ?? getModule("objectifs").color;
  const habit = habits.find((h) => h.id === goal.habitId);
  return (
    <aside className="goal-detail glass" aria-label={goal.title} style={{ "--goal-color": color } as CSSProperties}>
      <header className="goal-detail-head">
        <ModuleChip color={color} icon={symbolPath(goal.icon, ICONS.star)} size={34} />
        <div className="goal-detail-title">
          <h2>{goal.title}</h2>
          <span>{periodLabel(goal)}</span>
        </div>
        <button type="button" className="btn-glass btn-glass--sm" onClick={() => onEdit(goal)} title={tr("Modifier ({rename})", { rename: KEYS.rename })}>
          <Icon d={ICONS.pencil} size={13} stroke={2.2} />
          {tr("Modifier")}
        </button>
      </header>
      <div className="goal-hero">
        <Ring ratio={p.ratio} color={color} size={118} />
        <div className="goal-hero-text">
          <strong>{p.label}</strong>
          {pace && <span className="goal-pace" data-pace={pace}>{PACE_LABELS[pace]}</span>}
          {outlook && (
            <span className="goal-outlook">
              {tr("Reste {amount}", { amount: [NUMBER.format(outlook.remaining), unitOf(goal, outlook.remaining)].filter(Boolean).join(" ") })}
              {outlook.perWeek !== null && tr(" · {number} par semaine", { number: NUMBER.format(outlook.perWeek) })}
            </span>
          )}
          {outlook?.eta && (
            <span className="goal-outlook" data-late={(goal.targetDate !== null && outlook.eta > goal.targetDate) || undefined}>
              {tr("À ce rythme : vers le {date}", { date: LONG_DAY.format(new Date(`${outlook.eta}T12:00:00`)) })}
            </span>
          )}
          <span className="goal-hero-meta">
            {left === null ? tr("Sans échéance") : left > 1 ? tr("Encore {left} jours", { left }) : left === 1 ? tr("Échéance demain") : left === 0 ? tr("Échéance aujourd'hui") : tr("Échéance dépassée de {x} jours", { x: -left })}
          </span>
          <Select value={goal.status} options={(Object.keys(STATUS_LABELS) as GoalStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))} label={tr("État de l'objectif")} onChange={(status) => void update(goal, { status: status as GoalStatus })} />
        </div>
      </div>
      {series && series.length > 1 && p.total > 0 && (
        <section className="goal-section" aria-label={tr("Avancement dans le temps")}>
          <h3 className="goal-section-title">{tr("Avancement dans le temps")}</h3>
          <GoalChart goal={goal} series={series} total={p.total} today={today} />
        </section>
      )}
      {goal.why && (
        <section className="goal-section goal-why" aria-label={tr("Pourquoi")}>
          <h3 className="goal-section-title">{tr("Pourquoi")}</h3>
          <p>{goal.why}</p>
        </section>
      )}
      {goal.metric === "manuel" && <Entries goal={goal} />}
      {goal.metric === "etapes" && <Steps goal={goal} />}
      {goal.metric === "habitude" && (
        <section className="goal-section" aria-label={tr("Habitude")}>
          <h3 className="goal-section-title">{tr("Habitude")}</h3>
          <p className="settings-intro">{habit ? tr("« {name} » : chaque jour tenu depuis le {formatShortDay} compte.", { name: habit.name, formatShortDay: formatShortDay(goal.startDate, today) }) : tr("Habitude supprimée.")}</p>
        </section>
      )}
      <LinksSection
        item={{ kind: "goal", id: goal.id }}
        kinds={goal.metric === "taches" ? ["task"] : GOAL_LINK_KINDS}
        title={goal.metric === "taches" ? tr("Tâches liées") : tr("Éléments liés")}
        empty={goal.metric === "taches" ? tr("Aucune tâche liée. « Lier » ajoute les tâches qui font avancer l'objectif.") : tr("Aucun élément lié.")}
      />
      {goal.metric !== "taches" && <p className="settings-hint"><Sentences text={tr("Une tâche liée apparaît ici. Pour qu'elle compte, choisissez « Tâches liées » comme progression.")} /></p>}
    </aside>
  );
}

// ——— Écran ———

/** Reconduit un objectif sur la période suivante : mêmes réglages, étapes à refaire, aucune saisie. */
function useRenewGoal(): (goal: Goal) => Promise<Goal | null> {
  const { create, addStep, steps } = useGoals();
  const notify = useToast();
  return async (goal) => {
    const period = nextPeriod(goal);
    const copy = await create({ ...toGoalInput(goal), startDate: period.start, targetDate: period.end, status: "en-cours" });
    if (!copy) return null;
    for (const step of steps.get(goal.id) ?? []) await addStep(copy, step.title, null);
    notify(tr("Objectif reconduit : {periodLabel}.", { periodLabel: periodLabel(copy) }));
    return copy;
  };
}

export function GoalsScreen() {
  const { visible, loaded, remove, reorder } = useGoals();
  const renew = useRenewGoal();
  const progress = useGoalProgress();
  const itemMenu = useItemMenu();
  const pinEntry = usePinEntry();
  const today = dayKey(useNow());
  const [pending] = useState(goalRequest.take);
  const [view, setView] = useState<View>("tous");
  const [selectedId, setSelectedId] = useState<string | null>(pending && pending !== NEW_ITEM ? pending : null);
  const [editing, setEditing] = useState<Goal | "nouveau" | null>(pending === NEW_ITEM ? "nouveau" : null);
  const m = getModule("objectifs");

  useEffect(
    () =>
      goalRequest.on((id) => {
        if (id === NEW_ITEM) setEditing("nouveau");
        else {
          setSelectedId(id);
          setView("tous");
        }
      }),
    [],
  );
  useNewItem(() => setEditing("nouveau"));
  useScreenMenu(() => [{ label: tr("Nouvel objectif…"), icon: ICONS.plus, shortcut: KEYS.create, run: () => setEditing("nouveau") }]);

  const shown = visible.filter((g) => (view === "termines" ? g.status !== "en-cours" : g.status === "en-cours" && (view === "tous" || g.horizon === view)));
  const selected = visible.find((g) => g.id === selectedId) ?? shown[0] ?? null;

  return (
    <div className="screen goals-screen">
      <header className="tasks-header">
        <ScreenTitle module="objectifs" />
        <Tabs items={VIEWS} value={view} onChange={setView} label={tr("Objectifs affichés")} idPrefix="objectifs" />
        <span className="tasks-header-spacer" />
        <button type="button" className="btn-gel" onClick={() => setEditing("nouveau")} title={tr("Nouvel objectif ({create})", { create: KEYS.create })}>
          <Icon d={ICONS.plus} size={16} stroke={2.8} />
          <span>{tr("Nouvel objectif")}</span>
        </button>
      </header>

      {loaded && visible.length === 0 ? (
        <section className="coming-soon glass habits-empty">
          <Orb color={m.color} icon={m.icon} size={110} />
          <h2 className="coming-title">{tr("Aucun objectif")}</h2>
          <p className="settings-intro"><Sentences text={tr("Relier les grandes ambitions au quotidien. Un objectif avance par une cible chiffrée, des étapes, des tâches ou une habitude.")} /></p>
          <button type="button" className="btn-gel" onClick={() => setEditing("nouveau")}>
            <Icon d={ICONS.plus} size={16} stroke={2.8} />
            {tr("Nouvel objectif")}
          </button>
        </section>
      ) : (
        <div className="goals-body">
          <section className="goals-grid-panel" aria-label={tr("Objectifs")}>
            {shown.length === 0 && (
              <EmptyState
                color={m.color}
                icon={m.icon}
                text={view === "termines" ? tr("Aucun objectif atteint ou abandonné.") : tr("Aucun objectif pour cet horizon.")}
                action={view === "termines" ? undefined : { label: tr("Nouvel objectif"), run: () => setEditing("nouveau") }}
              />
            )}
            <ul className="goals-grid" data-sort="objectifs" data-sort-axis="x">
              {shown.map((g, i) => {
                const p = progress(g);
                const pace = g.status === "en-cours" ? paceOf(p, expectedRatio(g, today)) : null;
                const color = g.color ?? m.color;
                const menu = itemMenu(() => [
                  { label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => setSelectedId(g.id) },
                  { label: tr("Modifier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setEditing(g) },
                  pinEntry({ kind: "goal", id: g.id }),
                  { label: tr("Déplacer vers l'avant"), icon: ICONS.arrowLeft, disabled: i === 0, run: () => void reorder(moved(shown.map((x) => x.id), i, -1)) },
                  { label: tr("Déplacer vers l'arrière"), icon: ICONS.arrowRight, disabled: i === shown.length - 1, run: () => void reorder(moved(shown.map((x) => x.id), i, 1)) },
                  {
                    label: g.horizon === "libre" && !g.targetDate ? tr("Dupliquer") : tr("Reconduire : {periodLabel}", { periodLabel: periodLabel({ horizon: g.horizon, startDate: nextPeriod(g).start }) }),
                    icon: ICONS.repeat,
                    shortcut: g.horizon === "libre" && !g.targetDate ? KEYS.duplicate : undefined,
                    run: () => void renew(g).then((c) => c && setSelectedId(c.id)),
                  },
                  "separator",
                  { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void remove(g) },
                ]);
                return (
                  <li key={g.id} data-sort-id={g.id}>
                    <button
                      type="button"
                      onPointerDown={(e) => startDrag(e, { kind: "objectif", ids: [g.id], label: g.title, color }, { sort: { group: "objectifs", onSort: (ids) => void reorder(ids) } })}
                      className="goal-card glass" aria-current={selected?.id === g.id || undefined} style={{ "--goal-color": color } as CSSProperties} onClick={() => setSelectedId(g.id)} {...menu}>
                      <Ring ratio={p.ratio} color={color} size={62} />
                      <span className="goal-card-text">
                        <span className="goal-card-title">{g.title}</span>
                        <span className="goal-card-meta">{periodLabel(g)}</span>
                        <span className="goal-card-progress">{p.label}</span>
                        {pace && <span className="goal-pace" data-pace={pace}>{PACE_LABELS[pace]}</span>}
                        {g.status !== "en-cours" && <span className="goal-pace">{STATUS_LABELS[g.status]}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <GoalDetail goal={selected} onEdit={setEditing} />
        </div>
      )}

      {editing && <GoalEditor goal={editing === "nouveau" ? undefined : editing} onClose={() => setEditing(null)} onSaved={(g) => setSelectedId(g.id)} />}
    </div>
  );
}
