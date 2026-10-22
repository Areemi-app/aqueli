import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { submenuEntry, useContextMenu, useScreenMenu, type MenuEntry } from "../components/ContextMenu";
import { ScreenTitle } from "../components/ScreenTitle";
import { exportCalendar } from "./api";
import { toIcs } from "./icsExport";
import { calendarPrintDoc } from "./calendarPrint";
import { printDoc, usePrint } from "../print/print";
import { KEYS, menuKeys } from "../lib/itemKeys";
import { usePinEntry } from "../pins/pins";
import { useToast } from "../app/ToastProvider";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useNewItem } from "../shell/newItem";
import { useTaskMenu } from "../tasks/taskMenu";
import { useObligationMenu } from "../obligations/obligationMenu";
import { requestObligation } from "../obligations/obligationRequest";
import { useObligations } from "../obligations/ObligationsProvider";
import { useContactsIfAny } from "../contacts/ContactsProvider";
import { contactRequest } from "../lib/request";
import { getModule } from "../modules/modules";
import { Checkbox } from "../components/Checkbox";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Tabs } from "../components/Tabs";
import { useNow } from "../lib/useNow";
import { useNavigation } from "../navigation/NavigationProvider";
import { toTime } from "../planner/plan";
import { useSpaces } from "../spaces/SpacesProvider";
import { addDays, addMonths, weekday, type DayKey } from "../tasks/day";
import { requestTaskOpen } from "../tasks/taskFocus";
import { useTasks } from "../tasks/TasksProvider";
import { AgendaView } from "./AgendaView";
import { useCalendarPrefs } from "./calendarPrefs";
import { onCalendarRequest, takePendingCalendar, type CalendarRequest } from "./calendarRequest";
import { EventEditor } from "./EventEditor";
import type { CalendarEvent, EventInput } from "./events";
import { useEvents } from "./EventsProvider";
import { addMinutes, nextHourSlot } from "./eventTime";
import { occurrenceOf } from "./occurrences";
import { applyToSeries, detachedEvent, withoutOccurrence, type SeriesScope, type When } from "./series";
import { SeriesScopeDialog } from "./SeriesScopeDialog";
import { useSpecialDays } from "./SpecialDaysProvider";
import { isoWeek, minutesOf, useCalendarSettings } from "./calendarSettings";
import { describeQuickEvent, QuickEventField } from "./QuickEventField";
import { useLinkContacts } from "../contacts/contactRefs";
import { SpecialDaysAside } from "./SpecialDaysSettings";
import { preselectSettingsTab } from "../screens/settingsTab";
import { itemsBetween, type CalItem } from "./items";
import { MiniMonth } from "./MiniMonth";
import { MonthView } from "./MonthView";
import { TimeGrid, type GridActions } from "./TimeGrid";
import { monthGrid, monthLabel, rangeLabel, shiftAnchor, VIEWS, viewRange, weekDays, type CalendarView } from "./view";
import { YearView } from "./YearView";
import { tr } from "../i18n/i18n";

const DAY = 24 * 60;
const PREVIOUS: Record<CalendarView, string> = {
  jour: tr("Jour précédent"),
  semaine: tr("Semaine précédente"),
  mois: tr("Mois précédent"),
  annee: tr("Année précédente"),
  agenda: tr("Période précédente"),
};
const NEXT: Record<CalendarView, string> = {
  jour: tr("Jour suivant"),
  semaine: tr("Semaine suivante"),
  mois: tr("Mois suivant"),
  annee: tr("Année suivante"),
  agenda: tr("Période suivante"),
};

/** Événement ouvert, ou valeurs de départ d'un nouvel événement. */
type Editing = { event: CalendarEvent; occurrence?: DayKey | null } | { draft: EventInput };
/** Question « Cet événement / Tous les événements » en attente. */
type Asking = { action: "modifier" | "supprimer"; apply: (scope: SeriesScope) => void };

