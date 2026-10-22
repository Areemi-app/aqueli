/**
 * Lancement d'une visite guidée depuis n'importe où (Paramètres › Aide, palette, aide F1).
 * Léger : le texte des visites se charge avec leur fenêtre.
 */
import type { ModuleKey } from "../modules/modules";
import { readPref, writePref } from "../lib/storage";

export type TourRequestId = "general" | ModuleKey;

const EVENT = "aqueli:visite";
/** Visite générale à proposer au premier déverrouillage après la création du compte. */
const PENDING = "visiteAFaire";

export function requestTour(id: TourRequestId): void {
  window.dispatchEvent(new CustomEvent<TourRequestId>(EVENT, { detail: id }));
}

export function onTourRequest(listener: (id: TourRequestId) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<TourRequestId>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** À la création du compte : la visite générale sera proposée une fois. */
export function planWelcomeTour(): void {
  writePref(PENDING, true);
}

/** Vrai si la visite générale attend d'être proposée. */
export function welcomeTourPending(): boolean {
  return readPref(PENDING, false, (v): v is boolean => typeof v === "boolean");
}

/** La visite générale a été proposée : elle ne le sera plus. */
export function clearWelcomeTour(): void {
  writePref(PENDING, false);
}
