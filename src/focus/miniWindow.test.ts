import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string) => {
    calls.push(`début ${cmd}`);
    // L'ouverture répond lentement : un ordre suivant ne doit pas la doubler.
    const delay = cmd === "focus_mini_open" ? 30 : 1;
    return new Promise((resolve) => setTimeout(() => (calls.push(`fin ${cmd}`), resolve(null)), delay));
  },
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onFocusChanged: () => Promise.resolve(() => {}) }) }));
vi.mock("../lib/windowControls", () => ({ inTauri: true }));
vi.mock("./focusStore", () => ({
  focusStore: {
    get: () => ({
      phase: "concentration",
      status: "en-cours",
      endsAt: Date.now() + 60_000,
      remaining: 60_000,
      cycle: 1,
      startedAt: Date.now(),
      taskId: null,
      intention: null,
      plan: { focus: 25, pause: 5, longPause: 15, every: 4 },
    }),
    subscribe: () => () => {},
    toggle: () => {},
    stop: () => {},
    skip: () => {},
  },
}));

const { applyMiniAction, miniWindowState, pinMiniWindow } = await import("./miniWindow");
const settle = () => new Promise((r) => setTimeout(r, 80));

describe("petite fenêtre du mini-lecteur", () => {
  beforeEach(async () => {
    pinMiniWindow(false);
    await settle();
    calls.length = 0;
  });

  it("« Ouvrir Aqueli » juste après l'ouverture : la fenêtre finit fermée, après l'ouverture", async () => {
    pinMiniWindow(true);
    applyMiniAction("afficher");
    await settle();
    expect(miniWindowState()).toEqual({ pinned: true, shown: false });
    expect(calls.at(-1)).toBe("fin focus_mini_close");
    expect(calls.indexOf("début focus_mini_close")).toBeGreaterThan(calls.indexOf("fin focus_mini_open"));
  });

  it("« Fermer » l'emporte toujours, même pendant une ouverture", async () => {
    pinMiniWindow(true);
    applyMiniAction("detacher");
    await settle();
    expect(miniWindowState()).toEqual({ pinned: false, shown: false });
    expect(calls.at(-1)).toBe("fin focus_mini_close");
  });

  it("chaque ordre attend le précédent", async () => {
    pinMiniWindow(true);
    pinMiniWindow(false);
    pinMiniWindow(true);
    await settle();
    await settle();
    // Jamais deux ordres en cours en même temps.
    let open = 0;
    for (const c of calls) {
      open += c.startsWith("début") ? 1 : -1;
      expect(open).toBeLessThanOrEqual(1);
    }
    expect(miniWindowState().shown).toBe(true);
    expect(calls.at(-1)).toBe("fin focus_mini_open");
  });
});
