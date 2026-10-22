/** Rappel donné d'office aux tâches qui reçoivent une heure (Paramètres › Rappels). */
import { readPref, writePref } from "../lib/storage";
import { reminderChoices } from "./reminders";

const KEY = "rappelParDefaut";
/** « À l'échéance » : une tâche à 14:00 prévient à 14:00. */
const DEFAULT = 0;

function isChoice(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && reminderChoices(true).includes(value));
}

export function readDefaultReminder(): number | null {
  return readPref(KEY, DEFAULT, isChoice);
}

export function writeDefaultReminder(minutes: number | null): void {
  writePref(KEY, minutes);
}