/** Calendrier (maquette Calendrier.dc.html) : jour, semaine, mois, année, agenda. */
export function CalendarScreen() {
  const { events, create: createEventNow, update: updateEvent, remove: removeEvent } = useEvents();
  const { tasks, today, update: updateTask } = useTasks();
  const { spaces, filter } = useSpaces();
  const { go } = useNavigation();
  const linkContacts = useLinkContacts();
  const now = useNow();
  const [prefs, setPrefs] = useCalendarPrefs();
  const [pending] = useState(takePendingCalendar);
  const [anchor, setAnchor] = useState<DayKey>(pending?.day ?? today);
  const [miniMonth, setMiniMonth] = useState<DayKey>(anchor);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const view = prefs.view;
  const range = viewRange(view, anchor);
  const special = useSpecialDays();
  const cal = useCalendarSettings();
  // Jours fériés, fêtes et périodes (vacances…) de la période affichée.
  const marks = useMemo(() => special.marks(range.from, range.to), [special, range.from, range.to]);
  const tabsId = useId();
  const openMenu = useContextMenu();
  const notify = useToast();
  const taskMenu = useTaskMenu();
  const pinEntry = usePinEntry();
  const obligationMenu = useObligationMenu();
  const { obligations, categories: obligationCategories } = useObligations();
  const contacts = useContactsIfAny()?.contacts;

  useEffect(() => setMiniMonth(anchor), [anchor]);

  const items = useMemo(
    () =>
      itemsBetween(
        {
          events,
          tasks,
          spaces,
          filter,
          hiddenSpaces: prefs.hiddenSpaces,
          showTasks: prefs.showTasks,
          holidays: special.holidays(range.from, range.to),
          obligations,
          obligationCategories,
          showObligations: prefs.showObligations,
          contacts,
          showBirthdays: prefs.showBirthdays,
          birthdayColor: getModule("contacts").color,
        },
        range.from,
        range.to,
      ),
    [events, tasks, obligations, obligationCategories, spaces, filter, prefs.hiddenSpaces, prefs.showTasks, special, prefs.showObligations, contacts, prefs.showBirthdays, range.from, range.to],
  );

  const draftFor = (when: Pick<EventInput, "startDate" | "startTime" | "endDate" | "endTime">): EventInput => ({
    title: "",
    location: "",
    notes: "",
    spaceId: filter !== "tous" ? filter : (spaces[0]?.id ?? null),
    color: null,
    reminder: when.startTime === null ? null : cal.eventReminder,
    recurrence: null,
    exceptions: [],
    repeatUntil: null,
    ...when,
  });
  const createEvent = (day: DayKey) => setEditing({ draft: draftFor(nextHourSlot(day, now, today, cal.defaultDuration)) });

  useNewItem(() => createEvent(view === "jour" ? anchor : today));
  // Export .ics : les événements de l'espace affiché (cahier des charges § 4.3).
  const exportIcs = async () => {
    const shown = events.filter((e) => filter === "tous" || e.spaceId === filter);
    if (shown.length === 0) return notify(tr("Aucun événement à exporter."));
    try {
      const path = await exportCalendar(tr("Calendrier Aqueli"), toIcs(shown, new Date()));
      if (path) notify(shown.length > 1 ? tr("{length} événements exportés.", { length: shown.length }) : tr("Événement exporté."));
    } catch (err) {
      notify(dataErrorMessage(err as DataError));
    }
  };
  // Ctrl+P : la période affichée, jour par jour, avec les couches choisies.
  const printCalendar = () =>
    printDoc(calendarPrintDoc(view, anchor, items, filter !== "tous" ? tr("Espace : {name}", { name: spaces.find((s) => s.id === filter)?.name }) : undefined, marks));
  usePrint(() => printCalendar);
  useScreenMenu(() => [
    { label: tr("Nouvel événement"), icon: ICONS.plus, shortcut: KEYS.create, run: () => createEvent(view === "jour" ? anchor : today) },
    { label: tr("Aller à aujourd'hui"), icon: ICONS.today, run: () => setAnchor(today) },
    "separator",
    submenuEntry(tr("Affichage"), ICONS.layers, VIEWS.map((v) => ({ label: v.label, checked: view === v.id, run: () => setPrefs({ view: v.id }) }))),
    "separator",
    { label: tr("Imprimer…"), icon: ICONS.printer, shortcut: KEYS.print, run: printCalendar },
    { label: tr("Exporter le calendrier (.ics)…"), icon: ICONS.save, run: () => void exportIcs() },
    "separator",
    {
      label: tr("Jours fériés et fêtes…"),
      icon: ICONS.flag,
      run: () => {
        preselectSettingsTab("calendrier");
        go("parametres");
      },
    },
  ]);

  // Demandes venues de l'Accueil, de la palette ou de la recherche : la liste des événements
  // est lue à jour (un événement créé depuis l'ouverture de l'écran s'y trouve aussi).
  const latestEvents = useRef(events);
  latestEvents.current = events;
  useEffect(() => {
    const handle = (request: CalendarRequest) => {
      if (request.day) setAnchor(request.day);
      const event = request.eventId ? latestEvents.current.find((e) => e.id === request.eventId) : undefined;
      if (event) setEditing({ event, occurrence: event.recurrence ? (request.day ?? null) : null });
      else if (request.create) createEvent(request.day ?? today);
    };
    if (pending) handle(pending);
    return onCalendarRequest(handle);
    // Les demandes suivantes arrivent par l'événement ; `pending` ne sert qu'une fois.
  }, []);

  const miniGrid = monthGrid(miniMonth);
  const miniFrom = miniGrid[0]!;
  const miniTo = miniGrid[miniGrid.length - 1]!;
  const miniMarks = useMemo(() => special.marks(miniFrom, miniTo), [special, miniFrom, miniTo]);

  const eventOf = (item: CalItem) => events.find((e) => e.id === item.id);
  const taskOf = (item: CalItem) => tasks.find((t) => t.id === item.id);
  /** Dates de l'occurrence visée (celles de l'événement s'il n'est pas répété). */
  const whenOf = (event: CalendarEvent, item: CalItem) => occurrenceOf(event, item.occurrence ?? event.startDate);

  /** Nouveau créneau d'un événement ; pour une série, la portée est demandée. */
  const commitEvent = (event: CalendarEvent, item: CalItem, next: When) => {
    const day = item.occurrence;
    if (!event.recurrence || !day) {
      void updateEvent(event, next);
      return;
    }
    setAsking({
      action: "modifier",
      apply: (scope) => {
        if (scope === "one") {
          void updateEvent(event, withoutOccurrence(event, day));
          void createEventNow(detachedEvent(event, next));
        } else {
          void updateEvent(event, applyToSeries(event, day, next));
        }
      },
    });
  };
  const deleteEvent = (event: CalendarEvent, item: CalItem) => {
    const day = item.occurrence;
    if (!event.recurrence || !day) {
      void removeEvent(event);
      return;
    }
    setAsking({
      action: "supprimer",
      apply: (scope) => (scope === "one" ? void updateEvent(event, withoutOccurrence(event, day)) : void removeEvent(event)),
    });
  };

  const actions = {
    open: (item) => {
      if (item.kind === "event") {
        const event = eventOf(item);
        if (event) setEditing({ event, occurrence: item.occurrence });
      } else if (item.kind === "task") {
        requestTaskOpen(item.id);
        go("taches");
      } else if (item.kind === "obligation" || item.kind === "cancel") {
        go("obligations");
        requestObligation({ id: item.id });
      } else if (item.kind === "birthday") {
        go("contacts");
        contactRequest.request(item.id);
      }
    },
    create: (day, start, end) =>
      setEditing({
        draft: draftFor({
          startDate: day,
          startTime: toTime(start),
          endDate: end >= DAY ? addDays(day, 1) : day,
          endTime: toTime(end % DAY),
        }),
      }),
    shift: (item, minutes) => {
      if (item.kind === "event") {
        const event = eventOf(item);
        if (!event) return;
        const when = whenOf(event, item);
        if (when.startTime === null || when.endTime === null) {
          const days = Math.round(minutes / DAY);
          commitEvent(event, item, { ...when, startDate: addDays(when.startDate, days), endDate: addDays(when.endDate, days) });
        } else {
          const start = addMinutes(when.startDate, when.startTime, minutes);
          const end = addMinutes(when.endDate, when.endTime, minutes);
          commitEvent(event, item, { startDate: start.day, startTime: start.time, endDate: end.day, endTime: end.time });
        }
      } else if (item.kind === "task") {
        const task = taskOf(item);
        if (!task?.dueDate) return;
        if (task.dueTime === null) void updateTask(task, { dueDate: addDays(task.dueDate, Math.round(minutes / DAY)) });
        else {
          const at = addMinutes(task.dueDate, task.dueTime, minutes);
          void updateTask(task, { dueDate: at.day, dueTime: at.time });
        }
      }
    },
    resize: (item, end) => {
      if (item.kind === "event") {
        const event = eventOf(item);
        if (!event) return;
        const when = whenOf(event, item);
        if (when.endTime === null) return;
        commitEvent(event, item, end >= DAY ? { ...when, endDate: addDays(when.endDate, 1), endTime: "00:00" } : { ...when, endTime: toTime(end) });
      } else if (item.kind === "task" && item.start !== null) {
        const task = taskOf(item);
        if (task) void updateTask(task, { estimate: end - item.start });
      }
    },
    placeAt: (item, day, start) => {
      if (item.kind === "task") {
        const task = taskOf(item);
        if (task) void updateTask(task, { dueDate: day, dueTime: toTime(start) });
      } else if (item.kind === "event") {
        const event = eventOf(item);
        if (!event) return;
        const end = addMinutes(day, toTime(start), 60);
        commitEvent(event, item, { startDate: day, startTime: toTime(start), endDate: end.day, endTime: end.time });
      }
    },
    pickDay: (day: DayKey) => {
      setAnchor(day);
      setPrefs({ view: "jour" });
    },
  } satisfies Omit<GridActions, "menu" | "slotMenu" | "keys">;

  // Menu d'un élément du calendrier ; ses raccourcis (Suppr, Ctrl+D…) valent aussi au clavier.
  const itemEntries = (item: CalItem): MenuEntry[] => {
    if (item.kind === "event") {
      const event = eventOf(item);
      if (!event) return [];
      return [
        { label: tr("Modifier"), icon: ICONS.pencil, shortcut: KEYS.open, run: () => setEditing({ event, occurrence: item.occurrence }) },
        {
          label: tr("Dupliquer"),
          icon: ICONS.layers,
          shortcut: KEYS.duplicate,
          run: () =>
            void createEventNow(detachedEvent(event, whenOf(event, item)))
              .then(() => notify(tr("Événement dupliqué.")))
              .catch((err: DataError) => notify(dataErrorMessage(err))),
        },
        pinEntry({ kind: "event", id: event.id }),
        "separator",
        { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => deleteEvent(event, item) },
      ];
    }
    if (item.kind === "task") {
      const task = taskOf(item);
      if (!task) return [];
      const extra = task.dueTime
        ? [{ label: tr("Retirer l'heure"), icon: ICONS.clock, run: () => void updateTask(task, { dueTime: null }) }]
        : [];
      return taskMenu(task, { extra });
    }
    if (item.kind === "obligation" || item.kind === "cancel") {
      const obligation = obligations.find((o) => o.id === item.id);
      if (obligation) return obligationMenu(obligation, () => actions.open(item));
    }
    if (item.kind === "birthday") return [{ label: tr("Ouvrir le contact"), icon: ICONS.enter, shortcut: KEYS.open, run: () => actions.open(item) }];
    return [];
  };
  const itemMenu = (e: MouseEvent, item: CalItem) => openMenu(e, itemEntries(item));
  // L'ouverture (Entrée, Espace) est déjà gérée par chaque vue.
  const itemKeys = (item: CalItem) => ({ ...menuKeys(itemEntries(item)), open: undefined });
  const slotMenu = (e: MouseEvent, day: DayKey, minute: number | null) =>
    openMenu(e, [
      {
        label: minute === null ? tr("Nouvel événement") : tr("Nouvel événement à {toTime}", { toTime: toTime(minute) }),
        icon: ICONS.plus,
        run: () => (minute === null ? createEvent(day) : actions.create(day, minute, minute + 60)),
      },
      ...(view === "jour" ? [] : [{ label: tr("Afficher le jour"), icon: ICONS.calendar, run: () => actions.pickDay(day) }]),
      "separator",
      { label: tr("Aujourd'hui"), icon: ICONS.today, run: () => setAnchor(today) },
    ]);
  const gridActions: GridActions = { ...actions, menu: itemMenu, slotMenu, keys: itemKeys };

  const panelId = `${tabsId}-panel-${view}`;
  const tabId = `${tabsId}-tab-${view}`;

  return (
    <div className="screen calendar-screen">
      <header className="screen-header cal-header">
        <ScreenTitle module="calendrier" className="screen-title" />
        <div className="cal-nav">
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label={PREVIOUS[view]}
            title={PREVIOUS[view]}
            onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}
          >
            <Icon d={ICONS.arrowLeft} size={15} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label={NEXT[view]}
            title={NEXT[view]}
            onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
          >
            <Icon d={ICONS.arrowRight} size={15} />
          </button>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => setAnchor(today)}>
            {tr("Aujourd'hui")}
          </button>
        </div>
        <span className="cal-range" aria-live="polite">
          {rangeLabel(view, anchor)}
          {cal.weekNumbers && (view === "semaine" || view === "jour") && <span className="cal-week">{tr(" · semaine {n}", { n: isoWeek(anchor) })}</span>}
        </span>
        <Tabs items={VIEWS} value={view} onChange={(v) => setPrefs({ view: v })} label={tr("Vue")} idPrefix={tabsId} />
        <button type="button" className="btn-gel" title={tr("Nouvel événement ({create})", { create: KEYS.create })} onClick={() => createEvent(view === "jour" ? anchor : today)}>
          <Icon d={ICONS.plus} size={16} stroke={2.6} />
          {tr("Nouvel événement")}
        </button>
      </header>

      <div className="cal-body">
        <aside className="cal-aside glass" aria-label={tr("Calendriers")}>
          <div className="cal-mini-head">
            <span className="cal-mini-title">{monthLabel(miniMonth)}</span>
            <button
              type="button"
              className="icon-btn icon-btn--xs"
              aria-label={tr("Mois précédent")}
              onClick={() => setMiniMonth(addMonths(miniMonth, -1))}
            >
              <Icon d={ICONS.arrowLeft} size={12} stroke={2.4} />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--xs"
              aria-label={tr("Mois suivant")}
              onClick={() => setMiniMonth(addMonths(miniMonth, 1))}
            >
              <Icon d={ICONS.arrowRight} size={12} stroke={2.4} />
            </button>
          </div>
          <MiniMonth
            month={miniMonth}
            today={today}
            highlight={view === "jour" || view === "semaine" ? range : undefined}
            special={miniMarks}
            onPick={setAnchor}
            label={monthLabel(miniMonth)}
          />

          <h2 className="cal-aside-heading">{tr("Mes calendriers")}</h2>
          <div className="cal-checks">
            {spaces.map((s) => (
              <Checkbox
                key={s.id}
                label={s.name}
                color={s.color}
                checked={!prefs.hiddenSpaces.includes(s.id)}
                disabled={filter !== "tous" && filter !== s.id}
                onChange={(on) =>
                  setPrefs({ hiddenSpaces: on ? prefs.hiddenSpaces.filter((id) => id !== s.id) : [...prefs.hiddenSpaces, s.id] })
                }
              />
            ))}
          </div>

          <h2 className="cal-aside-heading">{tr("Afficher aussi")}</h2>
          <div className="cal-checks">
            <Checkbox label={tr("Tâches datées")} checked={prefs.showTasks} onChange={(on) => setPrefs({ showTasks: on })} />
            <Checkbox label={tr("Obligations")} checked={prefs.showObligations} onChange={(on) => setPrefs({ showObligations: on })} />
            <Checkbox label={tr("Anniversaires")} checked={prefs.showBirthdays} onChange={(on) => setPrefs({ showBirthdays: on })} />
          </div>

          <SpecialDaysAside />
        </aside>

        <section className="cal-main glass" aria-label={rangeLabel(view, anchor)}>
          <QuickEventField
            spaces={spaces}
            today={today}
            duration={cal.defaultDuration}
            onCreate={(q) => {
              const base = draftFor({ startDate: q.startDate, startTime: q.startTime, endDate: q.endDate, endTime: q.endTime });
              void createEventNow({ ...base, title: q.title, recurrence: q.recurrence, spaceId: q.spaceId ?? base.spaceId }).then(
                (event) => {
                  void linkContacts({ kind: "event", id: event.id }, q.contactIds);
                  setAnchor(q.startDate);
                  notify(tr("Événement ajouté : {describeQuickEvent}.", { describeQuickEvent: describeQuickEvent(q, today) }), { label: tr("Ouvrir"), run: () => setEditing({ event, occurrence: null }) });
                },
                (err) => notify(dataErrorMessage(err as DataError)),
              );
            }}
          />
          {(view === "jour" || view === "semaine") && (
            <TimeGrid
              key={view}
              days={view === "jour" ? [anchor] : weekDays(anchor).filter((d) => cal.weekends || weekday(d) % 6 !== 0)}
              workHours={cal.showWorkHours ? { start: minutesOf(cal.workStart), end: minutesOf(cal.workEnd) } : null}
              defaultDuration={cal.defaultDuration}
              items={items}
              today={today}
              now={now}
              actions={gridActions}
              special={marks}
              id={panelId}
              labelledBy={tabId}
            />
          )}
          {view === "mois" && (
            <MonthView
              anchor={anchor}
              today={today}
              items={items}
              open={actions.open}
              shift={actions.shift}
              createOn={createEvent}
              pickDay={actions.pickDay}
              menu={itemMenu}
              keys={itemKeys}
              slotMenu={slotMenu}
              special={marks}
              weekNumbers={cal.weekNumbers}
              id={panelId}
              labelledBy={tabId}
            />
          )}
          {view === "annee" && (
            <YearView anchor={anchor} special={marks} today={today} items={items} pickDay={actions.pickDay} id={panelId} labelledBy={tabId} />
          )}
          {view === "agenda" && (
            <AgendaView anchor={anchor} today={today} items={items} special={marks} open={actions.open} menu={itemMenu} keys={itemKeys} id={panelId} labelledBy={tabId} />
          )}
        </section>
      </div>

      {editing && <EventEditor {...editing} onClose={() => setEditing(null)} />}
      {asking && <SeriesScopeDialog action={asking.action} onChoose={asking.apply} onClose={() => setAsking(null)} />}
    </div>
  );
}
