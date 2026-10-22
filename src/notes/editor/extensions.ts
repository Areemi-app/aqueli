/**
 * Extensions de l'éditeur de notes (TipTap). La politique de sécurité de la fenêtre refuse les
 * styles écrits dans le document : les couleurs de surlignage passent par `data-color` et
 * les feuilles de style de l'application, jamais par un attribut `style`.
 */
import type { Editor, Extensions, Range } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Mention } from "@tiptap/extension-mention";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { StarterKit } from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { CONTACT_MENTION, NOTE_LINK } from "../notes";
import { slashCommands, type SlashHandlers } from "./slash";
import { tr } from "../../i18n/i18n";

/** Couleurs de surlignage, dans l'ordre du spectre. */
export const HIGHLIGHTS = [
  { id: "orange", label: tr("Orange") },
  { id: "jaune", label: tr("Jaune") },
  { id: "vert", label: tr("Vert") },
  { id: "bleu", label: tr("Bleu") },
  { id: "violet", label: tr("Violet") },
  { id: "rose", label: tr("Rose") },
] as const;

const NamedHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => {
          const color = element.getAttribute("data-color");
          return HIGHLIGHTS.some((h) => h.id === color) ? color : null;
        },
        renderHTML: (attributes) => (attributes.color ? { "data-color": attributes.color } : {}),
      },
    };
  },
});

/** Images collées ou choisies, gardées dans la note (jamais chargées depuis Internet). */
const LocalImage = Image.extend({
  parseHTML() {
    return [{ tag: 'img[src^="data:image/"]' }];
  },
});

/** Proposition de la liste « [[ » : une note existante, ou une note à créer (`id` nul). */
export interface LinkItem {
  id: string | null;
  label: string;
}

export interface LinkMenuState {
  /** Ce que la liste propose : des notes (« [[ ») ou des contacts (« @ »). */
  kind?: "note" | "contact";
  items: LinkItem[];
  selected: number;
  /** Position du texte saisi, pour placer la liste. */
  rect: DOMRect | null;
  pick: (item: LinkItem) => void;
}

export interface LinkHandlers {
  items: (query: string) => LinkItem[];
  show: (state: LinkMenuState | null) => void;
  /** Crée la note citée et renvoie son identifiant. */
  create: (title: string) => Promise<string | null>;
}

function insertLink(editor: Editor, range: Range, id: string, label: string) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: NOTE_LINK, attrs: { id, label, mentionSuggestionChar: "[[" } },
      { type: "text", text: " " },
    ])
    .run();
}

/** Lien vers une note, saisi avec « [[ ». */
function noteLink(handlers: LinkHandlers) {
  const choose = (editor: Editor, range: Range, item: LinkItem) => {
    if (item.id) {
      insertLink(editor, range, item.id, item.label);
      return;
    }
    void handlers.create(item.label).then((id) => {
      if (id) insertLink(editor, range, id, item.label);
    });
  };

  return Mention.extend({ name: NOTE_LINK }).configure({
    HTMLAttributes: { class: "note-link" },
    deleteTriggerWithBackspace: false,
    renderText: ({ node }) => `[[${String(node.attrs.label ?? "")}]]`,
    renderHTML: ({ options, node }) => ["span", options.HTMLAttributes, String(node.attrs.label ?? "")],
    suggestion: {
      char: "[[",
      allowSpaces: true,
      allowedPrefixes: null,
      decorationClass: "note-link-typing",
      items: ({ query }) => handlers.items(query.replace(/\]+$/, "")),
      command: ({ editor, range, props }) => choose(editor, range, props as LinkItem),
      render: () => {
        let state: LinkMenuState | null = null;
        const publish = () => handlers.show(state ? { ...state } : null);
        const open = (props: SuggestionProps<LinkItem, LinkItem>, selected: number) => {
          // « ]] » saisi à la main : la note de ce titre, ou une nouvelle.
          if (props.query.endsWith("]]")) {
            const label = props.query.slice(0, -2).trim();
            if (label) {
              const exact = props.items.find((i) => i.id && i.label.toLowerCase() === label.toLowerCase());
              choose(props.editor, props.range, exact ?? { id: null, label });
              return;
            }
          }
          state = {
            items: props.items,
            selected: Math.min(selected, Math.max(0, props.items.length - 1)),
            rect: props.clientRect?.() ?? null,
            pick: (item) => props.command(item),
          };
          publish();
        };
        return {
          onStart: (props: SuggestionProps<LinkItem, LinkItem>) => open(props, 0),
          onUpdate: (props: SuggestionProps<LinkItem, LinkItem>) => open(props, state?.selected ?? 0),
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            if (!state || state.items.length === 0) return false;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              const step = event.key === "ArrowDown" ? 1 : -1;
              state.selected = (state.selected + step + state.items.length) % state.items.length;
              publish();
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              const item = state.items[state.selected];
              if (item) state.pick(item);
              return true;
            }
            return false;
          },
          onExit: () => {
            state = null;
            publish();
          },
        };
      },
    },
  });
}

