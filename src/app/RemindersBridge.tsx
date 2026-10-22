/**
 * Rappels confiés au cœur, qui affiche les notifications à l'heure : ceux des tâches, des
 * événements, des obligations et des habitudes, les anniversaires, l'expiration des documents
 * et la fin des séances de Focus, en une seule liste. Réponses aux boutons des notifications et
 * rappels manqués pendant qu'Aqueli était arrêté.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { requestCalendar } from "../calendar/calendarRequest";
import { missedEventsBetween, parseEventReminderId, scheduleForEvents } from "../calendar/eventReminders";
import { useEvents } from "../calendar/EventsProvider";
import { BIRTHDAY_REMINDER_CHANGED, parseBirthdayReminderId, readBirthdayReminder, scheduleForBirthdays } from "../contacts/birthdayReminders";
import { useContacts } from "../contacts/ContactsProvider";
import { KEEP_REMINDER_CHANGED, parseKeepReminderId, readKeepReminder, scheduleForKeepInTouch } from "../contacts/keepInTouchReminders";
import { parseDocumentReminderId, scheduleForDocuments } from "../documents/documents";
import { useDocuments } from "../documents/DocumentsProvider";
import { contactRequest, documentRequest } from "../lib/request";
import { scheduleForFocus } from "../focus/focus";
import { useFocus } from "../focus/FocusProvider";
import { parseHabitReminderId, scheduleForHabits } from "../habits/habitReminders";
import { requestHabit } from "../habits/habitRequest";
import { useHabits } from "../habits/HabitsProvider";
import { useJournal } from "../journal/JournalProvider";
import { JOURNAL_REMINDER_CHANGED, parseJournalReminderId, readJournalReminder, scheduleForJournal } from "../journal/journalReminder";
import { requestJournal } from "../journal/journalRequest";
import { useNavigation } from "../navigation/NavigationProvider";
import {
  missedObligationsBetween,
  OFFSETS_CHANGED,
  parseObligationReminderId,
  readReminderSettings,
  scheduleForObligations,
} from "../obligations/obligationReminders";
import { requestObligation } from "../obligations/obligationRequest";
import { useObligations } from "../obligations/ObligationsProvider";
import { addDays, dayKey } from "../tasks/day";
import { missedBetween, scheduleFor, type ScheduledReminder } from "../tasks/reminders";
import { missedWindow, syncReminders } from "../tasks/remindersApi";
import { requestTaskOpen } from "../tasks/taskFocus";
import { useTasks } from "../tasks/TasksProvider";
import { APP_EVENTS, onAppEvent } from "./background";
import { useToast } from "./ToastProvider";
import { publishUpcoming, setReminderOpener } from "./reminderFeed";
import { tr } from "../i18n/i18n";

/** Les rappels manqués ne sont signalés qu'une fois par lancement d'Aqueli. */
let missedChecked = false;

