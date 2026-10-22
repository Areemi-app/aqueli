import { describe, expect, it } from "vitest";
import { errorWaitSeconds, formatWait, vaultErrorMessage } from "./messages";

describe("messages du coffre", () => {
  it("écrit les attentes simplement", () => {
    expect(formatWait(30)).toBe("30 s");
    expect(formatWait(0.2)).toBe("1 s");
    expect(formatWait(60)).toBe("1 min");
    expect(formatWait(61)).toBe("2 min");
    expect(formatWait(900)).toBe("15 min");
    expect(formatWait(3600)).toBe("1 h");
  });

  it("un mauvais mot de passe donne un constat bref", () => {
    expect(vaultErrorMessage({ code: "wrongPassword", attemptsLeft: 4, waitSeconds: 0 })).toBe(
      "Mot de passe incorrect.",
    );
  });

  it("indique les tentatives restantes quand il en reste peu", () => {
    expect(vaultErrorMessage({ code: "wrongPassword", attemptsLeft: 1, waitSeconds: 0 })).toBe(
      "Mot de passe incorrect. 1 tentative restante.",
    );
    expect(vaultErrorMessage({ code: "wrongPassword", attemptsLeft: 2, waitSeconds: 0 })).toBe(
      "Mot de passe incorrect. 2 tentatives restantes.",
    );
  });

  it("annonce l'attente après trop d'erreurs", () => {
    const error = { code: "wrongPassword", attemptsLeft: 0, waitSeconds: 30 } as const;
    expect(vaultErrorMessage(error)).toBe("Mot de passe incorrect. Réessayez dans 30 s.");
    expect(errorWaitSeconds(error)).toBe(30);
    expect(vaultErrorMessage({ code: "tooManyAttempts", waitSeconds: 300 })).toBe(
      "Trop de tentatives. Réessayez dans 5 min.",
    );
    expect(errorWaitSeconds({ code: "notFound" })).toBe(0);
  });

  it("dit quoi faire si les fichiers sont endommagés", () => {
    expect(vaultErrorMessage({ code: "corrupted", detail: "en-tête illisible" })).toBe(
      "Fichiers de données endommagés (en-tête illisible). Ne les supprimez pas.",
    );
  });

  it("décrit sobrement les cas Windows Hello", () => {
    expect(vaultErrorMessage({ code: "helloCancelled" })).toBe("Vérification Windows Hello annulée.");
    expect(vaultErrorMessage({ code: "helloPasswordRequired" })).toBe("Mot de passe requis pour cette session Windows.");
    expect(vaultErrorMessage({ code: "helloFailed", detail: "clé introuvable" })).toBe(
      "Échec de Windows Hello (clé introuvable). Utilisez votre mot de passe.",
    );
  });
});
