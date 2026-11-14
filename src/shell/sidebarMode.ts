/**
 * Forme de la barre latérale (préférence `barreLaterale`) : « ouverte », « reduite » aux icônes, ou
 * « masquee » sur le bord de la fenêtre, un mince liseré de verre. Réduite ou masquée, elle se
 * déploie par-dessus le contenu au survol, sans le décaler. Ctrl+Maj+M, son bouton et la palette
 * passent d'ouverte à la forme repliée choisie (préférence `barreLateraleRepli`) ;
 * Paramètres › Modules propose les trois.
 */
import { useSyncExternalStore } from "react";
import { readPref, writePref } from "../lib/storage";

export type SidebarMode = "ouverte" | "reduite" | "masquee";
export type FoldedMode = Exclude<SidebarMode, "ouverte">;

const KEY = "barreLaterale";
const FOLD_KEY = "barreLateraleRepli";
const isMode = (v: unknown): v is SidebarMode => v === "ouverte" || v === "reduite" || v === "masquee";
const isFolded = (v: unknown): v is FoldedMode => v === "reduite" || v === "masquee";

let mode: SidebarMode = readPref(KEY, "ouverte", isMode);
/** Forme repliée retenue, reprise par Ctrl+Maj+M. */
let folded: FoldedMode = isFolded(mode) ? mode : readPref(FOLD_KEY, "reduite", isFolded);
const listeners = new Set<() => void>();

export const sidebarMode = (): SidebarMode => mode;

export function setSidebarMode(next: SidebarMode): void {
  if (next === mode) return;
  mode = next;
  writePref(KEY, next);
  if (isFolded(next) && next !== folded) {
    folded = next;
    writePref(FOLD_KEY, next);
  }
  listeners.forEach((l) => l());
}

export const toggleSidebar = (): void => setSidebarMode(mode === "ouverte" ? folded : "ouverte");

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useSidebarMode = (): SidebarMode => useSyncExternalStore(subscribe, sidebarMode);
