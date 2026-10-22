/**
 * Menu « / » de l'éditeur de notes (comme Notion ou Obsidian) : en tête de ligne ou après une
 * espace, « / » ouvre la liste des blocs à insérer (titres, listes, tableau, image, lien vers une
 * note, date du jour…). Les lettres saisies ensuite la filtrent ; flèches, puis Entrée.
 */
import { Extension, type Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { ICONS } from "../../components/icons";
import { fold } from "../../lib/fold";
import { locale, tr } from "../../i18n/i18n";

export interface SlashItem {
  id: string;
  label: string;
  /** Ce que fait le bloc, ou le geste équivalent au clavier. */
  hint: string;
  icon: string;
  keywords: string;
  run: (editor: Editor) => void;
}

export interface SlashMenuState {
  items: SlashItem[];
  selected: number;
  rect: DOMRect | null;
  pick: (item: SlashItem) => void;
}

export interface SlashHandlers {
  show: (state: SlashMenuState | null) => void;
  /** Ouvre le choix d'une image (comme le bouton de la barre d'outils). */
  image: () => void;
}

const LONG_DATE = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function slashItems(image: () => void): SlashItem[] {
  const chain = (e: Editor) => e.chain().focus();
  return [
    { id: "texte", label: tr("Texte"), hint: tr("Paragraphe simple"), icon: ICONS.notes, keywords: tr("paragraphe normal"), run: (e) => chain(e).setParagraph().run() },
    { id: "titre1", label: tr("Titre 1"), hint: tr("« # » en début de ligne"), icon: ICONS.heading, keywords: tr("h1 grand titre"), run: (e) => chain(e).setHeading({ level: 1 }).run() },
    { id: "titre2", label: tr("Titre 2"), hint: tr("« ## » en début de ligne"), icon: ICONS.heading, keywords: tr("h2 sous-titre"), run: (e) => chain(e).setHeading({ level: 2 }).run() },
    { id: "titre3", label: tr("Titre 3"), hint: tr("« ### » en début de ligne"), icon: ICONS.heading, keywords: tr("h3 petit titre"), run: (e) => chain(e).setHeading({ level: 3 }).run() },
    { id: "puces", label: tr("Liste à puces"), hint: tr("« - » en début de ligne"), icon: ICONS.listBullet, keywords: tr("liste points"), run: (e) => chain(e).toggleBulletList().run() },
    { id: "numeros", label: tr("Liste numérotée"), hint: tr("« 1. » en début de ligne"), icon: ICONS.listOrdered, keywords: tr("liste numeros etapes"), run: (e) => chain(e).toggleOrderedList().run() },
    { id: "cases", label: tr("Cases à cocher"), hint: tr("« [ ] » en début de ligne"), icon: ICONS.listCheck, keywords: tr("liste taches todo cocher"), run: (e) => chain(e).toggleTaskList().run() },
    { id: "citation", label: tr("Citation"), hint: tr("« > » en début de ligne"), icon: ICONS.quote, keywords: tr("citer"), run: (e) => chain(e).toggleBlockquote().run() },
    { id: "code", label: tr("Bloc de code"), hint: tr("Texte à chasse fixe"), icon: ICONS.code, keywords: tr("programme informatique"), run: (e) => chain(e).toggleCodeBlock().run() },
    { id: "separateur", label: tr("Séparateur"), hint: tr("Ligne horizontale"), icon: ICONS.divider, keywords: tr("ligne trait"), run: (e) => chain(e).setHorizontalRule().run() },
    { id: "tableau", label: tr("Tableau"), hint: tr("Trois colonnes, trois lignes"), icon: ICONS.table, keywords: tr("grille colonnes"), run: (e) => chain(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: "image", label: tr("Image"), hint: tr("Depuis un fichier de ce PC"), icon: ICONS.image, keywords: tr("photo illustration"), run: () => image() },
    { id: "lien", label: tr("Lien vers une note"), hint: tr("« [[ » puis le titre"), icon: ICONS.link, keywords: tr("relier note"), run: (e) => chain(e).insertContent("[[").run() },
    {
      id: "date",
      label: tr("Date du jour"),
      hint: tr("Par exemple « vendredi 9 octobre 2026 »"),
      icon: ICONS.calendar,
      keywords: tr("aujourd'hui jour"),
      run: (e) => chain(e).insertContent(`${LONG_DATE.format(new Date())} `).run(),
    },
  ];
}

/** Blocs dont un mot du nom ou des mots-clés commence par chaque mot saisi après « / ». */
export function filterSlash(items: readonly SlashItem[], query: string): SlashItem[] {
  const wanted = fold(query).split(/\s+/).filter(Boolean);
  if (wanted.length === 0) return [...items];
  return items.filter((i) => {
    const words = fold(`${i.label} ${i.keywords} ${i.id}`).split(/[\s'’-]+/);
    return wanted.every((w) => words.some((x) => x.startsWith(w)));
  });
}

export function slashCommands(handlers: SlashHandlers) {
  return Extension.create({
    name: "slashCommands",
    addProseMirrorPlugins() {
      const all = slashItems(handlers.image);
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: new PluginKey("slashCommands"),
          char: "/",
          allowSpaces: false,
          items: ({ query }) => filterSlash(all, query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            props.run(editor);
          },
          render: () => {
            let state: SlashMenuState | null = null;
            const publish = () => handlers.show(state ? { ...state } : null);
            const open = (props: SuggestionProps<SlashItem, SlashItem>, selected: number) => {
              state = {
                items: props.items,
                selected: Math.min(selected, Math.max(0, props.items.length - 1)),
                rect: props.clientRect?.() ?? null,
                pick: (item) => props.command(item),
              };
              publish();
            };
            return {
              onStart: (props) => open(props, 0),
              onUpdate: (props) => open(props, state?.selected ?? 0),
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                if (!state) return false;
                if (event.key === "Escape") {
                  state = null;
                  publish();
                  return true;
                }
                if (state.items.length === 0) return false;
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
        }),
      ];
    },
  });
}
