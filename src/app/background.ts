/**
 * Aqueli en arrière-plan : réglages partagés avec le cœur (Paramètres › Rappels), événements
 * de l'icône près de l'horloge et des notifications, lancement au démarrage de Windows.
 * Hors de Tauri (aperçu dans un navigateur), tout est sans effet.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readPref, writePref } from "../lib/storage";
import { inTauri } from "../lib/windowControls";

/** Événements envoyés par le cœur (src-tauri/src/system/background.rs et notify.rs). */
export const APP_EVENTS = {
  /** La fenêtre vient d'être montrée (icône, notification, second lancement). */
  shown: "fenetre-affichee",
  /** Fenêtre fermée : Aqueli reste en arrière-plan, verrouillé. */
  backgroundLock: "verrouillage-arriere-plan",
  /** Un élément de la capture rapide vient d'entrer dans la base (« task », « note », « event »). */
  captured: "capture-ajoutee",
  lockRequest: "verrouillage-demande",
  /** « Terminé » sur une notification (identifiant de la tâche). */
  reminderDone: "rappel-terminer",
  /** Clic sur une notification (identifiant de la tâche). */
  reminderOpen: "rappel-ouvrir",
} as const;

/** Écoute un événement du cœur ; renvoie de quoi arrêter l'écoute. */
export function onAppEvent<T = unknown>(name: string, handler: (payload: T) => void): () => void {
  if (!inTauri) return () => {};
  let stopped = false;
  let unlisten: (() => void) | undefined;
  listen<T>(name, (event) => handler(event.payload))
    .then((fn) => {
      if (stopped) fn();
      else unlisten = fn;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    unlisten?.();
  };
}

/** Éléments ajoutés ou retirés hors de leur écran (import) : les listes se relisent. */
const DATA_EVENT = "aqueli:donnees";

export type DataKind = "task" | "event" | "obligation" | "note" | "journal" | "habit" | "project" | "contact" | "document" | "list" | "goal" | "transaction";

export function announceData(kinds: readonly DataKind[]): void {
  window.dispatchEvent(new CustomEvent<readonly DataKind[]>(DATA_EVENT, { detail: kinds }));
}

/** Appelle `handler` quand des éléments de ce type arrivent de la capture rapide ou d'un import. */
export function onDataAdded(kind: DataKind, handler: () => void): () => void {
  const local = (e: Event) => {
    if ((e as CustomEvent<readonly DataKind[]>).detail?.includes(kind)) handler();
  };
  window.addEventListener(DATA_EVENT, local);
  const stop = onAppEvent<string>(APP_EVENTS.captured, (captured) => {
    if (captured === kind) handler();
  });
  return () => {
    window.removeEventListener(DATA_EVENT, local);
    stop();
  };
}

export interface BackgroundPrefs {
  /** Fermer la fenêtre garde Aqueli en arrière-plan. */
  keepInBackground: boolean;
  /** Les notifications montrent le titre des tâches même quand Aqueli est verrouillé. */
  showTitlesWhenLocked: boolean;
}

const DEFAULTS: BackgroundPrefs = { keepInBackground: true, showTitlesWhenLocked: false };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readBackgroundPrefs(): BackgroundPrefs {
  const saved = readPref<Record<string, unknown>>("arrierePlan", {}, isObject);
  return {
    keepInBackground: typeof saved.keepInBackground === "boolean" ? saved.keepInBackground : DEFAULTS.keepInBackground,
    showTitlesWhenLocked:
      typeof saved.showTitlesWhenLocked === "boolean" ? saved.showTitlesWhenLocked : DEFAULTS.showTitlesWhenLocked,
  };
}

/** Transmet les réglages au cœur (au démarrage, puis à chaque changement). */
export async function syncBackground(prefs: BackgroundPrefs = readBackgroundPrefs()): Promise<void> {
  if (!inTauri) return;
  await invoke("background_settings_set", {
    keepInBackground: prefs.keepInBackground,
    hideTitlesWhenLocked: !prefs.showTitlesWhenLocked,
  }).catch(() => {});
}

export function writeBackgroundPrefs(prefs: BackgroundPrefs): void {
  writePref("arrierePlan", prefs);
  void syncBackground(prefs);
}

let hidden: Promise<boolean> | null = null;

/** Aqueli a été lancé au démarrage de Windows, sans fenêtre. */
export function startedHidden(): Promise<boolean> {
  hidden ??= inTauri ? invoke<boolean>("app_start_hidden").catch(() => false) : Promise.resolve(false);
  return hidden;
}

export interface AutostartStatus {
  /** Seulement dans la version installée. */
  supported: boolean;
  enabled: boolean;
}

export const autostart = {
  get: (): Promise<AutostartStatus> =>
    inTauri ? invoke<AutostartStatus>("autostart_get") : Promise.resolve({ supported: false, enabled: false }),
  set: (enabled: boolean): Promise<AutostartStatus> =>
    inTauri ? invoke<AutostartStatus>("autostart_set", { enabled }) : Promise.resolve({ supported: false, enabled: false }),
};

export function testNotification(): Promise<void> {
  return inTauri ? invoke<void>("reminders_test") : Promise.resolve();
}
