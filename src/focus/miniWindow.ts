/**
 * Mini-lecteur du Focus, petite fenêtre toujours visible (src-tauri/src/focus_mini.rs) : la
 * fenêtre principale lui envoie l'état du minuteur et reçoit ses boutons. Rien de personnel ne
 * passe : ni la tâche, ni les réglages.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onAppEvent } from "../app/background";
import { readPref, writePref } from "../lib/storage";
import { inTauri } from "../lib/windowControls";
import { focusStore } from "./focusStore";
import { phaseTotal, type Phase, type Status, type TimerState } from "./timer";

/** État transmis au mini-lecteur. */
export interface MiniState {
  phase: Phase;
  status: Status;
  endsAt: number | null;
  remaining: number;
  total: number;
  cycle: number;
  every: number;
  /** Séance libre : le temps écoulé s'affiche. */
  flow: boolean;
}

export const MINI_STATE_EVENT = "focus-etat";
export const MINI_COMMAND_EVENT = "focus-commande";
export type MiniAction = "basculer" | "arreter" | "passer" | "afficher" | "detacher" | "taille";

/** Les trois tailles prévues du mini-lecteur (`SIZES` de src-tauri/src/focus_mini.rs). */
export const MINI_SIZES = ["compacte", "standard", "grande"] as const;
export type MiniSize = (typeof MINI_SIZES)[number];
const SIZE_PREF = "focusMiniTaille";
const isMiniSize = (v: unknown): v is MiniSize => MINI_SIZES.includes(v as MiniSize);
export const miniSize = (): MiniSize => readPref(SIZE_PREF, "standard", isMiniSize);

/** Taille suivante (compacte › standard › grande › compacte), appliquée tout de suite. */
export function nextMiniSize(): void {
  const next = MINI_SIZES[(MINI_SIZES.indexOf(miniSize()) + 1) % MINI_SIZES.length]!;
  writePref(SIZE_PREF, next);
  if (inTauri) void invoke("focus_mini_size", { size: next }).catch(() => undefined);
}

export function miniStateOf(t: TimerState): MiniState {
  return { phase: t.phase, status: t.status, endsAt: t.endsAt, remaining: t.remaining, total: phaseTotal(t), cycle: t.cycle, every: t.plan.every, flow: t.plan.flow === true };
}

/** Minuteur reconstitué à partir de l'état reçu (pour l'anneau du mini-lecteur). */
export function timerOf(s: MiniState): TimerState {
  return {
    phase: s.phase,
    status: s.status,
    endsAt: s.endsAt,
    remaining: s.remaining,
    cycle: s.cycle,
    startedAt: null,
    taskId: null,
    intention: null,
    plan: {
      focus: s.phase === "concentration" ? s.total / 60_000 : 25,
      pause: s.phase === "pause" ? s.total / 60_000 : 5,
      longPause: s.phase === "longue-pause" ? s.total / 60_000 : 15,
      every: s.every,
      flow: s.flow,
    },
  };
}

/** Bouton du mini-lecteur appliqué au minuteur. */
export function applyMiniAction(action: string): void {
  if (action === "basculer") focusStore.toggle();
  else if (action === "arreter") focusStore.stop();
  else if (action === "passer") focusStore.skip();
  else if (action === "detacher") pinMiniWindow(false);
  else if (action === "afficher") backInAqueli();
  else if (action === "taille") nextMiniSize();
}

/** Une séance est en cours, en pause ou suspendue (pas seulement prête à démarrer). */
export const sessionActive = (t: TimerState) => t.status !== "arret" || t.phase !== "concentration";

// ——— Un seul lecteur à la fois ———
// « Épinglé », le mini-lecteur sort d'Aqueli : la petite fenêtre s'affiche quand on quitte la
// fenêtre principale et se cache quand on y revient (le lecteur intégré reprend alors sa place).

const PINNED = "focusMiniEpingle";

export interface MiniWindowState {
  /** La personne veut le lecteur hors d'Aqueli. */
  pinned: boolean;
  /** La petite fenêtre est affichée : le lecteur intégré s'efface. */
  shown: boolean;
}

let mini: MiniWindowState = { pinned: readPref(PINNED, false, (v): v is boolean => typeof v === "boolean"), shown: false };
const listeners = new Set<() => void>();

// Ouvrir et fermer la petite fenêtre se font l'un après l'autre, chaque fois d'après l'état voulu
// à ce moment : un ordre arrivé en retard ne peut plus la laisser affichée en plus du lecteur
// intégré, ni la rouvrir après « Fermer ».
let windowQueue: Promise<unknown> = Promise.resolve();

function syncWindow(): void {
  windowQueue = windowQueue.then(async () => {
    if (!mini.shown) return invoke("focus_mini_close");
    await invoke("focus_mini_publish", { state: miniStateOf(focusStore.get()) });
    return invoke("focus_mini_open", { size: miniSize() });
  }).catch(() => {
    if (mini.shown) setMini({ shown: false });
  });
}

function setMini(next: Partial<MiniWindowState>): void {
  const merged = { ...mini, ...next };
  if (merged.pinned === mini.pinned && merged.shown === mini.shown) return;
  if (merged.pinned !== mini.pinned) writePref(PINNED, merged.pinned);
  const changed = merged.shown !== mini.shown;
  mini = merged;
  listeners.forEach((l) => l());
  if (changed && inTauri) syncWindow();
}

export const miniWindowState = (): MiniWindowState => mini;
export function subscribeMiniWindow(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Bouton « épingler » : la petite fenêtre s'affiche tout de suite ; « détacher » la retire. */
export function pinMiniWindow(on: boolean): void {
  if (!inTauri) return;
  setMini({ pinned: on, shown: on && sessionActive(focusStore.get()) });
}

let started = false;
/** La fenêtre principale a le premier plan. */
let focused = typeof document !== "undefined" && document.hasFocus();

/** « Ouvrir Aqueli » : la fenêtre principale revient, son lecteur intégré prend le relais, même si
 * Windows tarde à lui donner le premier plan. */
function backInAqueli(): void {
  focused = true;
  setMini({ shown: false });
}

/** Fenêtre principale : transmet chaque changement du minuteur, reçoit les boutons, et montre la
 * petite fenêtre seulement quand on a quitté Aqueli. */
export function startMiniBridge(): void {
  if (started || !inTauri) return;
  started = true;
  let last = "";
  focused = document.hasFocus();
  focusStore.subscribe(() => {
    const t = focusStore.get();
    const state = miniStateOf(t);
    const json = JSON.stringify(state);
    if (json !== last) {
      last = json;
      invoke("focus_mini_publish", { state }).catch(() => undefined);
    }
    if (!sessionActive(t)) setMini({ shown: false });
    else if (mini.pinned && !focused) setMini({ shown: true });
  });
  void getCurrentWindow()
    .onFocusChanged(({ payload }) => {
      focused = payload;
      // De retour dans Aqueli : le lecteur intégré reprend ; en partant : la petite fenêtre.
      if (focused) setMini({ shown: false });
      else if (mini.pinned && sessionActive(focusStore.get())) setMini({ shown: true });
    })
    .catch(() => undefined);
  onAppEvent<string>(MINI_COMMAND_EVENT, applyMiniAction);
}
