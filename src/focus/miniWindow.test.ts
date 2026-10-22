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
vi.mock("../lib/windowControls", () => ({ inTauri: true }));
vi.mock("../app/background", () => ({ onAppEvent: () => () => {} }));

let status: "arret" | "en-cours" = "en-cours";
const subscribers = new Set<() => void>();
vi.mock("./focusStore", () => ({
  focusStore: {
    get: () => ({
      phase: "concentration",
      status,
      endsAt: status === "en-cours" ? Date.now() + 60_000 : null,
      remaining: 60_000,
      cycle: 1,
      startedAt: null,
      taskId: null,
      intention: null,
      plan: { focus: 25, pause: 5, longPause: 15, every: 4 },
    }),
    subscribe: (fn: () => void) => (subscribers.add(fn), () => subscribers.delete(fn)),
    toggle: () => {},
    stop: () => {},
    skip: () => {},
  },
}));

const { applyMiniAction, miniWindowState, pinMiniWindow, startMiniBridge } = await import("./miniWindow");
const settle = () => new Promise((r) => setTimeout(r, 80));
const setStatus = (s: typeof status) => {
  status = s;
  subscribers.forEach((fn) => fn());
};

describe("petite fenêtre du mini-lecteur", () => {
  startMiniBridge();
  beforeEach(async () => {
    setStatus("en-cours");
    pinMiniWindow(false);
    await settle();
    calls.length = 0;
  });

  it("épinglée pendant une séance, elle est le seul lecteur, même en revenant dans Aqueli", async () => {
    pinMiniWindow(true);
    applyMiniAction("afficher");
    await settle();
    expect(miniWindowState()).toEqual({ pinned: true, shown: true });
    expect(calls.at(-1)).toBe("fin focus_mini_open");
  });

  it("« Fermer » l'emporte toujours, même pendant une ouverture", async () => {
    pinMiniWindow(true);
    applyMiniAction("detacher");
    await settle();
    expect(miniWindowState()).toEqual({ pinned: false, shown: false });
    expect(calls.at(-1)).toBe("fin focus_mini_close");
  });

  it("la fin de la séance la ferme, la suivante la rouvre si elle reste épinglée", async () => {
    pinMiniWindow(true);
    setStatus("arret");
    await settle();
    expect(miniWindowState()).toEqual({ pinned: true, shown: false });
    expect(calls.at(-1)).toBe("fin focus_mini_close");
    setStatus("en-cours");
    await settle();
    expect(miniWindowState().shown).toBe(true);
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
