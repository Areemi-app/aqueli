/** Événements du calendrier côté interface (src-tauri/src/data/events.rs). */
import type { DayKey } from "../tasks/day";
import type { Recurrence } from "../tasks/recurrence";

export interface CalendarEvent {
  id: string;
  title: string;
  location: string;
  notes: string;
  /** Calendrier de l'événement : un espace (Perso, Travail…). */
  spaceId: string | null;
  startDate: DayKey;
  /** `null` pour un événement sur la journée entière. */
  startTime: string | null;
  /** Comprise pour un événement sur la journée entière. */
  endDate: DayKey;
  endTime: string | null;
  /** Couleur choisie (« #rrggbb »), sinon celle du calendrier. */
  color: string | null;
  /** Rappel, en minutes avant le début. */
  reminder: number | null;
  recurrence: Recurrence | null;
  /** Occurrences retirées d'une série. */
  exceptions: DayKey[];
  /** Dernier jour de la série (compris) ; sans fin si `null`. */
  repeatUntil: DayKey | null;
  createdAt: number;
  updatedAt: number;
}

export type EventInput = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;

export function toEventInput(event: CalendarEvent): EventInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = event;
  return input;
}
