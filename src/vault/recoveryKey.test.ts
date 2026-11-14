import { describe, expect, it } from "vitest";
import { editRecoveryInput, formatRecoveryInput, isCompleteRecoveryKey, recoveryGroups } from "./recoveryKey";

describe("saisie de la clé de récupération", () => {
  it("met en majuscules et regroupe par 4", () => {
    expect(formatRecoveryInput("k7pq2m9d")).toBe("K7PQ-2M9D");
    expect(formatRecoveryInput("k7p")).toBe("K7P");
  });

  it("ignore espaces, tirets et caractères étrangers", () => {
    expect(formatRecoveryInput(" K7PQ - 2M9D / x4tb ")).toBe("K7PQ-2M9D-X4TB");
  });

  it("corrige O, I et L", () => {
    expect(formatRecoveryInput("OIL0")).toBe("0110");
  });

  it("s'arrête à 24 caractères", () => {
    const pasted = "ABCD0123EFGH4567JKMN89PQRSTV";
    expect(formatRecoveryInput(pasted)).toBe("ABCD-0123-EFGH-4567-JKMN-89PQ");
    expect(isCompleteRecoveryKey(formatRecoveryInput(pasted))).toBe(true);
    expect(isCompleteRecoveryKey("ABCD-0123")).toBe(false);
  });

  it("découpe une clé affichée en 6 groupes", () => {
    expect(recoveryGroups("ABCD-0123-EFGH-4567-JKMN-89PQ")).toHaveLength(6);
  });
});

describe("editRecoveryInput", () => {
  it("garde le curseur après le caractère saisi au milieu", () => {
    // « ABCD-EFGH », « x » saisi après « D ».
    expect(editRecoveryInput("ABCD-EFGH", "ABCDx-EFGH", 5)).toEqual({ value: "ABCD-XEFG-H", caret: 6 });
    expect(editRecoveryInput("ABC", "ABCD", 4)).toEqual({ value: "ABCD", caret: 4 });
    expect(editRecoveryInput("ABCD", "ABCDE", 5)).toEqual({ value: "ABCD-E", caret: 6 });
  });

  it("efface le caractère voisin d'un tiret effacé", () => {
    // Retour arrière juste après le tiret : « D » part.
    expect(editRecoveryInput("ABCD-EFGH", "ABCDEFGH", 4)).toEqual({ value: "ABCE-FGH", caret: 3 });
    // Suppr juste avant le tiret : « E » part.
    expect(editRecoveryInput("ABCD-EFGH", "ABCDEFGH", 4, true)).toEqual({ value: "ABCD-FGH", caret: 4 });
  });

  it("ne bouge pas le curseur pour un caractère refusé", () => {
    expect(editRecoveryInput("ABCD-EFGH", "AB!CD-EFGH", 3)).toEqual({ value: "ABCD-EFGH", caret: 2 });
  });
});
