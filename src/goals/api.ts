/** Objectifs, étapes et saisies, dans la base chiffrée (src-tauri/src/data/goals.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey } from "../tasks/day";
import { periodOf, type Goal, type GoalEntry, type GoalInput, type GoalStep } from "./goals";

export interface GoalsApi {
  list(): Promise<Goal[]>;
  create(goal: GoalInput): Promise<Goal>;
  update(id: string, goal: GoalInput): Promise<Goal>;
  remove(id: string): Promise<void>;
  /** Nouvel ordre (glisser-déposer). */
  reorder(ids: string[]): Promise<void>;
  restore(id: string): Promise<Goal>;
  steps(): Promise<GoalStep[]>;
  createStep(goalId: string, step: { title: string; dueDate: string | null }): Promise<GoalStep>;
  updateStep(id: string, step: { title: string; dueDate: string | null }): Promise<GoalStep>;
  setStepDone(id: string, done: boolean): Promise<GoalStep>;
  removeStep(id: string): Promise<void>;
  entries(): Promise<GoalEntry[]>;
  createEntry(goalId: string, entry: { day: string; value: number; note: string }): Promise<GoalEntry>;
  removeEntry(id: string): Promise<void>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: GoalsApi = {
  list: () => call("goals_list"),
  create: (goal) => call("goals_create", { goal }),
  update: (id, goal) => call("goals_update", { id, goal }),
  remove: (id) => call("goals_delete", { id }),
  reorder: (ids) => call("order_save", { kind: "objectifs", ids }),
  restore: (id) => call("goals_restore", { id }),
  steps: () => call("goal_steps_list"),
  createStep: (goalId, step) => call("goal_steps_create", { goalId, step }),
  updateStep: (id, step) => call("goal_steps_update", { id, step }),
  setStepDone: (id, done) => call("goal_steps_done", { id, done }),
  removeStep: (id) => call("goal_steps_delete", { id }),
  entries: () => call("goal_entries_list"),
  createEntry: (goalId, entry) => call("goal_entries_create", { goalId, entry }),
  removeEntry: (id) => call("goal_entries_delete", { id }),
};

/** Objectifs d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): GoalsApi {
  const now = () => Math.floor(Date.now() / 1000);
  const today = dayKey(new Date());
  let seq = 0;
  const id = (p: string) => `apercu-${p}${++seq}`;
  const year = periodOf("annee", today);
  const quarter = periodOf("trimestre", today);
  const make = (input: GoalInput, position: number): Goal => ({ ...input, id: id("g"), position, createdAt: now(), updatedAt: now() });
  let goals: Goal[] = [
    make({ title: demo("Lire 20 livres", "Read 20 books"), why: demo("Retrouver le goût de la lecture, le soir plutôt que les écrans.", "Get back into reading, in the evening rather than on screens."), horizon: "annee", startDate: year.start, targetDate: year.end, metric: "manuel", target: 20, unit: demo("livres", "books"), habitId: null, status: "en-cours", color: "#e0671f", icon: "livre", spaceId: "perso" }, 0),
    make({ title: demo("Préparer le déménagement", "Get ready for the move"), why: "", horizon: "trimestre", startDate: quarter.start, targetDate: quarter.end, metric: "etapes", target: null, unit: "", habitId: null, status: "en-cours", color: "#6d5ce0", icon: "maison", spaceId: "famille" }, 1),
    make({ title: demo("Courir 100 km", "Run 100 km"), why: demo("Être prêt pour la course de printemps.", "Be ready for the spring 10K."), horizon: "libre", startDate: addDays(today, -40), targetDate: addDays(today, 60), metric: "manuel", target: 100, unit: "km", habitId: null, status: "en-cours", color: "#2fae4a", icon: "sport", spaceId: "sante" }, 2),
  ];
  const [lire, demenager, courir] = goals as [Goal, Goal, Goal];
  let steps: GoalStep[] = [
    { id: id("s"), goalId: demenager.id, title: demo("Trouver le logement", "Find a flat"), dueDate: addDays(today, -20), doneAt: now() - 864_000, position: 0 },
    { id: id("s"), goalId: demenager.id, title: demo("Signer le bail", "Sign the tenancy agreement"), dueDate: addDays(today, -3), doneAt: now() - 200_000, position: 1 },
    { id: id("s"), goalId: demenager.id, title: demo("Faire les cartons", "Pack the boxes"), dueDate: addDays(today, 20), doneAt: null, position: 2 },
    { id: id("s"), goalId: demenager.id, title: demo("Emménager", "Move in"), dueDate: addDays(today, 30), doneAt: null, position: 3 },
  ];
  let entries: GoalEntry[] = [
    ...[2, 3, 1, 2, 3].map((value, i) => ({ id: id("e"), goalId: lire.id, day: addDays(today, -200 + i * 40), value, note: "", createdAt: now() })),
    ...[8, 10, 12, 6, 15].map((value, i) => ({ id: id("e"), goalId: courir.id, day: addDays(today, -35 + i * 7), value, note: "", createdAt: now() })),
  ];
  const deleted = new Map<string, Goal>();
  return {
    list: async () => goals,
    create: async (input) => {
      const g = make(input, goals.length);
      goals = [...goals, g];
      return g;
    },
    update: async (gid, input) => {
      const g = { ...goals.find((x) => x.id === gid)!, ...input, updatedAt: now() };
      goals = goals.map((x) => (x.id === gid ? g : x));
      return g;
    },
    reorder: async (ids) => {
      goals = goals.map((x) => (ids.includes(x.id) ? { ...x, position: ids.indexOf(x.id) } : x)).sort((a, b) => a.position - b.position);
    },
    remove: async (gid) => {
      const g = goals.find((x) => x.id === gid);
      if (!g) throw asDataError({ code: "notFound" });
      deleted.set(gid, g);
      goals = goals.filter((x) => x.id !== gid);
    },
    restore: async (gid) => {
      const g = deleted.get(gid);
      if (!g) throw asDataError({ code: "notFound" });
      goals = [...goals, g];
      return g;
    },
    steps: async () => steps.filter((s) => goals.some((g) => g.id === s.goalId)),
    createStep: async (goalId, input) => {
      const s = { ...input, id: id("s"), goalId, doneAt: null, position: steps.filter((x) => x.goalId === goalId).length };
      steps = [...steps, s];
      return s;
    },
    updateStep: async (sid, input) => {
      const s = { ...steps.find((x) => x.id === sid)!, ...input };
      steps = steps.map((x) => (x.id === sid ? s : x));
      return s;
    },
    setStepDone: async (sid, done) => {
      const s = { ...steps.find((x) => x.id === sid)!, doneAt: done ? now() : null };
      steps = steps.map((x) => (x.id === sid ? s : x));
      return s;
    },
    removeStep: async (sid) => {
      steps = steps.filter((x) => x.id !== sid);
    },
    entries: async () => entries.filter((e) => goals.some((g) => g.id === e.goalId)),
    createEntry: async (goalId, input) => {
      const e = { ...input, id: id("e"), goalId, createdAt: now() };
      entries = [...entries, e];
      return e;
    },
    removeEntry: async (eid) => {
      entries = entries.filter((x) => x.id !== eid);
    },
  };
}

export const goalsApi: GoalsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
