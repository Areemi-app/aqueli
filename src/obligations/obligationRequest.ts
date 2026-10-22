/**
 * Ouvrir l'écran Obligations sur une obligation (notification, Accueil, calendrier), ou la
 * fenêtre « Nouvelle obligation » (palette), ou ses réglages (Paramètres), qu'il soit déjà
 * affiché ou non.
 */

export interface ObligationRequest {
  id?: string;
  create?: boolean;
  /** Réglages des obligations, sur l'onglet donné. */
  settings?: "categories" | "rappels";
}

const EVENT = "aqueli:obligation";
let pending: ObligationRequest | null = null;

export function requestObligation(request: ObligationRequest): void {
  pending = request;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: request }));
}

/** À l'ouverture de l'écran : la demande qui attendait (et la consomme). */
export function takePendingObligation(): ObligationRequest | null {
  const request = pending;
  pending = null;
  return request;
}

export function onObligationRequest(listener: (request: ObligationRequest) => void): () => void {
  const handler = (e: Event) => {
    pending = null;
    listener((e as CustomEvent<ObligationRequest>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
