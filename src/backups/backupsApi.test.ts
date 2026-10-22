import { describe, expect, it } from "vitest";
import { formatSize, previewText } from "./backupsApi";

describe("sauvegardes", () => {
  it("affichent leur taille en Ko ou en Mo", () => {
    expect(formatSize(300)).toBe("1 Ko");
    expect(formatSize(512 * 1024)).toBe("512 Ko");
    expect(formatSize(1.25 * 1024 * 1024)).toBe("1,3 Mo");
  });

  it("résument leur contenu, au singulier comme au pluriel", () => {
    expect(previewText({ tasks: 1, events: 0, obligations: 12, notes: 1500 })).toBe(
      "1 tâche · 0 événement · 12 obligations · 1 500 notes",
    );
  });
});
