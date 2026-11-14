import { describe, expect, it } from "vitest";
import { writePref } from "../lib/storage";
import { AUTO_LOCK_CHOICES, autoLockLabel } from "../vault/VaultProvider";
import { readBackgroundPrefs } from "./background";

describe("verrouillage", () => {
  it("par défaut, Aqueli se verrouille avec Windows et en fermant la fenêtre", () => {
    expect(readBackgroundPrefs()).toMatchObject({ lockWithWindows: true, lockOnClose: true });
  });

  it("garde les choix de la personne, et seulement des valeurs valides", () => {
    writePref("arrierePlan", { lockWithWindows: false, lockOnClose: "non" });
    expect(readBackgroundPrefs()).toMatchObject({ lockWithWindows: false, lockOnClose: true });
  });

  it("le délai d'inactivité peut être « Jamais »", () => {
    expect(AUTO_LOCK_CHOICES).toContain(0);
    expect(autoLockLabel(0)).toBe("Jamais");
    expect(autoLockLabel(10)).toBe("10 min");
  });
});
