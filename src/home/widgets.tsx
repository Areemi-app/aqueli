/**
 * Cartes de l'Accueil (maquette Main.dc.html). Celles des modules à venir gardent leur cadre
 * avec « Bientôt disponible ».
 */
import { useId, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { writePref } from "../lib/storage";
import { getModule, type ModuleKey } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, relativeDay } from "../tasks/day";
import { PRIORITY_LABELS, sortTasks } from "../tasks/tasks";
import { useTasks } from "../tasks/TasksProvider";
import { TodayWidget } from "../tasks/TodayWidget";
import { useTaskMenu } from "../tasks/taskMenu";
import { useItemMenu } from "../components/ContextMenu";
import { KEYS } from "../lib/itemKeys";
import { useNoteMenu } from "../notes/noteMenu";
import { useObligationMenu } from "../obligations/obligationMenu";
import { requestObligation } from "../obligations/obligationRequest";
import { cancelSoon, dueLabel, formatAmount, type Obligation } from "../obligations/obligations";
import { useObligations } from "../obligations/ObligationsProvider";
import { requestCalendar } from "../calendar/calendarRequest";
import { useEvents } from "../calendar/EventsProvider";
import { itemsBetween } from "../calendar/items";
import { toTime } from "../planner/plan";
import { useNow } from "../lib/useNow";
import { requestNote } from "../notes/noteRequest";
import { noteTitle, sortNotes, updatedLabel, type NoteSummary } from "../notes/notes";
import { useNotes } from "../notes/NotesProvider";
import { summarize } from "../focus/focus";
import { useFocus, useTimerNow } from "../focus/FocusProvider";
import { FocusControls, FocusRing } from "../focus/FocusRing";
import { durationLabel } from "../focus/timer";
import { HabitToday } from "../habits/HabitToday";
import { isDoneOn, isForToday } from "../habits/habits";
import { useHabits } from "../habits/HabitsProvider";
import { requestHabit } from "../habits/habitRequest";
import { promptFor } from "../journal/journal";
import { requestJournal } from "../journal/journalRequest";
import { useJournal } from "../journal/JournalProvider";
import { EnergyPicker, MoodPicker } from "../journal/MoodPicker";
import { symbolPath } from "../components/symbols";
import { dayKey } from "../tasks/day";
import { useContactsIfAny } from "../contacts/ContactsProvider";
import { contactRequest } from "../lib/request";
import type { WidgetId } from "./layout";
import { ContactsWidget, ProjectsWidget, ShoppingWidget } from "./moreWidgets";
import { BudgetWidget, GoalsWidget } from "./planWidgets";
import { tr } from "../i18n/i18n";

/** Minuteur Focus à anneau arc-en-ciel (maquette Main.dc.html). */
function FocusWidget() {
  const m = getModule("focus");
  const { go } = useNavigation();
  const { timer, sessions, today } = useFocus();
  const { tasks } = useTasks();
  const now = useTimerNow(timer.status === "en-cours");
  const headingId = useId();
  const task = timer.taskId ? tasks.find((t) => t.id === timer.taskId) : undefined;
  const minutes = summarize(sessions, today).today;
  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Focus")}
        </h2>
        <button type="button" className="link-btn" onClick={() => go("focus")}>
          {tr("Focus")}
        </button>
      </div>
      <div className="focus-body">
        <FocusRing timer={timer} now={now} size={136} />
        <div className="focus-side">
          <span className="focus-side-task">{timer.intention ?? task?.title ?? tr("Aucune tâche")}</span>
          <p>{minutes > 0 ? tr("Aujourd'hui : {durationLabel}.", { durationLabel: durationLabel(minutes) }) : tr("Aucune séance aujourd'hui.")}</p>
          <FocusControls compact />
        </div>
      </div>
    </section>
  );
}

const MAX_HABITS = 5;

