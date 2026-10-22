/** Bannière illustrée du thème : affichée ou non (préférence « banniere », affichée par défaut). */
import { useSyncExternalStore } from "react";
import { readPref, writePref } from "../lib/storage";
import { usePreferences } from "../prefs/PreferencesProvider";
import { bannerImage, hasBanner } from "./banners";
import { useTheme } from "./ThemeProvider";

const PREF = "banniere";
const listeners = new Set<() => void>();
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

export function bannerEnabled(): boolean {
  return readPref(PREF, true, isBool);
}

export function setBannerEnabled(on: boolean): void {
  writePref(PREF, on);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBannerEnabled(): boolean {
  return useSyncExternalStore(subscribe, bannerEnabled);
}

/**
 * Bannière à peindre dans la barre de titre (thème personnel : celle de son thème de départ, sauf
 * s'il a un fond d'écran). Aucune en contraste élevé : la barre garde alors son fond opaque.
 */
export function useThemeBanner(): string | null {
  const { theme, customThemes } = useTheme();
  const { prefs, system } = usePreferences();
  const on = useBannerEnabled();
  if (!on || prefs.highContrast || system.highContrast) return null;
  const custom = customThemes.find((c) => c.id === theme.id);
  const id = custom ? (custom.wallpaper ? null : custom.base) : theme.id;
  return id && hasBanner(id) ? bannerImage(id) : null;
}
