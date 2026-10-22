import { describe, expect, it } from "vitest";
import { clampCrop, coverScale, drawTransform, INITIAL_CROP, outputSize, rotatedSize, zoomAt } from "./crop";

const photo = { width: 4000, height: 3000 };
const square = { width: 300, height: 300 };

describe("cadrage d'une image", () => {
  it("couvre le cadre sans zoom, la plus petite dimension au bord", () => {
    expect(coverScale(photo, 0, square)).toBeCloseTo(0.1);
    expect(rotatedSize(photo, 90)).toEqual({ width: 3000, height: 4000 });
    expect(coverScale(photo, 90, { width: 400, height: 300 })).toBeCloseTo(400 / 3000);
  });

  it("garde l'image sur tout le cadre quand on la déplace", () => {
    // 4000 × 3000 dans un carré de 300 : 400 × 300 affichés, 50 px de marge de chaque côté.
    expect(clampCrop({ ...INITIAL_CROP, offsetX: 120, offsetY: 40 }, photo, square)).toMatchObject({ offsetX: 50, offsetY: 0 });
    expect(clampCrop({ ...INITIAL_CROP, zoom: 2, offsetY: -500 }, photo, square)).toMatchObject({ zoom: 2, offsetY: -150 });
    expect(clampCrop({ ...INITIAL_CROP, zoom: 9 }, photo, square).zoom).toBe(4);
    expect(clampCrop({ ...INITIAL_CROP, zoom: 0.5 }, photo, square).zoom).toBe(1);
  });

  it("zoome autour du point visé", () => {
    const z = zoomAt(INITIAL_CROP, 2, { x: 150, y: 150 }, photo, square);
    expect(z).toMatchObject({ zoom: 2, offsetX: 0, offsetY: 0 });
    const corner = zoomAt(INITIAL_CROP, 2, { x: 300, y: 150 }, photo, square);
    expect(corner.offsetX).toBeCloseTo(-150);
    // Au retour à 1, le point visé reste en place autant que les limites le permettent.
    expect(zoomAt(corner, 1, { x: 300, y: 150 }, photo, square).offsetX).toBeCloseTo(0);
    expect(zoomAt({ ...INITIAL_CROP, zoom: 4, offsetX: -400 }, 1, { x: 0, y: 150 }, photo, square).offsetX).toBeCloseTo(-50);
  });

  it("produit une image aux proportions du cadre, dessinée comme à l'écran", () => {
    expect(outputSize({ width: 400, height: 300 }, 640)).toEqual({ width: 640, height: 480 });
    expect(outputSize(square, 320)).toEqual({ width: 320, height: 320 });
    const t = drawTransform({ zoom: 2, rotation: 90, offsetX: 10, offsetY: -20 }, photo, square, { width: 600, height: 600 });
    expect(t).toMatchObject({ x: 320, y: 260 });
    expect(t.angle).toBeCloseTo(Math.PI / 2);
    expect(t.scale).toBeCloseTo((300 / 3000) * 2 * 2);
  });
});
