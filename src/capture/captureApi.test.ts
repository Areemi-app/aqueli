import { describe, expect, it } from "vitest";
import { DEFAULT_HOTKEY, hotkeyFromEvent, hotkeyKeys } from "./captureApi";

const press = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("raccourci de la capture rapide", () => {
  it("s'affiche dans l'ordre de Windows", () => {
    expect(hotkeyKeys(DEFAULT_HOTKEY)).toEqual(["Ctrl", "Alt", "A"]);
    expect(hotkeyKeys({ ctrl: false, alt: false, shift: true, win: true, key: 0x74 })).toEqual(["Maj", "Windows", "F5"]);
  });

  it("se lit au clavier, touche physique comprise sur un clavier AZERTY", () => {
    expect(hotkeyFromEvent(press("KeyN", { ctrlKey: true, shiftKey: true }))).toEqual({ ctrl: true, alt: false, shift: true, win: false, key: 0x4e });
    expect(hotkeyFromEvent(press("Digit1", { altKey: true }))).toEqual({ ctrl: false, alt: true, shift: false, win: false, key: 0x31 });
    expect(hotkeyFromEvent(press("F12", { metaKey: true }))?.key).toBe(0x7b);
    expect(hotkeyFromEvent(press("KeyA", { ctrlKey: true, altKey: true }))).toEqual(DEFAULT_HOTKEY);
    expect(hotkeyFromEvent(press("Space", { ctrlKey: true, altKey: true }))?.key).toBe(0x20);
  });

  it("refuse une touche seule, Maj seule ou une touche non prise en charge", () => {
    expect(hotkeyFromEvent(press("KeyA"))).toBeNull();
    expect(hotkeyFromEvent(press("KeyA", { shiftKey: true }))).toBeNull();
    expect(hotkeyFromEvent(press("Enter", { ctrlKey: true }))).toBeNull();
  });
});
