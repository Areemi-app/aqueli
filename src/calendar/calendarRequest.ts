/**
 * Ouvrir le calendrier sur un jour, un événement, ou la fenêtre « Nouvel événement »
 * (Accueil, palette), qu'il soit déjà affiché ou qu'il s'ouvre à l'instant.
 */
import type { DayKey } from "../tasks/day";

export interface CalendarRequest {
  day?: DayKey;
  eventId?: string;
  create?: boolean;
}

const EVENT = "aqueli:calendrier";
let pending: CalendarRequest | null = null;

export function requestCalendar(request: CalendarRequest): void {
  pending = request;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: request }));
}

/** À l'ouverture de l'écran : la demande qui attendait (et la consomme). */
export function takePendingCalendar(): CalendarRequest | null {
  const request = pending;
  pending = null;
  return request;
}

export function onCalendarRequest(listener: (request: CalendarRequest) => void): () => void {
  const handler = (e: Event) => {
    pending = null;
    listener((e as CustomEvent<CalendarRequest>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
