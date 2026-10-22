import { describe, expect, it } from "vitest";
import { spacesApi } from "../spaces/api";
import { localizeDefaults } from "./defaults";

describe("noms de départ", () => {
  it("suivent la langue tant que la personne ne les a pas renommés", async () => {
    const byId = async () => Object.fromEntries((await spacesApi.list()).map((s) => [s.id, s]));
    const before = await byId();
    // Compte créé en anglais, puis passé en français ; « Famille » renommé par la personne.
    await spacesApi.update("perso", "Personal", before.perso!.color, before.perso!.icon);
    await spacesApi.update("famille", "Maison", before.famille!.color, before.famille!.icon);
    await localizeDefaults();
    const after = await byId();
    expect(after.perso!.name).toBe("Perso");
    expect(after.travail!.name).toBe("Travail");
    expect(after.famille!.name).toBe("Maison");
  });
});
