import { describe, expect, it } from "vitest";
import { itemAction, type ItemActions } from "./itemKeys";

const actions: Required<ItemActions> = {
  open: () => undefined,
  remove: () => undefined,
  rename: () => undefined,
  duplicate: () => undefined,
};
const key = (k: string, extra: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});

describe("raccourcis des éléments de liste", () => {
  it("Entrée ouvre, Suppr supprime, F2 renomme, Ctrl+D duplique", () => {
    expect(itemAction(key("Enter"), actions, false)).toBe(actions.open);
    expect(itemAction(key("Delete"), actions, false)).toBe(actions.remove);
    expect(itemAction(key("F2"), actions, false)).toBe(actions.rename);
    expect(itemAction(key("d", { ctrlKey: true }), actions, false)).toBe(actions.duplicate);
    expect(itemAction(key("D", { ctrlKey: true }), actions, false)).toBe(actions.duplicate);
  });

  it("laisse Entrée au bouton, qui ouvre déjà l'élément", () => {
    expect(itemAction(key("Enter"), actions, true)).toBeUndefined();
    expect(itemAction(key("Delete"), actions, true)).toBe(actions.remove);
  });

  it("ignore les combinaisons voisines et les actions absentes", () => {
    expect(itemAction(key("Delete", { shiftKey: true }), actions, false)).toBeUndefined();
    expect(itemAction(key("d"), actions, false)).toBeUndefined();
    expect(itemAction(key("d", { ctrlKey: true, shiftKey: true }), actions, false)).toBeUndefined();
    expect(itemAction(key("F2"), { open: actions.open }, false)).toBeUndefined();
  });
});
