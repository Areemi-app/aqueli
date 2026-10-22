import { describe, expect, it } from "vitest";
import type { Contact } from "../contacts/contacts";
import type { Task } from "../tasks/tasks";
import { buildRows, tableRecords, toBatch, type ImportContext } from "./records";
import { mergeContact, mergeTask, prepareUpdates } from "./updates";

const task = (id: string, t: Partial<Task> = {}): Task =>
  ({
    id,
    title: id,
    notes: "",
    spaceId: "perso",
    dueDate: null,
    dueTime: null,
    priority: 0,
    estimate: null,
    tags: [],
    subtasks: [],
    inbox: false,
    doneAt: null,
    createdAt: 1,
    updatedAt: 1,
    recurrence: null,
    color: null,
    reminder: null,
    projectId: null,
    doing: false,
    ...t,
  }) as Task;

const garage = task("t1", { title: "Appeler le garage", color: "#e0508a", projectId: "p1", doing: true, subtasks: [{ id: "s1", title: "Trouver le numéro", done: true }] });

const ctx = (tasks: Task[] = [garage]): ImportContext => ({
  now: new Date(2026, 9, 8, 9),
  today: "2026-10-08",
  date1904: false,
  spaces: [{ id: "perso", name: "Perso" }] as unknown as ImportContext["spaces"],
  defaultSpaceId: "perso",
  notebooks: [],
  categories: [],
  defaultReminder: null,
  existing: { tasks, events: [], obligations: [], notes: [] },
});

const rowsOf = (lines: string[][], c = ctx()) =>
  buildRows("csv", tableRecords(["Titre", "Priorité", "Sous-tâches", "Identifiant"], lines.map((cells, i) => ({ line: i + 2, cells })), "task"), c, new Set(["task|appeler le garage|"]), new Map());

describe("mise à jour par l'import", () => {
  it("une ligne à l'identifiant connu met à jour l'élément, sans compter comme doublon", () => {
    const [update, other, unknown, again] = rowsOf([
      ["Appeler le garage avant 18 h", "haute", "Trouver le numéro; Prendre rendez-vous", "t1"],
      ["Appeler le garage", "", "", ""],
      ["Réserver le camion", "", "", "inconnu42"],
      ["Appeler le garage", "", "", "t1"],
    ]);
    expect(update).toMatchObject({ replaces: "t1", duplicate: null, checked: true, warnings: [] });
    expect(other).toMatchObject({ replaces: null, duplicate: "Déjà dans Aqueli." });
    expect(unknown).toMatchObject({ replaces: null, warnings: ["Identifiant inconnu : un nouvel élément sera créé."], checked: true });
    expect(again).toMatchObject({ replaces: "t1", duplicate: "Même élément que la ligne 2.", checked: false });
  });

  it("garde ce que le fichier ne décrit pas", () => {
    const [row] = rowsOf([["Appeler le garage avant 18 h", "haute", "Trouver le numéro; Prendre rendez-vous", "t1"]]);
    const merged = mergeTask(garage, row!.item!.kind === "task" ? row!.item!.input : (null as never));
    expect(merged).toMatchObject({ title: "Appeler le garage avant 18 h", priority: 3, color: "#e0508a", projectId: "p1", doing: true });
    expect(merged.subtasks.map((s) => [s.title, s.done])).toEqual([
      ["Trouver le numéro", true],
      ["Prendre rendez-vous", false],
    ]);
    const contact = { id: "c1", firstName: "Léa", lastName: "", company: "", phones: [{ label: "Portable", value: "06 12 34 56 78" }], emails: [], address: "", birthday: null, notes: "", tags: [], photo: "data:image/jpeg;base64,AAAA", color: "#2d6ff0", favorite: true, spaceId: null, fields: [], groupId: "g1", style: null, createdAt: 1, updatedAt: 1, keepInTouch: 30, lastContact: null } as Contact;
    const c = mergeContact(contact, { ...contact, firstName: "Léa M.", phones: [{ label: "", value: "06 12 34 56 78" }], photo: null, favorite: false, groupId: null });
    expect(c).toMatchObject({ firstName: "Léa M.", photo: contact.photo, favorite: true, groupId: "g1", phones: [{ label: "Portable", value: "06 12 34 56 78" }] });
    // Sans « Rester en contact » dans le fichier, le suivi reste.
    expect(mergeContact(contact, { ...contact, keepInTouch: null }).keepInTouch).toBe(30);
  });

  it("envoie les mises à jour après les créations, et garde les valeurs d'avant pour annuler", () => {
    const rows = rowsOf([
      ["Appeler le garage avant 18 h", "haute", "", "t1"],
      ["Réserver le camion", "", "", ""],
    ]);
    const { rows: ready, previous } = prepareUpdates(rows, { tasks: [garage], events: [], contacts: [], transactions: [] });
    expect(previous.tasks).toEqual([{ id: "t1", input: expect.objectContaining({ title: "Appeler le garage", color: "#e0508a", projectId: "p1" }) }]);
    const { batch, origin } = toBatch(ready);
    expect(batch.tasks.map((t) => t.title)).toEqual(["Réserver le camion"]);
    expect(batch.updates.tasks).toEqual([{ id: "t1", input: expect.objectContaining({ title: "Appeler le garage avant 18 h", color: "#e0508a" }) }]);
    // Le cœur numérote les mises à jour après les créations : une ligne refusée se retrouve.
    expect(origin.task.map((r) => r.line)).toEqual([3, 2]);
  });
});
