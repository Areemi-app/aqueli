/** Réglages d'affichage du calendrier, gardés d'une ouverture à l'autre. */
import { useCallback, useState } from "react";
import { readPref, writePref } from "../lib/storage";
import { isCalendarView, type CalendarView } from "./view";

export interface CalendarPrefs {
  view: CalendarView;
  /** Calendriers (espaces) décochés dans « Mes calendriers ». */
  hiddenSpaces: string[];
  showTasks: boolean;
  showObligations: boolean;
  showBirthdays: boolean;
}

const KEY = "calendrier";
const DEFAULTS: CalendarPrefs = { view: "semaine", hiddenSpaces: [], showTasks: true, showObligations: true, showBirthdays: true };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readCalendarPrefs(): CalendarPrefs {
  const saved = readPref<Record<string, unknown>>(KEY, {}, isObject);
  const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  return {
    view: isCalendarView(saved.view) ? saved.view : DEFAULTS.view,
    hiddenSpaces: Array.isArray(saved.hiddenSpaces) ? saved.hiddenSpaces.filter((s): s is string => typeof s === "string") : [],
    showTasks: bool(saved.showTasks, DEFAULTS.showTasks),
    showObligations: bool(saved.showObligations, DEFAULTS.showObligations),
    showBirthdays: bool(saved.showBirthdays, DEFAULTS.showBirthdays),
  };
}

export function useCalendarPrefs(): [CalendarPrefs, (changes: Partial<CalendarPrefs>) => void] {
  const [prefs, setPrefs] = useState(readCalendarPrefs);
  const change = useCallback((changes: Partial<CalendarPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...changes };
      writePref(KEY, next);
      return next;
    });
  }, []);
  return [prefs, change];
}
