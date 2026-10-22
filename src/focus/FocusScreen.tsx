/**
 * Écran Focus (cahier des charges § 4.10) : minuteur à anneau arc-en-ciel, tâche suivie,
 * plan des séances, ambiances sonores, statistiques ; plein écran « aquarium ».
 */
import { memo, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Checkbox } from "../components/Checkbox";
import { ScreenTitle } from "../components/ScreenTitle";
import { useItemMenu, useScreenMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Segmented } from "../components/Segmented";
import { Select } from "../components/SelectRow";
import { KEYS } from "../lib/itemKeys";
import { setFullscreen } from "../lib/windowControls";
import { getModule } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { fromDayKey } from "../tasks/day";
import { requestTaskOpen } from "../tasks/taskFocus";
import { sortTasks } from "../tasks/tasks";
import { useTasks } from "../tasks/TasksProvider";
import type { FocusSession } from "./api";
import { AMBIENCE_LABELS, DAILY_GOALS, minutesByDay, PLAN_LABELS, summarize, topTasks, type Ambience, type PlanId } from "./focus";
import { useFocus, useTimerNow } from "./FocusProvider";
import { FocusControls, FocusRing } from "./FocusRing";
import { miniWindowState, pinMiniWindow, subscribeMiniWindow } from "./miniWindow";
import { durationLabel, type FocusPlan } from "./timer";
import { locale, tr, trn } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

const PLAN_OPTIONS = (Object.keys(PLAN_LABELS) as PlanId[]).map((value) => ({ value, label: PLAN_LABELS[value] }));
const AMBIENCES = Object.keys(AMBIENCE_LABELS) as Ambience[];
const WEEKDAY = new Intl.DateTimeFormat(locale(), { weekday: "short" });
const HOUR_MINUTE = new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" });
const GOAL_OPTIONS = DAILY_GOALS.map((m) => ({ value: String(m), label: m === 0 ? tr("Aucun") : durationLabel(m) }));
/** Intention : une ligne courte (le cœur en garde 200 caractères). */
const MAX_INTENTION = 200;

/** Tâche suivie par la séance. */
function TaskPicker() {
  const { timer, setTask } = useFocus();
  const { visible, tasks } = useTasks();
  const id = useId();
  const options = useMemo(() => {
    const open = sortTasks(visible.filter((t) => t.doneAt === null)).slice(0, 200);
    const current = timer.taskId ? tasks.find((t) => t.id === timer.taskId) : undefined;
    const list = current && !open.includes(current) ? [current, ...open] : open;
    return [{ value: "", label: tr("Aucune tâche") }, ...list.map((t) => ({ value: t.id, label: t.title }))];
  }, [visible, tasks, timer.taskId]);
  return (
    <div className="field focus-task">
      <label htmlFor={id} className="field-label">
        {tr("Tâche")}
      </label>
      <Select id={id} value={timer.taskId ?? ""} options={options} onChange={(v) => setTask(v || null)} />
    </div>
  );
}

/** Intention de la séance : enregistrée avec elle et rappelée dans l'historique du jour. */
function IntentionField() {
  const { timer, setIntention } = useFocus();
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {tr("Intention")}
      </label>
      <div className="field-box">
        <input
          id={id}
          className="field-input"
          value={timer.intention ?? ""}
          maxLength={MAX_INTENTION}
          placeholder={tr("Sur quoi travaillez-vous ?")}
          autoComplete="off"
          spellCheck
          onChange={(e) => setIntention(e.target.value)}
        />
      </div>
    </div>
  );
}

