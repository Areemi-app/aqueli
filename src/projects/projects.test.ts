import { describe, expect, it } from "vitest";
import { deadlineLabel, fromTemplate, healthOf, nextAction, nextMilestone, progressOf, PROJECT_TEMPLATES, sortMilestones, sortProjects, stageOf, timelinePosition, type Milestone, type Project } from "./projects";
import { SYMBOLS } from "../components/symbols";

const milestone = (id: string, dueDate: string | null, doneAt: number | null = null, position = 0): Milestone => ({ id, projectId: "p", title: id, dueDate, doneAt, position });

describe("projets", () => {
  it("place chaque tâche dans sa colonne", () => {
    expect(stageOf({ doneAt: null, doing: false })).toBe("a-faire");
    expect(stageOf({ doneAt: null, doing: true })).toBe("en-cours");
    expect(stageOf({ doneAt: 5, doing: true })).toBe("termine");
  });

  it("calcule l'avancement avec les tâches et les jalons", () => {
    expect(progressOf([{ doneAt: 1 }, { doneAt: null }, { doneAt: 2 }], [milestone("a", null, 3)])).toEqual({ done: 3, total: 4, percent: 75 });
    expect(progressOf([], [])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("range les jalons et trouve le prochain", () => {
    const list = [milestone("sans-date", null), milestone("fait", "2026-09-01", 9), milestone("tard", "2026-12-01"), milestone("tot", "2026-10-15")];
    expect(sortMilestones(list).map((m) => m.id)).toEqual(["tot", "tard", "sans-date", "fait"]);
    expect(nextMilestone(list)?.id).toBe("tot");
    expect(nextMilestone([milestone("fait", null, 1)])).toBeNull();
  });

  it("dit où en est une échéance", () => {
    expect(deadlineLabel("2026-10-01", "2026-10-01")).toBe("Aujourd'hui");
    expect(deadlineLabel("2026-10-02", "2026-10-01")).toBe("Demain");
    expect(deadlineLabel("2026-10-13", "2026-10-01")).toBe("Dans 12 jours");
    expect(deadlineLabel("2026-09-30", "2026-10-01")).toBe("Dépassée d'un jour");
    expect(deadlineLabel("2026-09-28", "2026-10-01")).toBe("Dépassée de 3 jours");
  });

  it("range les projets : en cours, en pause, terminés, puis archivés", () => {
    const p = (id: string, status: Project["status"], archived = false, position = 0) => ({ id, status, archived, position }) as Project;
    expect(sortProjects([p("a", "termine"), p("b", "en-pause"), p("c", "en-cours", true), p("d", "en-cours", false, 2), p("e", "en-cours", false, 1)]).map((x) => x.id)).toEqual([
      "e",
      "d",
      "b",
      "a",
      "c",
    ]);
  });

  it("crée un projet daté d'après un modèle", () => {
    const voyage = PROJECT_TEMPLATES.find((t) => t.id === "voyage")!;
    const { project, tasks, milestones } = fromTemplate(voyage, "2026-10-01", "perso");
    expect(project).toMatchObject({ name: "Voyage", startDate: "2026-10-01", endDate: "2026-10-31", spaceId: "perso", status: "en-cours" });
    expect(PROJECT_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(PROJECT_TEMPLATES.map((t) => t.id)).size).toBe(PROJECT_TEMPLATES.length);
    expect(tasks[1]).toMatchObject({ title: "Réserver le transport", dueDate: "2026-10-03", spaceId: "perso" });
    expect(milestones).toEqual([
      { title: "Réservations faites", dueDate: "2026-10-11" },
      { title: "Départ", dueDate: "2026-10-31" },
    ]);
    // Les symboles des modèles existent, et les tâches tiennent dans un projet.
    for (const t of PROJECT_TEMPLATES) {
      expect(SYMBOLS.some((s) => s.id === t.icon)).toBe(true);
      expect(t.tasks.length).toBeLessThanOrEqual(200);
      // Jalons et tâches restent dans la durée du projet (à quelques jours près pour les démarches après coup).
      for (const m of t.milestones) expect(m.day).toBeLessThanOrEqual(t.days);
      expect(t.tasks.every((x) => x.title.length <= 500)).toBe(true);
    }
  });
});

describe("état d'un projet", () => {
  const p = (extra: Partial<Pick<Project, "status" | "startDate" | "endDate">> = {}) => ({ status: "en-cours" as const, startDate: null, endDate: null, ...extra });
  const t = (dueDate: string | null, done = false) => ({ dueDate, doneAt: done ? 1 : null });
  const m = (dueDate: string | null, done = false) => ({ dueDate, doneAt: done ? 1 : null });
  const TODAY = "2026-10-10";

  it("dit si le projet est dans les temps, à surveiller ou en retard", () => {
    expect(healthOf(p(), [t("2026-10-12"), t("2026-10-30")], [], TODAY)).toMatchObject({ level: "bon", late: 0, week: 1 });
    expect(healthOf(p(), [t("2026-10-08")], [], TODAY)).toMatchObject({ level: "attention", reasons: ["1 tâche en retard"] });
    expect(healthOf(p(), [t("2026-10-01"), t("2026-10-02"), t("2026-10-03")], [], TODAY)?.level).toBe("retard");
    expect(healthOf(p(), [], [m("2026-10-01")], TODAY)).toMatchObject({ level: "retard", reasons: ["1 étape dépassée"] });
    expect(healthOf(p({ endDate: "2026-10-05" }), [t(null)], [], TODAY)?.reasons).toContain("Échéance dépassée");
    // Les trois quarts du temps passés, un quart du travail fait.
    expect(healthOf(p({ startDate: "2026-07-12", endDate: "2026-11-09" }), [t(null, true), t(null), t(null), t(null)], [], TODAY)).toMatchObject({ level: "attention", reasons: ["Avancement en retard sur le calendrier"] });
    expect(healthOf(p({ status: "en-pause" }), [t("2026-10-01")], [], TODAY)).toBeNull();
  });

  it("place une date sur la frise", () => {
    expect(timelinePosition("2026-10-10", "2026-10-01", "2026-10-21")).toBeCloseTo(0.45);
    expect(timelinePosition("2026-09-01", "2026-10-01", "2026-10-21")).toBe(0);
    expect(timelinePosition("2026-12-01", "2026-10-01", "2026-10-21")).toBe(1);
  });
});

describe("prochaine action", () => {
  it("prend la tâche en cours, sinon l'échéance la plus proche", () => {
    const t = (id: string, extra: Partial<{ doneAt: number | null; doing: boolean; dueDate: string | null; createdAt: number }> = {}) => ({ id, doneAt: null, doing: false, dueDate: null, createdAt: 0, ...extra });
    expect(nextAction([t("a", { dueDate: "2026-10-20" }), t("b", { dueDate: "2026-10-12" }), t("c")])?.id).toBe("b");
    expect(nextAction([t("a", { dueDate: "2026-10-12" }), t("b", { doing: true })])?.id).toBe("b");
    expect(nextAction([t("a", { doneAt: 5 })])).toBeNull();
  });
});
