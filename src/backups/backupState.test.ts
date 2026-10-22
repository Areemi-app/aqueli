import { describe, expect, it } from "vitest";
import { backupAgo, backupFreshness } from "./backupState";

const NOW = 1_790_000_000;

describe("dernière sauvegarde", () => {
  it("se lit en temps écoulé", () => {
    expect(backupAgo(NOW - 20, NOW)).toBe("à l'instant");
    expect(backupAgo(NOW - 5 * 60, NOW)).toBe("il y a 5 min");
    expect(backupAgo(NOW - 2 * 3600, NOW)).toBe("il y a 2 h");
    expect(backupAgo(NOW - 30 * 3600, NOW)).toBe("hier");
    expect(backupAgo(NOW - 4 * 86_400, NOW)).toBe("il y a 4 jours");
    expect(backupAgo(NOW - 20 * 86_400, NOW)).toMatch(/^le \d+ /);
  });

  it("signale une sauvegarde absente ou ancienne", () => {
    expect(backupFreshness(null, NOW)).toBe("aucune");
    expect(backupFreshness(NOW - 3600, NOW)).toBe("recente");
    expect(backupFreshness(NOW - 2 * 86_400, NOW)).toBe("correcte");
    expect(backupFreshness(NOW - 5 * 86_400, NOW)).toBe("ancienne");
  });
});
