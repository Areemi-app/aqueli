/** Raccourcis dans les textes d'aide et de visite : `{palette}`, `{newItem}`… remplacés par ceux en vigueur. */
import { shortcutText, type CommandId, type ShortcutMap } from "../app/shortcuts";

const TOKEN = /\{(\w+)\}/g;

/** Remplace `{palette}`, `{newItem}`… par les raccourcis en vigueur ; `{capture}` par celui de la capture rapide. */
export function fillShortcuts(text: string, keys: ShortcutMap, capture: string): string {
  return text.replace(TOKEN, (whole, id: string) => {
    if (id === "capture") return capture;
    return id in keys ? shortcutText(id as CommandId, keys) : whole;
  });
}
