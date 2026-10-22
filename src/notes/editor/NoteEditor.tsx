import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useToast } from "../../app/ToastProvider";
import { useContextMenu } from "../../components/ContextMenu";
import { Icon } from "../../components/Icon";
import { ICONS } from "../../components/icons";
import { Select } from "../../components/SelectRow";
import { onBeforeLock } from "../../lib/beforeLock";
import { fold } from "../../lib/fold";
import { useDismiss } from "../../lib/useDismiss";
import { dataErrorMessage, type DataError } from "../../lib/dataError";
import { useSpaces } from "../../spaces/SpacesProvider";
import { TASK_COLORS } from "../../tasks/colors";
import { MoveNoteDialog, TemplateNameDialog, useNotebookOptions } from "../NoteDialogs";
import { useNoteMenu } from "../noteMenu";
import { printNote } from "../notePrint";
import { usePrint } from "../../print/print";
import {
  backlinks,
  CONTACT_MENTION,
  EMPTY_DOC,
  linksIn,
  NOTE_LINK,
  notebookPath,
  noteTitle,
  titleMatches,
  modifiedLabel,
  wordCount,
  type DocNode,
  type Note,
  type NoteSummary,
} from "../notes";
import { useNotes } from "../NotesProvider";
import { VersionsDialog } from "../VersionsDialog";
import { imageToDataUrl, noteExtensions, type ContactHandlers, type LinkHandlers, type LinkMenuState } from "./extensions";
import { useContactsIfAny } from "../../contacts/ContactsProvider";
import { contactName } from "../../contacts/contacts";
import { useLinksIfAny } from "../../links/LinksProvider";
import { LinkMenu } from "./LinkMenu";
import { SlashMenu } from "./SlashMenu";
import { outlineOf, readingMinutes, type OutlineEntry } from "./outline";
import type { SlashHandlers, SlashMenuState } from "./slash";
import { Toolbar } from "./Toolbar";
import { tr, trn } from "../../i18n/i18n";

/** Délai d'enregistrement après la dernière frappe. */
const SAVE_DELAY_MS = 700;
/** Image collée : 20 Mo au plus avant réduction. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const PLACEHOLDER = tr("Saisir le texte. « # » titre, « - » liste, « [ ] » case à cocher, « [[ » lien vers une note.");
/** Notes nouvelles restées vides, retirées un instant après leur fermeture. */
const discards = new Map<string, number>();

interface NoteEditorProps {
  noteId: string;
  /** Ouvre une autre note (lien, rétrolien, copie). */
  onOpen: (id: string) => void;
  /** Place le curseur dans le titre (note nouvelle). */
  focusTitle?: boolean;
  /** Note créée vide pendant cette séance : retirée si on la quitte sans rien saisir. */
  fresh?: boolean;
  /** « Ouvrir dans une fenêtre » (fenêtre principale seulement) ; appelé une fois la note enregistrée. */
  onDetach?: () => void;
  /** Ouvre la fiche d'un contact cité avec « @ » (fenêtre principale seulement). */
  onOpenContact?: (id: string) => void;
}

/** Note ouverte : chargement de son contenu, puis l'éditeur. */
export function NoteEditor(props: NoteEditorProps) {
  const { load } = useNotes();
  const loadRef = useRef(load);
  loadRef.current = load;
  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    loadRef
      .current(props.noteId)
      .then((n) => alive && setNote(n))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [props.noteId]);

  if (missing) return <p className="tasks-empty">{tr("Cette note n'existe plus.")}</p>;
  if (!note) return <div className="note-editor" aria-busy="true" />;
  return <NoteEditorBody {...props} note={note} />;
}

function parseDoc(content: string): DocNode {
  try {
    return JSON.parse(content) as DocNode;
  } catch {
    return EMPTY_DOC;
  }
}

