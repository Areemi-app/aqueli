/** Ouvrir une habitude (Accueil, recherche globale), que l'écran soit affiché ou non. */
const EVENT = "aqueli:habitude";
/** Demande d'une nouvelle habitude (palette de commandes). */
export const NEW_HABIT = "nouvelle";
let pending: string | null = null;

export function requestHabit(id: string): void {
  pending = id;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/** À l'ouverture de l'écran : l'habitude demandée (et la demande est consommée). */
export function takePendingHabit(): string | null {
  const id = pending;
  pending = null;
  return id;
}

export function onHabitRequest(listener: (id: string) => void): () => void {
  const handler = (e: Event) => {
    pending = null;
    listener((e as CustomEvent<string>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
