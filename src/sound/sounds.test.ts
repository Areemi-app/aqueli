import { describe, expect, it } from "vitest";
import { THEMES } from "../theme/themes";
import { DEFAULT_SOUND_PREFS, PALETTES, SCORES, gainFor, paletteFor, shouldPlay, type SoundPrefs } from "./sounds";

function prefs(overrides: Partial<SoundPrefs> = {}): SoundPrefs {
  return structuredClone({ ...DEFAULT_SOUND_PREFS, ...overrides });
}

describe("sons", () => {
  it("sont activés par défaut", () => {
    expect(shouldPlay(prefs(), "clic")).toBe(true);
    expect(shouldPlay(prefs(), "carillon")).toBe(true);
  });

  it("se taisent quand le son général, le volume ou la catégorie est coupé", () => {
    expect(shouldPlay(prefs({ enabled: false }), "bulle")).toBe(false);
    expect(shouldPlay(prefs({ volume: 0 }), "bulle")).toBe(false);
    const p = prefs();
    p.categories.interface = false;
    expect(shouldPlay(p, "clic")).toBe(false);
    expect(shouldPlay(p, "deverrouillage")).toBe(true);
  });

  it("dose le volume sur une courbe douce", () => {
    expect(gainFor(0)).toBe(0);
    expect(gainFor(100)).toBe(1);
    expect(gainFor(50)).toBeCloseTo(0.25);
    expect(gainFor(150)).toBe(1);
    expect(gainFor(-10)).toBe(0);
  });

  it("donne à chaque thème sa couleur sonore", () => {
    expect(paletteFor("aqua")).toBe(PALETTES.aqua);
    expect(paletteFor("nuit-etoilee").wave).toBe("triangle");
    expect(paletteFor("inconnu")).toBe(PALETTES.aqua);
    for (const t of THEMES) expect(PALETTES[t.id], t.id).toBeDefined();
    expect(paletteFor("hiver").shimmer).toBeGreaterThan(0.4);
    expect(paletteFor("lagon").echo).toBeGreaterThan(0);
    const labels = Object.values(PALETTES).map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("reste dans une hauteur agréable une fois transposé", () => {
    for (const p of Object.values(PALETTES)) {
      for (const notes of Object.values(SCORES)) {
        for (const note of notes) {
          const freq = note.freq * 2 ** (p.transpose / 12);
          expect(freq).toBeGreaterThan(300);
          expect(freq).toBeLessThan(2600);
        }
      }
    }
  });

  it("garde des sons courts et doux", () => {
    for (const notes of Object.values(SCORES)) {
      for (const note of notes) {
        expect(note.gain).toBeLessThanOrEqual(0.2);
        expect(note.at + note.duration).toBeLessThan(2);
      }
    }
  });
});
