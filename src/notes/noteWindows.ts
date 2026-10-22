/**
 * Notes ouvertes dans leur propre fenêtre (src-tauri/src/note_window.rs). La fenêtre principale
 * suit la liste de ces notes, relit une note modifiée ailleurs et ouvre celle qu'on lui demande ;
 * une fenêtre de note signale l'activité de la personne et enregistre avant un verrouillage.
 */
import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { onAppEvent } from "../app/background";
import { inTauri } from "../lib/windowControls";

const LIST_EVENT = "notes-fenetres";
const SAVED_EVENT = "note-enregistree";
const OPEN_EVENT = "note-ouvrir";
const ACTIVITY_EVENT = "activite";
const FLUSH_EVENT = "note-enregistrer";

/** Fenêtre d'une note : « #note=<identifiant> ». */
export function noteWindowId(hash: string = window.location.hash): string | null {
  const m = /^#note=([A-Za-z0-9_-]{1,64})$/.exec(hash);
  return m ? m[1]! : null;
}

export const isNoteWindow = () => noteWindowId() !== null;

// ——— Fenêtre principale ———

let detached: readonly string[] = [];
const listeners = new Set<() => void>();

function setDetached(ids: readonly string[]): void {
  detached = [...ids];
  listeners.forEach((l) => l());
}

/** Notes ouvertes à part, tenues à jour par le cœur. */
export function useDetachedNotes(): readonly string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => detached,
  );
}

/** Suit les fenêtres de note (à lancer une fois, dans la fenêtre principale). */
export function watchNoteWindows(): () => void {
  if (!inTauri) return () => {};
  void invoke<string[]>("note_windows_list")
    .then(setDetached)
    .catch(() => {});
  return onAppEvent<string[]>(LIST_EVENT, setDetached);
}

export async function openNoteWindow(id: string, title: string): Promise<boolean> {
  if (!inTauri) return false;
  await invoke("note_window_open", { id, title });
  return true;
}

export async function closeNoteWindow(id: string): Promise<void> {
  if (inTauri) await invoke("note_window_close", { id });
}

/** Avant un verrouillage : les fenêtres de note enregistrent ce qui est en cours. */
export async function flushNoteWindows(): Promise<void> {
  if (inTauri && detached.length > 0) await invoke("note_windows_flush").catch(() => {});
}

export const onNoteChangedElsewhere = (handler: (id: string) => void) => onAppEvent<string>(SAVED_EVENT, handler);
export const onOpenNoteRequest = (handler: (id: string) => void) => onAppEvent<string>(OPEN_EVENT, handler);
export const onActivityElsewhere = (handler: () => void) => onAppEvent<null>(ACTIVITY_EVENT, () => handler());

// ——— Fenêtre d'une note ———

let lastActivity = 0;

/** Signale l'activité de la personne (au plus deux fois par minute). */
export function reportActivity(): void {
  const now = Date.now();
  if (!inTauri || now - lastActivity < 30_000) return;
  lastActivity = now;
  void invoke("note_window_activity").catch(() => {});
}

/** Ouvre une note dans la fenêtre principale ; `close` : cette fenêtre se ferme. */
export function showInMain(id: string, close: boolean): void {
  if (inTauri) void invoke("note_window_show_in_main", { id, close }).catch(() => {});
}

export const onFlushRequest = (handler: () => void) => onAppEvent<null>(FLUSH_EVENT, () => handler());
