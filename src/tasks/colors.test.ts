import { describe, expect, it } from "vitest";
import { SPACE_COLORS } from "../spaces/spaces";
import { hue, TASK_COLORS } from "./colors";

const SPECTRUM = TASK_COLORS.slice(0, 18);

describe("palette des tâches", () => {
  it("contient 20 couleurs distinctes au format #rrggbb", () => {
    expect(TASK_COLORS).toHaveLength(20);
    expect(new Set(TASK_COLORS.map((c) => c.value)).size).toBe(20);
    expect(TASK_COLORS.every((c) => /^#[0-9a-f]{6}$/.test(c.value))).toBe(true);
  });

  it("suit l'ordre du spectre, du rouge au rose", () => {
    const hues = SPECTRUM.map((c) => hue(c.value));
    expect(hues).toEqual([...hues].sort((a, b) => a - b));
  });

  it("calcule la teinte d'une couleur", () => {
    expect(hue("#ff0000")).toBe(0);
    expect(hue("#00ff00")).toBe(120);
    expect(hue("#0000ff")).toBe(240);
    expect(Math.round(hue("#e0508a"))).toBe(336);
  });
});

it("les couleurs des espaces suivent aussi l'ordre du spectre", () => {
  const hues = SPACE_COLORS.map((c) => hue(c.value));
  expect(hues).toEqual([...hues].sort((a, b) => a - b));
});
