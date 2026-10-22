/** Rappels confiés au cœur (src-tauri/src/reminders.rs), qui affiche les notifications. */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../lib/windowControls";
import type { ScheduledReminder } from "./reminders";

export async function syncReminders(reminders: ScheduledReminder[]): Promise<void> {
  if (inTauri) await invoke("reminders_sync", { reminders });
}

/** Période pendant laquelle Aqueli ne tournait pas (secondes Unix), ou `null`. */
export async function missedWindow(): Promise<{ since: number; until: number } | null> {
  if (!inTauri) return null;
  return invoke<{ since: number; until: number }>("reminders_missed");
}