/** Contacts proposés après « @ » ; `picked` : le contact choisi (pour relier la note). */
export interface ContactHandlers {
  items: (query: string) => LinkItem[];
  show: (state: LinkMenuState | null) => void;
  picked: (id: string) => void;
}

/** Contact cité avec « @ » (après une espace ou en début de ligne : une adresse e-mail ne déclenche rien). */
function contactMention(handlers: ContactHandlers) {
  return Mention.extend({ name: CONTACT_MENTION }).configure({
    HTMLAttributes: { class: "contact-mention" },
    deleteTriggerWithBackspace: false,
    renderText: ({ node }) => `@${String(node.attrs.label ?? "")}`,
    renderHTML: ({ options, node }) => ["span", options.HTMLAttributes, `@${String(node.attrs.label ?? "")}`],
    suggestion: {
      char: "@",
      allowSpaces: true,
      decorationClass: "note-link-typing",
      items: ({ query }) => handlers.items(query),
      command: ({ editor, range, props }) => {
        const item = props as LinkItem;
        if (!item.id) return;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: CONTACT_MENTION, attrs: { id: item.id, label: item.label, mentionSuggestionChar: "@" } },
            { type: "text", text: " " },
          ])
          .run();
        handlers.picked(item.id);
      },
      render: () => {
        let state: LinkMenuState | null = null;
        const publish = () => handlers.show(state ? { ...state } : null);
        const open = (props: SuggestionProps<LinkItem, LinkItem>, selected: number) => {
          // Rien qui corresponde : la liste se ferme, le texte reste tel quel.
          if (props.items.length === 0) {
            state = null;
            publish();
            return;
          }
          state = {
            kind: "contact",
            items: props.items,
            selected: Math.min(selected, props.items.length - 1),
            rect: props.clientRect?.() ?? null,
            pick: (item) => props.command(item),
          };
          publish();
        };
        return {
          onStart: (props: SuggestionProps<LinkItem, LinkItem>) => open(props, 0),
          onUpdate: (props: SuggestionProps<LinkItem, LinkItem>) => open(props, state?.selected ?? 0),
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            if (!state || state.items.length === 0) return false;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              const step = event.key === "ArrowDown" ? 1 : -1;
              state.selected = (state.selected + step + state.items.length) % state.items.length;
              publish();
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              const item = state.items[state.selected];
              if (item) state.pick(item);
              return true;
            }
            return false;
          },
          onExit: () => {
            state = null;
            publish();
          },
        };
      },
    },
  });
}

/** Sans contacts (fenêtre d'une note, lecture d'une version) : « @ » reste du texte. */
const NO_CONTACTS: ContactHandlers = { items: () => [], show: () => undefined, picked: () => undefined };

export interface ExtensionOptions {
  placeholder: string;
  links: LinkHandlers;
  /** Contacts cités avec « @ » ; absents, les mentions déjà écrites s'affichent quand même. */
  contacts?: ContactHandlers;
  /** Menu « / » (éditeur seulement, pas la lecture d'une version). */
  slash?: SlashHandlers;
}

export function noteExtensions({ placeholder, links, contacts, slash }: ExtensionOptions): Extensions {
  return [
    StarterKit.configure({
      // Pas de liens web : une note ne quitte jamais ce PC et la fenêtre ne navigue pas.
      link: false,
      heading: { levels: [1, 2, 3] },
    }),
    TaskList,
    TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node) => node.textContent || tr("Élément sans texte") } }),
    NamedHighlight.configure({ multicolor: true }),
    TableKit.configure({ table: { resizable: false, cellMinWidth: 80 } }),
    LocalImage.configure({ allowBase64: true }),
    Placeholder.configure({ placeholder }),
    noteLink(links),
    contactMention(contacts ?? NO_CONTACTS),
    ...(slash ? [slashCommands(slash)] : []),
  ];
}

/** Extensions sans comportement de saisie (lecture d'une version, contrôle des modèles). */
export function readOnlyExtensions(): Extensions {
  return noteExtensions({ placeholder: "", links: { items: () => [], show: () => undefined, create: async () => null } });
}

/** Côté le plus long d'une image collée, en pixels. */
const MAX_IMAGE_SIDE = 1600;

/** Image réduite et compressée pour être gardée dans la note. */
export async function imageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}
