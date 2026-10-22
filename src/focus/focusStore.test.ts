import { describe, expect, it, vi } from "vitest";
import { createFocusStore } from "./focusStore";

const MIN = 60_000;

describe("minuteur partagé", () => {
  it("se pilote de partout et garde les séances à enregistrer", () => {
    let clock = 1_000_000;
    const store = createFocusStore(() => clock, false);
    store.configure({ focus: 25, pause: 5, longPause: 15, every: 4 }, false);
    const changed = vi.fn();
    store.subscribe(changed);
    store.setIntention("Rapport");
    store.startWith("t1");
    expect(store.get()).toMatchObject({ status: "en-cours", taskId: "t1" });
    clock += 10 * MIN;
    store.toggle();
    expect(store.get().status).toBe("suspendu");
    clock += 5 * MIN;
    store.toggle();
    expect(store.get().endsAt).toBe(clock + 15 * MIN);
    clock += 2 * MIN;
    store.stop();
    expect(store.takeRecords()).toEqual([{ taskId: "t1", startedAt: 1_000_000, minutes: 12, note: "Rapport", undoable: true }]);
    expect(store.takeRecords()).toEqual([]);
    expect(changed).toHaveBeenCalled();
  });

  it("annonce la fin d'une phase et garde la séance terminée", () => {
    let clock = 0;
    const store = createFocusStore(() => clock, false);
    store.configure({ focus: 25, pause: 5, longPause: 15, every: 4 }, false);
    const ended = vi.fn();
    const records = vi.fn();
    store.onEnded(ended);
    store.onRecords(records);
    store.start();
    clock = 25 * MIN + 1;
    store.advance(clock);
    expect(ended).toHaveBeenCalledWith(["concentration"], expect.objectContaining({ phase: "pause" }));
    expect(records).toHaveBeenCalledTimes(1);
    expect(store.takeRecords()).toEqual([{ taskId: null, startedAt: 0, minutes: 25, note: null, undoable: false }]);
  });

  it("applique un nouveau plan tout de suite si rien n'a commencé", () => {
    const store = createFocusStore(() => 0, false);
    store.configure({ focus: 25, pause: 5, longPause: 15, every: 4 }, false);
    store.get();
    store.configure({ focus: 50, pause: 10, longPause: 20, every: 4 }, true);
    expect(store.get().remaining).toBe(50 * MIN);
  });
});
