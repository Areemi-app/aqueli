import { describe, expect, it } from "vitest";
import { linkedTo, linkOf, sameLink } from "./links";

describe("liens entre éléments", () => {
  it("range un lien de la même façon dans les deux sens, comme le cœur", () => {
    const a = linkOf({ kind: "task", id: "t1" }, { kind: "contact", id: "c1" });
    const b = linkOf({ kind: "contact", id: "c1" }, { kind: "task", id: "t1" });
    expect(a).toEqual({ aKind: "contact", aId: "c1", bKind: "task", bId: "t1" });
    expect(sameLink(a, b)).toBe(true);
    expect(linkOf({ kind: "task", id: "b" }, { kind: "task", id: "a" })).toMatchObject({ aId: "a", bId: "b" });
  });

  it("trouve les éléments reliés, quel que soit le bout", () => {
    const links = [
      linkOf({ kind: "task", id: "t1" }, { kind: "contact", id: "c1" }),
      linkOf({ kind: "document", id: "d1" }, { kind: "task", id: "t1" }),
      linkOf({ kind: "document", id: "d1" }, { kind: "project", id: "p1" }),
    ];
    expect(linkedTo(links, { kind: "task", id: "t1" })).toEqual([
      { kind: "contact", id: "c1" },
      { kind: "document", id: "d1" },
    ]);
    expect(linkedTo(links, { kind: "project", id: "p1" })).toEqual([{ kind: "document", id: "d1" }]);
  });
});
