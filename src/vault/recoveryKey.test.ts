import { describe, expect, it } from "vitest";
import { formatRecoveryInput, isCompleteRecoveryKey, recoveryGroups } from "./recoveryKey";

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
