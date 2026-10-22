/**
 * Sens d'écriture d'un paragraphe de note (Ctrl+Maj droite ou gauche, src/lib/textDirection.ts).
 * Sans réglage, un paragraphe prend le sens de sa première lettre ; un sens choisi est gardé dans
 * la note (attribut `dir`). Dans une liste, il s'applique à l'élément entier, puce ou case comprise.
 */
import { Extension } from "@tiptap/core";
import type { Direction } from "../../lib/textDirection";

const BLOCKS = ["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem", "tableCell", "tableHeader"];
const ITEMS = new Set(["listItem", "taskItem"]);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockDirection: {
      /** Sens des paragraphes de la sélection. */
      setBlockDirection: (direction: Direction) => ReturnType;
    };
  }
}

export const BlockDirection = Extension.create({
  name: "blockDirection",
  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => {
              const dir = element.getAttribute("dir");
              return dir === "rtl" || dir === "ltr" ? dir : null;
            },
            renderHTML: (attributes) => (attributes.dir ? { dir: attributes.dir } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setBlockDirection:
        (direction) =>
        ({ state, tr, dispatch }) => {
          const { from, to } = state.selection;
          const targets = new Set<number>();
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isTextblock) return true;
            // Dans une liste, l'élément entier ; sinon le paragraphe lui-même.
            const $pos = state.doc.resolve(pos + 1);
            let at = BLOCKS.includes(node.type.name) ? pos : -1;
            for (let depth = $pos.depth - 1; depth > 0; depth--) {
              if (ITEMS.has($pos.node(depth).type.name)) {
                at = $pos.before(depth);
                break;
              }
            }
            if (at >= 0) targets.add(at);
            return false;
          });
          if (targets.size === 0) return false;
          if (dispatch) {
            for (const pos of targets) tr.setNodeAttribute(pos, "dir", direction);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
