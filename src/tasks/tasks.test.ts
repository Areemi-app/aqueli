import { describe, expect, it } from "vitest";
import { dayKey } from "./day";
import {
  countFor,
  inList,
  sectionsFor,
  sortTasks,
  tagsInUse,
  toInput,
  type SmartListId,
  type Task,
} from "./tasks";

// Dimanche 27 septembre 2026, 10 h.
const NOW = new Date(2026, 8, 27, 10, 0);
const TODAY = dayKey(NOW);
const at = (y: number, m: number, d: number, h = 12) => Math.floor(new Date(y, m - 1, d, h).getTime() / 1000);

let seq = 0;
function task(title: string, extra: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
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
    createdAt: seq,
    updatedAt: seq,
    ...extra,
  };
}

const overdue = task("Renouveler l'ordonnance", { dueDate: "2026-09-26", spaceId: "sante" });
const today1 = task("Appeler le garage", { dueDate: TODAY, dueTime: "14:00", priority: 3, tags: ["voiture"] });
const today2 = task("Envoyer le dossier mutuelle", { dueDate: TODAY });
const today3 = task("Préparer la réunion de lundi", { dueDate: TODAY, dueTime: "09:00", priority: 2 });
const doneToday = task("Arroser les plantes", { dueDate: TODAY, doneAt: at(2026, 9, 27, 9) });
const doneOverdue = task("Répondre au syndic", { dueDate: "2026-09-20", doneAt: at(2026, 9, 27, 8) });
const tomorrow = task("Acheter des cartons", { dueDate: "2026-09-28", tags: ["déménagement"] });
const later = task("Poster le colis de Léa", { dueDate: "2026-10-02", dueTime: "12:00" });
const inbox = task("Idée cadeau", { inbox: true });
const noDate = task("Trier les photos");
const doneYesterday = task("Payer la cantine", { doneAt: at(2026, 9, 26), tags: ["école"] });
const ALL = [overdue, today1, today2, today3, doneToday, doneOverdue, tomorrow, later, inbox, noDate, doneYesterday];

const titles = (list: Task[]) => list.map((t) => t.title);
const filtered = (list: SmartListId) => ALL.filter((t) => inList(t, list, TODAY));

describe("listes intelligentes", () => {
  it("une tâche pas encore commencée n'est que dans « À venir », à sa date de début", () => {
    const later = task("Déclaration", { startDate: "2026-10-01", dueDate: "2026-10-15", tags: ["impots"], inbox: false });
    const undated = task("Ranger la cave", { startDate: "2026-09-30", inbox: true });
    const begun = task("Trier les photos", { startDate: "2026-09-25" });
    const lists = (t: Task) => (["boite", "aujourdhui", "a-venir", "sans-date", "tag:impots"] as SmartListId[]).filter((l) => inList(t, l, TODAY));
    expect(lists(later)).toEqual(["a-venir"]);
    expect(lists(undated)).toEqual(["a-venir"]);
    // Commencée et sans échéance : dans « Aujourd'hui », comme le « Quand » de Things.
    expect(lists(begun)).toEqual(["aujourdhui", "sans-date"]);
    expect(countFor([later, undated, begun], "aujourdhui", TODAY)).toBe(1);
    const upcoming = sectionsFor("a-venir", [later, undated], TODAY);
    expect(upcoming.map((s) => [s.key, s.tasks.map((t) => t.title)])).toEqual([
      ["2026-09-30", ["Ranger la cave"]],
      ["2026-10-01", ["Déclaration"]],
    ]);
    expect(toInput(later).startDate).toBe("2026-10-01");
  });

  it("Boîte de réception : les tâches capturées, pas encore organisées", () => {
    expect(titles(filtered("boite"))).toEqual(["Idée cadeau"]);
  });

  it("Aujourd'hui : en retard, du jour (y compris terminées aujourd'hui) et de demain", () => {
    expect(titles(filtered("aujourdhui")).sort()).toEqual(
      [
        "Acheter des cartons",
        "Appeler le garage",
        "Arroser les plantes",
        "Envoyer le dossier mutuelle",
        "Préparer la réunion de lundi",
        "Renouveler l'ordonnance",
        "Répondre au syndic",
      ].sort(),
    );
  });

  it("À venir, En retard, Sans date, Terminées", () => {
    expect(titles(filtered("a-venir"))).toEqual(["Acheter des cartons", "Poster le colis de Léa"]);
    expect(titles(filtered("en-retard"))).toEqual(["Renouveler l'ordonnance"]);
    expect(titles(filtered("sans-date"))).toEqual(["Idée cadeau", "Trier les photos"]);
    expect(titles(filtered("terminees"))).toEqual(["Arroser les plantes", "Répondre au syndic", "Payer la cantine"]);
  });

  it("filtre par étiquette, sans tenir compte des majuscules", () => {
    expect(titles(ALL.filter((t) => inList(t, "tag:Voiture", TODAY)))).toEqual(["Appeler le garage"]);
  });

  it("une étiquette retient aussi ses sous-étiquettes", () => {
    const jardin = { ...ALL[0]!, title: "Tailler la haie", tags: ["Maison/Jardin"] };
    const maison = { ...ALL[0]!, title: "Ranger", tags: ["maison"] };
    const autre = { ...ALL[0]!, title: "Maisonnette", tags: ["maisonnette"] };
    expect(titles([jardin, maison, autre].filter((t) => inList(t, "tag:maison", TODAY)))).toEqual(["Tailler la haie", "Ranger"]);
    expect(titles([jardin, maison].filter((t) => inList(t, "tag:maison/jardin", TODAY)))).toEqual(["Tailler la haie"]);
  });

  it("compte les tâches à faire de chaque liste", () => {
    expect(countFor(ALL, "boite", TODAY)).toBe(1);
    expect(countFor(ALL, "aujourdhui", TODAY)).toBe(3);
    expect(countFor(ALL, "a-venir", TODAY)).toBe(2);
    expect(countFor(ALL, "en-retard", TODAY)).toBe(1);
    expect(countFor(ALL, "sans-date", TODAY)).toBe(2);
    expect(countFor(ALL, "terminees", TODAY)).toBe(0);
  });

  it("liste les étiquettes utilisées par les tâches à faire, par ordre alphabétique", () => {
    expect(tagsInUse(ALL)).toEqual(["déménagement", "voiture"]);
  });
});

