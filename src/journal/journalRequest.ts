/** Ouvrir le Journal sur un jour (Accueil, recherche globale, palette), qu'il soit affiché ou non. */
import type { DayKey } from "../tasks/day";

const EVENT = "aqueli:journal";
let pending: DayKey | null = null;

export function requestJournal(day: DayKey): void {
  pending = day;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: day }));
}

/** À l'ouverture de l'écran : le jour demandé (et la demande est consommée). */
export function takePendingJournal(): DayKey | null {
  const day = pending;
  pending = null;
  return day;
}

export function onJournalRequest(listener: (day: DayKey) => void): () => void {
  const handler = (e: Event) => {
    pending = null;
    listener((e as CustomEvent<DayKey>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
