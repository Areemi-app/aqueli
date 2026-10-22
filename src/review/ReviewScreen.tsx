/**
 * Écran Bilan (cahier des charges § 4.14) : revue de la semaine pas à pas, statistiques (tâches
 * terminées, temps de focus, habitudes, humeur) par semaine, mois ou année, et rapport du mois
 * exportable en PDF par l'impression de Windows (« Microsoft Print to PDF »).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePrint } from "../print/print";
import { useToast } from "../app/ToastProvider";
import { plannedPayments, summarize } from "../budget/budget";
import { useBudget } from "../budget/BudgetProvider";
import { requestCalendar } from "../calendar/calendarRequest";
import { useEvents } from "../calendar/EventsProvider";
import { dayItems, itemsBetween, type CalItem } from "../calendar/items";
import { useSpecialDays } from "../calendar/SpecialDaysProvider";
import { BarChart, LineChart } from "../components/Charts";
import { useItemMenu, useScreenMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { Segmented } from "../components/Segmented";
import { Select } from "../components/SelectRow";
import { useContactsIfAny } from "../contacts/ContactsProvider";
import { focusApi, type FocusSession } from "../focus/api";
import { useFocus } from "../focus/FocusProvider";
import { expectedRatio, paceOf, periodLabel } from "../goals/goals";
import { Ring, useGoalProgress } from "../goals/GoalProgress";
import { useGoals } from "../goals/GoalsProvider";
import { habitsApi } from "../habits/api";
import type { CheckIndex, HabitCheck } from "../habits/habits";
import { useHabits } from "../habits/HabitsProvider";
import { moodOf } from "../journal/journal";
import { useJournal } from "../journal/JournalProvider";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { KEYS } from "../lib/itemKeys";
import { contactRequest, goalRequest, NEW_ITEM, projectRequest, reviewRequest } from "../lib/request";
import { symbolPath } from "../components/symbols";
import { HEALTH_LABELS, healthOf, nextAction } from "../projects/projects";
import { useProjects } from "../projects/ProjectsProvider";
import { readPref, writePref } from "../lib/storage";
import { useNow } from "../lib/useNow";
import { getModule } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { requestObligation } from "../obligations/obligationRequest";
import { formatAmount } from "../obligations/obligations";
import { useObligations } from "../obligations/ObligationsProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, dayKey, relativeDay, type DayKey } from "../tasks/day";
import { requestTaskOpen } from "../tasks/taskFocus";
import { useTaskMenu } from "../tasks/taskMenu";
import type { Task } from "../tasks/tasks";
import { useTasks } from "../tasks/TasksProvider";
import { reviewsApi } from "./api";
import { announceReview, useWeekReviewState } from "./reviewState";
import {
  doneDay,
  formatMinutes,
  habitRate,
  habitTally,
  isoWeek,
  mondayOf,
  moodAverage,
  periodOf,
  periodTitle,
  shiftPeriod,
  sumByBucket,
  weekBounds,
  weekLabel,
  type Period,
  type PeriodUnit,
  type Review,
} from "./review";
import { locale, tr, trn } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

type Tab = "revue" | "statistiques" | "rapport";


const isTab = (v: unknown): v is Tab => v === "revue" || v === "statistiques" || v === "rapport";
const isUnit = (v: unknown): v is PeriodUnit => v === "semaine" || v === "mois" || v === "annee";

const UNITS: readonly { value: PeriodUnit; label: string }[] = [
  { value: "semaine", label: tr("Semaine") },
  { value: "mois", label: tr("Mois") },
  { value: "annee", label: tr("Année") },
];

const PACE_LABELS = { avance: tr("En avance"), temps: tr("Dans les temps"), retard: tr("En retard|rythme") } as const;
const ONE = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });

// ——— Historique : tâches terminées, Focus, habitudes, humeur ———

interface History {
  /** Une entrée par tâche terminée. */
  done: { day: DayKey; value: number }[];
  /** Minutes de concentration. */
  focus: { day: DayKey; value: number }[];
  checks: CheckIndex;
  habits: ReturnType<typeof useHabits>["habits"];
  moods: { day: DayKey; mood: number | null }[];
  journalDays: DayKey[];
}

/**
 * Données des statistiques depuis `from`. Le Focus garde 56 jours en mémoire et les Habitudes
 * 400 : une période plus ancienne est relue dans la base.
 */
