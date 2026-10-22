/**
 * Demande d'ouvrir un élément depuis ailleurs (Accueil, recherche globale, liens, palette),
 * que son écran soit déjà affiché ou non : l'écran la lit à son ouverture, ou la reçoit s'il
 * est affiché.
 */
export interface ItemRequest<T> {
  request: (value: T) => void;
  /** À l'ouverture de l'écran : la demande en attente (consommée). */
  take: () => T | null;
  on: (listener: (value: T) => void) => () => void;
}

export function itemRequest<T>(name: string): ItemRequest<T> {
  const event = `aqueli:${name}`;
  let pending: T | null = null;
  return {
    request: (value) => {
      pending = value;
      window.dispatchEvent(new CustomEvent(event, { detail: value }));
    },
    take: () => {
      const value = pending;
      pending = null;
      return value;
    },
    on: (listener) => {
      const handler = (e: Event) => {
        pending = null;
        listener((e as CustomEvent<T>).detail);
      };
      window.addEventListener(event, handler);
      return () => window.removeEventListener(event, handler);
    },
  };
}

/** Ouvrir un projet, un contact ou un document ; « nouveau » : en créer un. */
export const projectRequest = itemRequest<string>("projet");
export const contactRequest = itemRequest<string>("contact");
export const documentRequest = itemRequest<string>("document");
export const NEW_ITEM = "nouveau";
export const listRequest = itemRequest<string>("liste");
export const goalRequest = itemRequest<string>("objectif");
export const transactionRequest = itemRequest<string>("operation");
/** Ouvrir le Bilan sur un onglet : « revue », « statistiques » ou « rapport ». */
export const reviewRequest = itemRequest<string>("bilan");
