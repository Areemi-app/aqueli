import { describe, expect, it } from "vitest";
import { inkOn, luminance } from "./colorInk";

describe("texte lisible sur une couleur", () => {
  it("calcule la luminance", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("#000000")).toBe(0);
  });

  it("met du blanc sur les couleurs foncées, du foncé sur les claires", () => {
    expect(inkOn("#0778b0")).toBe("light");
    expect(inkOn("#6a4fd6")).toBe("light");
    expect(inkOn("#f2c230")).toBe("dark");
    expect(inkOn("#8adbff")).toBe("dark");
  });
});
