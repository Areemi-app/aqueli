/** Ouvre l'aide depuis n'importe quel écran (Paramètres, boutons d'aide) : la rubrique donnée,
 * sinon celle de l'écran affiché. */

const EVENT = "aqueli:aide";

export function requestHelp(topic?: string): void {
  window.dispatchEvent(new CustomEvent<string | null>(EVENT, { detail: topic ?? null }));
}

export function onHelpRequest(listener: (topic: string | null) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<string | null>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
