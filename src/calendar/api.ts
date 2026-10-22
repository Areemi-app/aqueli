/** Événements enregistrés dans la base chiffrée (commandes du cœur, src-tauri/src/data/events.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError, type DataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey, type DayKey } from "../tasks/day";
import { startOfWeek } from "./view";
import type { CalendarEvent, EventInput } from "./events";

export interface EventsApi {
  list(): Promise<CalendarEvent[]>;
  create(event: EventInput): Promise<CalendarEvent>;
  update(id: string, event: EventInput): Promise<CalendarEvent>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<CalendarEvent>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: EventsApi = {
  list: () => call("events_list"),
  create: (event) => call("events_create", { event }),
  update: (id, event) => call("events_update", { id, event }),
  remove: (id) => call("events_delete", { id }),
  restore: (id) => call("events_restore", { id }),
};

/** Événements d'exemple en mémoire pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): EventsApi {
  const now = () => Math.floor(Date.now() / 1000);
  const monday = startOfWeek(dayKey(new Date()));
  let seq = 0;
  const make = (input: Partial<EventInput> & { title: string; startDate: DayKey }): CalendarEvent => {
    seq += 1;
    return {
      id: `apercu-evt${seq}`,
      location: "",
      notes: "",
      spaceId: "perso",
      startTime: null,
      endDate: input.startDate,
      endTime: null,
      color: null,
      reminder: null,
      recurrence: null,
      exceptions: [],
      repeatUntil: null,
      createdAt: now(),
      updatedAt: now(),
      ...input,
    };
  };
  const timed = (day: number, from: string, to: string, title: string, extra: Partial<EventInput> = {}) =>
    make({ title, startDate: addDays(monday, day), startTime: from, endDate: addDays(monday, day), endTime: to, ...extra });
  let events: CalendarEvent[] = [
    timed(0, "09:30", "10:00", demo("Dentiste", "Dentist"), { spaceId: "sante", location: demo("Cabinet du Dr Martin", "Riverside Dental Practice") }),
    timed(0, "14:00", "15:30", demo("Réunion d'équipe", "Team meeting"), { spaceId: "travail" }),
    timed(1, "12:00", "13:00", demo("Déjeuner d'équipe", "Team lunch"), { spaceId: "travail" }),
    timed(2, "18:00", "19:00", demo("Cours de yoga", "Yoga class"), { recurrence: { kind: "weekly", interval: 1, days: [3] }, reminder: 15 }),
    timed(3, "10:00", "11:30", demo("Rendez-vous banque", "Appointment at the bank")),
    timed(4, "12:30", "14:00", demo("Déjeuner avec Camille", "Lunch with Camille")),
    timed(5, "10:00", "12:00", demo("Marché et jardin", "Market and gardening"), { spaceId: "famille" }),
    timed(6, "15:00", "17:00", demo("Goûter chez Léa", "Afternoon tea at Lea's"), { spaceId: "famille" }),
    make({ title: demo("Anniversaire de Léa", "Lea's birthday"), startDate: addDays(monday, 6), spaceId: "famille" }),
    make({ title: demo("Salon de l'habitat", "Home and garden show"), startDate: addDays(monday, 9), endDate: addDays(monday, 11) }),
  ];
  const find = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) throw { code: "notFound" } satisfies DataError;
    return event;
  };
  const check = (input: EventInput): EventInput => {
    const title = input.title.split(/\s+/).filter(Boolean).join(" ");
    if (!title || title.length > 500) throw { code: "invalid", field: "title" } satisfies DataError;
    const start = `${input.startDate} ${input.startTime ?? ""}`;
    const end = `${input.endDate} ${input.endTime ?? ""}`;
    if ((input.startTime === null) !== (input.endTime === null)) throw { code: "invalid", field: "endTime" } satisfies DataError;
    if (input.startTime === null ? input.endDate < input.startDate : end <= start) {
      throw { code: "invalid", field: input.startTime === null ? "endDate" : "endTime" } satisfies DataError;
    }
    return { ...input, title, location: input.location.trim() };
  };
  const deleted = new Map<string, CalendarEvent>();
  return {
    list: async () => events,
    create: async (input) => {
      const event = make(check(input));
      events = [...events, event];
      return event;
    },
    update: async (id, input) => {
      const event = { ...find(id), ...check(input), updatedAt: now() };
      events = events.map((e) => (e.id === id ? event : e));
      return event;
    },
    remove: async (id) => {
      deleted.set(id, find(id));
      events = events.filter((e) => e.id !== id);
    },
    restore: async (id) => {
      const event = deleted.get(id);
      if (!event) throw { code: "notFound" } satisfies DataError;
      deleted.delete(id);
      events = [...events, event];
      return event;
    },
  };
}

/** Enregistre le calendrier (.ics) dans un fichier choisi ; chemin, ou `null` si annulé. */
export async function exportCalendar(name: string, content: string): Promise<string | null> {
  if (!inTauri && import.meta.env.DEV) return `C:\\Users\\…\\Documents\\${name}.ics`;
  try {
    return await invoke<string | null>("export_file", { name, format: "ics", content });
  } catch (e) {
    throw asDataError(e);
  }
}

export const eventsApi: EventsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
