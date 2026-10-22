import { describe, expect, it } from "vitest";
import { AVATAR_CATEGORIES, AVATARS, avatarById, randomAvatarId } from "./avatars";

describe("banque d'images de profil", () => {
  it("propose un grand choix, dans chaque thème", () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(70);
    for (const c of AVATAR_CATEGORIES) expect(AVATARS.filter((a) => a.category === c.id).length).toBeGreaterThanOrEqual(6);
  });

  it("donne à chaque image un identifiant unique, que le cœur accepte", () => {
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Même règle que accounts::profile (src-tauri/src/accounts.rs).
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it("dessine chaque image en SVG bien formé, sans script ni lien", () => {
    const parser = new DOMParser();
    for (const a of AVATARS) {
      const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${a.body}</svg>`, "image/svg+xml");
      expect(doc.querySelector("parsererror"), a.id).toBeNull();
      expect(a.body).not.toMatch(/<script|href|on[a-z]+=/i);
      expect(a.bg).toHaveLength(2);
    }
  });

  it("retrouve une image par son identifiant et en tire une au hasard", () => {
    expect(avatarById("canard")?.category).toBe("animaux");
    expect(avatarById("inconnu")).toBeNull();
    expect(avatarById("")).toBeNull();
    expect(avatarById(randomAvatarId(() => 0.999))).not.toBeNull();
    expect(randomAvatarId(() => 0)).toBe(AVATARS[0]!.id);
  });
});
