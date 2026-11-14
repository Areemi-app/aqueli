import { describe, expect, it } from "vitest";
import { cleanDigits, settle, stepped } from "./numberInput";

describe("saisie d'un nombre", () => {
  it("aucun zéro ne reste en tête", () => {
    expect(cleanDigits("05", 4)).toBe("5");
    expect(cleanDigits("0", 4)).toBe("0");
    expect(cleanDigits("007", 4)).toBe("7");
    expect(cleanDigits("10", 4)).toBe("10");
  });

  it("seuls les chiffres comptent, jusqu'à la longueur prévue", () => {
    expect(cleanDigits("1 2a3", 4)).toBe("123");
    expect(cleanDigits("12345", 3)).toBe("123");
    expect(cleanDigits("", 3)).toBe("");
  });

  it("les chiffres arabes et pleine chasse deviennent latins", () => {
    expect(cleanDigits("١٢", 4)).toBe("12");
    expect(cleanDigits("۳", 4)).toBe("3");
    expect(cleanDigits("２５", 4)).toBe("25");
  });

  it("en quittant le champ, la valeur reste dans ses bornes, et un champ vide reprend la sienne", () => {
    expect(settle("", 8, 1, 1000)).toBe(8);
    expect(settle("0", 8, 1, 1000)).toBe(1);
    expect(settle("5000", 8, 1, 1000)).toBe(1000);
    expect(settle("12", 8, 1, 1000)).toBe(12);
  });

  it("les flèches avancent d'un sans sortir des bornes", () => {
    expect(stepped(5, 1, 1, 10)).toBe(6);
    expect(stepped(10, 1, 1, 10)).toBe(10);
    expect(stepped(1, -1, 1, 10)).toBe(1);
  });
});
