/**
 * Réglage des jours spéciaux (pays, zones de vacances, traditions), lu dans la base chiffrée une
 * fois le compte ouvert, et partagé par tous les écrans qui affichent des dates (calendrier,
 * journal…). Voir `specialDays.ts`.
 */
import { invoke } from "@tauri-apps/api/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "../app/ToastProvider";
import { asDataError } from "../lib/dataError";
import { readPref } from "../lib/storage";
import { inTauri } from "../lib/windowControls";
import type { DayKey } from "../tasks/day";
import type { Holiday, Period } from "./holidays";
import { dayMarks, DEFAULT_DAY_SETTINGS, holidaysBetween, parseDaySettings, periodsBetween, type DayMark, type DaySettings } from "./specialDays";
import { tr } from "../i18n/i18n";

const KEY = "calendrier-jours";

interface SettingsApi {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: SettingsApi = {
  get: () => call("setting_get", { key: KEY }),
  set: (value) => call("setting_set", { key: KEY, value }),
};

/** Aperçu dans un navigateur (développement) : le réglage reste en mémoire. */
function createPreviewApi(): SettingsApi {
  let saved: string | null = null;
  return {
    get: async () => saved,
    set: async (value) => void (saved = value),
  };
}

export const specialDaysApi: SettingsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();

/** Avant ce réglage, la case « Jours fériés » du calendrier pouvait masquer les jours fériés. */
function initialSettings(): DaySettings {
  const old = readPref<Record<string, unknown>>("calendrier", {}, (v): v is Record<string, unknown> => typeof v === "object" && v !== null);
  return old.showHolidays === false ? { ...DEFAULT_DAY_SETTINGS, country: "aucun" } : DEFAULT_DAY_SETTINGS;
}

interface SpecialDaysValue {
  settings: DaySettings;
  change: (changes: Partial<DaySettings>) => void;
  holidays: (from: DayKey, to: DayKey) => Holiday[];
  periods: (from: DayKey, to: DayKey) => Period[];
  marks: (from: DayKey, to: DayKey) => Map<DayKey, DayMark>;
}

const SpecialDaysContext = createContext<SpecialDaysValue | null>(null);

export function SpecialDaysProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const [settings, setSettings] = useState<DaySettings>(initialSettings);
  const current = useRef(settings);
  current.current = settings;

  useEffect(() => {
    let live = true;
    specialDaysApi
      .get()
      .then((saved) => {
        if (!live) return;
        if (saved) setSettings(parseDaySettings(JSON.parse(saved)));
        // Ancienne case décochée : le choix est gardé dans la base, la préférence disparaîtra.
        else if (current.current.country !== DEFAULT_DAY_SETTINGS.country) void specialDaysApi.set(JSON.stringify(current.current)).catch(() => {});
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const change = useCallback(
    (changes: Partial<DaySettings>) => {
      const next = parseDaySettings({ ...current.current, ...changes });
      current.current = next;
      setSettings(next);
      specialDaysApi.set(JSON.stringify(next)).catch(() => notify(tr("Réglage du calendrier non enregistré.")));
    },
    [notify],
  );

  const value = useMemo<SpecialDaysValue>(
    () => ({
      settings,
      change,
      holidays: (from, to) => holidaysBetween(settings, from, to),
      periods: (from, to) => periodsBetween(settings, from, to),
      marks: (from, to) => dayMarks(settings, from, to),
    }),
    [settings, change],
  );

  return <SpecialDaysContext.Provider value={value}>{children}</SpecialDaysContext.Provider>;
}

export function useSpecialDays(): SpecialDaysValue {
  const ctx = useContext(SpecialDaysContext);
  if (!ctx) throw new Error("useSpecialDays doit être utilisé dans SpecialDaysProvider");
  return ctx;
}

/** Hors de la fenêtre principale (fenêtre de capture…), pas de jours spéciaux. */
export function useSpecialDaysIfAny(): SpecialDaysValue | null {
  return useContext(SpecialDaysContext);
}
