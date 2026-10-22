import { describe, expect, it } from "vitest";
import { NO_SELECTION, pick, pickAll, pickedIn, pickMode, prune, rangeOf } from "./selection";

const order = ["a", "b", "c", "d", "e"];
const ids = (s: { ids: ReadonlySet<string> }) => [...s.ids].sort();

describe("sélection de plusieurs éléments", () => {
  it("reconnaît les gestes de Windows", () => {
    expect(pickMode({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe("seul");
    expect(pickMode({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe("ajout");
    expect(pickMode({ ctrlKey: false, metaKey: false, shiftKey: true })).toBe("plage");
    expect(pickMode({ ctrlKey: true, metaKey: false, shiftKey: true })).toBe("plage-ajout");
  });

  it("Ctrl+clic ajoute puis retire, en gardant l'élément ouvert", () => {
    let s = pick(NO_SELECTION, "c", "ajout", order, "a");
    expect(ids(s)).toEqual(["a", "c"]);
    s = pick(s, "d", "ajout", order);
    expect(ids(s)).toEqual(["a", "c", "d"]);
    s = pick(s, "c", "ajout", order);
    expect(ids(s)).toEqual(["a", "d"]);
  });

  it("Maj+clic prend la plage depuis le dernier élément choisi, dans les deux sens", () => {
    let s = pick(NO_SELECTION, "b", "ajout", order);
    s = pick(s, "d", "plage", order);
    expect(ids(s)).toEqual(["b", "c", "d"]);
    s = pick(s, "a", "plage", order);
    expect(ids(s)).toEqual(["a", "b"]);
  });

  it("Maj+clic part de l'élément ouvert quand rien n'est choisi", () => {
    expect(ids(pick(NO_SELECTION, "c", "plage", order, "e"))).toEqual(["c", "d", "e"]);
  });

  it("Ctrl+Maj+clic ajoute une plage à la sélection", () => {
    let s = pick(NO_SELECTION, "a", "ajout", order);
    s = pick(s, "c", "ajout", order);
    s = pick(s, "e", "plage-ajout", order);
    expect(ids(s)).toEqual(["a", "c", "d", "e"]);
  });

  it("Ctrl+A prend tout ; les éléments disparus quittent la sélection", () => {
    const all = pickAll(order);
    expect(all.ids.size).toBe(5);
    const s = prune(all, ["b", "d"]);
    expect(ids(s)).toEqual(["b", "d"]);
    expect(s.anchor).toBeNull();
    expect(prune(s, ["b", "d"])).toBe(s);
  });

  it("rend les éléments choisis dans l'ordre affiché", () => {
    const s = pick(pick(NO_SELECTION, "d", "ajout", order), "a", "ajout", order);
    expect(pickedIn(order.map((id) => ({ id })), s).map((x) => x.id)).toEqual(["a", "d"]);
    expect(rangeOf(order, "zz", "c")).toEqual(["c"]);
  });
});
