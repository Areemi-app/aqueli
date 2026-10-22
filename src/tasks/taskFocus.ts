/**
 * Ouvrir une tâche précise (clic sur une notification, rappel manqué) : l'écran Tâches la
 * sélectionne, qu'il soit déjà ouvert ou qu'il s'ouvre à l'instant.
 */

const EVENT = "aqueli:ouvrir-tache";
let pending: string | null = null;

export function requestTaskOpen(id: string): void {
  pending = id;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/** À l'ouverture de l'écran : la tâche qui attendait (et consomme la demande). */
export function takePendingTaskOpen(): string | null {
  const id = pending;
  pending = null;
  return id;
}

export function onTaskOpenRequest(listener: (id: string) => void): () => void {
  const handler = (e: Event) => {
    pending = null;
    listener((e as CustomEvent<string>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