describe("tri et sections", () => {
  it("trie par date, heure (sans heure en dernier), priorité puis création", () => {
    const list = sortTasks([today2, today1, later, today3, overdue]);
    expect(titles(list)).toEqual([
      "Renouveler l'ordonnance",
      "Préparer la réunion de lundi",
      "Appeler le garage",
      "Envoyer le dossier mutuelle",
      "Poster le colis de Léa",
    ]);
  });

  it("place les tâches terminées après celles à faire", () => {
    expect(titles(sortTasks([doneToday, today2]))).toEqual(["Envoyer le dossier mutuelle", "Arroser les plantes"]);
  });

  it("Aujourd'hui : sections En retard, Aujourd'hui, Demain", () => {
    const sections = sectionsFor("aujourdhui", filtered("aujourdhui"), TODAY);
    expect(sections.map((s) => [s.title, s.subtitle, s.tone, s.tasks.length])).toEqual([
      ["En retard", undefined, "danger", 1],
      ["Aujourd'hui", "dim. 27 sept.", undefined, 5],
      ["Demain", "lun. 28 sept.", undefined, 1],
    ]);
    expect(titles(sections[1]?.tasks ?? [])).toEqual([
      "Préparer la réunion de lundi",
      "Appeler le garage",
      "Envoyer le dossier mutuelle",
      "Arroser les plantes",
      "Répondre au syndic",
    ]);
  });

  it("À venir : une section par jour", () => {
    const sections = sectionsFor("a-venir", filtered("a-venir"), TODAY);
    expect(sections.map((s) => [s.title, s.subtitle])).toEqual([
      ["Demain", "lun. 28 sept."],
      ["ven. 2 oct.", undefined],
    ]);
  });

  it("Terminées : par jour d'achèvement, les plus récentes d'abord", () => {
    const sections = sectionsFor("terminees", filtered("terminees"), TODAY);
    expect(sections.map((s) => [s.title, s.tasks.length])).toEqual([
      ["Aujourd'hui", 2],
      ["Hier", 1],
    ]);
    expect(titles(sections[0]?.tasks ?? [])).toEqual(["Arroser les plantes", "Répondre au syndic"]);
  });

  it("une liste vide n'a aucune section", () => {
    expect(sectionsFor("boite", [], TODAY)).toEqual([]);
  });
});

it("toInput garde tous les champs modifiables", () => {
  expect(toInput(today1)).toEqual({
    title: "Appeler le garage",
    notes: "",
    spaceId: "perso",
    dueDate: TODAY,
    dueTime: "14:00",
    startDate: null,
    priority: 3,
    estimate: null,
    tags: ["voiture"],
    subtasks: [],
    recurrence: null,
    color: null,
    reminder: null,
    inbox: false,
    projectId: null,
    doing: false,
  });
});
