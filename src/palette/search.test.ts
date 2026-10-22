import { describe, expect, it } from "vitest";
import { normalize, scoreItem, searchItems } from "./search";

const items = [
  { label: "Accueil" },
  { label: "Tâches", keywords: ["todo", "à faire"] },
  { label: "Calendrier", keywords: ["agenda", "rendez-vous"] },
  { label: "Paramètres", keywords: ["réglages", "options"] },
  { label: "Thème : Aqua", keywords: ["apparence", "couleurs"] },
  { label: "Thème : Nuit étoilée", keywords: ["apparence", "sombre"] },
];

const labels = (query: string) => searchItems(items, query).map((i) => i.label);

describe("recherche de la palette", () => {
  it("ignore accents, majuscules et ligatures", () => {
    expect(normalize("  Thème : NUIT  Étoilée ")).toBe("theme : nuit etoilee");
    expect(normalize("Cœur")).toBe("coeur");
  });

  it("montre tout quand rien n'est tapé", () => {
    expect(labels("")).toHaveLength(items.length);
  });

  it("trouve un module sans les accents", () => {
    expect(labels("taches")[0]).toBe("Tâches");
    expect(labels("parametres")[0]).toBe("Paramètres");
  });

  it("met en tête ce qui commence par la saisie", () => {
    expect(labels("cal")[0]).toBe("Calendrier");
  });

  it("cherche aussi dans les mots-clés", () => {
    expect(labels("agenda")).toEqual(["Calendrier"]);
    expect(labels("reglages")).toEqual(["Paramètres"]);
  });

  it("combine plusieurs mots", () => {
    expect(labels("theme nuit")).toEqual(["Thème : Nuit étoilée"]);
    expect(labels("sombre")).toEqual(["Thème : Nuit étoilée"]);
  });

  it("tolère une lettre oubliée", () => {
    expect(labels("calndrier")).toEqual(["Calendrier"]);
  });

  it("ne renvoie rien quand rien ne correspond", () => {
    expect(labels("xyz")).toEqual([]);
    expect(scoreItem("zzz", { label: "Accueil" })).toBe(0);
  });
});
