/**
 * Sélection de plusieurs éléments d'une liste, comme dans l'Explorateur de Windows :
 * Ctrl+clic ajoute ou retire un élément, Maj+clic prend tous ceux d'entre le dernier choisi et
 * celui-ci, Ctrl+Maj+clic les ajoute à la sélection, Ctrl+A prend toute la liste.
 * Fonctions pures ; le crochet `useSelection` (src/components/SelectionBar.tsx) les utilise.
 */

export interface Selection {
  ids: ReadonlySet<string>;
  /** Point de départ des plages (Maj+clic). */
  anchor: string | null;
}

export const NO_SELECTION: Selection = { ids: new Set(), anchor: null };

/** Geste du clic : seul (aucune touche), ajout (Ctrl), plage (Maj), ou plage ajoutée (Ctrl+Maj). */
export type PickMode = "seul" | "ajout" | "plage" | "plage-ajout";

export function pickMode(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): PickMode {
  const add = e.ctrlKey || e.metaKey;
  if (e.shiftKey) return add ? "plage-ajout" : "plage";
  return add ? "ajout" : "seul";
}

/** Éléments entre `from` et `to` (compris), dans l'ordre affiché. */
export function rangeOf(order: readonly string[], from: string, to: string): string[] {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (b < 0) return [];
  if (a < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/**
 * Nouvelle sélection après un clic sur `id`. `current` est l'élément ouvert (détail affiché) :
 * le premier Ctrl+clic le garde dans la sélection, comme l'élément actif de Windows.
 */
export function pick(sel: Selection, id: string, mode: PickMode, order: readonly string[], current: string | null = null): Selection {
  if (mode === "seul") return { ids: new Set([id]), anchor: id };
  const base = sel.ids.size === 0 && current && current !== id && order.includes(current) ? new Set([current]) : new Set(sel.ids);
  if (mode === "ajout") {
    if (base.has(id)) base.delete(id);
    else base.add(id);
    return { ids: base, anchor: id };
  }
  const from = sel.anchor && order.includes(sel.anchor) ? sel.anchor : (current ?? id);
  const range = rangeOf(order, from, id);
  const ids = mode === "plage-ajout" ? new Set([...base, ...range]) : new Set(range);
  return { ids, anchor: from };
}

/** Toute la liste affichée. */
export function pickAll(order: readonly string[]): Selection {
  return { ids: new Set(order), anchor: order[0] ?? null };
}

/** Sans les éléments qui ne sont plus affichés (filtre, suppression, changement de liste). */
export function prune(sel: Selection, order: readonly string[]): Selection {
  if (sel.ids.size === 0) return sel;
  const shown = new Set(order);
  const ids = [...sel.ids].filter((id) => shown.has(id));
  if (ids.length === sel.ids.size) return sel;
  return { ids: new Set(ids), anchor: sel.anchor && shown.has(sel.anchor) ? sel.anchor : null };
}

/** Les éléments sélectionnés, dans l'ordre affiché. */
export function pickedIn<T extends { id: string }>(items: readonly T[], sel: Selection): T[] {
  return items.filter((item) => sel.ids.has(item.id));
}
