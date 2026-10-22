/**
 * « Nouvelle tâche » (palette, bouton) : place le curseur dans la saisie rapide de
 * l'écran Tâches, qu'il soit déjà ouvert ou qu'il s'ouvre à l'instant.
 */

const EVENT = "aqueli:nouvelle-tache";
let pending = false;

export function requestQuickAdd(): void {
  pending = true;
  window.dispatchEvent(new Event(EVENT));
}

/** À l'ouverture de l'écran : vrai si une demande attendait (et la consomme). */
export function takePendingQuickAdd(): boolean {
  const was = pending;
  pending = false;
  return was;
}

export function onQuickAddRequest(listener: () => void): () => void {
  const handler = () => {
    pending = false;
    listener();
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