/** Durées du plan personnalisé. */
function CustomPlan() {
  const { settings, setSettings } = useFocus();
  const ids = useId();
  const fields: { key: Exclude<keyof FocusPlan, "flow">; label: string; max: number; unit: string }[] = [
    { key: "focus", label: tr("Séance"), max: 240, unit: "min" },
    { key: "pause", label: tr("Pause"), max: 60, unit: "min" },
    { key: "longPause", label: tr("Longue pause"), max: 90, unit: "min" },
    { key: "every", label: tr("Longue pause toutes les"), max: 8, unit: tr("séances") },
  ];
  return (
    <div className="focus-custom">
      {fields.map((f) => (
        <div key={f.key} className="field">
          <label htmlFor={`${ids}-${f.key}`} className="field-label">
            {f.label}
          </label>
          <div className="field-box focus-number">
            <input
              id={`${ids}-${f.key}`}
              className="field-input"
              type="number"
              min={f.key === "every" ? 2 : 1}
              max={f.max}
              value={settings.custom[f.key]}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value));
                if (Number.isFinite(v) && v >= (f.key === "every" ? 2 : 1) && v <= f.max) setSettings({ custom: { ...settings.custom, [f.key]: v } });
              }}
            />
            <span className="field-suffix">{f.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AmbiencePicker() {
  const { settings, setSettings } = useFocus();
  const volumeId = useId();
  return (
    <div className="focus-ambience">
      <span className="field-label">{tr("Ambiance")}</span>
      <div className="focus-ambience-list" role="radiogroup" aria-label={tr("Ambiance")}>
        {AMBIENCES.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={settings.ambience === a}
            className="chip-btn focus-ambience-chip"
            onClick={() => setSettings({ ambience: a })}
          >
            {AMBIENCE_LABELS[a]}
          </button>
        ))}
      </div>
      {settings.ambience !== "aucune" && (
        <div className="focus-volume">
          <label htmlFor={volumeId} className="field-label">
            {tr("Volume")}
          </label>
          <input
            id={volumeId}
            type="range"
            className="range"
            min={0}
            max={100}
            step={5}
            value={settings.volume}
            onChange={(e) => setSettings({ volume: Number(e.target.value) })}
            style={{ "--range-fill": `${settings.volume}%` } as CSSProperties}
            aria-valuetext={`${settings.volume} %`}
            data-sans-son
          />
        </div>
      )}
    </div>
  );
}

/** Minutes des 7 derniers jours, en barres. */
function WeekBars() {
  const { sessions, today } = useFocus();
  const days = minutesByDay(sessions, today, 7);
  const max = Math.max(60, ...days.map((d) => d.minutes));
  return (
    <div className="focus-bars" role="img" aria-label={tr("Minutes de concentration des 7 derniers jours : {x}", { x: days.map((d) => d.minutes).join(", ") })}>
      {days.map((d) => (
        <div key={d.day} className="focus-bar" data-today={d.day === today || undefined}>
          <span className="focus-bar-value">{d.minutes > 0 ? d.minutes : ""}</span>
          <span className="focus-bar-track">
            <span className="focus-bar-fill" style={{ height: `${(d.minutes / max) * 100}%` }} />
          </span>
          <span className="focus-bar-day">{WEEKDAY.format(fromDayKey(d.day)).replace(".", "")}</span>
        </div>
      ))}
    </div>
  );
}

/** Objectif du jour : minutes concentrées sur l'objectif choisi. */
function DailyGoal({ minutes }: { minutes: number }) {
  const { settings } = useFocus();
  const goal = settings.dailyGoal;
  if (goal === 0) return null;
  const done = minutes >= goal;
  return (
    <div className="focus-goal" data-done={done || undefined}>
      <div className="focus-goal-head">
        <span className="focus-goal-label">{tr("Objectif du jour")}</span>
        <span className="focus-goal-value">{done ? tr("Atteint") : tr("{done} sur {goal}", { done: durationLabel(minutes), goal: durationLabel(goal) })}</span>
      </div>
      <div className="today-bar" role="progressbar" aria-label={tr("Objectif du jour")} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, minutes)} aria-valuetext={tr("{done} sur {goal}", { done: durationLabel(minutes), goal: durationLabel(goal) })}>
        <div className="today-bar-fill" style={{ width: `${Math.min(100, (100 * minutes) / goal)}%` }} />
      </div>
    </div>
  );
}

