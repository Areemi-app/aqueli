import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { eventsApi } from "./api";
import { toEventInput, type CalendarEvent, type EventInput } from "./events";
import { tr } from "../i18n/i18n";

interface EventsContextValue {
  events: readonly CalendarEvent[];
  loaded: boolean;
  create: (input: EventInput) => Promise<CalendarEvent>;
  /** Modifie un événement ; l'affichage suit tout de suite, puis la base confirme. */
  update: (event: CalendarEvent, changes: Partial<EventInput>) => Promise<void>;
  /** Met l'événement à la corbeille, avec « Annuler » pendant 8 secondes. */
  remove: (event: CalendarEvent) => Promise<void>;
}

const EventsContext = createContext<EventsContextValue | null>(null);

/** Événements du calendrier, chargés une fois le compte déverrouillé. */
export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();

  const eventsRef = useRef<CalendarEvent[]>([]);
  const setAll = useCallback((change: (list: CalendarEvent[]) => CalendarEvent[]) => {
    eventsRef.current = change(eventsRef.current);
    setEvents(eventsRef.current);
  }, []);

  // Les enregistrements partent un par un, dans l'ordre des changements.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);
  // Une réponse ancienne n'écrase pas un changement plus récent du même événement.
  const versions = useRef(new Map<string, number>());

  const reload = useCallback(async () => {
    const list = await enqueue(() => eventsApi.list());
    setAll(() => list);
  }, [enqueue, setAll]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);

  // Élément ajouté par la capture rapide : la liste est relue.
  useEffect(
    () =>
      onDataAdded("event", () => {
        reload().catch(() => undefined);
      }),
    [reload],
  );

  const value = useMemo<EventsContextValue>(() => {
    const update = async (event: CalendarEvent, changes: Partial<EventInput>) => {
      const base = eventsRef.current.find((e) => e.id === event.id) ?? event;
      // Ctrl+Z rend l'événement tel qu'avant (déplacement, durée, fenêtre de l'événement).
      recordUndo(tr("modification de l'événement"), () => update(base, toEventInput(base)), `event:${base.id}`);
      const input = { ...toEventInput(base), ...changes };
      const version = (versions.current.get(base.id) ?? 0) + 1;
      versions.current.set(base.id, version);
      setAll((list) => list.map((e) => (e.id === base.id ? { ...base, ...input } : e)));
      try {
        const saved = await enqueue(() => eventsApi.update(base.id, input));
        if (versions.current.get(base.id) === version) setAll((list) => list.map((e) => (e.id === saved.id ? saved : e)));
      } catch (err) {
        notify(dataErrorMessage(err as DataError));
        await reload().catch(() => undefined);
      }
    };
    const remove = async (event: CalendarEvent) => {
      try {
        await enqueue(() => eventsApi.remove(event.id));
      } catch (err) {
        notify(dataErrorMessage(err as DataError));
        return;
      }
      setAll((list) => list.filter((e) => e.id !== event.id));
      notify(tr("Événement supprimé."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de l'événement"),
        run: () => {
          enqueue(() => eventsApi.restore(event.id))
            .then((back) => setAll((list) => [...list.filter((e) => e.id !== back.id), back]))
            .catch((err: DataError) => notify(dataErrorMessage(err)));
        },
      });
    };
    return {
      events,
      loaded,
      create: async (input) => {
        const event = await enqueue(() => eventsApi.create(input));
        setAll((list) => [...list, event]);
        recordUndo(tr("ajout de l'événement"), () => remove(event));
        return event;
      },
      update,
      remove,
    };
  }, [events, loaded, enqueue, setAll, notify, reload]);

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents(): EventsContextValue {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error("useEvents doit être utilisé dans EventsProvider");
  return ctx;
}
