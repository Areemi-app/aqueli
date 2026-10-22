/**
 * Ouvrir l'écran Notes sur une note (Accueil), ou sur une note nouvelle (palette, menus),
 * qu'il soit déjà affiché ou non.
 */

export interface NoteRequest {
  id?: string;
  create?: boolean;
}

const EVENT = "aqueli:note";
let pending: NoteRequest | null = null;

export function requestNote(request: NoteRequest): void {
  pending = request;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: request }));
}

/** À l'ouverture de l'écran : la demande qui attendait (et la consomme). */
export function takePendingNote(): NoteRequest | null {
  const request = pending;
  pending = null;
  return request;
}

export function onNoteRequest(listener: (request: NoteRequest) => void): () => void {
  const handler = (e: Event) => {
    pending = null;
    listener((e as CustomEvent<NoteRequest>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
