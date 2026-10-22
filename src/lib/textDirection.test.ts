import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { readOnlyExtensions } from "../notes/editor/extensions";
import { applyDirection, directionTracker } from "./textDirection";

const key = (key: string, code: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key,
  code,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
  metaKey: false,
});

describe("Ctrl+Maj, comme dans Windows", () => {
  it("Ctrl puis Maj droite : de droite à gauche ; Maj gauche : de gauche à droite", () => {
    const t = directionTracker();
    t.down(key("Control", "ControlLeft", { ctrl: true }));
    t.down(key("Shift", "ShiftRight", { ctrl: true, shift: true }));
    expect(t.up(key("Shift", "ShiftRight", { ctrl: true }))).toBe("rtl");
    t.down(key("Shift", "ShiftLeft", { ctrl: true, shift: true }));
    expect(t.up(key("Control", "ControlLeft", { shift: true }))).toBe("ltr");
  });

  it("Maj d'abord, puis Ctrl : le même sens", () => {
    const t = directionTracker();
    t.down(key("Shift", "ShiftRight", { shift: true }));
    t.down(key("Control", "ControlRight", { ctrl: true, shift: true }));
    expect(t.up(key("Control", "ControlRight", { shift: true }))).toBe("rtl");
  });

  it("un autre raccourci (Ctrl+Maj+S) ou AltGr ne change rien", () => {
    const t = directionTracker();
    t.down(key("Control", "ControlLeft", { ctrl: true }));
    t.down(key("Shift", "ShiftRight", { ctrl: true, shift: true }));
    t.down(key("S", "KeyS", { ctrl: true, shift: true }));
    expect(t.up(key("Shift", "ShiftRight", { ctrl: true }))).toBeNull();
    t.down(key("Shift", "ShiftRight", { ctrl: true, shift: true, alt: true }));
    expect(t.up(key("Shift", "ShiftRight", { ctrl: true, alt: true }))).toBeNull();
  });

  it("un champ de saisie prend le sens demandé", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    const check = document.createElement("input");
    check.type = "checkbox";
    expect(applyDirection(input, "rtl")).toBe(true);
    expect(applyDirection(area, "rtl")).toBe(true);
    expect(applyDirection(check, "rtl")).toBe(false);
    expect([input.dir, area.dir, check.dir]).toEqual(["rtl", "rtl", ""]);
  });
});

describe("sens d'un paragraphe de note", () => {
  const editorWith = (content: object) => {
    const element = document.createElement("div");
    document.body.append(element);
    return new Editor({ element, extensions: readOnlyExtensions(), content });
  };

  it("est gardé dans la note, et le paragraphe voisin n'en prend pas", () => {
    const editor = editorWith({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "مرحبا بالعالم" }] },
        { type: "paragraph", content: [{ type: "text", text: "Bonjour" }] },
      ],
    });
    editor.commands.setTextSelection(2);
    expect(applyDirection(editor.view.dom, "rtl")).toBe(true);
    const json = editor.getJSON();
    expect(json.content?.[0]?.attrs?.dir).toBe("rtl");
    expect(json.content?.[1]?.attrs?.dir ?? null).toBeNull();
    // Relue, la note garde son sens.
    const again = editorWith(json);
    expect(again.view.dom.querySelector("p")?.getAttribute("dir")).toBe("rtl");
    editor.commands.setTextSelection(2);
    editor.commands.setBlockDirection("ltr");
    expect(editor.getJSON().content?.[0]?.attrs?.dir).toBe("ltr");
  });

  it("dans une liste, l'élément entier change de sens, puce comprise", () => {
    const editor = editorWith({
      type: "doc",
      content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "שלום" }] }] }] }],
    });
    editor.commands.setTextSelection(3);
    editor.commands.setBlockDirection("rtl");
    expect(editor.view.dom.querySelector("li")?.getAttribute("dir")).toBe("rtl");
  });
});
