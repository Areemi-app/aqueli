import { describe, expect, it } from "vitest";
import { formatDateLine, formatLongDate, greeting, isoWeek } from "./dates";

describe("dates à la française", () => {
  it("salue selon l'heure", () => {
    expect(greeting(new Date(2026, 8, 27, 8, 0))).toBe("Bonjour");
    expect(greeting(new Date(2026, 8, 27, 14, 0))).toBe("Bon après-midi");
    expect(greeting(new Date(2026, 8, 27, 21, 7))).toBe("Bonsoir");
    expect(greeting(new Date(2026, 8, 27, 2, 0))).toBe("Bonsoir");
  });

  it("salue par le prénom choisi, s'il y en a un", () => {
    expect(greeting(new Date(2026, 8, 27, 8, 0), "Léa")).toBe("Bonjour, Léa");
    expect(greeting(new Date(2026, 8, 27, 14, 0), "Léa")).toBe("Bon après-midi, Léa");
    expect(greeting(new Date(2026, 8, 27, 21, 7), "Léa")).toBe("Bonsoir, Léa");
    expect(greeting(new Date(2026, 8, 27, 8, 0), "")).toBe("Bonjour");
  });

  it("calcule la semaine ISO (semaine du lundi)", () => {
    expect(isoWeek(new Date(2026, 8, 27))).toBe(39); // dimanche 27 septembre 2026
    expect(isoWeek(new Date(2026, 8, 28))).toBe(40); // lundi suivant
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1); // jeudi 1er janvier 2026
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53); // vendredi 1er janvier 2027
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1); // lundi 30 décembre 2024
  });

  it("écrit la date en toutes lettres, avec majuscule", () => {
    expect(formatLongDate(new Date(2026, 8, 27))).toBe("Dimanche 27 septembre 2026");
    expect(formatDateLine(new Date(2026, 8, 27))).toBe("Dimanche 27 septembre 2026 · semaine 39");
  });
});
