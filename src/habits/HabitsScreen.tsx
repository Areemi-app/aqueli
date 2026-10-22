import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useContextMenu, useItemMenu, useScreenMenu } from "../components/ContextMenu";
import { EmptyState } from "../components/EmptyState";
import { ScreenTitle } from "../components/ScreenTitle";
import { DateField } from "../components/DateField";
import { Dialog } from "../components/Dialog";
import { useToast } from "../app/ToastProvider";
import { useBulk } from "../app/bulk";
import { startDrag } from "../lib/dragDrop";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { symbolPath } from "../components/symbols";
import { Tabs, type TabItem } from "../components/Tabs";
import { KEYS } from "../lib/itemKeys";
import { getModule } from "../modules/modules";
import { useNewItem } from "../shell/newItem";
import { addDays, fromDayKey, type DayKey } from "../tasks/day";
import {
  isPaused,
  MOMENTS,
  strength,
  bestStreak,
  currentStreak,
  frequencyLabel,
  heatmap,
  isDoneOn,
  isDue,
  isForToday,
  lastDays,
  streakLabel,
  successRate,
  targetLabel,
  valueOn,
  weekCount,
  type Habit,
  type HabitMoment,
} from "./habits";
import { HabitEditor } from "./HabitEditor";
import { NEW_HABIT, onHabitRequest, takePendingHabit } from "./habitRequest";
import { HabitToday } from "./HabitToday";
import { useHabits } from "./HabitsProvider";
import { locale, tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

type View = "jour" | "toutes" | "archivees";
const VIEWS: readonly TabItem<View>[] = [
  { id: "jour", label: tr("Aujourd'hui") },
  { id: "toutes", label: tr("Toutes") },
  { id: "archivees", label: tr("Archivées") },
];

const DAY_TITLE = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });
const MONTH_SHORT = new Intl.DateTimeFormat(locale(), { month: "short" });

const colorOf = (h: Habit) => h.color ?? getModule("habitudes").color;

