import { describe, expect, it } from "vitest";
import { storedNotes } from "./ContactCard";

describe("notes d'un contact", () => {
  it("se comparent telles que le cœur les enregistre, pour ne pas effacer l'espace en cours de saisie", () => {
    expect(storedNotes("Aime le jazz ")).toBe("Aime le jazz");
    expect(storedNotes("Ligne 1\r\nLigne 2\n\n")).toBe("Ligne 1\nLigne 2");
    expect(storedNotes("  début gardé")).toBe("  début gardé");
  });
});
