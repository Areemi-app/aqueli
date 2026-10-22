import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prefs, PrefsBackend } from "./storage";

const isString = (v: unknown): v is string => typeof v === "string";
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Faux fichier preferences.json. */
function fakeBackend(initial: Prefs = {}) {
  const saves: Prefs[] = [];
  let fail = false;
  const backend: PrefsBackend = {
    load: async () => structuredClone(initial),
    save: async (prefs) => {
      if (fail) throw new Error("disque plein");
      saves.push(structuredClone(prefs));
    },
  };
  return { backend, saves, failSaves: () => (fail = true) };
}

/** Module neuf à chaque test : les préférences en mémoire repartent de zéro. */
async function freshStorage() {
  vi.resetModules();
  return import("./storage");
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("préférences d'affichage", () => {
  it("sont lues depuis le fichier", async () => {
    const { loadPrefs, readPref } = await freshStorage();
    await loadPrefs(fakeBackend({ theme: "nuit-etoilee", volume: 40 }).backend);
    expect(readPref("theme", "aqua", isString)).toBe("nuit-etoilee");
    expect(readPref("absente", "aqua", isString)).toBe("aqua");
    expect(readPref("volume", "aqua", isString)).toBe("aqua");
  });

  it("sont enregistrées dans le fichier, plusieurs changements rapprochés en un seul envoi", async () => {
    vi.useFakeTimers();
    const { loadPrefs, readPref, writePref } = await freshStorage();
    const fake = fakeBackend({ theme: "aqua" });
    await loadPrefs(fake.backend);

    writePref("theme", "nuit-etoilee");
    writePref("dernierEcran", "taches");
    expect(readPref("theme", "aqua", isString)).toBe("nuit-etoilee");
    expect(fake.saves).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(200);
    expect(fake.saves).toEqual([{ theme: "nuit-etoilee", dernierEcran: "taches" }]);
  });

  it("enregistrent tout de suite les changements en attente à la fermeture", async () => {
    const { flushPrefs, loadPrefs, writePref } = await freshStorage();
    const fake = fakeBackend();
    await loadPrefs(fake.backend);
    writePref("theme", "aqua");
    await flushPrefs();
    expect(fake.saves.at(-1)).toEqual({ theme: "aqua" });
  });

  it("ne changent pas si l'on modifie une valeur lue", async () => {
    const { loadPrefs, readPref } = await freshStorage();
    await loadPrefs(fakeBackend({ sons: { enabled: true } }).backend);
    const sons = readPref<Record<string, unknown>>("sons", {}, isObject);
    sons.enabled = false;
    expect(readPref<Record<string, unknown>>("sons", {}, isObject)).toEqual({ enabled: true });
  });

  it("gardent les réglages par défaut si le fichier est illisible", async () => {
    const { loadPrefs, readPref } = await freshStorage();
    await loadPrefs({ load: () => Promise.reject(new Error("illisible")), save: async () => {} });
    expect(readPref("theme", "aqua", isString)).toBe("aqua");
  });
});

describe("préférences du stockage local (versions précédentes)", () => {
  it("sont reprises dans le fichier, puis effacées", async () => {
    window.localStorage.setItem("aqueli.theme", '"nuit-etoilee"');
    window.localStorage.setItem("aqualis.dernierEcran", '"notes"');
    window.localStorage.setItem("autre.cle", "1");
    const { loadPrefs, readPref } = await freshStorage();
    const fake = fakeBackend();

    await loadPrefs(fake.backend, window.localStorage);

    expect(readPref("theme", "aqua", isString)).toBe("nuit-etoilee");
    expect(readPref("dernierEcran", "accueil", isString)).toBe("notes");
    expect(fake.saves).toEqual([{ theme: "nuit-etoilee", dernierEcran: "notes" }]);
    expect(window.localStorage.getItem("aqueli.theme")).toBeNull();
    expect(window.localStorage.getItem("aqualis.dernierEcran")).toBeNull();
    expect(window.localStorage.getItem("autre.cle")).toBe("1");
  });

  it("ne remplacent pas celles du fichier ; le nouveau nom l'emporte sur l'ancien", async () => {
    window.localStorage.setItem("aqueli.theme", '"aqua"');
    window.localStorage.setItem("aqualis.sons", '{"enabled":false}');
    window.localStorage.setItem("aqueli.sons", '{"enabled":true}');
    const { loadPrefs, readPref } = await freshStorage();

    await loadPrefs(fakeBackend({ theme: "nuit-etoilee" }).backend, window.localStorage);

    expect(readPref("theme", "aqua", isString)).toBe("nuit-etoilee");
    expect(readPref("sons", {}, isObject)).toEqual({ enabled: true });
  });

  it("sont gardées si le fichier ne peut pas être écrit", async () => {
    window.localStorage.setItem("aqueli.theme", '"nuit-etoilee"');
    const { loadPrefs, readPref } = await freshStorage();
    const fake = fakeBackend();
    fake.failSaves();

    await loadPrefs(fake.backend, window.localStorage);

    expect(readPref("theme", "aqua", isString)).toBe("nuit-etoilee");
    expect(window.localStorage.getItem("aqueli.theme")).toBe('"nuit-etoilee"');
  });

  it("ignorent une valeur illisible", async () => {
    window.localStorage.setItem("aqueli.theme", "{pas du json");
    const { loadPrefs, readPref } = await freshStorage();
    await loadPrefs(fakeBackend().backend, window.localStorage);
    expect(readPref("theme", "aqua", isString)).toBe("aqua");
    expect(window.localStorage.getItem("aqueli.theme")).toBeNull();
  });
});
