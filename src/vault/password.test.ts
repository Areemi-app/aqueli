import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password";

describe("solidité du mot de passe", () => {
  it("n'affiche rien tant que rien n'est tapé", () => {
    const s = passwordStrength("");
    expect(s.score).toBe(0);
    expect(s.label).toBe("");
    expect(s.acceptable).toBe(false);
  });

  it("refuse moins de 8 caractères et dit combien il en manque", () => {
    const s = passwordStrength("bulle");
    expect(s.acceptable).toBe(false);
    expect(s.label).toBe("Trop court");
    expect(s.hint).toBe("8 caractères minimum (encore 3).");
    expect(passwordStrength("bulles!").hint).toBe("8 caractères minimum (encore 1).");
  });

  it("compte les lettres accentuées comme un seul caractère", () => {
    expect(passwordStrength("éèêëàâîï").acceptable).toBe(true);
  });

  it("juge faibles les mots de passe connus et les motifs répétés", () => {
    expect(passwordStrength("motdepasse123").score).toBeLessThanOrEqual(2);
    expect(passwordStrength("Mot de passe !").score).toBeLessThanOrEqual(2);
    expect(passwordStrength("azertyuiop").label).toBe("Faible");
    expect(passwordStrength("abababababab").label).toBe("Faible");
    expect(passwordStrength("azertyuiop").hint).toBe("Mot de passe trop courant ou répétitif.");
  });

  it("récompense la longueur et la variété", () => {
    expect(passwordStrength("bullesbleues").score).toBe(2);
    expect(passwordStrength("Bulles bleues 42").score).toBe(4);
    expect(passwordStrength("Les bulles montent au ciel !").label).toBe("Très fort");
    expect(passwordStrength("Les bulles montent au ciel !").hint).toBe("");
  });

  it("recommande 12 caractères quand c'est court", () => {
    expect(passwordStrength("Lagon8!x").hint).toBe("12 caractères ou plus recommandés.");
  });
});
