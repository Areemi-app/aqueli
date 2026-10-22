import { describe, expect, it } from "vitest";
import { seamlessLoop } from "./ambience";

describe("ambiances du Focus", () => {
  it("bouclent sans coupure ni saut au raccord", () => {
    const length = 4000;
    const seam = 600;
    const raw = Float32Array.from({ length: length + seam }, (_, i) => Math.sin(i * 0.05) * 0.8);
    const loop = seamlessLoop(raw, length, seam);
    expect(loop).toHaveLength(length);
    // La fin enchaîne sur le début comme deux échantillons voisins.
    const step = Math.abs(raw[1]! - raw[0]!) * 1.5;
    expect(Math.abs(loop[0]! - loop[length - 1]!)).toBeLessThanOrEqual(step);
    // Pas de silence au raccord : le niveau reste celui du signal.
    const rms = (a: Float32Array) => Math.sqrt(a.reduce((sum, v) => sum + v * v, 0) / a.length);
    expect(rms(loop.subarray(0, 300))).toBeGreaterThan(0.35);
    expect(rms(loop.subarray(length - 300))).toBeGreaterThan(0.35);
  });
});
