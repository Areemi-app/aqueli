import { describe, expect, it } from "vitest";
import { australianHolidays, type AustralianState } from "./australia";
import { countryHolidays } from "./countries";
import { TRADITIONS } from "./traditions";
import OFFICIAL from "./australia.official.json";

const STATES: AustralianState[] = ["nsw", "vic", "qld", "sa", "wa", "tas", "act", "nt"];
const days = (state: AustralianState, y: number) => australianHolidays(state, y).map((h) => h.day);

/**
 * Jours du jeu de données officiel (data.gov.au) qu'Aqueli ne reprend pas : fériés d'une seule
 * ville ou région, jours de la fonction publique ou des banques, deuil national de 2022.
 */
const NOT_GENERAL = /Bank Holiday|Easter Tuesday|Show|Regatta|Recreation Day|Mourning|Cup Day \(.*only|Launceston|Devonport|King Island|Burnie|Flinders|Hobart/i;

describe("jours fériés d'Australie", () => {
  for (const state of STATES) {
    it(`${state} : les mêmes jours que le jeu de données officiel de 2021 à 2025`, () => {
      const official = (OFFICIAL as Record<string, string[]>)[state]!;
      const problems: string[] = [];
      for (let y = 2021; y <= 2025; y++) {
        const expected = official.filter((r) => r.startsWith(`${y}-`) && !NOT_GENERAL.test(r)).map((r) => r.slice(0, 10));
        const ours = days(state, y);
        for (const d of expected) if (!ours.includes(d)) problems.push(`manque ${d} ${official.find((r) => r.startsWith(d))}`);
        for (const d of ours) if (!expected.includes(d)) problems.push(`en trop ${d}`);
      }
      // La finale de l'AFL de 2025 n'était pas encore fixée quand le jeu de données a paru.
      expect(problems.filter((p) => p !== "en trop 2025-09-26")).toEqual([]);
    });
  }

  it("suit les pages officielles des États pour 2026 et 2027", () => {
    expect(days("nsw", 2026)).toEqual(expect.arrayContaining(["2026-04-25", "2026-04-27", "2026-06-08", "2026-10-05", "2026-12-26", "2026-12-28"]));
    expect(days("nsw", 2027)).toEqual(expect.arrayContaining(["2027-04-25", "2027-04-26", "2027-06-14", "2027-12-27", "2027-12-28"]));
    expect(days("qld", 2026)).toEqual(expect.arrayContaining(["2026-05-04", "2026-10-05", "2026-12-24", "2026-12-28"]));
    expect(days("qld", 2026)).not.toContain("2026-04-27");
    expect(days("wa", 2026)).toEqual(expect.arrayContaining(["2026-03-02", "2026-04-25", "2026-04-27", "2026-06-01", "2026-09-28", "2026-12-28"]));
    expect(days("wa", 2027)).toEqual(expect.arrayContaining(["2027-03-01", "2027-04-26", "2027-06-07", "2027-09-27", "2027-12-27", "2027-12-28"]));
    expect(days("act", 2026)).toEqual(expect.arrayContaining(["2026-03-09", "2026-04-27", "2026-06-01", "2026-06-08", "2026-10-05"]));
    // Un jour n'est jamais compté deux fois.
    for (const state of STATES) for (let y = 2021; y <= 2030; y++) expect(new Set(days(state, y)).size).toBe(days(state, y).length);
  });

  it("propose chaque État, avec le changement d'heure de l'hémisphère sud là où il existe", () => {
    expect(countryHolidays("au-vic", 2026).some((h) => h.day === "2026-11-03")).toBe(true);
    const popular = TRADITIONS.find((t) => t.id === "populaire")!;
    const clock = (id: "au-nsw" | "au-qld") => popular.days(2026, id).filter((h) => h.day === "2026-04-05" || h.day === "2026-10-04");
    expect(clock("au-nsw")).toHaveLength(2);
    expect(clock("au-qld")).toHaveLength(0);
  });
});