/** Habitudes prévues aujourd'hui, à cocher. */
function HabitsWidget() {
  const m = getModule("habitudes");
  const { go } = useNavigation();
  const { visible, checks, today, loaded, toggle } = useHabits();
  const itemMenu = useItemMenu();
  const headingId = useId();
  const list = visible.filter((h) => isForToday(h, checks, today));
  const done = list.filter((h) => isDoneOn(h, checks, today)).length;
  const open = (id: string) => {
    go("habitudes");
    requestHabit(id);
  };
  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Habitudes")}
        </h2>
        <button type="button" className="link-btn" onClick={() => go("habitudes")}>
          {m.label}
        </button>
      </div>
      {loaded && list.length === 0 ? (
        <div className="widget-empty">
          <Orb color={m.color} icon={m.icon} size={64} />
          <p>{visible.some((h) => !h.archived) ? tr("Rien de prévu aujourd'hui.") : tr("Aucune habitude.")}</p>
        </div>
      ) : (
        <>
          <ul className="today-rows">
            {list.slice(0, MAX_HABITS).map((h) => (
              <li
                key={h.id}
                className="today-row habit-widget-row"
                data-done={isDoneOn(h, checks, today) || undefined}
                style={{ "--row-color": h.color ?? m.color } as CSSProperties}
                {...itemMenu(() => [
                  { label: isDoneOn(h, checks, today) ? tr("Décocher aujourd'hui") : tr("Cocher aujourd'hui"), icon: ICONS.check, run: () => void toggle(h, today) },
                  { label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => open(h.id) },
                ])}
              >
                <ModuleChip color={h.color ?? m.color} icon={symbolPath(h.icon, ICONS.repeat)} size={24} />
                <button type="button" className="today-title" onClick={() => open(h.id)}>
                  {h.name}
                </button>
                <HabitToday habit={h} day={today} checks={checks} />
              </li>
            ))}
          </ul>
          {list.length > MAX_HABITS && (
            <button type="button" className="link-btn today-more" onClick={() => go("habitudes")}>
              {tr("{n} de plus", { n: list.length - MAX_HABITS })}
            </button>
          )}
          <div className="today-progress">
            <div className="today-bar" role="progressbar" aria-label={tr("Habitudes du jour tenues")} aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={done}>
              <div className="today-bar-fill" style={{ width: `${list.length ? (100 * done) / list.length : 0}%` }} />
            </div>
            <span className="today-count">
              {tr("{done} sur {total}", { done, total: list.length })}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/** Humeur et énergie du jour, notées sans ouvrir le journal. */
function MoodWidget() {
  const m = getModule("journal");
  const { go } = useNavigation();
  const { pages, setFeeling } = useJournal();
  const today = dayKey(useNow());
  const headingId = useId();
  const page = pages.get(today);
  const write = () => {
    go("journal");
    requestJournal(today);
  };
  return (
    <section className="widget glass mood-widget" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Humeur du jour")}
        </h2>
        <button type="button" className="link-btn" onClick={write}>
          {m.label}
        </button>
      </div>
      <MoodPicker value={page?.mood ?? null} onChange={(mood) => void setFeeling(today, { mood })} />
      <div className="mood-widget-energy">
        <span className="field-label">{tr("Énergie")}</span>
        <EnergyPicker value={page?.energy ?? null} onChange={(energy) => void setFeeling(today, { energy })} />
      </div>
      <button type="button" className="mood-widget-prompt" onClick={write}>
        {page?.excerpt ? page.excerpt : promptFor(today)}
      </button>
    </section>
  );
}

const MAX_UPCOMING = 6;

/** Tâches des 7 prochains jours. */
function UpcomingWidget() {
  const { visible, today, setDone, loaded } = useTasks();
  const { spaces } = useSpaces();
  const { go } = useNavigation();
  const headingId = useId();
  const m = getModule("taches");
  const until = addDays(today, 7);
  const upcoming = sortTasks(visible.filter((t) => t.doneAt === null && t.dueDate !== null && t.dueDate > today && t.dueDate <= until));
  const shown = upcoming.slice(0, MAX_UPCOMING);
  const itemMenu = useItemMenu();
  const taskMenu = useTaskMenu();

  const openList = () => {
    writePref("listeTaches", "a-venir");
    go("taches");
  };

  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={ICONS.calendar} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("À venir")}
        </h2>
        <button type="button" className="link-btn" onClick={openList}>
          {tr("Tout voir")}
        </button>
      </div>
      {loaded && upcoming.length === 0 ? (
        <div className="widget-empty">
          <Orb color={m.color} icon={ICONS.calendar} size={64} />
          <p>{tr("Aucune tâche dans les 7 prochains jours.")}</p>
        </div>
      ) : (
        <>
          <ul className="today-rows">
            {shown.map((t) => {
              const space = spaces.find((s) => s.id === t.spaceId);
              return (
                <li key={t.id} className="today-row" {...itemMenu(() => taskMenu(t))}>
                  <button
                    type="button"
                    className="task-check"
                    data-sans-son
                    aria-label={tr("Terminer la tâche « {title} »", { title: t.title })}
                    onClick={() => void setDone(t, true)}
                  />
                  <button type="button" className="today-title" onClick={openList}>
                    {t.title}
                  </button>
                  {t.dueDate && <span className="task-meta">{relativeDay(t.dueDate, today)}</span>}
                  {t.dueTime && <span className="pill today-time">{t.dueTime}</span>}
                  {t.priority > 0 && (
                    <span
                      className="task-flag"
                      data-priority={t.priority}
                      role="img"
                      aria-label={tr("Priorité {x}", { x: PRIORITY_LABELS[t.priority].toLowerCase() })}
                    >
                      <Icon d={ICONS.flag} size={14} filled />
                    </span>
                  )}
                  <span
                    className="space-dot"
                    style={{ "--space-color": space?.color ?? "transparent" } as CSSProperties}
                    aria-hidden="true"
                  />
                </li>
              );
            })}
          </ul>
          {upcoming.length > MAX_UPCOMING && (
            <button type="button" className="link-btn today-more" onClick={openList}>
              {tr("{n} de plus", { n: upcoming.length - MAX_UPCOMING })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

const MAX_APPOINTMENTS = 6;

/** Rendez-vous des 7 prochains jours (événements du calendrier). */
function AppointmentsWidget() {
  const { events, loaded } = useEvents();
  const { spaces, filter } = useSpaces();
  const { today } = useTasks();
  const { go } = useNavigation();
  const now = useNow();
  const headingId = useId();
  const m = getModule("calendrier");
  const itemMenu = useItemMenu();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const contacts = useContactsIfAny()?.contacts;
  const layers = {
    events,
    tasks: [],
    spaces,
    filter,
    hiddenSpaces: [],
    showTasks: false,
    contacts,
    showBirthdays: true,
    birthdayColor: getModule("contacts").color,
  };
  const upcoming = itemsBetween(layers, today, addDays(today, 6))
    .filter((i) => i.endDate > today || i.end === null || i.end > nowMin)
    .map((i) => ({ ...i, day: i.startDate < today ? today : i.startDate }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.start ?? -1) - (b.start ?? -1)));
  const shown = upcoming.slice(0, MAX_APPOINTMENTS);

  const openCalendar = (day?: string, eventId?: string) => {
    go("calendrier");
    requestCalendar({ day, eventId });
  };
  const openItem = (i: (typeof upcoming)[number]) => {
    if (i.kind === "birthday") {
      go("contacts");
      contactRequest.request(i.id);
    } else openCalendar(i.day, i.id);
  };

  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Prochains rendez-vous")}
        </h2>
        <button type="button" className="link-btn" onClick={() => openCalendar()}>
          {m.label}
        </button>
      </div>
      {loaded && upcoming.length === 0 ? (
        <div className="widget-empty">
          <Orb color={m.color} icon={m.icon} size={64} />
          <p>{tr("Aucun rendez-vous dans les 7 prochains jours.")}</p>
        </div>
      ) : (
        <>
          <ul className="today-rows">
            {shown.map((i) => {
              const day = relativeDay(i.day, today);
              const time = i.start === null || i.startDate < i.day ? tr("Journée") : toTime(i.start);
              return (
                <li
                  key={i.key}
                  className="today-row appointment-row"
                  {...itemMenu(() =>
                    i.kind === "birthday"
                      ? [{ label: tr("Ouvrir le contact"), icon: ICONS.enter, shortcut: KEYS.open, run: () => openItem(i) }]
                      : [{ label: tr("Ouvrir dans le calendrier"), icon: ICONS.calendar, shortcut: KEYS.open, run: () => openItem(i) }],
                  )}
                >
                  <span
                    className="appointment-dot"
                    style={i.color ? ({ "--ev-color": i.color } as CSSProperties) : undefined}
                    aria-hidden="true"
                  />
                  <button type="button" className="today-title" onClick={() => openItem(i)}>
                    {i.title}
                  </button>
                  <span className="task-meta">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                  <span className="pill today-time">{time}</span>
                </li>
              );
            })}
          </ul>
          {upcoming.length > MAX_APPOINTMENTS && (
            <button type="button" className="link-btn today-more" onClick={() => openCalendar()}>
              {tr("{n} de plus", { n: upcoming.length - MAX_APPOINTMENTS })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

const MAX_OBLIGATIONS = 6;

/** Échéances des 7 prochains jours (et en retard), dates limites de résiliation proches. */
function ObligationsWidget() {
  const { obligations, loaded, categoryOf } = useObligations();
  const { filter } = useSpaces();
  const { today } = useTasks();
  const { go } = useNavigation();
  const itemMenu = useItemMenu();
  const obligationMenu = useObligationMenu();
  const headingId = useId();
  const m = getModule("obligations");
  const until = addDays(today, 7);
  const mine = obligations.filter((o) => filter === "tous" || o.spaceId === filter);
  type Row = { key: string; o: Obligation; cancel: boolean; day: string };
  const rows: Row[] = [
    ...mine.filter((o) => o.status === "a-faire" && o.dueDate <= until).map((o) => ({ key: o.id, o, cancel: false, day: o.dueDate })),
    ...mine
      .filter((o) => cancelSoon(o, today) && o.cancelBy !== null && o.cancelBy <= until)
      .map((o) => ({ key: `${o.id}:r`, o, cancel: true, day: o.cancelBy! })),
  ].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const shown = rows.slice(0, MAX_OBLIGATIONS);

  const openOne = (o: Obligation) => {
    go("obligations");
    requestObligation({ id: o.id });
  };

  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Obligations à venir")}
        </h2>
        <button type="button" className="link-btn" onClick={() => go("obligations")}>
          {m.label}
        </button>
      </div>
      {loaded && rows.length === 0 ? (
        <div className="widget-empty">
          <Orb color={m.color} icon={m.icon} size={64} />
          <p>{tr("Aucune échéance dans les 7 prochains jours.")}</p>
        </div>
      ) : (
        <>
          <ul className="today-rows">
            {shown.map(({ key, o, cancel, day }) => {
              const category = categoryOf(o.category);
              return (
                <li key={key} className="today-row" {...itemMenu(() => obligationMenu(o, () => openOne(o)))}>
                  <ModuleChip color={o.color ?? category.color} icon={category.icon} size={20} />
                  <button type="button" className="today-title" onClick={() => openOne(o)}>
                    {cancel ? tr("Résiliation : {title}", { title: o.title }) : o.title}
                  </button>
                  {!cancel && o.amountCents !== null && <span className="task-meta obl-widget-amount">{formatAmount(o.amountCents)}</span>}
                  <span className="task-meta" data-late={(!cancel && day < today) || undefined} data-warn={cancel || undefined}>
                    {dueLabel(day, today)}
                  </span>
                </li>
              );
            })}
          </ul>
          {rows.length > MAX_OBLIGATIONS && (
            <button type="button" className="link-btn today-more" onClick={() => go("obligations")}>
              {tr("{n} de plus", { n: rows.length - MAX_OBLIGATIONS })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** La note épinglée la plus récente : titre, début du texte, étiquettes. */
function PinnedNoteWidget() {
  const { notes, loaded } = useNotes();
  const { filter } = useSpaces();
  const { go } = useNavigation();
  const itemMenu = useItemMenu();
  const noteMenu = useNoteMenu();
  const headingId = useId();
  const m = getModule("notes");
  const pinned = sortNotes(notes.filter((n) => n.pinned && !n.archived && (filter === "tous" || n.spaceId === filter)));
  const note = pinned[0];
  const openOne = (n: NoteSummary) => {
    go("notes");
    requestNote({ id: n.id });
  };

  return (
    <section className="widget glass" aria-labelledby={headingId}>
      <div className="widget-head">
        <ModuleChip color={m.color} icon={m.icon} size={26} />
        <h2 id={headingId} className="widget-title">
          {tr("Note épinglée")}
        </h2>
        <button type="button" className="link-btn" onClick={() => go("notes")}>
          {m.label}
        </button>
      </div>
      {loaded && !note ? (
        <div className="widget-empty widget-empty--note">
          <Orb color={m.color} icon={m.icon} size={64} />
          <p>{tr("Aucune note épinglée.")}</p>
        </div>
      ) : note ? (
        <button
          type="button"
          className="pinned-note"
          style={note.color ? ({ "--row-color": note.color } as CSSProperties) : undefined}
          onClick={() => openOne(note)}
          {...itemMenu(() => {
            // Déplacer et « Enregistrer comme modèle » se font dans l'écran Notes.
            const inNotes = () => openOne(note);
            return noteMenu(note, { open: () => openOne(note), move: inNotes, saveAsTemplate: inNotes });
          })}
        >
          <span className="pinned-note-title">{noteTitle(note)}</span>
          <span className="pinned-note-text">{note.excerpt || tr("Aucun texte.")}</span>
          <span className="pinned-note-meta">
            {updatedLabel(note.updatedAt, new Date())}
            {note.tags.slice(0, 3).map((t) => (
              <span key={t}> · #{t}</span>
            ))}
          </span>
        </button>
      ) : null}
      {pinned.length > 1 && (
        <button type="button" className="link-btn today-more" onClick={() => go("notes")}>
          {tr("{n} de plus", { n: pinned.length - 1 })}
        </button>
      )}
    </section>
  );
}

interface WidgetDef {
  title: string;
  /** Module de la carte : sa couleur teinte l'en-tête et les lignes. */
  module: ModuleKey;
  render: () => ReactNode;
}

export const WIDGETS: Record<WidgetId, WidgetDef> = {
  aujourdhui: { title: tr("Aujourd'hui"), module: "taches", render: () => <TodayWidget /> },
  "a-venir": { title: tr("À venir"), module: "taches", render: () => <UpcomingWidget /> },
  "rendez-vous": { title: tr("Prochains rendez-vous"), module: "calendrier", render: () => <AppointmentsWidget /> },
  obligations: { title: tr("Obligations à venir"), module: "obligations", render: () => <ObligationsWidget /> },
  habitudes: { title: tr("Habitudes"), module: "habitudes", render: () => <HabitsWidget /> },
  humeur: { title: tr("Humeur du jour"), module: "journal", render: () => <MoodWidget /> },
  focus: { title: tr("Focus"), module: "focus", render: () => <FocusWidget /> },
  note: { title: tr("Note épinglée"), module: "notes", render: () => <PinnedNoteWidget /> },
  objectifs: { title: tr("Objectifs"), module: "objectifs", render: () => <GoalsWidget /> },
  budget: { title: tr("Budget du mois"), module: "budget", render: () => <BudgetWidget /> },
  contacts: { title: tr("Anniversaires et nouvelles"), module: "contacts", render: () => <ContactsWidget /> },
  projets: { title: tr("Projets en cours"), module: "projets", render: () => <ProjectsWidget /> },
  courses: { title: tr("Liste de courses"), module: "listes", render: () => <ShoppingWidget /> },
};
