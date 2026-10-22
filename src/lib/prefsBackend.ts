/**
 * Où ranger les préférences : le fichier preferences.json dans l'application ; le stockage
 * du navigateur pour l'aperçu de développement (hors de Tauri).
 */
import { invoke } from "@tauri-apps/api/core";
import type { Prefs, PrefsBackend } from "./storage";
import { inTauri } from "./windowControls";

const tauriBackend: PrefsBackend = {
  load: () => invoke<Prefs>("prefs_load"),
  save: (prefs) => invoke<void>("prefs_save", { prefs }),
};

const PREVIEW_KEY = "aqueli-apercu.preferences";

function createPreviewBackend(): PrefsBackend {
  return {
    load: async () => {
      const raw = window.localStorage.getItem(PREVIEW_KEY);
      return raw ? (JSON.parse(raw) as Prefs) : {};
    },
    save: async (prefs) => window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(prefs)),
  };
}

export const prefsBackend: PrefsBackend = inTauri || !import.meta.env.DEV ? tauriBackend : createPreviewBackend();
