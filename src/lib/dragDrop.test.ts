import { describe, expect, it } from "vitest";
import { dragLabel, mergeOrder, moved, reorderIds } from "./dragDrop";

describe("remise en ordre par glisser-déposer", () => {
  it("place l'élément avant celui qui est visé", () => {
    expect(reorderIds(["a", "b", "c", "d"], ["d"], "b")).toEqual(["a", "d", "b", "c"]);
    expect(reorderIds(["a", "b", "c", "d"], ["a"], "d")).toEqual(["b", "c", "a", "d"]);
  });

  it("place l'élément à la fin quand rien n'est visé", () => {
    expect(reorderIds(["a", "b", "c"], ["a"], null)).toEqual(["b", "c", "a"]);
  });

  it("déplace plusieurs éléments ensemble, dans leur ordre", () => {
    expect(reorderIds(["a", "b", "c", "d", "e"], ["b", "d"], "a")).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("accueille un élément venu d'une autre liste", () => {
    expect(reorderIds(["a", "b"], ["x"], "b")).toEqual(["a", "x", "b"]);
    expect(reorderIds([], ["x"], null)).toEqual(["x"]);
  });

  it("garde l'ordre quand l'élément vise sa propre place", () => {
    expect(reorderIds(["a", "b", "c"], ["b"], "c")).toEqual(["a", "b", "c"]);
  });
});

describe("ordre complet d'après une vue filtrée", () => {
  it("garde la place des éléments que la vue ne montre pas", () => {
    // La vue montre b, d, e ; e passe en tête.
    expect(mergeOrder(["a", "b", "c", "d", "e"], ["e", "b", "d"])).toEqual(["a", "e", "c", "b", "d"]);
    expect(mergeOrder(["a", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("déplacer d'un cran (clic droit)", () => {
  it("échange avec le voisin, sans sortir de la liste", () => {
    expect(moved(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moved(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moved(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("étiquette du glisser", () => {
  it("montre le titre seul ou le nombre d'éléments", () => {
    expect(dragLabel(1, "Courses", "notes")).toBe("Courses");
    expect(dragLabel(3, "Courses", "notes")).toBe("3 notes");
  });
});
