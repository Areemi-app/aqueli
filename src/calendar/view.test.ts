import { describe, expect, it } from "vitest";
import { formatRange, monthGrid, rangeLabel, shiftAnchor, startOfWeek, viewRange, weekDays } from "./view";

describe("vues du calendrier", () => {
  it("commence la semaine le lundi", () => {
    expect(startOfWeek("2026-09-28")).toBe("2026-09-28");
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28");
    expect(weekDays("2026-10-01")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("montre 6 semaines pour un mois", () => {
    const grid = monthGrid("2026-10-15");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-09-28");
    expect(grid[41]).toBe("2026-11-08");
  });

  it("donne la période affichée et la suivante", () => {
    expect(viewRange("semaine", "2026-10-01")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(viewRange("annee", "2026-10-01")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(viewRange("agenda", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-28" });
    expect(shiftAnchor("mois", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftAnchor("semaine", "2026-10-01", -1)).toBe("2026-09-24");
  });

  it("écrit la période comme la maquette", () => {
    expect(rangeLabel("semaine", "2026-09-30")).toBe("28 sept. – 4 oct. 2026");
    expect(rangeLabel("jour", "2026-09-28")).toBe("Lundi 28 septembre 2026");
    expect(rangeLabel("mois", "2026-09-28")).toBe("Septembre 2026");
    expect(formatRange("2026-12-28", "2027-01-03")).toBe("28 déc. 2026 – 3 janv. 2027");
  });
});
