import { beforeEach, describe, expect, it } from "vitest";
import { clearUndo, collectUndo, forgetUndo, isCollecting, MAX_UNDO, popUndo, recordUndo, replay, undoCount } from "./undo";

describe("annuler (Ctrl+Z)", () => {
  beforeEach(clearUndo);

  it("reprend les actions de la plus récente à la plus ancienne", () => {
    recordUndo("première", () => undefined);
    recordUndo("seconde", () => undefined);
    expect(popUndo()?.label).toBe("seconde");
    expect(popUndo()?.label).toBe("première");
    expect(popUndo()).toBeNull();
  });

  it("regroupe les modifications rapprochées d'un même élément, et garde l'état d'avant la première", () => {
    const first = recordUndo("modification", () => "avant", "task:1", 1000);
    const again = recordUndo("modification", () => "après", "task:1", 2500);
    expect(again).toBe(first);
    expect(undoCount()).toBe(1);
    expect(popUndo()?.run()).toBe("avant");
    recordUndo("modification", () => undefined, "task:1", 1000);
    recordUndo("modification", () => undefined, "task:1", 9000);
    expect(undoCount(), "plus de 3 secondes après : une nouvelle action").toBe(2);
  });

  it("n'inscrit rien pendant une annulation", async () => {
    await replay(async () => {
      recordUndo("pendant", () => undefined);
      await Promise.resolve();
      recordUndo("toujours pendant", () => undefined);
    });
    expect(undoCount()).toBe(0);
  });

  it("oublie une action annulée par son bouton, et ne garde que les dernières", () => {
    const id = recordUndo("suppression", () => undefined);
    forgetUndo(id!);
    expect(undoCount()).toBe(0);
    for (let i = 0; i < MAX_UNDO + 5; i++) recordUndo(`action ${i}`, () => undefined);
    expect(undoCount()).toBe(MAX_UNDO);
    expect(popUndo()?.label).toBe(`action ${MAX_UNDO + 4}`);
  });
});

describe("action sur plusieurs éléments", () => {
  beforeEach(() => clearUndo());

  it("réunit ce qui défait chaque élément en une seule annulation, dans l'ordre inverse", async () => {
    const done: string[] = [];
    const run = await collectUndo(async () => {
      expect(isCollecting()).toBe(true);
      recordUndo("suppression de la tâche", () => done.push("a"));
      recordUndo("suppression de la tâche", async () => {
        done.push("b");
      });
    });
    expect(isCollecting()).toBe(false);
    expect(undoCount()).toBe(0);
    await run?.();
    expect(done).toEqual(["b", "a"]);
  });

  it("ne renvoie rien quand aucune action n'a été inscrite", async () => {
    expect(await collectUndo(async () => {})).toBeNull();
  });
});