/** Une séance du jour : heure, intention ou tâche, durée ; clic droit pour l'ouvrir ou la supprimer. */
function SessionRow({ session }: { session: FocusSession }) {
  const { removeSession } = useFocus();
  const { tasks } = useTasks();
  const { go } = useNavigation();
  const itemMenu = useItemMenu();
  const task = session.taskId ? tasks.find((t) => t.id === session.taskId) : undefined;
  const openTask = task
    ? () => {
        go("taches");
        requestTaskOpen(task.id);
      }
    : undefined;
  const label = session.note ?? task?.title ?? tr("Séance");
  const time = HOUR_MINUTE.format(new Date(session.startedAt * 1000));
  const menu = itemMenu(() => [
    { label: tr("Ouvrir la tâche"), icon: ICONS.check, shortcut: KEYS.open, disabled: !openTask, run: () => openTask?.() },
    "separator",
    { label: tr("Supprimer la séance"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => removeSession(session) },
  ]);
  return (
    <li
      className="focus-session"
      tabIndex={0}
      title={task && session.note ? `${session.note} · ${task.title}` : label}
      aria-label={tr("{label} : {value}", { label: `${time}, ${durationLabel(session.minutes)}`, value: label })}
      onDoubleClick={openTask}
      {...menu}
    >
      <span className="focus-session-time">{time}</span>
      <span className="focus-session-text">
        <span className="focus-session-label">{label}</span>
        {task && session.note && <span className="focus-session-task">{task.title}</span>}
      </span>
      <span className="focus-task-minutes">{durationLabel(session.minutes)}</span>
    </li>
  );
}

function Stats() {
  const { sessions, byTask, today } = useFocus();
  const { tasks } = useTasks();
  const { go } = useNavigation();
  const s = summarize(sessions, today);
  const top = topTasks(byTask, 5).filter(([id]) => tasks.some((t) => t.id === id));
  // Séances du jour, la plus récente en tête.
  const todays = sessions.filter((x) => x.day === today).sort((a, b) => b.startedAt - a.startedAt);
  return (
    <aside className="focus-stats glass" aria-label={tr("Statistiques")}>
      <DailyGoal minutes={s.today} />
      <div className="habit-stats">
        <div className="habit-stat">
          <span className="habit-stat-value">{durationLabel(s.today)}</span>
          <span className="habit-stat-label">
            {trn(s.todaySessions, "aujourd'hui · {n} séance", "aujourd'hui · {n} séances")}
          </span>
        </div>
        <div className="habit-stat">
          <span className="habit-stat-value">{durationLabel(s.week)}</span>
          <span className="habit-stat-label">{tr("cette semaine")}</span>
        </div>
        <div className="habit-stat">
          <span className="habit-stat-value">{s.streak}</span>
          <span className="habit-stat-label">{trn(s.streak, "jour de suite", "jours de suite")}</span>
        </div>
      </div>
      <h3 className="focus-stats-title">{tr("Séances du jour")}</h3>
      {todays.length === 0 ? (
        <p className="focus-stats-note">{tr("Aucune séance aujourd'hui.")}</p>
      ) : (
        <ul className="focus-sessions" aria-label={tr("Séances du jour")}>
          {todays.map((x) => (
            <SessionRow key={x.id} session={x} />
          ))}
        </ul>
      )}
      <h3 className="focus-stats-title">{tr("7 derniers jours")}</h3>
      <WeekBars />
      {s.average > 0 && <p className="focus-stats-note">{tr("Moyenne des jours de séance : {duration}.", { duration: durationLabel(s.average) })}</p>}
      <h3 className="focus-stats-title">{tr("Temps par tâche")}</h3>
      {top.length === 0 ? (
        <p className="focus-stats-note">{tr("Aucune séance rattachée à une tâche.")}</p>
      ) : (
        <ul className="focus-task-times">
          {top.map(([id, minutes]) => (
            <li key={id}>
              <button
                type="button"
                className="focus-task-time"
                onClick={() => {
                  go("taches");
                  requestTaskOpen(id);
                }}
              >
                <span className="focus-task-name">{tasks.find((t) => t.id === id)?.title}</span>
                <span className="focus-task-minutes">{durationLabel(minutes)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

const BUBBLES = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 37) % 100,
  size: 6 + ((i * 7) % 18),
  delay: -((i * 1.7) % 14),
  duration: 9 + ((i * 3) % 9),
}));

const FISH = [
  { top: 24, duration: 46, delay: -8, scale: 1 },
  { top: 52, duration: 62, delay: -30, scale: 0.7 },
  { top: 70, duration: 54, delay: -18, scale: 0.85 },
];

const WEEDS = [
  { left: 8, late: false, d: "M20 120C10 90 35 70 22 40C15 25 25 10 30 0" },
  { left: 18, late: true, d: "M18 120C28 95 8 75 20 50C26 38 18 25 22 15" },
  { left: 78, late: false, d: "M20 120C30 92 5 72 18 45C24 30 15 18 20 5" },
  { left: 88, late: true, d: "M22 120C14 100 34 80 22 58" },
];

/**
 * Décor de l'aquarium : il ne dépend de rien et ne se redessine jamais ; seules des
 * animations de déplacement (prises en charge par la carte graphique) le font vivre.
 */
const AquariumScene = memo(function AquariumScene() {
  return (
    <>
      <div className="aquarium-rays" aria-hidden="true" />
      <div className="aquarium-bubbles" aria-hidden="true">
        {BUBBLES.map((b, i) => (
          <span
            key={i}
            className="aquarium-bubble"
            style={{ left: `${b.left}%`, width: b.size, height: b.size, animationDelay: `${b.delay}s`, animationDuration: `${b.duration}s` } as CSSProperties}
          />
        ))}
      </div>
      <div className="aquarium-fish-layer" aria-hidden="true">
        {FISH.map((f, i) => (
          <svg
            key={i}
            className="aquarium-fish"
            viewBox="0 0 64 32"
            width={64 * f.scale}
            height={32 * f.scale}
            style={{ top: `${f.top}%`, animationDuration: `${f.duration}s`, animationDelay: `${f.delay}s` } as CSSProperties}
          >
            <path d="M6 16C14 4 34 2 46 12l12-8-4 12 4 12-12-8C34 30 14 28 6 16z" />
            <circle cx="16" cy="14" r="2" className="aquarium-eye" />
          </svg>
        ))}
      </div>
      <div className="aquarium-weeds" aria-hidden="true">
        {WEEDS.map((w, i) => (
          <svg key={i} className={w.late ? "aquarium-weed aquarium-weed--late" : "aquarium-weed"} viewBox="0 0 40 120" style={{ left: `${w.left}%` }}>
            <path d={w.d} />
          </svg>
        ))}
      </div>
    </>
  );
});

/** Plein écran apaisant : eau profonde, bulles, poissons, et le minuteur. */
function Aquarium({ onClose }: { onClose: () => void }) {
  const { timer } = useFocus();
  const now = useTimerNow(timer.status === "en-cours");
  const { tasks } = useTasks();
  const task = timer.taskId ? tasks.find((t) => t.id === timer.taskId) : undefined;
  const subject = timer.intention ?? task?.title;
  const closeRef = useRef<HTMLButtonElement>(null);
  // Le minuteur redessine l'écran plusieurs fois par seconde : la fermeture est lue au
  // dernier moment, pour que le plein écran ne soit demandé qu'une fois.
  const closeNow = useRef(onClose);
  closeNow.current = onClose;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.aquarium = "true";
    void setFullscreen(true).catch(() => {});
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeNow.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      delete root.dataset.aquarium;
      void setFullscreen(false).catch(() => {});
    };
  }, []);

  return createPortal(
    <div className="aquarium" role="dialog" aria-modal="true" aria-label={tr("Aquarium")} data-phase={timer.phase}>
      <AquariumScene />
      <div className="aquarium-center">
        <FocusRing timer={timer} now={now} size={300} />
        {subject && <p className="aquarium-task">{subject}</p>}
        <FocusControls compact />
      </div>
      <button ref={closeRef} type="button" className="btn-glass aquarium-close" onClick={onClose}>
        {tr("Quitter l'aquarium")}
      </button>
    </div>,
    document.body,
  );
}

export function FocusScreen() {
  const { timer, settings, setSettings, start, suspend, stop } = useFocus();
  const running = timer.status === "en-cours";
  useScreenMenu(() => [
    {
      label: running ? tr("Suspendre") : timer.status === "suspendu" ? tr("Reprendre") : timer.phase === "concentration" ? tr("Démarrer") : tr("Démarrer la pause"),
      icon: running ? ICONS.pause : ICONS.play,
      run: running ? suspend : start,
    },
    ...(timer.status !== "arret" ? [{ label: tr("Arrêter la séance"), icon: ICONS.stop, run: stop }] : []),
  ]);
  const now = useTimerNow(timer.status === "en-cours");
  const [aquarium, setAquarium] = useState(false);
  const mini = useSyncExternalStore(subscribeMiniWindow, miniWindowState);
  const m = getModule("focus");
  const goalId = useId();

  return (
    <div className="screen focus-screen" style={{ "--row-color": m.color } as CSSProperties}>
      <header className="tasks-header">
        <ScreenTitle module="focus" />
      </header>

      <div className="focus-layout">
        <section className="focus-main-panel glass" aria-label={tr("Minuteur")}>
          <div className="focus-panel-grid">
            <div className="focus-stage">
              <FocusRing timer={timer} now={now} size={260} />
              <FocusControls />
              <div className="focus-extras">
                <button type="button" className="btn-glass focus-extra" onClick={() => setAquarium(true)}>
                  <Icon d={ICONS.expand} size={15} stroke={2.4} />
                  {tr("Aquarium")}
                </button>
                <button
                  type="button"
                  className="btn-glass focus-extra"
                  aria-pressed={mini.pinned}
                  onClick={() => pinMiniWindow(!mini.pinned)}
                  title={mini.pinned ? tr("Ne plus afficher le mini-lecteur hors d'Aqueli") : tr("Afficher le mini-lecteur hors d'Aqueli")}
                >
                  <Icon d={ICONS.pin} size={15} stroke={2.2} />
                  {tr("Mini-lecteur")}
                </button>
              </div>
            </div>
            <div className="focus-settings">
              <IntentionField />
              <TaskPicker />
              <div className="field">
                <span className="field-label">{tr("Durées")}</span>
                <Segmented value={settings.plan} options={PLAN_OPTIONS} label={tr("Durées")} onChange={(plan) => setSettings({ plan })} />
              </div>
              {settings.plan === "perso" && <CustomPlan />}
              {settings.plan === "libre" && <p className="focus-stats-note"><Sentences text={tr("Le minuteur compte le temps écoulé. « Pause » termine la séance. La pause dure le cinquième de la séance.")} /></p>}
              <div className="field focus-goal-field">
                <label htmlFor={goalId} className="field-label">
                  {tr("Objectif du jour")}
                </label>
                <Select id={goalId} value={String(settings.dailyGoal)} options={GOAL_OPTIONS} onChange={(v) => setSettings({ dailyGoal: Number(v) })} />
              </div>
              <AmbiencePicker />
              <div className="focus-options">
                <Checkbox
                  checked={settings.quiet}
                  onChange={(quiet) => setSettings({ quiet })}
                  label={tr("Ne pas déranger")}
                  note={tr("Les rappels attendent la fin de la séance.")}
                />
                <Checkbox
                  checked={settings.autoContinue}
                  onChange={(autoContinue) => setSettings({ autoContinue })}
                  label={tr("Enchaîner les séances")}
                  note={tr("La séance suivante démarre à la fin de la pause.")}
                />
              </div>
            </div>
          </div>
        </section>
        <Stats />
      </div>

      {aquarium && <Aquarium onClose={() => setAquarium(false)} />}
    </div>
  );
}
