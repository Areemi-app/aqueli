/**
 * Sens d'écriture (arabe, hébreu, persan…). Chaque texte prend le sens de sa première lettre
 * (`unicode-bidi: plaintext`, base.css). Comme dans Windows, Ctrl+Maj droite passe le champ, ou
 * le paragraphe d'une note, de droite à gauche, et Ctrl+Maj gauche de gauche à droite.
 */
export type Direction = "ltr" | "rtl";

interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** Ctrl et une touche Maj pressées seules, puis relâchées : le sens demandé. Toute autre touche
 * entre-temps (Ctrl+Maj+S…) annule, et Ctrl+Alt (AltGr) ne compte pas. */
export function directionTracker() {
  let shift: string | null = null;
  let pending: Direction | null = null;
  return {
    down(e: KeyLike): void {
      if (e.key === "Shift") shift = e.code;
      const modifier = e.key === "Shift" || e.key === "Control";
      if (!modifier) pending = null;
      else if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) pending = shift === "ShiftRight" ? "rtl" : shift === "ShiftLeft" ? "ltr" : null;
      else if (e.altKey || e.metaKey) pending = null;
    },
    up(e: KeyLike): Direction | null {
      if (e.key !== "Shift" && e.key !== "Control") return null;
      const result = pending;
      pending = null;
      return result;
    },
  };
}

const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", ""]);

/** Applique le sens au champ qui a le focus, ou au paragraphe de la note où est le curseur. */
export function applyDirection(target: Element | null, direction: Direction): boolean {
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && TEXT_INPUTS.has(target.getAttribute("type") ?? ""))) {
    target.dir = direction;
    return true;
  }
  // Éditeur des notes et du Journal (TipTap le rattache à sa zone de saisie).
  const editable = target?.closest<HTMLElement & { editor?: { commands: { setBlockDirection?: (d: Direction) => boolean } } }>(".ProseMirror");
  return editable?.editor?.commands.setBlockDirection?.(direction) ?? false;
}

let installed = false;

export function installTextDirection(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const tracker = directionTracker();
  window.addEventListener("keydown", (e) => tracker.down(e), true);
  window.addEventListener(
    "keyup",
    (e) => {
      const direction = tracker.up(e);
      if (direction) applyDirection(document.activeElement, direction);
    },
    true,
  );
  window.addEventListener("blur", () => tracker.up({ key: "Shift", code: "", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }));
}
