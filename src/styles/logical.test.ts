import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Gardés physiques : positions centrées par `translate` ou qui suivent le dessin, et chevrons tracés
 * par deux bordures, retournés par `--aq-dir` (base.css). */
const PHYSICAL = new Set([
  ".mini-day[data-mark]::after",
  ".agenda-resize::after",
  ".aquarium-fish",
  ".sidebar-edge::after",
  ".obl-disclosure-arrow",
  '[data-skin="signature"] .widget-head .link-btn::after',
]);

describe("feuilles de style de droite à gauche", () => {
  it("marges, retraits et positions sont logiques, pour que l'arabe retourne la mise en page", () => {
    const found: string[] = [];
    for (const file of readdirSync("src/styles").filter((f) => f.endsWith(".css"))) {
      const css = readFileSync(`src/styles/${file}`, "utf8");
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = rule[1]!.trim().split("\n").pop()!.trim();
        for (const [, prop, value] of rule[2]!.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)) {
          const physical =
            !PHYSICAL.has(selector) &&
            (/^(margin|padding|border)-(left|right)/.test(prop!) ||
              /^border-(top|bottom)-(left|right)-radius$/.test(prop!) ||
              /^(left|right)$/.test(prop!) ||
              (/^(text-align|float)$/.test(prop!) && /^(left|right)$/.test(value!.trim())));
          if (physical) found.push(`${file} ${selector} { ${prop}: ${value!.trim()} }`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