function NoteEditorBody({ note, onOpen, focusTitle, fresh, onDetach, onOpenContact }: NoteEditorProps & { note: Note }) {
  const { notes, notebooks, saveBody, updateMeta, create, discard } = useNotes();
  const { spaces } = useSpaces();
  const notify = useToast();
  const openMenu = useContextMenu();
  const noteMenu = useNoteMenu();
  const notebookOptions = useNotebookOptions();
  const summary: NoteSummary = notes.find((n) => n.id === note.id) ?? note;

  const [title, setTitle] = useState(note.title);
  const [words, setWords] = useState(0);
  const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  // Sommaire : les titres de la note, tenus à jour pendant la saisie.
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const outlineRef = useRef<HTMLSpanElement>(null);
  const [dialog, setDialog] = useState<"versions" | "move" | "template" | null>(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const colorsRef = useRef<HTMLSpanElement>(null);
  const closeColors = useCallback(() => setColorsOpen(false), []);
  useDismiss(colorsRef, colorsOpen, closeColors);
  const closeOutline = useCallback(() => setOutlineOpen(false), []);
  useDismiss(outlineRef, outlineOpen, closeOutline);

  // Contacts cités avec « @ » (absents dans la fenêtre d'une note : « @ » y reste du texte).
  const contactList = useContactsIfAny()?.contacts;
  const linksApi = useLinksIfAny();

  // Valeurs à jour pour les fonctions données une fois à l'éditeur.
  const latest = useRef({ notes, create, summary, saveBody, notify, discard, fresh, contactList, linksApi });
  latest.current = { notes, create, summary, saveBody, notify, discard, fresh, contactList, linksApi };

  // ——— Enregistrement automatique ———
  const titleValue = useRef(note.title);
  const dirty = useRef(false);
  const timer = useRef(0);
  const save = useCallback(async () => {
    const editor = editorRef.current;
    window.clearTimeout(timer.current);
    if (!dirty.current || !editor) return;
    dirty.current = false;
    const json = editor.getJSON() as DocNode;
    await latest.current.saveBody(note.id, {
      title: titleValue.current,
      content: JSON.stringify(json),
      plain: editor.getText({ blockSeparator: "\n" }),
      links: linksIn(json),
    });
  }, [note.id]);
  const schedule = useCallback(() => {
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  }, [save]);
  useEffect(() => onBeforeLock(save), [save]);
  // Ctrl+P : la note ouverte, telle qu'affichée.
  usePrint(() => () => printNote(noteTitle({ title: titleValue.current }), (editorRef.current?.getJSON() as DocNode | undefined) ?? EMPTY_DOC));
  // Changement de note ou d'écran : le texte en attente part tout de suite ; une note nouvelle
  // restée vide est retirée.
  useEffect(() => {
    // Remontée aussitôt (mode développement de React) : la note reste.
    window.clearTimeout(discards.get(note.id));
    discards.delete(note.id);
    return () => {
      const editor = editorRef.current;
      if (latest.current.fresh && !titleValue.current.trim() && editor?.isEmpty) {
        window.clearTimeout(timer.current);
        const discard = latest.current.discard;
        discards.set(
          note.id,
          window.setTimeout(() => {
            discards.delete(note.id);
            void discard(note.id);
          }, 0),
        );
      } else {
        void save();
      }
    };
  }, [save, note.id]);

  // ——— Liens « [[ » ———
  const links = useMemo<LinkHandlers>(
    () => ({
      items: (query) => {
        const q = query.trim();
        const others = latest.current.notes.filter((n) => n.id !== note.id);
        const found = titleMatches(q, others).map((n) => ({ id: n.id, label: noteTitle(n) }));
        const exact = found.some((f) => fold(f.label) === fold(q));
        return q && !exact ? [...found, { id: null, label: q }] : found;
      },
      show: setLinkMenu,
      create: async (label) => {
        const s = latest.current.summary;
        try {
          const created = await latest.current.create(
            { title: label, content: JSON.stringify(EMPTY_DOC), plain: "", links: [] },
            { notebookId: s.notebookId, spaceId: s.spaceId, tags: [], pinned: false, favorite: false, color: null, archived: false },
          );
          latest.current.notify(tr("Note « {label} » créée.", { label }));
          return created.id;
        } catch (err) {
          latest.current.notify(dataErrorMessage(err as DataError));
          return null;
        }
      },
    }),
    [note.id],
  );

  // ——— Contacts « @ » ———
  const contacts = useMemo<ContactHandlers>(
    () => ({
      items: (query) => {
        const q = fold(query.trim());
        return (latest.current.contactList ?? [])
          .map((c) => ({ id: c.id, label: contactName(c) }))
          .filter((c) => !q || fold(c.label).split(/\s+/).some((w) => w.startsWith(q)) || fold(c.label).startsWith(q))
          .sort((a, b) => a.label.localeCompare(b.label, "fr"))
          .slice(0, 8);
      },
      show: setLinkMenu,
      picked: (id) => void latest.current.linksApi?.link({ kind: "note", id: note.id }, { kind: "contact", id }),
    }),
    [note.id],
  );

  // ——— Images ———
  const insertImages = useCallback((files: FileList | null | undefined, at?: number): boolean => {
    const images = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return false;
    for (const file of images) {
      if (file.size > MAX_IMAGE_BYTES) {
        latest.current.notify(tr("Image trop volumineuse (20 Mo au plus)."));
        continue;
      }
      imageToDataUrl(file)
        .then((src) => {
          const image = { type: "image", attrs: { src, alt: file.name } };
          const chain = editorRef.current?.chain().focus();
          (at === undefined ? chain?.insertContent(image) : chain?.insertContentAt(at, image))?.run();
        })
        .catch(() => latest.current.notify(tr("Image illisible.")));
    }
    return true;
  }, []);

  // Menu « / » : l'image passe par le même choix de fichier que la barre d'outils.
  const slash = useMemo<SlashHandlers>(() => ({ show: setSlashMenu, image: () => fileRef.current?.click() }), []);

  const editor = useEditor(
    {
      extensions: noteExtensions({ placeholder: PLACEHOLDER, links, contacts, slash }),
      content: parseDoc(note.content),
      injectCSS: false,
      editorProps: {
        attributes: { class: "note-content", "aria-label": tr("Texte de la note"), spellcheck: "true" },
        handlePaste: (_view, event) => insertImages(event.clipboardData?.files),
        handleDrop: (view, event) => {
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          return insertImages(event.dataTransfer?.files, at);
        },
      },
      onCreate: ({ editor: e }) => {
        setWords(wordCount(e.getText()));
        setOutline(outlineOf(e));
        // Titres des notes citées, mis à jour s'ils ont changé depuis.
        const titles = new Map(latest.current.notes.map((n) => [n.id, noteTitle(n)]));
        const tr = e.state.tr;
        e.state.doc.descendants((node, pos) => {
          if (node.type.name !== NOTE_LINK) return;
          const current = titles.get(String(node.attrs.id));
          if (current && current !== node.attrs.label) tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: current });
        });
        if (tr.docChanged) e.view.dispatch(tr.setMeta("addToHistory", false));
      },
      onUpdate: ({ editor: e }) => {
        schedule();
        setWords(wordCount(e.getText()));
        setOutline(outlineOf(e));
      },
      onBlur: () => void save(),
    },
    [note.id],
  );
  editorRef.current = editor;

  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  const openLink = (e: MouseEvent) => {
    const mention = (e.target as HTMLElement).closest<HTMLElement>(`[data-type="${CONTACT_MENTION}"]`);
    if (mention?.dataset.id && onOpenContact) {
      if (latest.current.contactList?.some((c) => c.id === mention.dataset.id)) onOpenContact(mention.dataset.id);
      else notify(tr("Ce contact n'existe plus."));
      return;
    }
    const link = (e.target as HTMLElement).closest<HTMLElement>(`[data-type="${NOTE_LINK}"]`);
    const id = link?.dataset.id;
    if (!id) return;
    if (latest.current.notes.some((n) => n.id === id)) onOpen(id);
    else notify(tr("Cette note n'existe plus."));
  };

  const onRestored = (restored: Note) => {
    dirty.current = false;
    window.clearTimeout(timer.current);
    titleValue.current = restored.title;
    setTitle(restored.title);
    editor?.commands.setContent(parseDoc(restored.content), { emitUpdate: false });
    setWords(wordCount(editor?.getText() ?? ""));
  };

  const addTag = () => {
    const tag = newTag.trim().replace(/^#/, "");
    setNewTag("");
    if (!tag || summary.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    void updateMeta(summary, { tags: [...summary.tags, tag] });
  };

  const cited = summary.links.map((id) => notes.find((n) => n.id === id)).filter((n): n is NoteSummary => Boolean(n));
  const citing = backlinks(note.id, notes);
  const place = summary.notebookId ? notebookPath(summary.notebookId, notebooks) : "";
  const spaceOptions = [{ value: "", label: tr("Aucun espace") }, ...spaces.map((s) => ({ value: s.id, label: s.name }))];

  return (
    <div className="note-editor">
      <div className="note-head">
        <span className="note-place">
          {place ? (
            <>
              <Icon d={ICONS.notebook} size={13} />
              {place}
            </>
          ) : (
            tr("Sans carnet")
          )}
          <span className="note-updated"> · {modifiedLabel(summary.updatedAt, new Date())}</span>
        </span>
        <span className="note-head-actions">
          <span className="note-colors-anchor" ref={outlineRef}>
            <button
              type="button"
              className="note-tool"
              aria-label={tr("Sommaire")}
              aria-expanded={outlineOpen}
              title={outline.length ? tr("Sommaire") : tr("Sommaire : la note n'a pas encore de titre")}
              disabled={outline.length === 0}
              onClick={() => setOutlineOpen((open) => !open)}
            >
              <Icon d={ICONS.listBullet} size={16} stroke={2.2} />
            </button>
            {outlineOpen && outline.length > 0 && (
              <nav
                className="note-outline glass-popover"
                aria-label={tr("Sommaire de la note")}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setOutlineOpen(false);
                  }
                }}
              >
                {outline.map((h) => (
                  <button
                    key={h.index}
                    type="button"
                    className="note-outline-item"
                    data-level={h.level}
                    onClick={() => {
                      setOutlineOpen(false);
                      const target = editor?.view.dom.querySelectorAll("h1, h2, h3")[h.index];
                      target?.scrollIntoView({ block: "start", behavior: "smooth" });
                    }}
                  >
                    {h.text}
                  </button>
                ))}
              </nav>
            )}
          </span>
          <button
            type="button"
            className="note-tool"
            aria-pressed={summary.pinned}
            aria-label={tr("Épingler")}
            title={summary.pinned ? tr("Désépingler") : tr("Épingler")}
            onClick={() => void updateMeta(summary, { pinned: !summary.pinned })}
          >
            <Icon d={ICONS.pin} size={16} stroke={2.2} />
          </button>
          <button
            type="button"
            className="note-tool note-tool--star"
            aria-pressed={summary.favorite}
            aria-label={tr("Favori")}
            title={summary.favorite ? tr("Retirer des favoris") : tr("Ajouter aux favoris")}
            onClick={() => void updateMeta(summary, { favorite: !summary.favorite })}
          >
            <Icon d={ICONS.star} size={16} stroke={2.2} />
          </button>
          <span className="note-colors-anchor" ref={colorsRef}>
            <button
              type="button"
              className={summary.color ? "note-tool note-tool--color" : "note-tool note-tool--color note-tool--theme"}
              aria-label={tr("Couleur de la note")}
              aria-expanded={colorsOpen}
              title={tr("Couleur")}
              style={summary.color ? ({ "--swatch": summary.color } as CSSProperties) : undefined}
              onClick={() => setColorsOpen((open) => !open)}
            >
              <span className="note-tool-dot" />
            </button>
            {colorsOpen && (
              <div
                className="note-colors note-colors--end glass-popover"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setColorsOpen(false);
                  }
                }}
              >
                <div className="color-choices" role="radiogroup" aria-label={tr("Couleur de la note")}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={summary.color === null}
                    className="color-choice color-choice--theme"
                    title={tr("Couleur du thème")}
                    aria-label={tr("Couleur du thème")}
                    onClick={() => {
                      void updateMeta(summary, { color: null });
                      setColorsOpen(false);
                    }}
                  />
                  {TASK_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={summary.color === c.value}
                      className="color-choice"
                      title={c.label}
                      aria-label={c.label}
                      style={{ "--swatch": c.value } as CSSProperties}
                      onClick={() => {
                        void updateMeta(summary, { color: c.value });
                        setColorsOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </span>
          {onDetach && (
            <button
              type="button"
              className="note-tool"
              aria-label={tr("Ouvrir dans une fenêtre")}
              title={tr("Ouvrir dans une fenêtre")}
              onClick={() => {
                dirty.current = true;
                void save().then(onDetach);
              }}
            >
              <Icon d={ICONS.windowOpen} size={16} stroke={2.2} />
            </button>
          )}
          <button type="button" className="note-tool" aria-label={tr("Historique des versions")} title={tr("Historique des versions")} onClick={() => setDialog("versions")}>
            <Icon d={ICONS.history} size={16} stroke={2.2} />
          </button>
          <button
            type="button"
            className="note-tool"
            aria-label={tr("Autres actions")}
            aria-haspopup="menu"
            title={tr("Autres actions")}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openMenu(
                { clientX: r.right - 220, clientY: r.bottom + 4, currentTarget: e.currentTarget, preventDefault: () => undefined, stopPropagation: () => undefined },
                noteMenu(summary, {
                  move: () => setDialog("move"),
                  saveAsTemplate: () => setDialog("template"),
                  opened: (copy) => onOpen(copy.id),
                  current: () => ({ title: titleValue.current, doc: (editorRef.current?.getJSON() as DocNode | undefined) ?? EMPTY_DOC }),
                }),
              );
            }}
          >
            <Icon d={ICONS.more} size={18} stroke={3} />
          </button>
        </span>
      </div>

      <input
        ref={titleRef}
        className="note-title"
        value={title}
        placeholder={tr("Titre")}
        aria-label={tr("Titre de la note")}
        maxLength={300}
        onChange={(e) => {
          setTitle(e.target.value);
          titleValue.current = e.target.value;
          schedule();
        }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            editor?.commands.focus("start");
          }
        }}
      />

      {editor && <Toolbar editor={editor} onImage={() => fileRef.current?.click()} />}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          insertImages(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="note-scroll" onClick={openLink}>
        <EditorContent editor={editor} className="note-content-wrap" />

        <div className="note-links">
          {cited.length > 0 && (
            <section className="note-links-group" aria-label={tr("Notes citées")}>
              <h3 className="note-links-title">{tr("Liens · ")}{cited.length}</h3>
              <div className="note-links-list">
                {cited.map((n) => (
                  <button key={n.id} type="button" className="note-link-chip" onClick={() => onOpen(n.id)}>
                    <Icon d={ICONS.link} size={12} stroke={2.4} />
                    {noteTitle(n)}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="note-links-group" aria-label={tr("Rétroliens")}>
            <h3 className="note-links-title">{tr("Rétroliens · ")}{citing.length}</h3>
            {citing.length === 0 ? (
              <p className="note-links-empty">{tr("Aucune note ne cite celle-ci. « [[ » dans une autre note crée un lien.")}</p>
            ) : (
              <div className="note-links-list">
                {citing.map((n) => (
                  <button key={n.id} type="button" className="note-link-chip" onClick={() => onOpen(n.id)}>
                    <Icon d={ICONS.arrowLeft} size={12} stroke={2.4} />
                    {noteTitle(n)}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="note-foot">
        <div className="note-foot-field">
          <Select
            value={summary.notebookId ?? ""}
            options={notebookOptions}
            label={tr("Carnet")}
            onChange={(v) => void updateMeta(summary, { notebookId: v || null })}
          />
        </div>
        <div className="note-foot-field">
          <Select
            value={summary.spaceId ?? ""}
            options={spaceOptions}
            label={tr("Espace")}
            onChange={(v) => void updateMeta(summary, { spaceId: v || null })}
          />
        </div>
        <div className="detail-tags note-tags">
          {summary.tags.map((tag) => (
            <span key={tag} className="pill pill--removable">
              #{tag}
              <button
                type="button"
                className="pill-remove"
                aria-label={tr("Retirer l'étiquette {tag}", { tag })}
                onClick={() => void updateMeta(summary, { tags: summary.tags.filter((t) => t !== tag) })}
              >
                <Icon d={ICONS.close} size={10} stroke={3} />
              </button>
            </span>
          ))}
          <input
            className="detail-tag-input"
            aria-label={tr("Ajouter une étiquette")}
            placeholder={tr("+ étiquette")}
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onBlur={addTag}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " " || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
          />
        </div>
        <span className="note-words">
          {trn(words, "{n} mot", "{n} mots")}
          {words > 0 && tr(" · {readingMinutes} min de lecture", { readingMinutes: readingMinutes(words) })}
        </span>
      </div>

      {linkMenu && <LinkMenu state={linkMenu} />}
      {slashMenu && <SlashMenu state={slashMenu} />}
      {dialog === "versions" && (
        <VersionsDialog
          noteId={note.id}
          onRestored={onRestored}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
      {dialog === "move" && <MoveNoteDialog note={summary} onClose={() => setDialog(null)} />}
      {dialog === "template" && (
        <TemplateNameDialog
          note={summary}
          content={async () => JSON.stringify(editorRef.current?.getJSON() ?? EMPTY_DOC)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
