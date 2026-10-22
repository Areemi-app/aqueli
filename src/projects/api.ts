/** Projets et jalons enregistrés dans la base chiffrée (src-tauri/src/data/projects.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey, type DayKey } from "../tasks/day";
import { tasksApi } from "../tasks/api";
import type { TaskInput } from "../tasks/tasks";
import type { Milestone, MilestoneInput, Project, ProjectInput } from "./projects";

export interface ProjectsApi {
  list(): Promise<Project[]>;
  create(project: ProjectInput): Promise<Project>;
  /** Projet d'après un modèle, avec ses tâches et ses jalons. */
  createFrom(project: ProjectInput, tasks: TaskInput[], milestones: MilestoneInput[], today: DayKey): Promise<Project>;
  update(id: string, project: ProjectInput): Promise<Project>;
  archive(id: string, archived: boolean): Promise<Project>;
  reorder(ids: string[]): Promise<void>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<Project>;
  milestones(): Promise<Milestone[]>;
  createMilestone(projectId: string, milestone: MilestoneInput): Promise<Milestone>;
  updateMilestone(id: string, milestone: MilestoneInput): Promise<Milestone>;
  setMilestoneDone(id: string, done: boolean): Promise<Milestone>;
  removeMilestone(id: string): Promise<void>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: ProjectsApi = {
  list: () => call("projects_list"),
  create: (project) => call("projects_create", { project }),
  createFrom: (project, tasks, milestones, today) => call("projects_create_from", { project, tasks, milestones, today }),
  update: (id, project) => call("projects_update", { id, project }),
  archive: (id, archived) => call("projects_archive", { id, archived }),
  reorder: (ids) => call("projects_reorder", { ids }),
  remove: (id) => call("projects_delete", { id }),
  restore: (id) => call("projects_restore", { id }),
  milestones: () => call("milestones_list"),
  createMilestone: (projectId, milestone) => call("milestones_create", { projectId, milestone }),
  updateMilestone: (id, milestone) => call("milestones_update", { id, milestone }),
  setMilestoneDone: (id, done) => call("milestones_done", { id, done }),
  removeMilestone: (id) => call("milestones_delete", { id }),
};

/** Projets d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): ProjectsApi {
  const now = () => Math.floor(Date.now() / 1000);
  const today = dayKey(new Date());
  let seq = 1;
  let projects: Project[] = [
    {
      id: "apercu-prj1",
      name: demo("Déménagement", "Move to the new flat"),
      description: demo("Cartons, démarches et changements d'adresse.", "Boxes, paperwork and changes of address."),
      status: "en-cours",
      startDate: addDays(today, -10),
      endDate: addDays(today, 30),
      icon: "maison",
      color: "#e0671f",
      spaceId: "perso",
      position: 0,
      archived: false,
      createdAt: now() - 864_000,
      updatedAt: now(),
    },
  ];
  let milestones: Milestone[] = [
    { id: "apercu-jal1", projectId: "apercu-prj1", title: demo("Cartons prêts", "Boxes packed"), dueDate: addDays(today, 25), doneAt: null, position: 0 },
    { id: "apercu-jal2", projectId: "apercu-prj1", title: demo("Bail signé", "Tenancy agreement signed"), dueDate: addDays(today, -3), doneAt: now() - 200_000, position: 1 },
  ];
  const deleted = new Map<string, Project>();
  const find = (id: string) => {
    const p = projects.find((x) => x.id === id);
    if (!p) throw asDataError({ code: "notFound" });
    return p;
  };
  const replace = (p: Project) => {
    projects = projects.map((x) => (x.id === p.id ? p : x));
    return p;
  };
  const make = (input: ProjectInput): Project => {
    seq += 1;
    return { ...input, name: input.name.trim(), id: `apercu-prj${seq}`, position: seq, archived: false, createdAt: now(), updatedAt: now() };
  };
  const api: ProjectsApi = {
    list: async () => projects,
    create: async (input) => {
      const p = make(input);
      projects = [...projects, p];
      return p;
    },
    createFrom: async (input, tasks, list, day) => {
      const p = await api.create(input);
      for (const t of tasks) await tasksApi.create({ ...t, projectId: p.id }, day);
      for (const m of list) await api.createMilestone(p.id, m);
      return p;
    },
    update: async (id, input) => replace({ ...find(id), ...input, updatedAt: now() }),
    archive: async (id, archived) => replace({ ...find(id), archived }),
    reorder: async (ids) => {
      projects = projects.map((p) => ({ ...p, position: ids.indexOf(p.id) }));
    },
    remove: async (id) => {
      deleted.set(id, find(id));
      projects = projects.filter((p) => p.id !== id);
    },
    restore: async (id) => {
      const p = deleted.get(id);
      if (!p) throw asDataError({ code: "notFound" });
      projects = [...projects, p];
      return p;
    },
    milestones: async () => milestones.filter((m) => projects.some((p) => p.id === m.projectId)),
    createMilestone: async (projectId, input) => {
      seq += 1;
      const m = { id: `apercu-jal${seq}`, projectId, title: input.title.trim(), dueDate: input.dueDate, doneAt: null, position: seq };
      milestones = [...milestones, m];
      return m;
    },
    updateMilestone: async (id, input) => {
      const m = { ...milestones.find((x) => x.id === id)!, ...input };
      milestones = milestones.map((x) => (x.id === id ? m : x));
      return m;
    },
    setMilestoneDone: async (id, done) => {
      const m = { ...milestones.find((x) => x.id === id)!, doneAt: done ? now() : null };
      milestones = milestones.map((x) => (x.id === id ? m : x));
      return m;
    },
    removeMilestone: async (id) => {
      milestones = milestones.filter((m) => m.id !== id);
    },
  };
  return api;
}

export const projectsApi: ProjectsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
