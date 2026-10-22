/** Sommaire d'une note : ses titres (niveaux 1 à 3), dans l'ordre. */
import type { Editor } from "@tiptap/core";
import { tr } from "../../i18n/i18n";

export interface OutlineEntry {
  level: 1 | 2 | 3;
  text: string;
  /** Rang du titre dans la note (le n-ième h1, h2 ou h3 du texte). */
  index: number;
}

export function outlineOf(editor: Pick<Editor, "state">): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "heading") return true;
    const text = node.textContent.trim();
    entries.push({ level: Math.min(3, Math.max(1, Number(node.attrs.level))) as 1 | 2 | 3, text: text || tr("Titre sans texte"), index: entries.length });
    return false;
  });
  return entries;
}

/** Temps de lecture, à 230 mots par minute (au moins une minute dès le premier mot). */
export function readingMinutes(words: number): number {
  return words === 0 ? 0 : Math.max(1, Math.round(words / 230));
}
