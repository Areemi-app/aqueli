/**
 * Export des tâches en tableau CSV (séparateur « ; », UTF-8 avec BOM pour Excel), aux colonnes
 * du modèle d'import « Tâches » : le fichier se retravaille puis se réimporte tel quel. Colonnes et
 * valeurs en français, ou en anglais dans toute autre langue ; l'import lit les deux. Fonctions pures.
 */
import type { Space } from "../spaces/spaces";
import { lang, trExport } from "../i18n/i18n";
import { recurrenceLabel, recurrenceLabelEn } from "./recurrence";
import type { Task } from "./tasks";

/** Colonnes du modèle d'import « Tâches », puis l'identifiant (mise à jour à la réimportation). */
export const TASK_CSV_COLUMNS = ["Titre", "Échéance", "Heure", "Commencer le", "Priorité", "Étiquettes", "Espace", "Durée", "Rappel", "Répétition", "Sous-tâches", "Notes", "Identifiant"] as const;

const PRIORITY_WORDS = ["", "basse", "moyenne", "haute"] as const;
const PRIORITY_WORDS_EN = ["", "low", "medium", "high"] as const;
// Hors du français, l'export est en anglais : l'import le relit dans les deux langues.
const en = () => lang() !== "fr";

const cell = (text: string) => (/[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
const frDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** « 45 min », « 1 h 30 », « 2 h », « 1 j ». */
export function durationText(minutes: number): string {
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} ${en() ? "d" : "j"}`;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function toTasksCsv(tasks: readonly Task[], spaces: readonly Pick<Space, "id" | "name">[]): string {
  const rows = tasks.map((t) =>
    [
      t.title,
      t.dueDate ? frDay(t.dueDate) : "",
      t.dueDate && t.dueTime ? t.dueTime : "",
      t.startDate ? frDay(t.startDate) : "",
      (en() ? PRIORITY_WORDS_EN : PRIORITY_WORDS)[t.priority],
      t.tags.map((x) => `#${x}`).join(" "),
      spaces.find((s) => s.id === t.spaceId)?.name ?? "",
      t.estimate ? durationText(t.estimate) : "",
      // Un rappel n'a de sens qu'avec une échéance ; « aucun » évite le rappel par défaut à la réimportation.
      !t.dueDate ? "" : t.reminder === null ? (t.dueTime ? (en() ? "none" : "aucun") : "") : t.reminder === 0 ? (en() ? "on time" : "à l'heure") : durationText(t.reminder),
      t.recurrence ? (en() ? recurrenceLabelEn(t.recurrence) : recurrenceLabel(t.recurrence)) : "",
      t.subtasks.map((s) => s.title.replace(/;/g, ",")).join("; "),
      t.notes,
      t.id,
    ]
      .map(cell)
      .join(";"),
  );
  return `﻿${[TASK_CSV_COLUMNS.map((c) => trExport(c)).join(";"), ...rows].join("\r\n")}\r\n`;
}
