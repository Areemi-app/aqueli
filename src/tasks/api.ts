/** Tâches enregistrées dans la base chiffrée (commandes du cœur, src-tauri/src/data/tasks.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError, type DataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { addDays, addMonths, dayKey, fromDayKey, type DayKey } from "./day";
import type { Recurrence } from "./recurrence";
import type { Task, TaskInput } from "./tasks";

/** Résultat de l'achèvement (ou de la réouverture) d'une tâche. */
export interface DoneResult {
  task: Task;
  /** Occurrence suivante créée par l'achèvement d'une tâche répétée. */
  created: Task | null;
  /** Occurrence suivante retirée parce que la tâche a été rouverte. */
  removed: string | null;
}

/** Tâche terminée avant la fenêtre chargée : de quoi compter l'avancement et les statistiques. */
export interface DoneTask {
  id: string;
  doneAt: number;
  spaceId: string | null;
  projectId: string | null;
}

/** `today` : date du jour sur ce PC, pour les échéances des tâches répétées. */
export interface TasksApi {
  /** Tâches à faire, et terminées depuis `doneSince` (secondes Unix). */
  list(doneSince: number): Promise<Task[]>;
  /** Tâches terminées avant `before` (secondes Unix). */
  doneBefore(before: number): Promise<DoneTask[]>;
  create(task: TaskInput, today: DayKey): Promise<Task>;
  update(id: string, task: TaskInput, today: DayKey): Promise<Task>;
  setDone(id: string, done: boolean, today: DayKey): Promise<DoneResult>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<Task>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: TasksApi = {
  list: (doneSince) => call("tasks_list", { doneSince }),
  doneBefore: (before) => call("tasks_done_before", { before }),
  create: (task, today) => call("tasks_create", { task, today }),
  update: (id, task, today) => call("tasks_update", { id, task, today }),
  setDone: (id, done, today) => call("tasks_set_done", { id, done, today }),
  remove: (id) => call("tasks_delete", { id }),
  restore: (id) => call("tasks_restore", { id }),
};

/** Échéance suivante, calcul simplifié pour l'aperçu (le vrai calcul est dans le cœur). */
function previewNext(rule: Recurrence, due: DayKey | null, today: DayKey): DayKey {
  if (rule.kind === "afterDone") return addDays(today, rule.days);
  const from = due && due > today ? due : today;
  if (rule.kind === "monthly" || rule.kind === "monthlyNth") return addMonths(from, rule.interval);
  if (rule.kind === "yearly") return addMonths(from, 12 * rule.interval);
  if (rule.kind === "daily") return addDays(from, rule.interval);
  const days = rule.kind === "weekdays" ? [1, 2, 3, 4, 5] : rule.days;
  for (let n = 1; n <= 14; n++) {
    const candidate = addDays(from, n);
    if (days.includes(fromDayKey(candidate).getDay())) return candidate;
  }
  return addDays(from, 7);
}

/** Tâches d'exemple en mémoire pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): TasksApi {
  const now = () => Math.floor(Date.now() / 1000);
  const today = dayKey(new Date());
  let seq = 0;
  const make = (title: string, extra: Partial<Task> = {}): Task => {
    seq += 1;
    return {
      id: `apercu${seq}`,
      title,
      notes: "",
      spaceId: "perso",
      dueDate: null,
      dueTime: null,
      startDate: null,
      priority: 0,
      estimate: null,
      tags: [],
      subtasks: [],
      recurrence: null,
      color: null,
      reminder: null,
      inbox: false,
      projectId: null,
      doing: false,
      doneAt: null,
      createdAt: now() - 1000 + seq,
      updatedAt: now() - 1000 + seq,
      ...extra,
    };
  };
  let tasks: Task[] = [
    make(demo("Renouveler l'ordonnance", "Renew the prescription"), { dueDate: addDays(today, -1), spaceId: "sante" }),
    make(demo("Appeler le garage", "Call the garage"), { dueDate: today, dueTime: "14:00", priority: 3, tags: [demo("voiture", "car")], reminder: 60 }),
    make(demo("Envoyer le dossier mutuelle", "Send the health insurance claim"), { dueDate: today, spaceId: "sante" }),
    make(demo("Préparer la réunion de lundi", "Prepare Monday's meeting"), {
      dueDate: today,
      dueTime: "16:00",
      priority: 2,
      spaceId: "travail",
      estimate: 90,
      tags: [demo("réunion", "meeting")],
      notes: demo("Points à aborder : budget, planning, recrutement.", "Topics to cover: budget, schedule, hiring."),
      subtasks: [
        { id: "s1", title: demo("Relire le compte rendu précédent", "Reread last week's minutes"), done: true },
        { id: "s2", title: demo("Lister les points à aborder", "List the topics to cover"), done: true },
        { id: "s3", title: demo("Préparer les chiffres du trimestre", "Prepare the quarterly figures"), done: false },
        { id: "s4", title: demo("Envoyer l'ordre du jour", "Send the agenda"), done: false },
      ],
    }),
    make(demo("Arroser les plantes", "Water the plants"), {
      dueDate: today,
      doneAt: now() - 3600,
      recurrence: { kind: "afterDone", days: 3 },
    }),
    make(demo("Répondre au syndic", "Reply to the letting agent"), { dueDate: today, doneAt: now() - 7200 }),
    make(demo("Acheter des cartons", "Buy moving boxes"), {
      dueDate: addDays(today, 1),
      tags: [demo("déménagement", "moving")],
      projectId: "apercu-prj1",
      doing: true,
      subtasks: [
        { id: "apercu-st1", title: demo("Cartons moyens (20)", "Medium boxes (20)"), done: true },
        { id: "apercu-st2", title: demo("Papier bulle", "Bubble wrap"), done: false },
        { id: "apercu-st3", title: demo("Ruban adhésif", "Packing tape"), done: false },
      ],
    }),
    make(demo("Résilier la box internet", "Cancel the broadband contract"), { dueDate: addDays(today, 9), projectId: "apercu-prj1" }),
    make(demo("Changer d'adresse à la banque", "Update address with the bank"), { projectId: "apercu-prj1" }),
    make(demo("Réserver le camion", "Book the removal van"), { projectId: "apercu-prj1", doneAt: now() - 86_400 }),
    make(demo("Poster le colis de Léa", "Post Lea's parcel"), { dueDate: addDays(today, 1), dueTime: "12:00", spaceId: "famille", color: "#e0508a" }),
    make(demo("Sortir les poubelles", "Put the bins out"), {
      dueDate: addDays(today, 1),
      dueTime: "20:00",
      color: "#2fae4a",
      recurrence: { kind: "weekly", interval: 1, days: [fromDayKey(addDays(today, 1)).getDay()] },
    }),
    make(demo("Réserver le contrôle technique", "Book the MOT"), { dueDate: addDays(today, 5), tags: [demo("voiture", "car")] }),
    make(demo("Idée cadeau pour Léa", "Birthday present idea for Lea"), { inbox: true, spaceId: "famille" }),
    make(demo("Trier les photos de vacances", "Sort the holiday photos")),
  ];
  const find = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) throw { code: "notFound" } satisfies DataError;
    return task;
  };
  const check = (input: TaskInput, day: DayKey): TaskInput => {
    const title = input.title.split(/\s+/).filter(Boolean).join(" ");
    if (title.length === 0 || title.length > 500) throw { code: "invalid", field: "title" } satisfies DataError;
    const dueDate = input.dueDate ?? (input.recurrence ? previewNext(input.recurrence, null, addDays(day, -1)) : null);
    return { ...input, title, dueDate, inbox: input.inbox && dueDate === null, projectId: input.projectId ?? null, doing: input.doing ?? false };
  };
  const deleted = new Map<string, Task>();
  const nextOf = new Map<string, string>();
  return {
    list: async (doneSince) => tasks.filter((t) => t.doneAt === null || t.doneAt >= doneSince),
    // Une année d'anciennes tâches terminées, pour les statistiques du Bilan.
    doneBefore: async (before) =>
      Array.from({ length: 240 }, (_, i) => ({ id: `apercu-ancienne-${i}`, doneAt: before - 3600 - Math.floor((i * 335 * 86_400) / 240) - ((i * 7919) % 86_400), spaceId: i % 3 === 0 ? "travail" : "perso", projectId: null })).filter((t) => t.doneAt < before),
    create: async (input, day) => {
      const task = make("", { ...check(input, day), createdAt: now(), updatedAt: now() });
      tasks.push(task);
      return task;
    },
    update: async (id, input, day) => {
      const task = { ...find(id), ...check(input, day), updatedAt: now() };
      tasks = tasks.map((t) => (t.id === id ? task : t));
      return task;
    },
    setDone: async (id, done, day) => {
      const current = find(id);
      let created: Task | null = null;
      let removed: string | null = null;
      if (done && current.doneAt === null && current.recurrence) {
        created = make(current.title, {
          ...current,
          id: `apercu${seq + 1}`,
          dueDate: previewNext(current.recurrence, current.dueDate, day),
          subtasks: current.subtasks.map((s) => ({ ...s, done: false })),
          doneAt: null,
          createdAt: now(),
          updatedAt: now(),
        });
        tasks.push(created);
        nextOf.set(id, created.id);
      } else if (!done && nextOf.has(id)) {
        removed = nextOf.get(id)!;
        tasks = tasks.filter((t) => t.id !== removed);
        nextOf.delete(id);
      }
      const task = { ...current, doneAt: done ? (current.doneAt ?? now()) : null, inbox: done ? false : current.inbox, doing: done ? false : current.doing };
      tasks = tasks.map((t) => (t.id === id ? task : t));
      return { task, created, removed };
    },
    remove: async (id) => {
      deleted.set(id, find(id));
      tasks = tasks.filter((t) => t.id !== id);
    },
    restore: async (id) => {
      const task = deleted.get(id);
      if (!task) throw { code: "notFound" } satisfies DataError;
      deleted.delete(id);
      tasks.push(task);
      return task;
    },
  };
}

export const tasksApi: TasksApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
