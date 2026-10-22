import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenuProvider, groupMoves, submenuEntry, tidyEntries, useContextMenu, type MenuAction, type MenuEntry } from "./ContextMenu";

const action = (label: string, run = () => {}): MenuEntry => ({ label, run });

describe("menu du clic droit", () => {

  it("réunit les entrées de rangement dans « Déplacer », et retire les sous-menus vides", () => {
    const entries: MenuEntry[] = [action("Ouvrir"), action("Monter"), action("Descendre"), "separator", action("Ranger dans « Maison »"), action("Supprimer")];
    const grouped = groupMoves(entries);
    expect(grouped.map((e) => (e === "separator" ? "—" : e.label))).toEqual(["Ouvrir", "Déplacer", "—", "Supprimer"]);
    const move = grouped[1] as MenuAction;
    expect(move.submenu?.map((e) => (e === "separator" ? "—" : e.label))).toEqual(["Monter", "Descendre", "—", "Ranger dans « Maison »"]);
    // Une seule entrée de rangement reste à sa place.
    expect(groupMoves([action("Ouvrir"), action("Ranger dans « Voisins »")]).map((e) => (e === "separator" ? "—" : e.label))).toEqual(["Ouvrir", "Ranger dans « Voisins »"]);
    expect(tidyEntries([action("A"), submenuEntry("Vide", undefined, ["separator"])])).toEqual([action("A")].map((a) => ({ ...(a as MenuAction), run: expect.any(Function) })));
  });

  it("ouvre un sous-menu avec la flèche droite et le referme avec la flèche gauche", () => {
    const run = vi.fn();
    function Target() {
      const openMenu = useContextMenu();
      return (
        <button type="button" onContextMenu={(e) => openMenu(e, [submenuEntry("Planifier", undefined, [action("Demain", run)]), action("Supprimer")])}>
          Tâche
        </button>
      );
    }
    render(
      <ContextMenuProvider>
        <Target />
      </ContextMenuProvider>,
    );
    fireEvent.contextMenu(screen.getByText("Tâche"), { clientX: 40, clientY: 40 });
    const parent = screen.getByRole("menuitem", { name: "Planifier" });
    expect(document.activeElement).toBe(parent);
    fireEvent.keyDown(parent, { key: "ArrowRight" });
    const child = screen.getByRole("menuitem", { name: "Demain" });
    expect(document.activeElement).toBe(child);
    fireEvent.keyDown(child, { key: "ArrowLeft" });
    expect(screen.queryByRole("menuitem", { name: "Demain" })).toBeNull();
    expect(document.activeElement).toBe(parent);
    fireEvent.click(parent);
    fireEvent.click(screen.getByRole("menuitem", { name: "Demain" }));
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("retire les séparateurs inutiles", () => {
    const a = action("A");
    const b = action("B");
    expect(tidyEntries(["separator", a, "separator", "separator", b, "separator"])).toEqual([a, "separator", b]);
    expect(tidyEntries(["separator"])).toEqual([]);
  });

  it("s'ouvre au clic droit, se parcourt au clavier et lance l'action", () => {
    const run = vi.fn();
    function Target() {
      const openMenu = useContextMenu();
      return (
        <button type="button" onContextMenu={(e) => openMenu(e, [action("Ouvrir"), { label: "Supprimer", shortcut: "Suppr", run }])}>
          Tâche
        </button>
      );
    }
    render(
      <ContextMenuProvider>
        <Target />
      </ContextMenuProvider>,
    );
    fireEvent.contextMenu(screen.getByText("Tâche"), { clientX: 40, clientY: 40 });
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Ouvrir", "SupprimerSuppr"]);
    expect(document.activeElement).toBe(items[0]);
    act(() => {
      fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.click(items[1]!);
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("se ferme avec Échap", () => {
    function Target() {
      const openMenu = useContextMenu();
      return <div onContextMenu={(e) => openMenu(e, [action("Ouvrir")])}>Zone</div>;
    }
    render(
      <ContextMenuProvider>
        <Target />
      </ContextMenuProvider>,
    );
    fireEvent.contextMenu(screen.getByText("Zone"), { clientX: 10, clientY: 10 });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
