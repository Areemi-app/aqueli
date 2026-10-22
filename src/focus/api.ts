/** Séances de Focus enregistrées dans la base chiffrée (src-tauri/src/data/focus.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey, type DayKey } from "../tasks/day";

export interface FocusSession {
  id: number;
  taskId: string | null;
  day: DayKey;
  /** Début, en secondes Unix. */
  startedAt: number;
  minutes: number;
  /** Intention donnée avant la séance. */
  note: string | null;
}

export interface FocusApi {
  /** Séances depuis `since` (compris), de la plus ancienne à la plus récente. */
  list(since: DayKey): Promise<FocusSession[]>;
  add(taskId: string | null, day: DayKey, startedAt: number, minutes: number, note: string | null): Promise<FocusSession>;
  remove(id: number): Promise<void>;
  /** Minutes de concentration par tâche. */
  byTask(): Promise<[string, number][]>;
  /** « Ne pas déranger » : les rappels attendent jusqu'à `until` (secondes Unix). */
  quiet(until: number | null): Promise<void>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: FocusApi = {
  list: (since) => call("focus_list", { since }),
  add: (taskId, day, startedAt, minutes, note) => call("focus_add", { taskId, day, startedAt, minutes, note }),
  remove: (id) => call("focus_delete", { id }),
  byTask: () => call("focus_by_task"),
  quiet: (until) => call("reminders_quiet", { until }),
};

/** Séances d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): FocusApi {
  const today = dayKey(new Date());
  let seq = 0;
  let sessions: FocusSession[] = [];
  const minutesFor = [50, 75, 0, 100, 25, 125, 50, 25, 75, 0, 50, 100, 25, 75];
  minutesFor.forEach((total, i) => {
    const day = addDays(today, -(minutesFor.length - i));
    for (let left = total; left > 0; left -= 25) {
      seq += 1;
      sessions.push({ id: seq, taskId: null, day, startedAt: Math.floor(Date.now() / 1000) - (minutesFor.length - i) * 86_400, minutes: 25, note: null });
    }
  });
  return {
    list: async (since) => sessions.filter((s) => s.day >= since),
    add: async (taskId, day, startedAt, minutes, note) => {
      seq += 1;
      const s = { id: seq, taskId, day, startedAt, minutes, note: note?.trim() ? note.trim() : null };
      sessions = [...sessions, s];
      return s;
    },
    remove: async (id) => {
      sessions = sessions.filter((s) => s.id !== id);
    },
    byTask: async () => {
      const map = new Map<string, number>();
      for (const s of sessions) if (s.taskId) map.set(s.taskId, (map.get(s.taskId) ?? 0) + s.minutes);
      return [...map];
    },
    quiet: async () => {},
  };
}

export const focusApi: FocusApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
