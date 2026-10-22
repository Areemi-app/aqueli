import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { announceData, onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { mergeOrder } from "../lib/dragDrop";
import { useSpaces } from "../spaces/SpacesProvider";
import { dayKey } from "../tasks/day";
import type { TaskInput } from "../tasks/tasks";
import { projectsApi } from "./api";
import { sortMilestones, sortProjects, toInput, type Milestone, type MilestoneInput, type Project, type ProjectInput } from "./projects";
import { tr } from "../i18n/i18n";

interface ProjectsContextValue {
  /** Tous les projets, archivés compris, dans l'ordre d'affichage. */
  projects: readonly Project[];
  /** Projets de l'espace choisi dans la barre de titre. */
  visible: readonly Project[];
  /** Jalons, par projet, dans l'ordre. */
  milestones: ReadonlyMap<string, readonly Milestone[]>;
  loaded: boolean;
  create: (input: ProjectInput) => Promise<Project | null>;
  /** Projet d'après un modèle : ses tâches et ses jalons avec lui. */
  createFrom: (input: ProjectInput, tasks: TaskInput[], milestones: MilestoneInput[]) => Promise<Project | null>;
  update: (project: Project, changes: Partial<ProjectInput>) => Promise<void>;
  archive: (project: Project, archived: boolean) => Promise<void>;
  /** Met le projet à la corbeille, avec « Annuler ». */
  remove: (project: Project) => Promise<void>;
  move: (project: Project, direction: -1 | 1) => Promise<void>;
  /** Nouvel ordre des projets affichés (glisser-déposer) ; les autres gardent leur place. */
  reorder: (ids: string[]) => Promise<void>;
  addMilestone: (project: Project, input: MilestoneInput) => Promise<void>;
  updateMilestone: (milestone: Milestone, input: MilestoneInput) => Promise<void>;
  setMilestoneDone: (milestone: Milestone, done: boolean) => Promise<void>;
  removeMilestone: (milestone: Milestone) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestoneList, setMilestoneList] = useState<Milestone[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const { filter } = useSpaces();

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const reload = useCallback(async () => {
    const [list, ms] = await enqueue(() => Promise.all([projectsApi.list(), projectsApi.milestones()]));
    setProjects(sortProjects(list));
    setMilestoneList(ms);
  }, [enqueue]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);
  useEffect(() => onDataAdded("project", () => void reload().catch(() => undefined)), [reload]);

  const milestones = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    for (const m of milestoneList) map.set(m.projectId, [...(map.get(m.projectId) ?? []), m]);
    for (const [k, v] of map) map.set(k, sortMilestones(v));
    return map;
  }, [milestoneList]);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const value = useMemo<ProjectsContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const put = (p: Project) => setProjects((list) => sortProjects(list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]));
    const putMilestone = (m: Milestone) => setMilestoneList((list) => (list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m]));
    const remove = async (project: Project) => {
      try {
        await enqueue(() => projectsApi.remove(project.id));
      } catch (err) {
        fail(err);
        return;
      }
      setProjects((list) => list.filter((p) => p.id !== project.id));
      announceData(["task"]);
      notify(tr("Projet supprimé."), {
        label: tr("Annuler|action"),
        undo: tr("suppression du projet"),
        run: () => {
          enqueue(() => projectsApi.restore(project.id))
            .then((p) => {
              put(p);
              void reload();
              announceData(["task"]);
            })
            .catch(fail);
        },
      });
    };
    const update = async (project: Project, changes: Partial<ProjectInput>) => {
      const base = projectsRef.current.find((p) => p.id === project.id) ?? project;
      recordUndo(tr("modification du projet"), () => update(base, toInput(base)), `project:${base.id}`);
      put({ ...base, ...changes });
      try {
        put(await enqueue(() => projectsApi.update(base.id, { ...toInput(base), ...changes })));
        if (changes.spaceId !== undefined && changes.spaceId !== base.spaceId) announceData(["task"]);
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    const removeMilestone = async (m: Milestone) => {
      setMilestoneList((list) => list.filter((x) => x.id !== m.id));
      try {
        await enqueue(() => projectsApi.removeMilestone(m.id));
        recordUndo(tr("suppression de l'étape"), () =>
          enqueue(() => projectsApi.createMilestone(m.projectId, { title: m.title, dueDate: m.dueDate })).then(putMilestone),
        );
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    return {
      projects,
      visible: filter === "tous" ? projects : projects.filter((p) => p.spaceId === filter),
      milestones,
      loaded,
      create: async (input) => {
        try {
          const p = await enqueue(() => projectsApi.create(input));
          put(p);
          recordUndo(tr("ajout du projet"), () => remove(p));
          return p;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      createFrom: async (input, tasks, ms) => {
        try {
          const p = await enqueue(() => projectsApi.createFrom(input, tasks, ms, dayKey(new Date())));
          put(p);
          await reload();
          announceData(["task"]);
          recordUndo(tr("ajout du projet"), () => remove(p));
          return p;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      update,
      archive: async (project, archived) => {
        try {
          put(await enqueue(() => projectsApi.archive(project.id, archived)));
          recordUndo(archived ? tr("archivage du projet") : tr("retour du projet"), () => enqueue(() => projectsApi.archive(project.id, !archived)).then(put));
          notify(archived ? tr("Projet archivé.") : tr("Projet ressorti des archives."));
        } catch (err) {
          fail(err);
        }
      },
      remove,
      move: async (project, direction) => {
        const list = projectsRef.current.filter((p) => p.archived === project.archived && p.status === project.status);
        const i = list.findIndex((p) => p.id === project.id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= list.length) return;
        const a = list[i]!;
        const b = list[j]!;
        const all = projectsRef.current.map((p) => (p.id === a.id ? { ...p, position: b.position } : p.id === b.id ? { ...p, position: a.position } : p));
        const ordered = [...all].sort((x, y) => x.position - y.position || x.createdAt - y.createdAt);
        setProjects(sortProjects(ordered.map((p, index) => ({ ...p, position: index }))));
        try {
          await enqueue(() => projectsApi.reorder(ordered.map((p) => p.id)));
        } catch (err) {
          fail(err);
        }
      },
      reorder: async (part) => {
        const before = [...projectsRef.current].sort((x, y) => x.position - y.position || x.createdAt - y.createdAt).map((p) => p.id);
        const ids = mergeOrder(before, part);
        if (ids.join() === before.join()) return;
        const apply = async (order: string[]) => {
          setProjects(sortProjects(projectsRef.current.map((p) => ({ ...p, position: order.indexOf(p.id) }))));
          await enqueue(() => projectsApi.reorder(order));
        };
        try {
          await apply(ids);
          recordUndo(tr("déplacement du projet"), () => apply(before));
        } catch (err) {
          fail(err);
        }
      },
      addMilestone: async (project, input) => {
        try {
          const m = await enqueue(() => projectsApi.createMilestone(project.id, input));
          putMilestone(m);
          recordUndo(tr("ajout de l'étape"), () => removeMilestone(m));
        } catch (err) {
          fail(err);
        }
      },
      updateMilestone: async (m, input) => {
        recordUndo(tr("modification de l'étape"), () => enqueue(() => projectsApi.updateMilestone(m.id, { title: m.title, dueDate: m.dueDate })).then(putMilestone), `milestone:${m.id}`);
        putMilestone({ ...m, ...input });
        try {
          putMilestone(await enqueue(() => projectsApi.updateMilestone(m.id, input)));
        } catch (err) {
          fail(err);
          await reload().catch(() => undefined);
        }
      },
      setMilestoneDone: async (m, done) => {
        recordUndo(done ? tr("étape atteinte") : tr("étape rouverte"), () => enqueue(() => projectsApi.setMilestoneDone(m.id, !done)).then(putMilestone));
        putMilestone({ ...m, doneAt: done ? Math.floor(Date.now() / 1000) : null });
        try {
          putMilestone(await enqueue(() => projectsApi.setMilestoneDone(m.id, done)));
        } catch (err) {
          fail(err);
          await reload().catch(() => undefined);
        }
      },
      removeMilestone,
    };
  }, [projects, milestones, loaded, filter, enqueue, notify, reload]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects doit être utilisé dans ProjectsProvider");
  return ctx;
}

/** Projets s'ils sont disponibles (détail des tâches, aussi utilisé sans eux dans les tests). */
export function useProjectsIfAny(): ProjectsContextValue | null {
  return useContext(ProjectsContext);
}
