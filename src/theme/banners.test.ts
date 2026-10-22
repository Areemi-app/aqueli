import { describe, expect, it } from "vitest";
import { THEMES } from "./themes";
import { bannerImage, hasBanner, scatter } from "./banners";

describe("bannières des thèmes", () => {
  it("chaque thème fourni a sa frise, sans valeur manquante", () => {
    for (const theme of THEMES) {
      expect(hasBanner(theme.id), theme.id).toBe(true);
      const url = hasBanner(theme.id) ? bannerImage(theme.id) : null;
      expect(url, theme.id).toBeTruthy();
      expect(decodeURIComponent(url!), theme.id).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("les éléments semés ne se touchent pas", () => {
    const avoid = [{ x: 200, y: 32, r: 20 }];
    const spots = scatter(14, [0, 400, 0, 64], [3, 10], 5, 4, avoid);
    expect(spots.length).toBeGreaterThan(6);
    for (const a of [...spots, ...avoid])
      for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r + 4);
  });
});
