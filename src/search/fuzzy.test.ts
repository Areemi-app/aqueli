import { describe, expect, it } from "vitest";
import { distance, matchScore, wordScore, words } from "./fuzzy";

const item = (title: string, body = "") => ({ titleWords: words(title), bodyWords: words(body) });

describe("recherche tolérante", () => {
  it("découpe en mots sans majuscules, accents ni ligatures", () => {
    expect(words("Réunion d'équipe — Œufs")).toEqual(["reunion", "d", "equipe", "oeufs"]);
  });

  it("mesure les fautes, lettres inversées comprises", () => {
    expect(distance("reunion", "reunion", 2)).toBe(0);
    expect(distance("reunoin", "reunion", 2)).toBe(1);
    expect(distance("garage", "garaeg", 2)).toBe(1);
    expect(distance("abc", "abcdefgh", 2)).toBe(3);
  });

  it("accepte le mot, son début, puis une faute (deux pour les mots longs)", () => {
    expect(wordScore("courses", "courses")).toBe(4);
    expect(wordScore("cour", "courses")).toBe(3);
    expect(wordScore("reunoin", "reunion")).toBe(2);
    expect(wordScore("reunio", "reunions")).toBe(3);
    expect(wordScore("anniversiare", "anniversaire")).toBe(2);
    expect(wordScore("chat", "chien")).toBe(0);
    expect(wordScore("bus", "bis"), "trop court pour une faute").toBe(0);
  });

  it("chaque mot cherché doit se retrouver ; le titre compte double", () => {
    const a = item("Réunion d'équipe", "Budget du trimestre");
    const b = item("Budget", "Réunion prévue");
    expect(matchScore(words("reunion budget"), a)).toBeGreaterThan(0);
    expect(matchScore(words("reunion"), a)).toBeGreaterThan(matchScore(words("reunion"), b));
    expect(matchScore(words("reunion vacances"), a)).toBe(0);
    expect(matchScore(words("reunoin"), a)).toBeGreaterThan(0);
  });
});
