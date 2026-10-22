import { describe, expect, it } from "vitest";
import { shownTabs } from "./Tabs";

describe("onglets qui tiennent", () => {
  it("montre tout quand la place suffit", () => {
    expect(shownTabs(5, 5, 3)).toEqual([0, 1, 2, 3, 4]);
  });

  it("garde l'onglet actif visible", () => {
    expect(shownTabs(8, 4, 1)).toEqual([0, 1, 2, 3]);
    expect(shownTabs(8, 4, 6)).toEqual([0, 1, 2, 6]);
  });

  it("montre au moins l'onglet actif", () => {
    expect(shownTabs(8, 1, 5)).toEqual([5]);
    expect(shownTabs(8, 0, 0)).toEqual([0]);
  });
});
