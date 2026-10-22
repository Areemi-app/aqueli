/**
 * « Planifier ma journée » depuis la palette : l'Accueil ouvre le planificateur, qu'il soit
 * déjà affiché ou qu'il s'ouvre à l'instant.
 */

const EVENT = "aqueli:planifier-journee";
let pending = false;

export function requestDayPlanner(): void {
  pending = true;
  window.dispatchEvent(new Event(EVENT));
}

/** À l'ouverture de l'Accueil : vrai si une demande attendait (et la consomme). */
export function takePendingDayPlanner(): boolean {
  const was = pending;
  pending = false;
  return was;
}

export function onDayPlannerRequest(listener: () => void): () => void {
  const handler = () => {
    pending = false;
    listener();
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