/** « Pause jusqu'au… » : vacances, maladie ; les jours prévus ne comptent ni comme réussis ni comme manqués. */
function PauseDialog({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const { today, pauseUntil } = useHabits();
  const notify = useToast();
  const [until, setUntil] = useState<DayKey>(addDays(today, 6));
  return (
    <Dialog title={tr("Mettre en pause")} onClose={onClose}>
      <p className="settings-intro">
        <Sentences text={tr("Pendant la pause, « {name} » n'est plus proposée. Les jours prévus ne comptent ni comme réussis ni comme manqués. La série continue.", { name: habit.name })} />
      </p>
      <div className="field">
        <label className="field-label" htmlFor="pause-fin">
          {tr("Jusqu'au")}
        </label>
        <div className="field-box">
          <DateField id="pause-fin" className="field-input" value={until} min={today} onChange={(v) => v && setUntil(v)} />
        </div>
      </div>
      <div className="onb-actions">
        <button type="button" className="btn-glass" onClick={onClose}>
          {tr("Annuler")}
        </button>
        <button
          type="button"
          className="btn-gel"
          onClick={() => {
            void pauseUntil(habit, until).then((n) => notify(n === 0 ? tr("Aucun jour à mettre en pause.") : n === 1 ? tr("1 jour mis en pause.") : tr("{n} jours mis en pause.", { n })));
            onClose();
          }}
        >
          {tr("Mettre en pause")}
        </button>
      </div>
    </Dialog>
  );
}

function HabitRow({ habit, selected, onSelect, onEdit, onDrag }: { habit: Habit; selected: boolean; onSelect: () => void; onEdit: () => void; onDrag: (e: PointerEvent<HTMLElement>) => void }) {
  const { checks, today, toggle, archive, remove, move, setPaused } = useHabits();
  const itemMenu = useItemMenu();
  const openMenu = useContextMenu();
  const [pausing, setPausing] = useState(false);
  const streak = currentStreak(habit, checks, today);
  const target = targetLabel(habit);
  const week = habit.frequency.kind === "semaine" ? tr("{done} sur {times} cette semaine", { done: weekCount(habit, checks, today), times: habit.frequency.times }) : null;
  const menu = itemMenu(() => [
    { label: isDoneOn(habit, checks, today) ? tr("Décocher aujourd'hui") : tr("Cocher aujourd'hui"), icon: ICONS.check, shortcut: tr("Espace|touche"), run: () => void toggle(habit, today) },
    { label: tr("Modifier"), icon: ICONS.pencil, shortcut: KEYS.open, run: onEdit },
    isPaused(checks, habit.id, today)
      ? { label: tr("Retirer la pause d'aujourd'hui"), icon: ICONS.play, run: () => void setPaused(habit, today, false) }
      : { label: tr("Pause jusqu'au…"), icon: ICONS.pause, run: () => setPausing(true) },
    "separator",
    { label: tr("Monter"), icon: ICONS.arrowUp, run: () => void move(habit, -1) },
    { label: tr("Descendre"), icon: ICONS.arrowDown, run: () => void move(habit, 1) },
    { label: habit.archived ? tr("Ressortir des archives") : tr("Archiver"), icon: ICONS.layers, run: () => void archive(habit, !habit.archived) },
    "separator",
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void remove(habit) },
  ]);
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.key === " " && e.target === e.currentTarget) {
      e.preventDefault();
      void toggle(habit, today);
      return;
    }
    menu.onKeyDown(e);
  };
  return (
    <li
      className="habit-row"
      data-selected={selected || undefined}
      data-done={isDoneOn(habit, checks, today) || undefined}
      style={{ "--row-color": colorOf(habit) } as CSSProperties}
      tabIndex={0}
      onClick={onSelect}
      onFocus={onSelect}
      onPointerDown={onDrag}
      data-sort-id={habit.id}
      onContextMenu={menu.onContextMenu}
      onKeyDown={onKeyDown}
    >
      <ModuleChip color={colorOf(habit)} icon={symbolPath(habit.icon, ICONS.repeat)} size={32} />
      <span className="habit-row-text">
        <span className="habit-row-name">{habit.name}</span>
        <span className="habit-row-meta">
          {[frequencyLabel(habit.frequency), target, week, streak.count > 0 ? tr("Série : {streak}", { streak: streakLabel(streak) }) : null, habit.reminder ? tr("Rappel {time}", { time: habit.reminder }) : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="habit-week" aria-label={tr("7 derniers jours")}>
        {lastDays(today).map((d) => {
          const due = isDue(habit, d);
          const done = isDoneOn(habit, checks, d);
          const paused = isPaused(checks, habit.id, d);
          const partial = !done && valueOn(checks, habit.id, d) > 0;
          const label = tr("{label} : {value}", { label: DAY_TITLE.format(fromDayKey(d)), value: done ? tr("fait") : paused ? tr("pause") : partial ? tr("commencé") : due ? tr("pas fait") : tr("non prévu") });
          return (
            <button
              key={d}
              type="button"
              className="habit-day"
              data-done={done || undefined}
              data-partial={partial || undefined}
              data-rest={!due || undefined}
              data-paused={paused || undefined}
              data-today={d === today || undefined}
              aria-label={label}
              title={tr("{label} (clic droit : jour de pause)", { label })}
              onClick={(e) => {
                e.stopPropagation();
                void toggle(habit, d);
              }}
              onContextMenu={(e) => {
                e.stopPropagation();
                openMenu(e, [
                  { label: done ? tr("Décocher") : tr("Cocher"), icon: ICONS.check, run: () => void toggle(habit, d) },
                  paused
                    ? { label: tr("Retirer la pause"), icon: ICONS.play, run: () => void setPaused(habit, d, false) }
                    : { label: tr("Jour de pause"), icon: ICONS.pause, disabled: valueOn(checks, habit.id, d) > 0, run: () => void setPaused(habit, d, true) },
                ]);
              }}
            >
              {fromDayKey(d).toLocaleDateString(locale(), { weekday: "narrow" })}
            </button>
          );
        })}
      </span>
      {!habit.archived && (
        <span className="habit-today" onClick={(e) => e.stopPropagation()}>
          <HabitToday habit={habit} day={today} checks={checks} />
        </span>
      )}
      {pausing && <PauseDialog habit={habit} onClose={() => setPausing(false)} />}
    </li>
  );
}

/** Statistiques et carte de l'année d'une habitude. */
function HabitDetail({ habit, onEdit }: { habit: Habit | null; onEdit: (h: Habit) => void }) {
  const { checks, today } = useHabits();
  if (!habit) {
    return (
      <aside className="habit-detail glass habit-detail--empty">
        <p>{tr("Sélectionner une habitude pour voir ses statistiques.")}</p>
      </aside>
    );
  }
  const current = currentStreak(habit, checks, today);
  const best = bestStreak(habit, checks, today);
  const rate = successRate(habit, checks, today);
  const weeks = heatmap(habit, checks, today);
  return <HabitDetailBody habit={habit} onEdit={onEdit} current={current} best={best} rate={rate} weeks={weeks} force={strength(habit, checks, today)} />;
}

interface DetailBodyProps {
  habit: Habit;
  onEdit: (h: Habit) => void;
  current: ReturnType<typeof currentStreak>;
  best: ReturnType<typeof bestStreak>;
  rate: number;
  weeks: ReturnType<typeof heatmap>;
  /** Force de l'habitude, de 0 à 100. */
  force: number;
}

function HabitDetailBody({ habit, onEdit, current, best, rate, weeks, force }: DetailBodyProps) {
  const { checks, archive } = useHabits();
  const heatRef = useRef<HTMLDivElement>(null);
  // Les semaines les plus récentes en vue.
  useLayoutEffect(() => {
    const el = heatRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [habit.id]);
  return (
    <aside className="habit-detail glass" style={{ "--row-color": colorOf(habit) } as CSSProperties} aria-label={tr("Statistiques : {name}", { name: habit.name })}>
      <div className="habit-detail-head">
        <ModuleChip color={colorOf(habit)} icon={symbolPath(habit.icon, ICONS.repeat)} size={40} />
        <div className="habit-detail-title">
          <h2>{habit.name}</h2>
          <span>{[frequencyLabel(habit.frequency), targetLabel(habit), habit.negative ? tr("À arrêter") : null].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      <div className="habit-detail-actions">
        <button type="button" className="btn-glass btn-glass--sm" onClick={() => onEdit(habit)}>
          <Icon d={ICONS.pencil} size={14} stroke={2.2} />
          {tr("Modifier")}
        </button>
        <button type="button" className="btn-glass btn-glass--sm" onClick={() => void archive(habit, !habit.archived)}>
          <Icon d={ICONS.layers} size={14} stroke={2.2} />
          {habit.archived ? tr("Ressortir") : tr("Archiver")}
        </button>
      </div>
      <div className="habit-force" title={tr("Elle monte quand l'habitude est tenue et baisse doucement après un oubli. Un jour manqué n'efface pas les progrès.")}>
        <span className="habit-force-ring" style={{ "--force": `${force}%` } as CSSProperties} role="img" aria-label={tr("Force de l'habitude : {force} %", { force })}>
          <span className="habit-force-value">{force} %</span>
        </span>
        <span className="habit-force-text">
          <strong>{tr("Force de l'habitude")}</strong>
          <span>{force >= 80 ? tr("Bien ancrée") : force >= 50 ? tr("En bonne voie") : force >= 20 ? tr("En construction") : tr("À ses débuts")}</span>
        </span>
      </div>
      <div className="habit-stats">
        <div className="habit-stat">
          <span className="habit-stat-value">{current.count}</span>
          <span className="habit-stat-label">{current.unit === "semaine" ? tr("série en cours (semaines)") : tr("série en cours (jours)")}</span>
        </div>
        <div className="habit-stat">
          <span className="habit-stat-value">{best.count}</span>
          <span className="habit-stat-label">{best.unit === "semaine" ? tr("record (semaines)") : tr("record (jours)")}</span>
        </div>
        <div className="habit-stat">
          <span className="habit-stat-value">{rate} %</span>
          <span className="habit-stat-label">{tr("réussite sur 30 jours")}</span>
        </div>
      </div>
      <div className="habit-heat-wrap">
        <span className="journal-label">{habit.negative ? tr("Jours tenus sur un an") : tr("Une année")}</span>
        <div ref={heatRef} className="habit-heat" role="img" aria-label={tr("Carte de l'année : {name}", { name: habit.name })}>
          {weeks.map((week) => (
            <div key={week[0]!.day} className="habit-heat-week">
              {week[0]!.day.slice(8) <= "07" && <span className="habit-heat-month">{MONTH_SHORT.format(fromDayKey(week[0]!.day))}</span>}
              {week.map((cell) => (
                <span
                  key={cell.day}
                  className="habit-heat-cell"
                  data-level={cell.level}
                  data-outside={cell.outside || undefined}
                  data-paused={cell.paused || undefined}
                  title={cell.outside ? undefined : tr("{label} : {value}", { label: DAY_TITLE.format(fromDayKey(cell.day)), value: cell.paused ? tr("pause") : String(valueOn(checks, habit.id, cell.day) || tr("rien")) })}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/** Habitudes rangées par moment (matin, midi, soir, dans la journée), si au moins une en a un. */
/** Groupes par moment ; `into` : valeur du moment pour le glisser-déposer (« journee » sans moment), absente sans groupes. */
function byMoment(list: readonly Habit[]): { label: string; into: string | null; habits: Habit[] }[] {
  if (!list.some((h) => h.moment)) return [{ label: "", into: null, habits: [...list] }];
  return MOMENTS.map((m) => ({ label: m.label, into: m.value ?? "journee", habits: list.filter((h) => (h.moment ?? null) === m.value) })).filter((g) => g.habits.length > 0);
}

export function HabitsScreen() {
  const { visible, checks, today, loaded, reorder, update } = useHabits();
  const bulk = useBulk();
  const [pending] = useState(takePendingHabit);
  const [selectedId, setSelectedId] = useState<string | null>(pending === NEW_HABIT ? null : pending);
  const [view, setView] = useState<View>(() => (selectedId ? "toutes" : "jour"));
  const [editing, setEditing] = useState<Habit | "nouvelle" | null>(pending === NEW_HABIT ? "nouvelle" : null);
  useNewItem(() => setEditing("nouvelle"));
  useScreenMenu(() => [{ label: tr("Nouvelle habitude"), icon: ICONS.plus, shortcut: KEYS.create, run: () => setEditing("nouvelle") }]);
  // Habitude demandée ailleurs : elle s'affiche, même si elle n'est pas prévue aujourd'hui.
  useEffect(
    () =>
      onHabitRequest((id) => {
        if (id === NEW_HABIT) {
          setEditing("nouvelle");
          return;
        }
        setSelectedId(id);
        setView((v) => (v === "jour" ? "toutes" : v));
      }),
    [],
  );

  const list = useMemo(() => {
    if (view === "archivees") return visible.filter((h) => h.archived);
    const active = visible.filter((h) => !h.archived);
    return view === "jour" ? active.filter((h) => isForToday(h, checks, today)) : active;
  }, [visible, view, checks, today]);

  const forToday = visible.filter((h) => isForToday(h, checks, today));
  const doneToday = forToday.filter((h) => isDoneOn(h, checks, today)).length;
  const active = visible.filter((h) => !h.archived);
  const bestCurrent = active.map((h) => ({ h, s: currentStreak(h, checks, today) })).sort((a, b) => b.s.count - a.s.count)[0];
  const averageRate = active.length ? Math.round(active.reduce((sum, h) => sum + successRate(h, checks, today), 0) / active.length) : null;
  const selected = visible.find((h) => h.id === selectedId) ?? list[0] ?? null;

  useEffect(() => {
    if (selectedId && !visible.some((h) => h.id === selectedId)) setSelectedId(null);
  }, [visible, selectedId]);

  const m = getModule("habitudes");
  // Glisser une habitude : nouvel ordre, et nouveau moment de la journée si elle change de groupe.
  // « Monter » et « Descendre » (clic droit) restent l'équivalent au clavier.
  const dragHabit = (h: Habit) => (e: PointerEvent<HTMLElement>) =>
    startDrag(e, { kind: "habitude", ids: [h.id], label: h.name, color: colorOf(h) }, {
      sort: {
        group: "habitudes",
        onSort: (ids, into) => {
          const groups = byMoment(list);
          const order = groups.flatMap((g) => (g.into === into ? ids : g.habits.map((x) => x.id).filter((id) => !ids.includes(id))));
          const moment = into === null ? undefined : into === "journee" ? null : (into as HabitMoment);
          if (moment === undefined || moment === (h.moment ?? null)) {
            void reorder(order);
            return;
          }
          const label = MOMENTS.find((m) => m.value === moment)?.label ?? "";
          void bulk(tr("Habitude « {name} » déplacée : {label}.", { name: h.name, label: label.toLowerCase() }), tr("déplacement de l'habitude"), async () => {
            await update(h, { moment });
            await reorder(order);
          });
        },
      },
    });

  return (
    <div className="screen habits-screen">
      <header className="tasks-header">
        <ScreenTitle module="habitudes" />
        <Tabs items={VIEWS} value={view} onChange={setView} label={tr("Habitudes affichées")} idPrefix="habitudes" />
        <span className="tasks-header-spacer" />
        <button type="button" className="btn-gel" title={tr("Nouvelle habitude ({create})", { create: KEYS.create })} onClick={() => setEditing("nouvelle")}>
          <Icon d={ICONS.plus} size={16} stroke={2.8} />
          <span>{tr("Nouvelle habitude")}</span>
        </button>
      </header>

      {active.length > 0 && (
        <div className="obl-summary">
          <div className="obl-stat glass">
            <span className="obl-stat-label">{tr("Aujourd'hui")}</span>
            <span className="obl-stat-value">{forToday.length === 0 ? tr("Rien de prévu") : tr("{done} sur {total}", { done: doneToday, total: forToday.length })}</span>
          </div>
          <div className="obl-stat glass">
            <span className="obl-stat-label">{tr("Meilleure série en cours")}</span>
            <span className="obl-stat-value">{bestCurrent && bestCurrent.s.count > 0 ? `${streakLabel(bestCurrent.s)} · ${bestCurrent.h.name}` : tr("Aucune")}</span>
          </div>
          <div className="obl-stat glass">
            <span className="obl-stat-label">{tr("Réussite sur 30 jours")}</span>
            <span className="obl-stat-value">{averageRate === null ? "–" : `${averageRate} %`}</span>
          </div>
        </div>
      )}

      {loaded && visible.length === 0 ? (
        <section className="coming-soon glass habits-empty">
          <Orb color={m.color} icon={m.icon} size={110} />
          <h2 className="coming-title">{tr("Aucune habitude")}</h2>
          <p className="settings-intro"><Sentences text={tr("Une habitude se coche chaque jour, ou quelques fois par semaine. Par exemple : boire de l'eau, marcher, lire.")} /></p>
          <button type="button" className="btn-gel" onClick={() => setEditing("nouvelle")}>
            <Icon d={ICONS.plus} size={16} stroke={2.8} />
            {tr("Nouvelle habitude")}
          </button>
        </section>
      ) : (
        <div className="habits-body">
          <section className="task-panel glass" id={`habitudes-panel-${view}`} role="tabpanel" aria-labelledby={`habitudes-tab-${view}`}>
            <div className="task-scroll">
              {loaded && list.length === 0 && (
                <EmptyState
                  color={m.color}
                  icon={m.icon}
                  text={view === "archivees" ? tr("Aucune habitude archivée.") : view === "jour" ? tr("Rien de prévu aujourd'hui.") : tr("Aucune habitude.")}
                  action={view === "archivees" ? undefined : { label: tr("Nouvelle habitude"), run: () => setEditing("nouvelle") }}
                />
              )}
              {byMoment(list).map((group) => (
                <div key={group.label} className="task-section">
                  {group.label && (
                    <h2 className="task-section-title">
                      {group.label}
                      <span className="task-section-sub"> · {group.habits.length}</span>
                    </h2>
                  )}
                  <ul className="habit-rows" data-sort="habitudes" data-sort-into={group.into ?? undefined}>
                    {group.habits.map((h) => (
                      <HabitRow key={h.id} habit={h} selected={selected?.id === h.id} onSelect={() => setSelectedId(h.id)} onEdit={() => setEditing(h)} onDrag={dragHabit(h)} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
          {/* Vue vide (archives, rien aujourd'hui) : rien à sélectionner, pas de panneau de statistiques. */}
          {list.length > 0 && <HabitDetail habit={selected} onEdit={setEditing} />}
        </div>
      )}

      {editing && <HabitEditor habit={editing === "nouvelle" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
