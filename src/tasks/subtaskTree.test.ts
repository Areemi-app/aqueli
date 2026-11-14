import { describe, expect, it } from "vitest";
import type { Subtask } from "./tasks";
import {
  branchEnd,
  canIndent,
  hiddenByFold,
  indent,
  insertChild,
  MAX_SUBTASK_LEVEL,
  move,
  normalizeLevels,
  outdent,
  parseSubtaskLine,
  removeBranch,
  reorderBranch,
  setDone,
  subtaskLine,
} from "./subtaskTree";

/** « Cuisine », « >Vaisselle », « >>Verres » : un niveau par « > ». */
const tree = (...lines: string[]): Subtask[] =>
  lines.map((l, i) => {
    const { title, level } = parseSubtaskLine(l);
    return { id: `s${i}`, title, done: false, level };
  });
const shape = (list: Subtask[]) => list.map((s) => `${">".repeat(s.level ?? 0)}${s.title}${s.done ? "✓" : ""}`);

describe("sous-tâches sur plusieurs niveaux", () => {
  const house = () => tree("Cuisine", ">Vaisselle", ">>Verres", ">Sol", "Salon", ">Rideaux");

  it("repère la branche de chaque sous-tâche", () => {
    const list = house();
    expect(branchEnd(list, 0)).toBe(4);
    expect(branchEnd(list, 1)).toBe(3);
    expect(branchEnd(list, 4)).toBe(6);
  });

  it("Tab range sous la sous-tâche du dessus, avec la branche ; Maj+Tab la remonte", () => {
    const list = house();
    expect(shape(indent(list, 4))).toEqual(["Cuisine", ">Vaisselle", ">>Verres", ">Sol", ">Salon", ">>Rideaux"]);
    expect(canIndent(list, 0)).toBe(false);
    expect(canIndent(list, 2)).toBe(false);
    expect(shape(outdent(list, 1))).toEqual(["Cuisine", "Vaisselle", ">Verres", ">Sol", "Salon", ">Rideaux"]);
    // Jamais plus de cinq niveaux.
    let deep = tree("A", ">B", ">>C", ">>>D", ">>>>E", "F");
    expect(MAX_SUBTASK_LEVEL).toBe(4);
    expect(canIndent(deep, 4)).toBe(false);
    deep = indent(deep, 5);
    expect(shape(deep).at(-1)).toBe(">F");
  });

  it("monte et descend une branche entière parmi ses sœurs", () => {
    const list = house();
    expect(shape(move(list, 4, -1))).toEqual(["Salon", ">Rideaux", "Cuisine", ">Vaisselle", ">>Verres", ">Sol"]);
    expect(shape(move(list, 1, 1))).toEqual(["Cuisine", ">Sol", ">Vaisselle", ">>Verres", "Salon", ">Rideaux"]);
    // Pas de sœur au-dessus : rien ne bouge.
    expect(shape(move(list, 1, -1))).toEqual(shape(list));
  });

  it("cocher coche la branche ; décocher décoche ce qui la contient", () => {
    let list = setDone(house(), 0, true);
    expect(shape(list).slice(0, 4)).toEqual(["Cuisine✓", ">Vaisselle✓", ">>Verres✓", ">Sol✓"]);
    list = setDone(list, 2, false);
    expect(shape(list).slice(0, 4)).toEqual(["Cuisine", ">Vaisselle", ">>Verres", ">Sol✓"]);
  });

  it("supprime une branche, ajoute dedans, garde la branche en la glissant", () => {
    expect(shape(removeBranch(house(), 1))).toEqual(["Cuisine", ">Sol", "Salon", ">Rideaux"]);
    expect(shape(insertChild(house(), 1, { id: "n", title: "Tasses", done: false }))).toEqual(["Cuisine", ">Vaisselle", ">>Verres", ">>Tasses", ">Sol", "Salon", ">Rideaux"]);
    // « Vaisselle » glissée après « Rideaux » : « Verres » la suit.
    const list = house();
    const ids = ["s0", "s3", "s4", "s5", "s1", "s2"];
    expect(shape(reorderBranch(list, "s1", ids.filter((id) => id !== "s2")))).toEqual(["Cuisine", ">Sol", "Salon", ">Rideaux", ">Vaisselle", ">>Verres"]);
  });

  it("garde les sous-tâches cachées d'une branche repliée quand une autre est glissée", () => {
    const list = house();
    // « Cuisine » repliée : seules « Cuisine », « Salon » et « Rideaux » sont affichées.
    const moved = reorderBranch(list, "s4", ["s4", "s5", "s0"]);
    expect(shape(moved)).toEqual(["Salon", ">Rideaux", "Cuisine", ">Vaisselle", ">>Verres", ">Sol"]);
  });

  it("remet en ordre des niveaux impossibles, et cache une branche repliée", () => {
    expect(shape(normalizeLevels(tree(">>A", ">>>>B", "C")))).toEqual(["A", ">B", "C"]);
    expect([...hiddenByFold(house(), new Set(["s0"]))]).toEqual(["s1", "s2", "s3"]);
  });

  it("écrit et relit les niveaux pour l'import et l'export", () => {
    expect(house().map(subtaskLine)).toEqual(["Cuisine", "> Vaisselle", ">> Verres", "> Sol", "Salon", "> Rideaux"]);
    expect(parseSubtaskLine(">> Verres")).toEqual({ title: "Verres", level: 2 });
    expect(parseSubtaskLine("Salon")).toEqual({ title: "Salon", level: 0 });
  });
});
