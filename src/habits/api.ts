/** Habitudes enregistrées dans la base chiffrée (src-tauri/src/data/habits.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey, type DayKey } from "../tasks/day";
import type { Habit, HabitCheck, HabitInput } from "./habits";

export interface HabitsApi {
  list(): Promise<Habit[]>;
  /** Jours cochés depuis `since` (compris). */
  checks(since: DayKey): Promise<HabitCheck[]>;
  create(habit: HabitInput): Promise<Habit>;
  update(id: string, habit: HabitInput): Promise<Habit>;
  archive(id: string, archived: boolean): Promise<Habit>;
  reorder(ids: string[]): Promise<void>;
  /** 0 décoche. */
  check(habitId: string, day: DayKey, value: number): Promise<HabitCheck | null>;
  /** Jour de pause (ou retrait de la pause). */
  skip(habitId: string, day: DayKey, skipped: boolean): Promise<HabitCheck | null>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<Habit>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: HabitsApi = {
  list: () => call("habits_list"),
  checks: (since) => call("habits_checks", { since }),
  create: (habit) => call("habits_create", { habit }),
  update: (id, habit) => call("habits_update", { id, habit }),
  archive: (id, archived) => call("habits_archive", { id, archived }),
  reorder: (ids) => call("habits_reorder", { ids }),
  check: (habitId, day, value) => call("habits_check", { habitId, day, value }),
  skip: (habitId, day, skipped) => call("habits_skip", { habitId, day, skipped }),
  remove: (id) => call("habits_delete", { id }),
  restore: (id) => call("habits_restore", { id }),
};

/** Habitudes d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): HabitsApi {
  const now = () => Math.floor(Date.now() / 1000);
  const today = dayKey(new Date());
  let seq = 0;
  let habits: Habit[] = [];
  const deleted = new Map<string, Habit>();
  let checks: HabitCheck[] = [];
  const make = (input: HabitInput, ageDays = 40): Habit => {
    seq += 1;
    return { ...input, moment: input.moment ?? null, id: `apercu-hab${seq}`, position: seq, archived: false, createdAt: now() - ageDays * 86_400, updatedAt: now() };
  };
  const water = make({ name: demo("Boire de l'eau", "Drink water"), icon: "sante", color: "#2d9be0", kind: "quantite", negative: false, target: 8, unit: demo("verres", "glasses"), frequency: { kind: "quotidien" }, reminder: "10:00", spaceId: "sante" });
  const walk = make({ name: demo("Marcher 30 minutes", "Walk for 30 minutes"), icon: "sport", color: "#2fae4a", kind: "oui-non", negative: false, target: 1, unit: "", frequency: { kind: "quotidien" }, reminder: null, spaceId: "perso" });
  const sport = make({ name: demo("Sport", "Exercise"), icon: "sport", color: "#e0671f", kind: "oui-non", negative: false, target: 1, unit: "", frequency: { kind: "semaine", times: 3 }, reminder: null, spaceId: "perso" });
  const read = make({ name: demo("Lire", "Read 20 pages"), icon: "livre", color: "#7a5ce6", kind: "quantite", negative: false, target: 20, unit: demo("pages", "pages"), frequency: { kind: "jours", days: [1, 3, 5, 0] }, reminder: "21:30", spaceId: "perso" });
  habits = [water, walk, sport, read];
  for (let i = 1; i <= 120; i++) {
    const day = addDays(today, -i);
    if (i % 7 !== 3) checks.push({ habitId: water.id, day, value: i % 5 === 0 ? 5 : 8 });
    if (i < 9 || i % 4 !== 0) checks.push({ habitId: walk.id, day, value: 1 });
    if (i % 2 === 0) checks.push({ habitId: sport.id, day, value: 1 });
    if (i % 3 !== 1) checks.push({ habitId: read.id, day, value: 20 });
  }
  checks.push({ habitId: water.id, day: today, value: 3 });
  const get = (id: string) => {
    const h = habits.find((x) => x.id === id);
    if (!h) throw asDataError({ code: "notFound" });
    return h;
  };
  const replace = (h: Habit) => {
    habits = habits.map((x) => (x.id === h.id ? h : x));
    return h;
  };
  return {
    list: async () => habits,
    checks: async (since) => checks.filter((c) => c.day >= since && habits.some((h) => h.id === c.habitId)),
    create: async (input) => {
      const h = make(input, 0);
      habits = [...habits, h];
      return h;
    },
    update: async (id, input) => replace({ ...get(id), ...input, updatedAt: now() }),
    archive: async (id, archived) => replace({ ...get(id), archived }),
    reorder: async (ids) => {
      habits = habits.map((h) => ({ ...h, position: ids.indexOf(h.id) }));
    },
    check: async (habitId, day, value) => {
      checks = checks.filter((c) => !(c.habitId === habitId && c.day === day));
      if (value <= 0) return null;
      const c = { habitId, day, value };
      checks.push(c);
      return c;
    },
    skip: async (habitId, day, skipped) => {
      const current = checks.find((c) => c.habitId === habitId && c.day === day);
      if (!skipped) {
        if (current?.skipped) checks = checks.filter((c) => c !== current);
        return null;
      }
      if (current) return null;
      const c = { habitId, day, value: 0, skipped: true };
      checks.push(c);
      return c;
    },
    remove: async (id) => {
      deleted.set(id, get(id));
      habits = habits.filter((h) => h.id !== id);
    },
    restore: async (id) => {
      const h = deleted.get(id);
      if (!h) throw asDataError({ code: "notFound" });
      habits = [...habits, h];
      return h;
    },
  };
}

export const habitsApi: HabitsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
