/**
 * Boutons de la fenêtre (réduire, agrandir, fermer). Hors de Tauri (aperçu dans un
 * navigateur pendant le développement), ces fonctions ne font rien.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const inTauri = isTauri();

export async function minimizeWindow(): Promise<void> {
  if (inTauri) await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (inTauri) await getCurrentWindow().toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  if (inTauri) await getCurrentWindow().close();
}

/**
 * La fenêtre reste cachée tant que l'interface n'est pas dessinée : pas de flash blanc. Une fois
 * affichée, elle prend le mode discret (le cœur ne l'applique pas à une fenêtre cachée).
 */
export async function revealWindow(): Promise<void> {
  if (!inTauri) return;
  const win = getCurrentWindow();
  await win.show();
  await win.setFocus();
  await invoke("discreet_window").catch(() => {});
}

/** Prévient quand la fenêtre passe de « agrandie » à « normale » et inversement. */
export function watchMaximized(onChange: (maximized: boolean) => void): () => void {
  if (!inTauri) return () => {};
  const win = getCurrentWindow();
  let stopped = false;
  let unlisten: (() => void) | undefined;
  const refresh = () => {
    win
      .isMaximized()
      .then((m) => {
        if (!stopped) onChange(m);
      })
      .catch(() => {});
  };
  refresh();
  win
    .onResized(refresh)
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

let maximizedBeforeFullscreen = false;

/**
 * Plein écran (aquarium du Focus). Une fenêtre agrandie est d'abord rendue à sa taille
 * normale : sinon Windows laisse la barre des tâches par-dessus. Elle est agrandie de
 * nouveau en sortant.
 */
export function setFullscreen(on: boolean): Promise<void> {
  if (!inTauri) return Promise.resolve();
  // Les demandes passent l'une après l'autre : jamais d'entrée et de sortie mêlées.
  const run = fullscreenQueue.then(() => applyFullscreen(on));
  fullscreenQueue = run.catch(() => {});
  return run;
}

let fullscreenQueue: Promise<void> = Promise.resolve();

async function applyFullscreen(on: boolean): Promise<void> {
  const win = getCurrentWindow();
  if ((await win.isFullscreen()) === on) return;
  if (on) {
    maximizedBeforeFullscreen = await win.isMaximized();
    if (maximizedBeforeFullscreen) await win.unmaximize();
    await win.setFullscreen(true);
    await win.setFocus();
  } else {
    await win.setFullscreen(false);
    if (maximizedBeforeFullscreen) await win.maximize();
    maximizedBeforeFullscreen = false;
  }
}
