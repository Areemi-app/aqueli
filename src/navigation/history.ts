import type { RouteId } from "./routes";

/**
 * Historique de navigation interne, comme un navigateur web :
 * « Précédent » et « Suivant » parcourent les écrans déjà visités.
 */
export interface NavHistory {
  readonly entries: readonly RouteId[];
  readonly index: number;
}

/** Au-delà, les écrans les plus anciens sont oubliés. */
export const MAX_HISTORY = 100;

export function createHistory(start: RouteId): NavHistory {
  return { entries: [start], index: 0 };
}

export function currentRoute(history: NavHistory): RouteId {
  const route = history.entries[history.index];
  if (route === undefined) throw new Error("Historique de navigation vide");
  return route;
}

/** Ouvre un écran : tout ce qui était « en avant » est oublié, comme dans un navigateur. */
export function navigateTo(history: NavHistory, route: RouteId): NavHistory {
  if (currentRoute(history) === route) return history;
  const entries = [...history.entries.slice(0, history.index + 1), route];
  const overflow = Math.max(0, entries.length - MAX_HISTORY);
  return { entries: entries.slice(overflow), index: entries.length - 1 - overflow };
}

export function canGoBack(history: NavHistory): boolean {
  return history.index > 0;
}

export function canGoForward(history: NavHistory): boolean {
  return history.index < history.entries.length - 1;
}

export function goBack(history: NavHistory): NavHistory {
  return canGoBack(history) ? { ...history, index: history.index - 1 } : history;
}

export function goForward(history: NavHistory): NavHistory {
  return canGoForward(history) ? { ...history, index: history.index + 1 } : history;
}
