import { describe, expect, it } from "vitest";
import { MODULE_GROUPS, MODULES } from "./modules";

describe("catégories des modules", () => {
  it("rangent chaque module, l'Accueil en tête puis le Bilan, mis en avant", () => {
    expect(MODULES[0]?.key).toBe("accueil");
    expect(MODULES[0]?.group).toBeUndefined();
    expect(MODULES[1]).toMatchObject({ key: "bilan", featured: true });
    expect(MODULES[1]?.group).toBeUndefined();
    for (const m of MODULES.slice(2)) expect(MODULE_GROUPS.some((g) => g.key === m.group)).toBe(true);
  });

  it("suivent l'ordre de la barre latérale, pour que Ctrl+1 à 9 correspondent à l'affichage", () => {
    const order = MODULES.slice(2).map((m) => MODULE_GROUPS.findIndex((g) => g.key === m.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("gardent l'ordre des modules principaux", () => {
    expect(MODULES.slice(0, 8).map((m) => m.key)).toEqual(["accueil", "bilan", "taches", "calendrier", "obligations", "notes", "journal", "habitudes"]);
  });
});
