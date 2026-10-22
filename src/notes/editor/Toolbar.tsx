import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { useContextMenu, type MenuEntry } from "../../components/ContextMenu";
import { Icon } from "../../components/Icon";
import { ICONS } from "../../components/icons";
import { Select } from "../../components/SelectRow";
import { useDismiss } from "../../lib/useDismiss";
import { HIGHLIGHTS } from "./extensions";
import { tr } from "../../i18n/i18n";

type Block = "p" | "h1" | "h2" | "h3";
const BLOCKS: { value: Block; label: string }[] = [
  { value: "p", label: tr("Texte") },
  { value: "h1", label: tr("Titre 1") },
  { value: "h2", label: tr("Titre 2") },
  { value: "h3", label: tr("Titre 3") },
];

interface ToolbarProps {
  editor: Editor;
  /** Choisir une image sur ce PC. */
  onImage: () => void;
}

/** Ouvre un menu sous le bouton, à la souris comme au clavier. */
function below(button: HTMLElement) {
  const r = button.getBoundingClientRect();
  return { clientX: r.left, clientY: r.bottom + 4, currentTarget: button, preventDefault: () => undefined, stopPropagation: () => undefined };
}

/** Barre de mise en forme de l'éditeur de notes. Flèches gauche et droite : bouton voisin. */
export function Toolbar({ editor, onImage }: ToolbarProps) {
  const openMenu = useContextMenu();
  const [colorsOpen, setColorsOpen] = useState(false);
  const colorsRef = useRef<HTMLDivElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p") as Block,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      highlightColor: (e.getAttributes("highlight").color as string | null) ?? null,
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      taskList: e.isActive("taskList"),
      blockquote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  // Les couleurs se ferment au clic ailleurs ou avec Échap.
  const closeColors = useCallback(() => setColorsOpen(false), []);
  useDismiss(colorsRef, colorsOpen, closeColors);

  const chain = () => editor.chain().focus();
  const setBlock = (block: Block) => {
    if (block === "p") chain().setParagraph().run();
    else chain().setHeading({ level: Number(block[1]) as 1 | 2 | 3 }).run();
  };
  const tableMenu: MenuEntry[] = [
    { label: tr("Insérer une ligne au-dessus"), run: () => chain().addRowBefore().run() },
    { label: tr("Insérer une ligne au-dessous"), run: () => chain().addRowAfter().run() },
    { label: tr("Insérer une colonne à gauche"), run: () => chain().addColumnBefore().run() },
    { label: tr("Insérer une colonne à droite"), run: () => chain().addColumnAfter().run() },
    "separator",
    { label: tr("Supprimer la ligne"), run: () => chain().deleteRow().run() },
    { label: tr("Supprimer la colonne"), run: () => chain().deleteColumn().run() },
    { label: tr("Supprimer le tableau"), danger: true, run: () => chain().deleteTable().run() },
  ];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    if ((e.target as HTMLElement).tagName === "SELECT") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(".note-tool, select")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
    e.preventDefault();
  };

  const tool = (label: string, icon: string, active: boolean | undefined, run: () => void, shortcut?: string, disabled?: boolean) => (
    <button
      type="button"
      className="note-tool"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      <Icon d={icon} size={16} stroke={2.2} />
    </button>
  );

  return (
    <div className="note-toolbar" role="toolbar" aria-label={tr("Mise en forme")} onKeyDown={onKeyDown}>
      <Select value={s.block} options={BLOCKS} onChange={setBlock} label={tr("Style du paragraphe")} />
      <span className="note-tool-sep" />
      {tool(tr("Gras"), ICONS.bold, s.bold, () => chain().toggleBold().run(), "Ctrl+B")}
      {tool(tr("Italique"), ICONS.italic, s.italic, () => chain().toggleItalic().run(), "Ctrl+I")}
      {tool(tr("Souligné"), ICONS.underline, s.underline, () => chain().toggleUnderline().run(), "Ctrl+U")}
      {tool(tr("Barré"), ICONS.strike, s.strike, () => chain().toggleStrike().run(), "Ctrl+Maj+S")}
      <div className="note-colors-anchor" ref={colorsRef}>
        <button
          type="button"
          className="note-tool"
          aria-label={tr("Surlignage")}
          aria-pressed={s.highlight}
          aria-expanded={colorsOpen}
          aria-haspopup="true"
          title={tr("Surlignage (Ctrl+Maj+H)")}
          data-color={s.highlightColor ?? undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setColorsOpen((open) => !open)}
        >
          <Icon d={ICONS.highlight} size={16} stroke={2.2} />
          <span className="note-tool-swatch" data-color={s.highlightColor ?? "jaune"} />
        </button>
        {colorsOpen && (
          <div
            className="note-colors glass-popover"
            role="group"
            aria-label={tr("Couleur de surlignage")}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setColorsOpen(false);
                editor.commands.focus();
              }
            }}
          >
            {HIGHLIGHTS.map((h) => (
              <button
                key={h.id}
                type="button"
                className="note-color"
                data-color={h.id}
                aria-label={h.label}
                title={h.label}
                aria-pressed={s.highlight && (s.highlightColor ?? "jaune") === h.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  chain().setHighlight({ color: h.id }).run();
                  setColorsOpen(false);
                }}
              />
            ))}
            <button
              type="button"
              className="link-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                chain().unsetHighlight().run();
                setColorsOpen(false);
              }}
            >
              {tr("Aucun")}
            </button>
          </div>
        )}
      </div>
      <span className="note-tool-sep" />
      {tool(tr("Liste à puces"), ICONS.listBullet, s.bulletList, () => chain().toggleBulletList().run(), "Ctrl+Maj+8")}
      {tool(tr("Liste numérotée"), ICONS.listOrdered, s.orderedList, () => chain().toggleOrderedList().run(), "Ctrl+Maj+7")}
      {tool(tr("Cases à cocher"), ICONS.listCheck, s.taskList, () => chain().toggleTaskList().run(), "Ctrl+Maj+9")}
      <span className="note-tool-sep" />
      {tool(tr("Citation"), ICONS.quote, s.blockquote, () => chain().toggleBlockquote().run(), "Ctrl+Maj+B")}
      {tool(tr("Bloc de code"), ICONS.code, s.codeBlock, () => chain().toggleCodeBlock().run(), "Ctrl+Alt+C")}
      <button
        type="button"
        className="note-tool"
        aria-label={s.table ? tr("Tableau : lignes et colonnes") : tr("Insérer un tableau")}
        aria-pressed={s.table}
        aria-haspopup={s.table ? "menu" : undefined}
        title={s.table ? tr("Tableau : lignes et colonnes") : tr("Insérer un tableau")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          if (s.table) openMenu(below(e.currentTarget), tableMenu);
          else chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        }}
      >
        <Icon d={ICONS.table} size={16} stroke={2.2} />
      </button>
      {tool(tr("Séparateur"), ICONS.divider, undefined, () => chain().setHorizontalRule().run())}
      {tool(tr("Image"), ICONS.image, undefined, onImage)}
      {tool(tr("Lien vers une note"), ICONS.link, undefined, () => chain().insertContent("[[").run(), "[[")}
      <span className="note-tool-spacer" />
      {tool(tr("Annuler"), ICONS.undo, undefined, () => chain().undo().run(), "Ctrl+Z", !s.canUndo)}
      {tool(tr("Rétablir"), ICONS.redo, undefined, () => chain().redo().run(), "Ctrl+Y", !s.canRedo)}
    </div>
  );
}
