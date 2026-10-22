/** Commandes de la capture rapide et de son raccourci global (src-tauri/src/capture.rs). */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../lib/windowControls";
import type { Capture } from "./buildCapture";
import { tr } from "../i18n/i18n";

/** Enregistré tout de suite, ou en attente du déverrouillage. */
export type Outcome = "saved" | "pending";

export interface CaptureStatus {
  locked: boolean;
  pending: number;
}

/** Combinaison de touches ; `key` : code de touche virtuelle de Windows. */
export interface Hotkey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  win: boolean;
  key: number;
}

/** Ctrl+Alt+A (« A comme Aqueli ») : libre chez les assistants (Ctrl+Alt+Espace, Alt+Espace…) et
 * sans caractère sur AltGr+A au clavier AZERTY. */
export const DEFAULT_HOTKEY: Hotkey = { ctrl: true, alt: true, shift: false, win: false, key: 0x41 };

/** Le raccourci vient de changer (Paramètres › Clavier). */
const HOTKEY_CHANGED = "aqueli:raccourci-capture";

export function onHotkeyChange(listener: () => void): () => void {
  window.addEventListener(HOTKEY_CHANGED, listener);
  return () => window.removeEventListener(HOTKEY_CHANGED, listener);
}

/** Préférence lue par le cœur au démarrage. */
export const HOTKEY_PREF = "raccourciCapture";

export const captureApi = {
  submit: (capture: Capture): Promise<Outcome> =>
    inTauri ? invoke<Outcome>("capture_submit", { capture }) : Promise.resolve("saved"),
  status: (): Promise<CaptureStatus> =>
    inTauri ? invoke<CaptureStatus>("capture_status") : Promise.resolve({ locked: false, pending: 0 }),
  hide: (): Promise<void> => (inTauri ? invoke<void>("capture_hide") : Promise.resolve()),
  show: (): Promise<void> => (inTauri ? invoke<void>("capture_show") : Promise.resolve()),
  hotkey: (): Promise<Hotkey | null> => (inTauri ? invoke<Hotkey | null>("hotkey_get") : Promise.resolve(DEFAULT_HOTKEY)),
  setHotkey: async (hotkey: Hotkey): Promise<void> => {
    if (inTauri) await invoke<void>("hotkey_set", { hotkey });
    window.dispatchEvent(new Event(HOTKEY_CHANGED));
  },
};

/** Nom d'une touche d'après son code virtuel (Espace, A, 7, F5…). */
export function keyName(code: number): string {
  if (code === 0x20) return tr("Espace|touche");
  if (code >= 0x70 && code <= 0x7b) return `F${code - 0x6f}`;
  return String.fromCharCode(code);
}

/** Touches d'un raccourci, dans l'ordre de Windows : Ctrl, Alt, Maj, Windows, touche. */
export function hotkeyKeys(h: Hotkey): string[] {
  return [...(h.ctrl ? ["Ctrl"] : []), ...(h.alt ? ["Alt"] : []), ...(h.shift ? [tr("Maj")] : []), ...(h.win ? ["Windows"] : []), keyName(h.key)];
}

/** Raccourci saisi au clavier, s'il est accepté (Ctrl, Alt ou Windows, et une lettre, un
 * chiffre, Espace ou F1 à F12). */
export function hotkeyFromEvent(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): Hotkey | null {
  let key: number | null = null;
  const letter = /^Key([A-Z])$/.exec(e.code);
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  const fkey = /^F([1-9]|1[0-2])$/.exec(e.code);
  if (e.code === "Space") key = 0x20;
  else if (letter?.[1]) key = letter[1].charCodeAt(0);
  else if (digit?.[1]) key = 0x30 + Number(digit[1]);
  else if (fkey?.[1]) key = 0x6f + Number(fkey[1]);
  if (key === null || !(e.ctrlKey || e.altKey || e.metaKey)) return null;
  return { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, win: e.metaKey, key };
}