export function RemindersBridge() {
  const { tasks, loaded: tasksLoaded, today, setDone } = useTasks();
  const { events, loaded: eventsLoaded } = useEvents();
  const { obligations, loaded: obligationsLoaded } = useObligations();
  const { habits, checks, loaded: habitsLoaded, setValue } = useHabits();
  const { timer, settings: focusSettings } = useFocus();
  const { contacts, loaded: contactsLoaded } = useContacts();
  const { documents, loaded: documentsLoaded } = useDocuments();
  const { pages: journalPages } = useJournal();
  // Jours de rappel des obligations changés dans les Paramètres.
  const [offsetsVersion, offsetsChanged] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener(OFFSETS_CHANGED, offsetsChanged);
    window.addEventListener(BIRTHDAY_REMINDER_CHANGED, offsetsChanged);
    window.addEventListener(JOURNAL_REMINDER_CHANGED, offsetsChanged);
    window.addEventListener(KEEP_REMINDER_CHANGED, offsetsChanged);
    return () => {
      window.removeEventListener(KEEP_REMINDER_CHANGED, offsetsChanged);
      window.removeEventListener(OFFSETS_CHANGED, offsetsChanged);
      window.removeEventListener(BIRTHDAY_REMINDER_CHANGED, offsetsChanged);
      window.removeEventListener(JOURNAL_REMINDER_CHANGED, offsetsChanged);
    };
  }, []);
  const { go } = useNavigation();
  const notify = useToast();
  const loaded = tasksLoaded && eventsLoaded && obligationsLoaded && habitsLoaded && contactsLoaded && documentsLoaded;
  // Pages du journal déjà écrites sur les 7 prochains jours : seul ce qui change le rappel compte.
  const journalWritten = Array.from({ length: 7 }, (_, i) => addDays(today, i)).filter((d) => journalPages.has(d)).join(" ");

  // Plusieurs changements rapprochés ne font qu'un envoi.
  const pendingSync = useRef<ScheduledReminder[] | null>(null);
  const flushSync = useCallback(() => {
    const list = pendingSync.current;
    pendingSync.current = null;
    if (list) syncReminders(list).catch(() => {});
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const now = new Date();
    const day = dayKey(now);
    const all = [
      ...scheduleFor(tasks, now, day),
      ...scheduleForEvents(events, now, day),
      ...scheduleForObligations(obligations, readReminderSettings(), now),
      ...scheduleForHabits(habits, checks, now, day),
      ...scheduleForFocus(timer, focusSettings.autoContinue),
      ...scheduleForBirthdays(contacts, readBirthdayReminder(), now, day),
      ...scheduleForKeepInTouch(contacts, readKeepReminder(), now, day),
      ...scheduleForDocuments(documents, now),
      ...scheduleForJournal(readJournalReminder(), (d) => journalWritten.split(" ").includes(d), now, day),
    ].sort((a, b) => a.at - b.at);
    pendingSync.current = all;
    publishUpcoming(all);
    const pending = window.setTimeout(flushSync, 400);
    return () => window.clearTimeout(pending);
  }, [tasks, events, obligations, habits, checks, timer, focusSettings.autoContinue, contacts, documents, journalWritten, offsetsVersion, loaded, today, flushSync]);
  // Fermeture de la fenêtre ou verrouillage juste après un réglage : l'envoi part tout de suite.
  useEffect(() => flushSync, [flushSync]);

  const openItem = useCallback(
    (id: string) => {
      const event = parseEventReminderId(id);
      const obligation = parseObligationReminderId(id);
      const habit = parseHabitReminderId(id);
      const contactId = parseBirthdayReminderId(id) ?? parseKeepReminderId(id);
      const documentId = parseDocumentReminderId(id);
      const journalDay = parseJournalReminderId(id);
      if (journalDay) {
        go("journal");
        requestJournal(journalDay);
      } else if (contactId) {
        go("contacts");
        contactRequest.request(contactId);
      } else if (documentId) {
        go("documents");
        documentRequest.request(documentId);
      } else if (habit) {
        go("habitudes");
        requestHabit(habit.habitId);
      } else if (id.startsWith("focus:")) {
        go("focus");
      } else if (obligation) {
        go("obligations");
        requestObligation({ id: obligation.obligationId });
      } else if (event) {
        go("calendrier");
        requestCalendar({ day: event.day, eventId: event.eventId });
      } else {
        go("taches");
        requestTaskOpen(id);
      }
    },
    [go],
  );

  // La cloche de la barre de titre ouvre aussi l'élément d'un rappel.
  useEffect(() => {
    setReminderOpener(openItem);
    return () => setReminderOpener(null);
  }, [openItem]);

  // Boutons des notifications : « Terminé » (tâches, habitudes) et clic pour ouvrir.
  const latest = useRef({ tasks, setDone, openItem, habits, checks, setValue });
  latest.current = { tasks, setDone, openItem, habits, checks, setValue };
  useEffect(() => {
    const stopDone = onAppEvent<string>(APP_EVENTS.reminderDone, (id) => {
      const ref = parseHabitReminderId(id);
      const habit = ref ? latest.current.habits.find((h) => h.id === ref.habitId) : undefined;
      if (ref && habit) {
        const value = latest.current.checks.get(habit.id)?.get(ref.day) ?? 0;
        if (value < habit.target) void latest.current.setValue(habit, ref.day, Math.max(1, habit.target));
        return;
      }
      const task = latest.current.tasks.find((t) => t.id === id);
      if (task && task.doneAt === null) void latest.current.setDone(task, true);
    });
    const stopOpen = onAppEvent<string>(APP_EVENTS.reminderOpen, (id) => latest.current.openItem(id));
    return () => {
      stopDone();
      stopOpen();
    };
  }, []);

  // Rappels tombés pendant qu'Aqueli était arrêté : signalés au premier déverrouillage.
  useEffect(() => {
    if (!loaded || missedChecked) return;
    missedChecked = true;
    missedWindow()
      .then((range) => {
        if (!range || range.until <= range.since) return;
        const missed = [
          ...missedBetween(latest.current.tasks, range.since, range.until).map((t) => ({ title: t.title, id: t.id })),
          ...missedEventsBetween(events, range.since, range.until).map(({ event, day }) => ({
            title: event.title,
            id: `evt:${event.id}@${day}`,
          })),
          ...missedObligationsBetween(obligations, readReminderSettings(), range.since, range.until).map((m) => ({
            title: m.obligation.title,
            id: m.id,
          })),
        ];
        const first = missed[0];
        if (!first) return;
        notify(missed.length === 1 ? tr("Rappel manqué : {title}", { title: first.title }) : tr("{length} rappels manqués.", { length: missed.length }), {
          label: tr("Afficher"),
          run: () => latest.current.openItem(first.id),
        });
      })
      .catch(() => {});
    // Une seule fois, dès que tâches et événements sont chargés.
  }, [loaded]);

  return null;
}
