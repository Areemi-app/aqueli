import { describe, expect, it } from "vitest";
import { describeEvent } from "./securityLog";

describe("journal de sécurité", () => {
  it("nomme chaque événement en clair", () => {
    expect(describeEvent({ event: "deverrouillage", detail: null })).toMatchObject({ label: "Déverrouillage par mot de passe", detail: null, tone: null });
    expect(describeEvent({ event: "deverrouillage-windows-hello", detail: null }).label).toBe("Déverrouillage par Windows Hello");
    expect(describeEvent({ event: "export", detail: "Fichier .vcf" })).toMatchObject({ label: "Export", detail: "Fichier .vcf" });
    expect(describeEvent({ event: "inconnu", detail: null }).label).toBe("Événement : inconnu");
  });

  it("signale les essais erronés et l'accès par la clé de récupération", () => {
    expect(describeEvent({ event: "deverrouillage", detail: "3 essai(s) raté(s) avant ce déverrouillage" })).toMatchObject({
      detail: "3 essais erronés avant ce déverrouillage",
      tone: "warn",
    });
    expect(describeEvent({ event: "deverrouillage", detail: "1 essai(s) raté(s) avant ce déverrouillage" }).detail).toBe("1 essai erroné avant ce déverrouillage");
    expect(describeEvent({ event: "recuperation", detail: null }).tone).toBe("warn");
  });

  it("date la sauvegarde restaurée", () => {
    expect(describeEvent({ event: "restauration", detail: "2026-10-04" }).detail).toBe("Sauvegarde du 4 octobre 2026");
  });
});
