import { describe, expect, it } from "vitest";
import { isPinList, MAX_PINS, movePin, pinKey, reorderPins, togglePin, type Pin } from "./pins";

const note: Pin = { kind: "note", id: "n1" };
const list: Pin = { kind: "list", id: "l1" };

describe("éléments épinglés", () => {
  it("s'épinglent et se retirent, dans l'ordre d'ajout", () => {
    const pins = togglePin(togglePin([], note), list);
    expect(pins).toEqual([note, list]);
    expect(togglePin(pins, { kind: "note", id: "n1" })).toEqual([list]);
  });

  it("gardent les plus récents au-delà de la limite", () => {
    let pins: Pin[] = [];
    for (let i = 0; i < MAX_PINS + 2; i++) pins = togglePin(pins, { kind: "task", id: `t${i}` });
    expect(pins).toHaveLength(MAX_PINS);
    expect(pins[0]!.id).toBe("t2");
  });

  it("se réordonnent sans sortir de la liste", () => {
    expect(movePin([note, list], list, -1)).toEqual([list, note]);
    expect(movePin([note, list], note, -1)).toEqual([note, list]);
  });

  it("refusent des préférences mal formées", () => {
    expect(isPinList([note, list])).toBe(true);
    expect(isPinList([{ kind: "inconnu", id: "x" }])).toBe(false);
    expect(isPinList([{ kind: "note", id: "" }])).toBe(false);
    expect(isPinList("note")).toBe(false);
  });
});

describe("épinglés remis en ordre à la souris", () => {
  it("suivent l'ordre des clés ; un épinglé caché (supprimé) garde sa place", () => {
    const pins: Pin[] = [
      { kind: "note", id: "a" },
      { kind: "task", id: "gone" },
      { kind: "list", id: "b" },
    ];
    expect(reorderPins(pins, ["list:b", "note:a"]).map(pinKey)).toEqual(["list:b", "task:gone", "note:a"]);
  });
});