function useHistory(from: DayKey): History {
  const { tasks, olderDone, today } = useTasks();
  const { sessions } = useFocus();
  const { habits, checks } = useHabits();
  const { pages } = useJournal();
  const { filter } = useSpaces();
  const [older, setOlder] = useState<{ since: DayKey; sessions: FocusSession[]; checks: HabitCheck[] } | null>(null);
  const needsOlder = from < addDays(today, -50);

  useEffect(() => {
    if (!needsOlder || (older && older.since <= from)) return;
    let live = true;
    Promise.all([focusApi.list(from), habitsApi.checks(from)])
      .then(([s, c]) => {
        if (live) setOlder({ since: from, sessions: s, checks: c });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [from, needsOlder, older]);

  return useMemo(() => {
    const inSpace = (spaceId: string | null) => filter === "tous" || spaceId === filter;
    const done = [
      ...tasks.filter((t) => t.doneAt !== null && inSpace(t.spaceId)).map((t) => ({ day: doneDay(t.doneAt!), value: 1 })),
      ...olderDone.filter((t) => inSpace(t.spaceId)).map((t) => ({ day: doneDay(t.doneAt), value: 1 })),
    ];
    const recentIds = new Set(sessions.map((s) => s.id));
    const focus = [...sessions, ...(older?.sessions.filter((s) => !recentIds.has(s.id)) ?? [])].map((s) => ({ day: s.day, value: s.minutes }));
    let index: CheckIndex = checks;
    if (older) {
      const map = new Map<string, Map<DayKey, number>>();
      for (const [id, days] of checks) map.set(id, new Map(days));
      const recent = addDays(today, -399);
      for (const c of older.checks) {
        if (c.day >= recent) continue;
        const days = map.get(c.habitId) ?? new Map<DayKey, number>();
        days.set(c.day, c.value);
        map.set(c.habitId, days);
      }
      index = map;
    }
    return {
      done,
      focus,
      checks: index,
      habits: habits.filter((h) => filter === "tous" || h.spaceId === filter || h.spaceId === null),
      moods: [...pages.values()].map((p) => ({ day: p.day, mood: p.mood })),
      journalDays: [...pages.keys()],
    };
  }, [tasks, olderDone, sessions, older, checks, habits, pages, filter, today]);
}

interface Totals {
  done: number;
  focus: number;
  habits: number | null;
  mood: number | null;
  journal: number;
}

function totalsOf(h: History, from: DayKey, to: DayKey, today: DayKey): Totals {
  const within = (d: DayKey) => d >= from && d <= to;
  return {
    done: h.done.filter((x) => within(x.day)).length,
    focus: h.focus.reduce((s, x) => (within(x.day) ? s + x.value : s), 0),
    habits: habitRate(habitTally(h.habits, h.checks, from, to, today)),
    mood: moodAverage(h.moods, from, to),
    journal: h.journalDays.filter(within).length,
  };
}

const moodText = (mood: number | null) => (mood === null ? "—" : `${moodOf(Math.round(mood))?.label ?? ""} · ${ONE.format(mood)} / 5`);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="budget-stat glass">
      <span className="budget-stat-label">{label}</span>
      <span className="budget-stat-value">{value}</span>
      {sub && <span className="budget-stat-sub">{sub}</span>}
    </div>
  );
}

function StatTiles({ t, previous, previousLabel }: { t: Totals; previous?: Totals; previousLabel?: string }) {
  const before = (text: string) => (previous && previousLabel ? tr("{label} : {value}", { label: previousLabel, value: text }) : undefined);
  return (
    <div className="review-stats">
      <Stat label={tr("Tâches terminées")} value={String(t.done)} sub={previous ? before(String(previous.done)) : undefined} />
      <Stat label={tr("Temps de focus")} value={formatMinutes(t.focus)} sub={previous ? before(formatMinutes(previous.focus)) : undefined} />
      <Stat label={tr("Habitudes tenues")} value={t.habits === null ? "—" : `${t.habits} %`} sub={previous ? before(previous.habits === null ? "—" : `${previous.habits} %`) : undefined} />
      <Stat label={tr("Humeur moyenne")} value={t.mood === null ? "—" : `${ONE.format(t.mood)} / 5`} sub={t.mood === null ? tr("Aucune humeur notée") : moodOf(Math.round(t.mood))?.label} />
    </div>
  );
}

function PeriodNav({ period, onShift, onReset, label }: { period: Period; onShift: (by: number) => void; onReset: () => void; label: string }) {
  return (
    <div className="budget-month" role="group" aria-label={label}>
      <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Période précédente")} title={tr("Période précédente")} onClick={() => onShift(-1)}>
        <Icon d={ICONS.arrowLeft} size={14} stroke={2.4} />
      </button>
      <button type="button" className="budget-month-label review-period-label" onClick={onReset} title={tr("Revenir à la période en cours")}>
        {periodTitle(period)}
      </button>
      <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Période suivante")} title={tr("Période suivante")} onClick={() => onShift(1)}>
        <Icon d={ICONS.arrowRight} size={14} stroke={2.4} />
      </button>
    </div>
  );
}

// ——— Statistiques ———

function StatsView() {
  const today = dayKey(useNow());
  const [unit, setUnit] = useState<PeriodUnit>(() => readPref("bilanPeriode", "semaine", isUnit));
  const [anchor, setAnchor] = useState(today);
  const period = periodOf(unit, anchor);
  const previous = shiftPeriod(period, -1);
  const h = useHistory(previous.from);
  const current = (b: { from: DayKey; to: DayKey }) => today >= b.from && today <= b.to;
  const labels = period.buckets;
  const chooseUnit = (u: PeriodUnit) => {
    setUnit(u);
    writePref("bilanPeriode", u);
  };
  const previousLabel = unit === "semaine" ? tr("Semaine précédente") : unit === "mois" ? tr("Mois précédent") : tr("Année précédente");

  return (
    <div className="review-stats-view">
      <div className="review-toolbar">
        <Segmented value={unit} options={UNITS} label={tr("Période")} onChange={chooseUnit} />
        <PeriodNav period={period} label={tr("Période affichée")} onShift={(by) => setAnchor(shiftPeriod(period, by).from)} onReset={() => setAnchor(today)} />
      </div>
      <StatTiles t={totalsOf(h, period.from, period.to, today)} previous={totalsOf(h, previous.from, previous.to, today)} previousLabel={previousLabel} />
      <div className="review-charts">
        <section className="review-chart glass" aria-label={tr("Tâches terminées")}>
          <h2 className="budget-panel-title">{tr("Tâches terminées")}</h2>
          <BarChart
            data={sumByBucket(h.done, labels).map((value, i) => ({ label: labels[i]!.label, value, current: current(labels[i]!) }))}
            format={(n) => trn(n, "{n} tâche", "{n} tâches")}
            series={[tr("Tâches terminées")]}
            label={tr("Tâches terminées")}
            color={getModule("taches").color}
            height={130}
          />
        </section>
        <section className="review-chart glass" aria-label={tr("Temps de focus")}>
          <h2 className="budget-panel-title">{tr("Temps de focus")}</h2>
          <BarChart
            data={sumByBucket(h.focus, labels).map((value, i) => ({ label: labels[i]!.label, value, current: current(labels[i]!) }))}
            format={formatMinutes}
            series={[tr("Temps de focus")]}
            label={tr("Temps de focus")}
            color={getModule("focus").color}
            height={130}
          />
        </section>
        <section className="review-chart glass" aria-label={tr("Habitudes tenues")}>
          <h2 className="budget-panel-title">{tr("Habitudes tenues")}</h2>
          {h.habits.length === 0 ? (
            <p className="links-empty">{tr("Aucune habitude.")}</p>
          ) : (
            <BarChart
              data={labels.map((b) => ({ label: b.label, value: habitRate(habitTally(h.habits, h.checks, b.from, b.to, today)) ?? 0, current: current(b) }))}
              format={(n) => `${n} %`}
              series={[tr("Habitudes tenues")]}
              label={tr("Habitudes tenues")}
              color={getModule("habitudes").color}
              height={130}
            />
          )}
        </section>
        <section className="review-chart glass" aria-label={tr("Humeur")}>
          <h2 className="budget-panel-title">{tr("Humeur")}</h2>
          <LineChart points={labels.map((b) => ({ label: b.label, value: moodAverage(h.moods, b.from, b.to) }))} min={1} max={5} format={(n) => `${ONE.format(n)} / 5`} label={tr("Humeur moyenne")} height={130} />
        </section>
      </div>
    </div>
  );
}

// ——— Revue de la semaine ———

const STEPS = [
  {
    id: "boite",
    short: tr("Boîte"),
    title: tr("Boîte de réception"),
    intro: tr("Les tâches notées sans date attendent ici. Planifiez chacune, terminez-la avec la case ronde ou supprimez-la par le clic droit."),
    done: tr("La boîte de réception est vide."),
  },
  {
    id: "retard",
    short: tr("Retards"),
    title: tr("Tâches en retard"),
    intro: tr("Ces tâches ont dépassé leur échéance. Leur donner une nouvelle date réaliste, ou les terminer si elles sont faites."),
    done: tr("Aucune tâche en retard."),
  },
  {
    id: "semaine",
    short: tr("Semaine"),
    title: tr("Semaine à venir"),
    intro: tr("Rendez-vous, tâches, échéances et anniversaires des sept prochains jours, pour ne rien découvrir au dernier moment."),
    done: tr("Rien de prévu dans les sept prochains jours."),
  },
  {
    id: "objectifs",
    short: tr("Objectifs"),
    title: tr("Objectifs"),
    intro: tr("Où en sont les objectifs en cours ? Un objectif en retard mérite une tâche cette semaine."),
    done: tr("Aucun objectif en cours."),
  },
  {
    id: "projets",
    short: tr("Projets"),
    title: tr("Projets"),
    intro: tr("Chaque projet en cours a-t-il une prochaine action ? Un projet sans tâche à faire n'avance pas. Notez l'étape suivante, même petite."),
    done: tr("Aucun projet en cours."),
  },
  {
    id: "reussites",
    short: tr("Réussites"),
    title: tr("Réussites"),
    intro: tr("Noter ce qui a réussi, ce qui est à retenir, et les priorités de la semaine suivante. Le texte s'enregistre pendant la saisie."),
    done: "",
  },
] as const;

function ReviewTask({ task, today }: { task: Task; today: DayKey }) {
  const { setDone, update } = useTasks();
  const { go } = useNavigation();
  const itemMenu = useItemMenu();
  const taskMenu = useTaskMenu();
  const late = task.dueDate !== null && task.dueDate < today;
  const plan = (day: DayKey) => void update(task, { dueDate: day });
  return (
    <li className="review-row" style={task.color ? ({ "--row-color": task.color } as CSSProperties) : undefined} {...itemMenu(() => taskMenu(task))}>
      <button type="button" className="task-check" data-sans-son aria-label={tr("Terminer la tâche « {title} »", { title: task.title })} onClick={() => void setDone(task, true)} />
      <button
        type="button"
        className="review-row-title"
        onClick={() => {
          requestTaskOpen(task.id);
          go("taches");
        }}
      >
        {task.title}
      </button>
      {late && task.dueDate && (
        <span className="task-meta" data-late>
          {relativeDay(task.dueDate, today)}
        </span>
      )}
      <span className="review-plan" role="group" aria-label={tr("Planifier « {title} »", { title: task.title })}>
        <button type="button" className="btn-glass btn-glass--sm" onClick={() => plan(today)}>
          {tr("Aujourd'hui")}
        </button>
        <button type="button" className="btn-glass btn-glass--sm" onClick={() => plan(addDays(today, 1))}>
          {tr("Demain")}
        </button>
        <button type="button" className="btn-glass btn-glass--sm" onClick={() => plan(addDays(mondayOf(today), 7))}>
          {tr("Semaine prochaine")}
        </button>
      </span>
    </li>
  );
}

/** Étape terminée : rien à traiter. */
function AllClear({ text }: { text: string }) {
  return (
    <div className="review-clear">
      <span className="review-clear-mark" aria-hidden="true">
        <Icon d={ICONS.check} size={22} stroke={3} />
      </span>
      <p>{text}</p>
    </div>
  );
}

function TaskStep({ tasks, today, empty }: { tasks: readonly Task[]; today: DayKey; empty: string }) {
  if (tasks.length === 0) return <AllClear text={empty} />;
  return (
    <ul className="review-rows">
      {tasks.map((t) => (
        <ReviewTask key={t.id} task={t} today={today} />
      ))}
    </ul>
  );
}

const KIND_LABELS: Record<CalItem["kind"], string> = {
  event: tr("Rendez-vous"),
  task: tr("Tâche"),
  holiday: tr("Jour férié"),
  obligation: tr("Échéance"),
  cancel: tr("Résiliation"),
  birthday: tr("Anniversaire"),
};

const LONG_DAY = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });
const LONG_DATE = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" });
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function WeekAhead({ today }: { today: DayKey }) {
  const { events } = useEvents();
  const special = useSpecialDays();
  const { tasks } = useTasks();
  const { obligations, categories } = useObligations();
  const contacts = useContactsIfAny()?.contacts;
  const { spaces, filter } = useSpaces();
  const { go } = useNavigation();
  const itemMenu = useItemMenu();
  const from = addDays(today, 1);
  const to = addDays(today, 7);
  const items = itemsBetween(
    {
      events,
      tasks: tasks.filter((t) => t.doneAt === null),
      spaces,
      filter,
      hiddenSpaces: [],
      showTasks: true,
      holidays: special.holidays(from, to),
      obligations,
      obligationCategories: categories,
      showObligations: true,
      contacts,
      showBirthdays: true,
      birthdayColor: getModule("contacts").color,
    },
    from,
    to,
  );
  const open = (i: CalItem, day: DayKey) => {
    if (i.kind === "task") {
      requestTaskOpen(i.id);
      go("taches");
    } else if (i.kind === "obligation" || i.kind === "cancel") {
      go("obligations");
      requestObligation({ id: i.id });
    } else if (i.kind === "birthday") {
      go("contacts");
      contactRequest.request(i.id);
    } else {
      go("calendrier");
      requestCalendar({ day, eventId: i.kind === "event" ? i.id : undefined });
    }
  };
  if (items.length === 0) return <p className="review-empty">{tr("Rien de prévu dans les sept prochains jours.")}</p>;
  return (
    <div className="review-days">
      {Array.from({ length: 7 }, (_, n) => addDays(from, n)).map((day) => {
        const list = dayItems(items, day);
        if (list.length === 0) return null;
        const title = LONG_DAY.format(new Date(`${day}T12:00:00`));
        return (
          <section key={day} className="review-day" aria-label={title}>
            <h3 className="goal-section-title">{title}</h3>
            <ul className="review-rows">
              {list.map((i) => (
                <li
                  key={i.key}
                  className="review-row"
                  style={i.color ? ({ "--row-color": i.color } as CSSProperties) : undefined}
                  {...itemMenu(() => [{ label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => open(i, day) }])}
                >
                  <span className="appointment-dot" style={i.color ? ({ "--ev-color": i.color } as CSSProperties) : undefined} aria-hidden="true" />
                  <button type="button" className="review-row-title" onClick={() => open(i, day)}>
                    {i.title}
                  </button>
                  <span className="task-meta">{KIND_LABELS[i.kind]}</span>
                  <span className="pill today-time">{i.start === null || i.startDate < day ? tr("Journée") : toTime(i.start)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Projets en cours : état et prochaine action ; une action s'ajoute d'ici quand il en manque. */
function ProjectsStep({ today }: { today: DayKey }) {
  const { visible, milestones } = useProjects();
  const { tasks, create } = useTasks();
  const { go } = useNavigation();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const active = visible.filter((p) => p.status === "en-cours" && !p.archived);
  const openProject = (id: string) => {
    projectRequest.request(id);
    go("projets");
  };
  if (active.length === 0)
    return (
      <div className="review-empty">
        <p>{tr("Aucun projet en cours.")}</p>
      </div>
    );
  return (
    <ul className="review-projects">
      {active.map((p) => {
        const list = tasks.filter((t) => t.projectId === p.id);
        const health = healthOf(p, list, milestones.get(p.id) ?? [], today);
        const next = nextAction(list);
        const color = p.color ?? getModule("projets").color;
        const draft = drafts[p.id] ?? "";
        return (
          <li key={p.id} className="review-project" style={{ "--row-color": color } as CSSProperties}>
            <button type="button" className="review-project-head" onClick={() => openProject(p.id)}>
              <ModuleChip color={color} icon={symbolPath(p.icon, ICONS.flag)} size={30} />
              <span className="review-project-name">{p.name}</span>
              {health && (
                <span className="project-health" data-level={health.level} title={health.reasons.join(" · ")}>
                  {HEALTH_LABELS[health.level]}
                </span>
              )}
            </button>
            {next ? (
              <p className="review-project-next">
                {tr("Prochaine action : ")}<strong>{next.title}</strong>
                {next.dueDate ? ` · ${relativeDay(next.dueDate, today)}` : ""}
              </p>
            ) : (
              <form
                className="review-project-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = draft.trim();
                  if (!title) return;
                  setDrafts((d) => ({ ...d, [p.id]: "" }));
                  void create({
                    title,
                    notes: "",
                    spaceId: p.spaceId,
                    dueDate: null,
                    dueTime: null,
                    priority: 0,
                    estimate: null,
                    tags: [],
                    subtasks: [],
                    recurrence: null,
                    color: null,
                    reminder: null,
                    inbox: false,
                    projectId: p.id,
                  });
                }}
              >
                <span className="review-project-missing">{tr("Aucune prochaine action.")}</span>
                <div className="field-box">
                  <input
                    className="field-input"
                    value={draft}
                    maxLength={500}
                    placeholder={tr("Prochaine action, puis Entrée")}
                    aria-label={tr("Prochaine action de « {name} »", { name: p.name })}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  />
                </div>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function GoalsStep({ today }: { today: DayKey }) {
  const { visible } = useGoals();
  const progress = useGoalProgress();
  const { go } = useNavigation();
  const goals = visible.filter((g) => g.status === "en-cours");
  const open = (id: string) => {
    goalRequest.request(id);
    go("objectifs");
  };
  if (goals.length === 0)
    return (
      <div className="review-empty">
        <p>{tr("Aucun objectif en cours.")}</p>
        <button type="button" className="btn-glass btn-glass--sm" onClick={() => open(NEW_ITEM)}>
          {tr("Nouvel objectif")}
        </button>
      </div>
    );
  return (
    <ul className="review-goals">
      {goals.map((g) => {
        const p = progress(g);
        const pace = paceOf(p, expectedRatio(g, today));
        const color = g.color ?? getModule("objectifs").color;
        return (
          <li key={g.id}>
            <button type="button" className="goal-card glass" style={{ "--goal-color": color } as CSSProperties} onClick={() => open(g.id)}>
              <Ring ratio={p.ratio} color={color} size={54} />
              <span className="goal-card-text">
                <span className="goal-card-title">{g.title}</span>
                <span className="goal-card-meta">{periodLabel(g)}</span>
                <span className="goal-card-progress">{p.label}</span>
                {pace && (
                  <span className="goal-pace" data-pace={pace}>
                    {PACE_LABELS[pace]}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type ReflectionForm = Pick<Review, "wins" | "lessons" | "priorities">;

/** Termine la revue (enregistrée comme faite) ; fournie par l'étape « Réussites ». */
type Finish = () => Promise<Review | null>;

function Reflection({
  week,
  review,
  previous,
  onSaved,
  finishRef,
}: {
  week: string;
  review: Review | undefined;
  previous: Review | undefined;
  onSaved: (r: Review) => void;
  finishRef: MutableRefObject<Finish | null>;
}) {
  const notify = useToast();
  const [form, setForm] = useState<ReflectionForm>({ wins: review?.wins ?? "", lessons: review?.lessons ?? "", priorities: review?.priorities ?? "" });
  const pending = useRef<{ timer: number; form: ReflectionForm } | null>(null);
  const done = review?.doneAt != null;
  const doneRef = useRef(done);
  doneRef.current = done;

  const save = (f: ReflectionForm, markDone: boolean) =>
    reviewsApi
      .save(week, { ...f, done: markDone })
      .then((r) => {
        onSaved(r);
        announceReview(r);
        return r;
      })
      .catch((err: DataError) => {
        notify(dataErrorMessage(err));
        return null;
      });

  // Enregistre le brouillon peu après la saisie, et en quittant l'étape.
  const change = (changes: Partial<ReflectionForm>) => {
    const next = { ...form, ...changes };
    setForm(next);
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = { form: next, timer: window.setTimeout(() => flush(), 800) };
  };
  const flush = () => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    void save(p.form, doneRef.current);
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  finishRef.current = () => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
    return save(form, true);
  };

  const field = (key: keyof ReflectionForm, label: string, placeholder: string) => (
    <div className="field">
      <label htmlFor={`revue-${key}`} className="field-label">
        {label}
      </label>
      <textarea id={`revue-${key}`} className="detail-notes review-text" rows={3} maxLength={5000} placeholder={placeholder} value={form[key]} onChange={(e) => change({ [key]: e.target.value })} />
    </div>
  );

  return (
    <div className="review-reflection">
      {previous?.priorities && (
        <div className="review-previous">
          <span className="goal-section-title">{tr("Priorités prévues pour cette semaine")}</span>
          <p>{previous.priorities}</p>
        </div>
      )}
      {field("wins", tr("Réussites"), tr("Ce qui a bien marché cette semaine."))}
      {field("lessons", tr("À retenir"), tr("Ce qui a freiné, ce qui serait à changer."))}
      {field("priorities", tr("Priorités de la semaine suivante"), tr("Trois priorités au plus."))}
      {done && review?.doneAt && <p className="settings-hint">{tr("Revue faite le {date}.", { date: LONG_DAY.format(new Date(review.doneAt * 1000)) })}</p>}
    </div>
  );
}

/** Fin de la revue : ce qui a été noté, et la suite. */
function Finished({ review, onBack, onStats }: { review: Review; onBack: () => void; onStats: () => void }) {
  return (
    <div className="review-finished">
      <span className="review-clear-mark review-clear-mark--big" aria-hidden="true">
        <Icon d={ICONS.check} size={34} stroke={3} />
      </span>
      <h3>{tr("Revue de la semaine faite")}</h3>
      <p>{weekLabel(review.week)}</p>
      {review.priorities && (
        <div className="review-previous">
          <span className="goal-section-title">{tr("Priorités de la semaine suivante")}</span>
          <p>{review.priorities}</p>
        </div>
      )}
      <div className="review-finished-actions">
        <button type="button" className="btn-glass" onClick={onBack}>
          {tr("Revoir la revue")}
        </button>
        <button type="button" className="btn-gel" onClick={onStats}>
          {tr("Voir les statistiques")}
        </button>
      </div>
    </div>
  );
}

function ReviewView({ reviews, onSaved, onStats }: { reviews: readonly Review[]; onSaved: (r: Review) => void; onStats: () => void }) {
  const { visible, today } = useTasks();
  const [step, setStep] = useState(0);
  const [week, setWeek] = useState(() => isoWeek(today));
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [finished, setFinished] = useState<Review | null>(null);
  const finishRef = useRef<Finish | null>(null);
  const thisWeek = isoWeek(today);
  const lastWeek = isoWeek(addDays(today, -7));
  const bounds = weekBounds(week);
  const h = useHistory(bounds.start);
  const open = visible.filter((t) => t.doneAt === null);
  const inbox = open.filter((t) => t.inbox);
  const late = open.filter((t) => t.dueDate !== null && t.dueDate < today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  // Projets en cours sans prochaine action : à compléter à l'étape « Projets ».
  const { visible: projects } = useProjects();
  const withoutNext = projects.filter((p) => p.status === "en-cours" && !p.archived && !nextAction(open.filter((t) => t.projectId === p.id))).length;
  const counts = [inbox.length, late.length, 0, 0, withoutNext];
  const current = STEPS[step]!;
  const next = STEPS[step + 1];
  const last = step === STEPS.length - 1;
  const review = reviews.find((r) => r.week === week);
  const previous = reviews.find((r) => r.week === isoWeek(addDays(bounds.start, -7)));
  const past = reviews.filter((r) => r.wins || r.lessons || r.priorities || r.doneAt);
  const go = (i: number) => {
    setFinished(null);
    setStep(i);
  };

  let content: ReactNode;
  if (finished) content = <Finished review={finished} onBack={() => setFinished(null)} onStats={onStats} />;
  else if (current.id === "boite") content = <TaskStep tasks={inbox} today={today} empty={current.done} />;
  else if (current.id === "retard") content = <TaskStep tasks={late} today={today} empty={current.done} />;
  else if (current.id === "semaine") content = <WeekAhead today={today} />;
  else if (current.id === "objectifs") content = <GoalsStep today={today} />;
  else if (current.id === "projets") content = <ProjectsStep today={today} />;
  else
    content = (
      <>
        <div className="review-week-head">
          <Select
            value={week}
            label={tr("Semaine de la revue")}
            options={[
              { value: thisWeek, label: tr("Cette semaine · {x}", { x: weekLabel(thisWeek).split(" · ")[1] }) },
              { value: lastWeek, label: tr("Semaine dernière · {x}", { x: weekLabel(lastWeek).split(" · ")[1] }) },
            ]}
            onChange={setWeek}
          />
        </div>
        <StatTiles t={totalsOf(h, bounds.start, bounds.end, today)} />
        <Reflection key={week} week={week} review={review} previous={previous} onSaved={onSaved} finishRef={finishRef} />
      </>
    );

  return (
    <div className="review-body">
      <section className="review-main glass" aria-labelledby="revue-etape">
        <ol className="review-steps">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button type="button" className="review-step" aria-current={i === step && !finished ? "step" : undefined} data-done={i < step || finished !== null || undefined} onClick={() => go(i)}>
                <span className="review-step-number">{i < step || finished ? <Icon d={ICONS.check} size={12} stroke={3.2} /> : i + 1}</span>
                <span className="review-step-label" title={s.title}>{s.short}</span>
                {counts[i] ? <span className="review-step-count">{counts[i]}</span> : null}
              </button>
            </li>
          ))}
        </ol>
        {!finished && (
          <header className="review-step-head">
            <span className="review-step-of">
              {tr("Étape {n} sur {total}", { n: step + 1, total: STEPS.length })}
            </span>
            <h2 id="revue-etape">{current.title}</h2>
            <p>
              <Sentences text={current.intro} />
            </p>
          </header>
        )}
        <div className="review-step-content">{content}</div>
        {!finished && (
          <footer className="review-nav">
            <button type="button" className="btn-glass" disabled={step === 0} onClick={() => go(Math.max(0, step - 1))}>
              <Icon d={ICONS.arrowLeft} size={14} stroke={2.4} />
              {tr("Précédent")}
            </button>
            <span className="tasks-header-spacer" />
            {next && (
              <button type="button" className="btn-gel" onClick={() => go(step + 1)}>
                {tr("Suivant : {title}", { title: next.title })}
                <Icon d={ICONS.arrowRight} size={14} stroke={2.4} />
              </button>
            )}
            {last && (
              <button
                type="button"
                className="btn-gel"
                onClick={async () => {
                  const r = await finishRef.current?.();
                  if (r) setFinished(r);
                }}
              >
                <Icon d={ICONS.check} size={15} stroke={2.8} />
                {review?.doneAt ? tr("Enregistrer la revue") : tr("Terminer la revue")}
              </button>
            )}
          </footer>
        )}
      </section>
      <aside className="review-history glass" aria-label={tr("Revues enregistrées")}>
        <h2 className="budget-panel-title">{tr("Revues enregistrées")}</h2>
        {past.length === 0 ? (
          <p className="review-empty">{tr("Aucune revue enregistrée.")}</p>
        ) : (
          <ul className="review-history-list">
            {past.map((r) => (
              <li key={r.week} className="review-history-item" data-open={openWeek === r.week || undefined}>
                <button type="button" className="review-history-head" aria-expanded={openWeek === r.week} onClick={() => setOpenWeek((w) => (w === r.week ? null : r.week))}>
                  <span className="review-history-week">{weekLabel(r.week)}</span>
                  <span className="goal-pace" data-pace={r.doneAt ? "temps" : undefined}>
                    {r.doneAt ? tr("Faite") : tr("Brouillon")}
                  </span>
                </button>
                {openWeek === r.week && (
                  <dl className="review-history-text">
                    {r.wins && (
                      <>
                        <dt>{tr("Réussites")}</dt>
                        <dd>{r.wins}</dd>
                      </>
                    )}
                    {r.lessons && (
                      <>
                        <dt>{tr("À retenir")}</dt>
                        <dd>{r.lessons}</dd>
                      </>
                    )}
                    {r.priorities && (
                      <>
                        <dt>{tr("Priorités")}</dt>
                        <dd>{r.priorities}</dd>
                      </>
                    )}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

// ——— Rapport du mois ———

function Report({ period, reviews, today }: { period: Period; reviews: readonly Review[]; today: DayKey }) {
  const h = useHistory(period.from);
  const { visible: goals } = useGoals();
  const progress = useGoalProgress();
  const { visible: transactions } = useBudget();
  const { obligations } = useObligations();
  const { filter } = useSpaces();
  const t = totalsOf(h, period.from, period.to, today);
  const month = period.from.slice(0, 7);
  const shownObligations = obligations.filter((o) => filter === "tous" || o.spaceId === filter || o.spaceId === null);
  const money = summarize(transactions, plannedPayments(shownObligations, month), month);
  const monthGoals = goals.filter((g) => g.startDate <= period.to && (g.targetDate === null || g.targetDate >= period.from) && g.status !== "abandonne");
  const monthReviews = reviews
    .filter((r) => {
      const b = weekBounds(r.week);
      return b.start <= period.to && b.end >= period.from && (r.wins || r.lessons || r.priorities);
    })
    .sort((a, b) => a.week.localeCompare(b.week));
  const buckets = period.buckets;
  const m = getModule("bilan");
  return (
    <article className="report" aria-label={tr("Rapport du mois : {periodTitle}", { periodTitle: periodTitle(period) })}>
      <header className="report-head">
        <Orb color={m.color} icon={m.icon} size={46} />
        <div>
          <h2 className="report-title">{tr("Rapport du mois · ")}{periodTitle(period)}</h2>
          <p className="report-sub">{tr("Établi le {date}", { date: LONG_DATE.format(new Date(`${today}T12:00:00`)) })}</p>
        </div>
      </header>
      <section className="report-section">
        <h3 className="report-section-title">{tr("Activité")}</h3>
        <dl className="report-figures">
          <div>
            <dt>{tr("Tâches terminées")}</dt>
            <dd>{t.done}</dd>
          </div>
          <div>
            <dt>{tr("Temps de focus")}</dt>
            <dd>{formatMinutes(t.focus)}</dd>
          </div>
          <div>
            <dt>{tr("Habitudes tenues")}</dt>
            <dd>{t.habits === null ? "—" : `${t.habits} %`}</dd>
          </div>
          <div>
            <dt>{tr("Humeur moyenne")}</dt>
            <dd>{moodText(t.mood)}</dd>
          </div>
          <div>
            <dt>{tr("Pages de journal")}</dt>
            <dd>{t.journal}</dd>
          </div>
        </dl>
      </section>
      <section className="report-section report-charts">
        <div>
          <h3 className="report-section-title">{tr("Tâches terminées par semaine")}</h3>
          <BarChart data={sumByBucket(h.done, buckets).map((value, i) => ({ label: buckets[i]!.label, value }))} format={(n) => `${n}`} series={[tr("Tâches terminées")]} label={tr("Tâches terminées par semaine")} color={getModule("taches").color} height={110} />
        </div>
        <div>
          <h3 className="report-section-title">{tr("Temps de focus par semaine")}</h3>
          <BarChart data={sumByBucket(h.focus, buckets).map((value, i) => ({ label: buckets[i]!.label, value }))} format={formatMinutes} series={[tr("Temps de focus")]} label={tr("Temps de focus par semaine")} color={getModule("focus").color} height={110} />
        </div>
      </section>
      <section className="report-section">
        <h3 className="report-section-title">{tr("Objectifs")}</h3>
        {monthGoals.length === 0 ? (
          <p className="report-empty">{tr("Aucun objectif sur ce mois.")}</p>
        ) : (
          <ul className="report-goals">
            {monthGoals.map((g) => {
              const p = progress(g);
              return (
                <li key={g.id} style={{ "--goal-color": g.color ?? getModule("objectifs").color } as CSSProperties}>
                  <span className="report-goal-title">{g.title}</span>
                  <span className="report-goal-period">{periodLabel(g)}</span>
                  <span className="report-goal-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(p.ratio * 100)}%` }} />
                  </span>
                  <span className="report-goal-value">
                    {p.label} · {Math.round(p.ratio * 100)} %
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="report-section">
        <h3 className="report-section-title">{tr("Budget")}</h3>
        <dl className="report-figures report-figures--3">
          <div>
            <dt>{tr("Dépenses")}</dt>
            <dd>{formatAmount(money.spent + money.planned)}</dd>
          </div>
          <div>
            <dt>{tr("Revenus")}</dt>
            <dd>{formatAmount(money.income)}</dd>
          </div>
          <div>
            <dt>{tr("Solde")}</dt>
            <dd>{`${money.balance >= 0 ? "+" : "−"} ${formatAmount(Math.abs(money.balance))}`}</dd>
          </div>
        </dl>
      </section>
      <section className="report-section">
        <h3 className="report-section-title">{tr("Revues de la semaine")}</h3>
        {monthReviews.length === 0 ? (
          <p className="report-empty">{tr("Aucune revue sur ce mois.")}</p>
        ) : (
          monthReviews.map((r) => (
            <div key={r.week} className="report-review">
              <h4>{weekLabel(r.week)}</h4>
              <dl className="review-history-text">
                {r.wins && (
                  <>
                    <dt>{tr("Réussites")}</dt>
                    <dd>{r.wins}</dd>
                  </>
                )}
                {r.lessons && (
                  <>
                    <dt>{tr("À retenir")}</dt>
                    <dd>{r.lessons}</dd>
                  </>
                )}
                {r.priorities && (
                  <>
                    <dt>{tr("Priorités")}</dt>
                    <dd>{r.priorities}</dd>
                  </>
                )}
              </dl>
            </div>
          ))
        )}
      </section>
    </article>
  );
}

function ReportView({ reviews }: { reviews: readonly Review[] }) {
  const today = dayKey(useNow());
  const [anchor, setAnchor] = useState(today);
  const period = periodOf("mois", anchor);
  // Ctrl+P : le rapport affiché (sa feuille imprimable est toujours prête, plus bas).
  usePrint(() => () => window.print());
  return (
    <div className="review-report-view">
      <div className="review-toolbar">
        <PeriodNav period={period} label={tr("Mois du rapport")} onShift={(by) => setAnchor(shiftPeriod(period, by).from)} onReset={() => setAnchor(today)} />
        <span className="tasks-header-spacer" />
        <button type="button" className="btn-gel" onClick={() => window.print()} title={tr("Choisir « Microsoft Print to PDF » comme imprimante")}>
          <Icon d={ICONS.printer} size={15} stroke={2.4} />
          {tr("Exporter en PDF")}
        </button>
      </div>
      <div className="review-report-scroll glass">
        <Report period={period} reviews={reviews} today={today} />
      </div>
      {createPortal(
        <div className="print-sheet">
          <Report period={period} reviews={reviews} today={today} />
        </div>,
        document.body,
      )}
    </div>
  );
}

// ——— Écran ———

/** Les trois parties du Bilan, présentées comme trois portes d'entrée. */
/** Les trois parties du Bilan, chacune avec sa couleur (`null` : celle du module). */
const DOORS: readonly { id: Tab; title: string; text: string; icon: string; color: string | null }[] = [
  { id: "revue", title: tr("Revue de la semaine"), text: tr("Faire le point et préparer la semaine suivante, en cinq étapes."), icon: ICONS.check, color: null },
  { id: "statistiques", title: tr("Statistiques"), text: tr("Tâches terminées, temps de focus, habitudes et humeur, par semaine, mois ou année."), icon: ICONS.history, color: "#16a3a3" },
  { id: "rapport", title: tr("Rapport du mois"), text: tr("Le résumé d'un mois, à relire ou à enregistrer en PDF."), icon: ICONS.printer, color: "#e0671f" },
];

export function ReviewScreen() {
  const notify = useToast();
  const today = dayKey(useNow());
  const reviewState = useWeekReviewState();
  const [tab, setTab] = useState<Tab>(() => {
    const asked = reviewRequest.take();
    return isTab(asked) ? asked : readPref("bilanOnglet", "revue", isTab);
  });
  const [reviews, setReviews] = useState<Review[]>([]);
  const doorRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => reviewRequest.on((t) => isTab(t) && setTab(t)), []);
  useEffect(() => {
    reviewsApi
      .list()
      .then(setReviews)
      .catch((err: DataError) => notify(dataErrorMessage(err)));
  }, [notify]);
  useScreenMenu(() => DOORS.map((d) => ({ label: d.title, icon: d.icon, checked: tab === d.id, run: () => choose(d.id) })));

  const choose = (t: Tab) => {
    setTab(t);
    writePref("bilanOnglet", t);
  };
  const saved = (r: Review) => setReviews((list) => [r, ...list.filter((x) => x.week !== r.week)].sort((a, b) => b.week.localeCompare(a.week)));
  const m = getModule("bilan");
  const status: Record<Tab, string> = {
    revue: reviewState === "faite" ? tr("Faite cette semaine") : weekLabel(isoWeek(today)).split(" · ")[0]!,
    statistiques: weekLabel(isoWeek(today)).split(" · ")[0]!,
    rapport: periodTitle(periodOf("mois", today)),
  };
  const onDoorKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = (DOORS.findIndex((d) => d.id === tab) + step + DOORS.length) % DOORS.length;
    choose(DOORS[i]!.id);
    doorRefs.current[i]?.focus();
  };

  return (
    <div className="screen review-screen" style={{ "--bilan": m.color } as CSSProperties}>
      <div className="review-window">
        <header className="review-window-bar">
          <ModuleChip color={m.color} icon={m.icon} size={40} />
          <div className="review-window-title">
            <h1>{tr("Bilan")}</h1>
            <p>{tr("Le point sur ce qui s'est passé dans les autres modules.")}</p>
          </div>
        </header>
        <div className="review-doors" role="tablist" aria-label={tr("Parties du Bilan")} onKeyDown={onDoorKeys}>
          {DOORS.map((d, i) => (
            <button
              key={d.id}
              ref={(el) => {
                doorRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`bilan-porte-${d.id}`}
              aria-selected={tab === d.id}
              aria-controls={`bilan-partie-${d.id}`}
              tabIndex={tab === d.id ? 0 : -1}
              className="review-door"
              style={d.color ? ({ "--bilan": d.color } as CSSProperties) : undefined}
              onClick={() => choose(d.id)}
            >
              <span className="review-door-icon" aria-hidden="true">
                <Icon d={d.icon} size={18} stroke={2.4} />
              </span>
              <span className="review-door-text">
                <span className="review-door-title">{d.title}</span>
                <span className="review-door-desc">{d.text}</span>
              </span>
              <span className="review-door-status" data-done={(d.id === "revue" && reviewState === "faite") || undefined}>
                {status[d.id]}
              </span>
            </button>
          ))}
        </div>
        <div className="review-window-body" role="tabpanel" id={`bilan-partie-${tab}`} aria-labelledby={`bilan-porte-${tab}`}>
          {tab === "revue" && <ReviewView reviews={reviews} onSaved={saved} onStats={() => choose("statistiques")} />}
          {tab === "statistiques" && <StatsView />}
          {tab === "rapport" && <ReportView reviews={reviews} />}
        </div>
      </div>
    </div>
  );
}
