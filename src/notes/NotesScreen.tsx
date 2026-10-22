import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { useToast } from "../app/ToastProvider";
import { useBulk } from "../app/bulk";
import { contactRequest } from "../lib/request";
import { useNavigation } from "../navigation/NavigationProvider";
import { dragLabel, dropTarget, moved, startDrag } from "../lib/dragDrop";
import { useContextMenu, useItemMenu, useScreenMenu, type MenuEntry } from "../components/ContextMenu";
import { EmptyState } from "../components/EmptyState";
import { ScreenTitle } from "../components/ScreenTitle";
import { KEYS } from "../lib/itemKeys";
import { useNewItem } from "../shell/newItem";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ModuleChip } from "../components/ModuleChip";
import { symbolPath } from "../components/symbols";
import { ICONS } from "../components/icons";
import { Orb } from "../components/Orb";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { readPref, writePref } from "../lib/storage";
import { getModule } from "../modules/modules";
import { useSpaces } from "../spaces/SpacesProvider";
import { NoteEditor } from "./editor/NoteEditor";
import { MoveNoteDialog, TemplateNameDialog, TemplatesDialog } from "./NoteDialogs";
import { FolderDialog, NotebookDialog } from "./NotebookDialog";
import { useNoteMenu } from "./noteMenu";
import { useNoteBulk } from "./noteBulk";
import { SelectionBar, selectionEntries, useSelection } from "../components/SelectionBar";
import { onNoteRequest, takePendingNote, type NoteRequest } from "./noteRequest";
import {
  canNestNotebook,
  depthOf,
  EMPTY_DOC,
  filterNotes,
  MAX_NOTEBOOK_DEPTH,
  notebookTree,
  noteTitle,
  plainOf,
  sameFilter,
  sortNotes,
  NOTE_SORTS,
  isNoteSort,
  type NoteSort,
  subtreeIds,
  tagCounts,
  updatedLabel,
  type DocNode,
  type Notebook,
  type NoteFilter,
  type NoteFolder,
  type NotebookRow,
  type NoteSummary,
} from "./notes";
import { useNotes } from "./NotesProvider";
import { closeNoteWindow, flushNoteWindows, openNoteWindow, useDetachedNotes } from "./noteWindows";
import { inTauri } from "../lib/windowControls";
import { BUILTIN_TEMPLATES, fillDoc, fillVariables } from "./templates";
import { tr, trn } from "../i18n/i18n";

const NOTES_MODULE = getModule("notes");

function isNoteFilter(v: unknown): v is NoteFilter {
  if (typeof v !== "object" || v === null) return false;
  const f = v as { kind?: unknown; id?: unknown; tag?: unknown };
  if (f.kind === "toutes" || f.kind === "favoris" || f.kind === "sans-carnet" || f.kind === "archives") return true;
  if (f.kind === "carnet" || f.kind === "dossier") return typeof f.id === "string";
  return f.kind === "etiquette" && typeof f.tag === "string";
}

const isString = (v: unknown): v is string => typeof v === "string";

/** « Le carnet « Travail », son sous-carnet et ses 3 notes vont dans la corbeille. » */
function deleteNotebookText(notebook: Notebook, notes: number, subs: number): string {
  const name = notebook.name;
  if (subs === 0) return notes > 1 ? tr("Le carnet « {name} » et ses {notes} notes vont dans la corbeille.", { name, notes }) : tr("Le carnet « {name} » et sa note vont dans la corbeille.", { name });
  if (subs === 1) return notes > 1 ? tr("Le carnet « {name} », son sous-carnet et ses {notes} notes vont dans la corbeille.", { name, notes }) : tr("Le carnet « {name} », son sous-carnet et sa note vont dans la corbeille.", { name });
  return notes > 1
    ? tr("Le carnet « {name} », ses {subs} sous-carnets et ses {notes} notes vont dans la corbeille.", { name, subs, notes })
    : tr("Le carnet « {name} », ses {subs} sous-carnets et sa note vont dans la corbeille.", { name, subs });
}

type Dialogs =
  | { kind: "notebook"; notebook?: Notebook; parentId?: string | null; folderId?: string | null }
  | { kind: "folder"; folder?: NoteFolder }
  | { kind: "delete-notebook"; notebook: Notebook; count: number }
  | { kind: "move"; note: NoteSummary }
  | { kind: "template"; note: NoteSummary }
  | { kind: "templates" };

/** Écran Notes (cahier des charges § 4.5) : carnets, liste des notes, note ouverte. */
export function NotesScreen() {
  const { notes, notebooks, folders, templates, loaded, create, search, load, removeNotebook, updateNotebook, removeFolder, updateMeta, reorderFolders } = useNotes();
  const bulk = useBulk();
  const { go } = useNavigation();
  const { spaces, filter: spaceFilter } = useSpaces();
  const notify = useToast();
  const openMenu = useContextMenu();
  const itemMenu = useItemMenu();
  const noteMenu = useNoteMenu();
  const noteBulk = useNoteBulk();
  const [filter, setFilterState] = useState<NoteFilter>(() => readPref("filtreNotes", { kind: "toutes" }, isNoteFilter));
  const [openId, setOpenId] = useState<string | null>(() => readPref("noteOuverte", "", isString) || null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(readPref<string[]>("carnetsFermes", [], Array.isArray)));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const setFilter = (f: NoteFilter) => {
    setFilterState(f);
    writePref("filtreNotes", f);
    setQuery("");
  };
  const open = useCallback((id: string | null, focusTitle = false) => {
    setOpenId(id);
    setFocusId(focusTitle ? id : null);
    writePref("noteOuverte", id ?? "");
  }, []);
  const toggleBook = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    writePref("carnetsFermes", [...next]);
  };

  // Recherche plein texte, un instant après la dernière frappe.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      search(q)
        .then(setResults)
        .catch(() => setResults([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  // Tri de la liste (gardé d'une ouverture à l'autre).
  const [sort, setSortState] = useState<NoteSort>(() => readPref("triNotes", "modifiee", isNoteSort));
  const setSort = (value: NoteSort) => {
    setSortState(value);
    writePref("triNotes", value);
  };
  const visible = useMemo(() => notes.filter((n) => spaceFilter === "tous" || n.spaceId === spaceFilter), [notes, spaceFilter]);
  const shown = useMemo(() => {
    if (results) return results.map((id) => visible.find((n) => n.id === id)).filter((n): n is NoteSummary => Boolean(n));
    return sortNotes(filterNotes(visible, filter, notebooks), sort);
  }, [results, visible, filter, notebooks, sort]);
  const opened = notes.find((n) => n.id === openId) ?? null;
  // Notes ouvertes dans leur propre fenêtre : leur éditeur n'est pas ouvert ici en même temps.
  const detached = useDetachedNotes();
  // Plusieurs notes à la fois : Ctrl+clic, Maj+clic, Ctrl+A dans la liste.
  const pick = useSelection(
    shown.map((n) => n.id),
    openId,
  );
  const bulkActions = noteBulk(shown.filter((n) => pick.has(n.id)));
  const tree = notebookTree(notebooks);
  const hiddenBooks = new Set<string>();
  for (const id of collapsed) for (const sub of subtreeIds(id, notebooks)) if (sub !== id) hiddenBooks.add(sub);
  // Carnets rangés par dossier (un sous-carnet suit son carnet de premier niveau).
  const rowsByFolder = new Map<string | null, NotebookRow[]>();
  {
    let folderOf: string | null = null;
    for (const r of tree) {
      if (r.depth === 0) folderOf = r.notebook.folderId && folders.some((f) => f.id === r.notebook.folderId) ? r.notebook.folderId : null;
      rowsByFolder.set(folderOf, [...(rowsByFolder.get(folderOf) ?? []), r]);
    }
  }
  const count = (f: NoteFilter) => filterNotes(visible, f, notebooks).length;
  const archivedCount = count({ kind: "archives" });
  // Les notes archivées ne comptent que dans « Archives ».
  const tags = tagCounts(visible.filter((n) => !n.archived));

  const filterLabel = (() => {
    if (results) return tr("Résultats pour « {query} »", { query: query.trim() });
    switch (filter.kind) {
      case "toutes":
        return tr("Toutes les notes");
      case "favoris":
        return tr("Favoris");
      case "sans-carnet":
        return tr("Sans carnet");
      case "archives":
        return tr("Archives");
      case "carnet":
        return notebooks.find((b) => b.id === filter.id)?.name ?? tr("Carnet");
      case "dossier":
        return folders.find((f) => f.id === filter.id)?.name ?? tr("Dossier");
      case "etiquette":
        return `#${filter.tag}`;
    }
  })();

  // ——— Création ———
  const newNote = async (template?: { title: string; doc: DocNode }, inBook?: string) => {
    const now = new Date();
    const doc = template ? fillDoc(template.doc, now) : EMPTY_DOC;
    const notebookId = inBook ?? (filter.kind === "carnet" && notebooks.some((b) => b.id === filter.id) ? filter.id : null);
    try {
      const n = await create(
        { title: template ? fillVariables(template.title, now) : "", content: JSON.stringify(doc), plain: plainOf(doc), links: [] },
        {
          notebookId,
          spaceId: spaceFilter !== "tous" ? spaceFilter : (spaces[0]?.id ?? null),
          tags: filter.kind === "etiquette" ? [filter.tag] : [],
          pinned: false,
          favorite: filter.kind === "favoris",
          color: null,
          archived: false,
        },
      );
      if (!template) setFresh((s) => new Set(s).add(n.id));
      setQuery("");
      if (inBook && !(filter.kind === "carnet" && subtreeIds(filter.id, notebooks).has(inBook))) setFilter({ kind: "carnet", id: inBook });
      open(n.id, true);
    } catch (err) {
      notify(dataErrorMessage(err as DataError));
    }
  };
  const latestNew = useRef(newNote);
  latestNew.current = newNote;

  // Demandes venues de l'Accueil ou de la palette ; celle qui attendait est traitée une fois la liste chargée.
  const latest = useRef({ notes, filter, notebooks });
  latest.current = { notes, filter, notebooks };
  useEffect(() => {
    if (!loaded) return;
    const handle = (request: NoteRequest) => {
      if (request.create) {
        void latestNew.current();
        return;
      }
      const found = request.id ? latest.current.notes.find((n) => n.id === request.id) : undefined;
      if (!found) return;
      const { filter: f, notebooks: books } = latest.current;
      if (!filterNotes([found], f, books).length) setFilter({ kind: "toutes" });
      setQuery("");
      open(found.id);
    };
    const pending = takePendingNote();
    if (pending) handle(pending);
    return onNoteRequest(handle);
  }, [loaded, open]);

  const templateEntries = (): MenuEntry[] => [
    ...BUILTIN_TEMPLATES.map((t) => ({ label: t.name, icon: ICONS.template, run: () => void newNote(t) })),
    "separator",
    ...templates.map((t) => ({
      label: t.name,
      icon: ICONS.template,
      run: () => {
        let doc: DocNode = EMPTY_DOC;
        try {
          doc = JSON.parse(t.content) as DocNode;
        } catch {
          // Modèle illisible : note vide.
        }
        void newNote({ title: t.name, doc });
      },
    })),
    ...(templates.length > 0 ? ["separator" as const, { label: tr("Modèles personnels…"), icon: ICONS.settings, run: () => setDialog({ kind: "templates" }) }] : []),
  ];

  // Choix du carnet ou de l'étiquette depuis le titre de la liste (fenêtre étroite : sans colonne des carnets).
  const filterEntries = (): MenuEntry[] => {
    const entry = (f: NoteFilter, label: string, icon?: string) => ({
      label,
      icon,
      checked: !results && sameFilter(filter, f),
      run: () => setFilter(f),
    });
    return [
      entry({ kind: "toutes" }, tr("Toutes les notes"), ICONS.notes),
      entry({ kind: "favoris" }, tr("Favoris"), ICONS.star),
      entry({ kind: "sans-carnet" }, tr("Sans carnet"), ICONS.inbox),
      "separator",
      ...folders.map((f) => entry({ kind: "dossier", id: f.id }, f.name, ICONS.folder)),
      ...tree.map((r) => entry({ kind: "carnet", id: r.notebook.id }, `${"    ".repeat(r.depth)}${r.notebook.name}`, ICONS.notebook)),
      { label: tr("Nouveau carnet…"), icon: ICONS.plus, run: () => setDialog({ kind: "notebook" }) },
      { label: tr("Nouveau dossier…"), icon: ICONS.folder, run: () => setDialog({ kind: "folder" }) },
      "separator",
      ...tags.map((t) => entry({ kind: "etiquette", tag: t.tag }, `#${t.tag}`, ICONS.tag)),
      ...(archivedCount > 0 ? ["separator" as const, entry({ kind: "archives" }, tr("Archives"), ICONS.archive)] : []),
    ];
  };

  /** Range un carnet de premier niveau dans un dossier (ou l'en sort). */
  const move = (book: Notebook, folderId: string | null) =>
    updateNotebook(book.id, { name: book.name, parentId: book.parentId, color: book.color, icon: book.icon, folderId }).catch((err: DataError) =>
      notify(dataErrorMessage(err)),
    );

  // ——— Glisser-déposer : notes vers un carnet, « Sans carnet », les favoris, une étiquette ou
  // les archives ; carnet vers un autre carnet, un dossier ou le premier niveau (« Carnets »).
  // Le clic droit (« Déplacer… », « Ranger dans… ») reste l'équivalent au clavier.
  const split = (key: string): [string, string] => {
    const at = key.indexOf(":");
    return at < 0 ? [key, ""] : [key.slice(0, at), key.slice(at + 1)];
  };
  const notesOf = (ids: readonly string[]) => notes.filter((n) => ids.includes(n.id));
  const canDropNotes = (ids: readonly string[], key: string) => {
    const [kind, value] = split(key);
    const list = notesOf(ids);
    if (kind === "carnet") return list.some((n) => n.notebookId !== value);
    if (kind === "sans-carnet") return list.some((n) => n.notebookId !== null);
    if (kind === "favoris") return list.some((n) => !n.favorite);
    if (kind === "archives") return list.some((n) => !n.archived);
    if (kind === "etiquette") return list.some((n) => !n.tags.includes(value));
    return false;
  };
  const dropNotes = (ids: readonly string[], key: string) => {
    const [kind, value] = split(key);
    const list = notesOf(ids);
    const many = list.length > 1;
    const n = list.length;
    let message = "";
    let work: (n: NoteSummary) => Promise<void>;
    if (kind === "carnet") {
      const book = notebooks.find((b) => b.id === value);
      if (!book) return;
      message = trn(n, "Note déplacée dans « {name} ».", "{n} notes déplacées dans « {name} ».", { name: book.name });
      work = (n) => updateMeta(n, { notebookId: value });
    } else if (kind === "sans-carnet") {
      message = trn(n, "Note retirée de son carnet.", "{n} notes retirées de leur carnet.");
      work = (n) => updateMeta(n, { notebookId: null });
    } else if (kind === "favoris") {
      message = trn(n, "Note ajoutée aux favoris.", "{n} notes ajoutées aux favoris.");
      work = (n) => updateMeta(n, { favorite: true });
    } else if (kind === "archives") {
      message = trn(n, "Note archivée.", "{n} notes archivées.");
      work = (n) => updateMeta(n, { archived: true });
    } else if (kind === "etiquette") {
      message = many ? tr("Étiquette « {tag} » ajoutée à {n} notes.", { tag: value, n }) : tr("Étiquette « {tag} » ajoutée à la note.", { tag: value });
      work = (n) => (n.tags.includes(value) ? Promise.resolve() : updateMeta(n, { tags: [...n.tags, value] }));
    } else return;
    void bulk(message, tr("déplacement des notes"), async () => {
      for (const n of list) await work(n);
    });
  };
  const canDropBook = (book: Notebook, key: string) => {
    const [kind, value] = split(key);
    if (kind === "carnet") return canNestNotebook(book.id, value, notebooks);
    if (kind === "dossier") return book.parentId !== null || book.folderId !== value;
    if (kind === "carnets") return book.parentId !== null || book.folderId !== null;
    return false;
  };
  const dropBook = (book: Notebook, key: string) => {
    const [kind, value] = split(key);
    const input = { name: book.name, color: book.color, icon: book.icon };
    let message: string;
    let change: { parentId: string | null; folderId: string | null };
    if (kind === "carnet") {
      const parent = notebooks.find((b) => b.id === value);
      if (!parent) return;
      message = tr("Carnet « {name} » rangé dans « {parent} ».", { name: book.name, parent: parent.name });
      change = { parentId: value, folderId: null };
      if (collapsed.has(value)) toggleBook(value);
    } else if (kind === "dossier") {
      const folder = folders.find((f) => f.id === value);
      if (!folder) return;
      message = tr("Carnet « {name} » rangé dans le dossier « {folder} ».", { name: book.name, folder: folder.name });
      change = { parentId: null, folderId: value };
      if (collapsed.has(`dossier:${value}`)) toggleBook(`dossier:${value}`);
    } else if (kind === "carnets") {
      message = tr("Carnet « {name} » placé au premier niveau.", { name: book.name });
      change = { parentId: null, folderId: null };
    } else return;
    void bulk(message, tr("déplacement du carnet"), () =>
      updateNotebook(book.id, { ...input, ...change }).catch((err: DataError) => notify(dataErrorMessage(err))),
    );
  };
  const dragNotes = (n: NoteSummary) => (e: PointerEvent<HTMLElement>) => {
    const ids = pick.has(n.id) && pick.count > 1 ? shown.filter((x) => pick.has(x.id)).map((x) => x.id) : [n.id];
    const book = n.notebookId ? notebooks.find((b) => b.id === n.notebookId) : undefined;
    startDrag(
      e,
      { kind: "note", ids, label: dragLabel(ids.length, noteTitle(n), "notes"), color: n.color ?? book?.color ?? null },
      { canDrop: (key) => canDropNotes(ids, key), onDrop: (key) => dropNotes(ids, key) },
    );
  };
  const dragBook = (book: Notebook) => (e: PointerEvent<HTMLElement>) =>
    startDrag(
      e,
      { kind: "carnet", ids: [book.id], label: book.name, color: book.color },
      { canDrop: (key) => canDropBook(book, key), onDrop: (key) => dropBook(book, key) },
    );

  // Dossier : clic droit, et au clavier F2 (personnaliser) et Suppr (supprimer).
  const folderEntries = (folder: NoteFolder, i: number): MenuEntry[] => [
    { label: tr("Nouveau carnet dans « {name} »…", { name: folder.name }), icon: ICONS.notebook, run: () => setDialog({ kind: "notebook", folderId: folder.id }) },
    "separator",
    { label: tr("Personnaliser le dossier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setDialog({ kind: "folder", folder }) },
    { label: tr("Monter"), icon: ICONS.arrowUp, disabled: i === 0, run: () => void reorderFolders(moved(folders.map((x) => x.id), i, -1)) },
    { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: i === folders.length - 1, run: () => void reorderFolders(moved(folders.map((x) => x.id), i, 1)) },
    "separator",
    {
      label: tr("Supprimer le dossier"),
      icon: ICONS.trash,
      shortcut: KEYS.remove,
      danger: true,
      run: () => {
        if (filter.kind === "dossier" && filter.id === folder.id) setFilter({ kind: "toutes" });
        void removeFolder(folder);
      },
    },
  ];

  // Carnet : clic droit, et au clavier F2 (modifier) et Suppr (supprimer).
  const bookEntries = (book: Notebook): MenuEntry[] => {
    const depth = depthOf(book.id, notebooks);
    const inside = filterNotes(notes, { kind: "carnet", id: book.id }, notebooks).length;
    return [
      { label: tr("Nouvelle note dans « {name} »", { name: book.name }), icon: ICONS.plus, run: () => void newNote(undefined, book.id) },
      {
        label: tr("Nouveau sous-carnet…"),
        icon: ICONS.notebook,
        disabled: depth >= MAX_NOTEBOOK_DEPTH,
        run: () => setDialog({ kind: "notebook", parentId: book.id }),
      },
      "separator",
      {
        label: tr("Modifier le carnet…"),
        icon: ICONS.pencil,
        shortcut: KEYS.rename,
        run: () => setDialog({ kind: "notebook", notebook: book }),
      },
      ...(book.parentId === null && (folders.length > 0 || book.folderId)
        ? ([
            "separator",
            ...(book.folderId
              ? [{ label: tr("Sortir du dossier"), icon: ICONS.folder, run: () => void move(book, null) }]
              : []),
            ...folders
              .filter((f) => f.id !== book.folderId)
              .map((f) => ({ label: tr("Ranger dans « {name} »", { name: f.name }), icon: ICONS.folder, run: () => void move(book, f.id) })),
          ] as MenuEntry[])
        : []),
      "separator",
      {
        label: tr("Supprimer le carnet"),
        icon: ICONS.trash,
        shortcut: KEYS.remove,
        danger: true,
        run: () => (inside > 0 ? setDialog({ kind: "delete-notebook", notebook: book, count: inside }) : void removeNotebook(book)),
      },
    ];
  };

  // Note de la liste : clic droit, et au clavier Entrée, Suppr, Ctrl+D.
  const cardEntries = (n: NoteSummary) =>
    noteMenu(n, {
      open: () => open(n.id),
      move: () => setDialog({ kind: "move", note: n }),
      saveAsTemplate: () => setDialog({ kind: "template", note: n }),
      opened: (copy) => open(copy.id),
    });

  const cardProps = (n: NoteSummary) => {
    const menu = itemMenu(() => (pick.has(n.id) && pick.count > 1 ? selectionEntries(bulkActions) : cardEntries(n)));
    return {
      onContextMenu: menu.onContextMenu,
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        menu.onKeyDown(e);
        if (!e.defaultPrevented) onCardArrows(e);
      },
    };
  };

  useNewItem(() => void newNote());
  useScreenMenu(() => [
    { label: tr("Nouvelle note"), icon: ICONS.plus, shortcut: KEYS.create, run: () => void newNote() },
    { label: tr("Nouveau carnet…"), icon: ICONS.notebook, run: () => setDialog({ kind: "notebook" }) },
    { label: tr("Nouveau dossier…"), icon: ICONS.folder, run: () => setDialog({ kind: "folder" }) },
    "separator",
    { label: tr("Rechercher dans les notes"), icon: ICONS.search, shortcut: "Ctrl+F", run: () => searchRef.current?.focus() },
    { label: tr("Modèles personnels…"), icon: ICONS.template, run: () => setDialog({ kind: "templates" }) },
  ]);

  // Ctrl+F : recherche dans les notes.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Flèches haut et bas : note voisine. */
  const onCardArrows = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const cards = [...(listRef.current?.querySelectorAll<HTMLButtonElement>(".note-card") ?? [])];
    const index = cards.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1);
    cards[Math.max(0, Math.min(cards.length - 1, index))]?.focus();
  };

  /** Carnets de la colonne, avec leurs sous-carnets dépliables. */
  const bookRows = (rows: readonly NotebookRow[]) =>
    rows
      .filter((r) => !hiddenBooks.has(r.notebook.id))
      .map(({ notebook: b, depth, hasChildren }) => (
        <div key={b.id} className="notes-book" style={{ "--depth": depth } as CSSProperties}>
          {hasChildren ? (
            <button
              type="button"
              className="notes-book-toggle"
              aria-expanded={!collapsed.has(b.id)}
              aria-label={tr("Sous-carnets de « {name} »", { name: b.name })}
              onClick={() => toggleBook(b.id)}
            >
              <Icon d={ICONS.chevronDown} size={12} stroke={2.6} />
            </button>
          ) : (
            <span className="notes-book-toggle" aria-hidden="true" />
          )}
          {navItem({ kind: "carnet", id: b.id }, b.name, symbolPath(b.icon, ICONS.notebook), {
            menu: itemMenu(() => bookEntries(b)),
            chip: b.color,
            drop: `carnet:${b.id}`,
            accepts: "note carnet",
            onPointerDown: dragBook(b),
          })}
        </div>
      ));

  const navItem = (
    f: NoteFilter,
    label: string,
    icon: string,
    extra?: {
      menu?: { onContextMenu: (e: MouseEvent) => void; onKeyDown: (e: KeyboardEvent) => void };
      chip?: string | null;
      /** Cible de dépôt (clé) et sortes d'éléments reçues. */
      drop?: string;
      accepts?: string;
      onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
    },
  ) => {
    const current = !results && sameFilter(filter, f);
    const n = count(f);
    return (
      <button
        type="button"
        className="task-list-item"
        aria-current={current ? "page" : undefined}
        onClick={() => setFilter(f)}
        onPointerDown={extra?.onPointerDown}
        {...(extra?.drop ? dropTarget(extra.drop, extra.accepts ?? "note") : {})}
        {...extra?.menu}
      >
        {extra?.chip !== undefined ? (
          <ModuleChip color={extra.chip ?? "var(--aq-accent)"} icon={icon} size={20} />
        ) : (
          <Icon d={icon} size={16} />
        )}
        <span className="task-list-label">{label}</span>
        {n > 0 && (
          <span className="task-list-count" data-current={current || undefined}>
            {n}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="screen notes-screen">
      <header className="tasks-header">
        <ScreenTitle module="notes" />
        <div className="field-box notes-search">
          <Icon d={ICONS.search} size={15} />
          <input
            ref={searchRef}
            type="search"
            className="field-input"
            placeholder={tr("Rechercher dans les notes")}
            aria-label={tr("Rechercher dans les notes")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
          />
        </div>
        <span className="tasks-header-spacer" />
        <div className="notes-new">
          <button type="button" className="btn-gel" title={tr("Nouvelle note ({create})", { create: KEYS.create })} onClick={() => void newNote()}>
            <Icon d={ICONS.plus} size={16} stroke={2.8} />
            <span>{tr("Nouvelle note")}</span>
          </button>
          <button
            type="button"
            className="btn-gel notes-new-more"
            aria-label={tr("Nouvelle note à partir d'un modèle")}
            aria-haspopup="menu"
            title={tr("À partir d'un modèle")}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openMenu(
                { clientX: r.right - 230, clientY: r.bottom + 6, currentTarget: e.currentTarget, preventDefault: () => undefined, stopPropagation: () => undefined },
                templateEntries(),
              );
            }}
          >
            <Icon d={ICONS.chevronDown} size={15} stroke={2.6} />
          </button>
        </div>
      </header>

      <div className="tasks-body notes-body">
        <nav className="task-lists glass notes-nav" aria-label={tr("Carnets")}>
          {navItem({ kind: "toutes" }, tr("Toutes les notes"), ICONS.notes)}
          {navItem({ kind: "favoris" }, tr("Favoris"), ICONS.star, { drop: "favoris" })}
          {navItem({ kind: "sans-carnet" }, tr("Sans carnet"), ICONS.inbox, { drop: "sans-carnet" })}
          <div className="section-label notes-nav-head" {...dropTarget("carnets", "carnet")}>
            {tr("Carnets")}
            <span className="notes-nav-actions">
              <button type="button" className="notes-nav-add" aria-label={tr("Nouveau dossier")} title={tr("Nouveau dossier")} onClick={() => setDialog({ kind: "folder" })}>
                <Icon d={ICONS.folder} size={13} stroke={2.4} />
              </button>
              <button type="button" className="notes-nav-add" aria-label={tr("Nouveau carnet")} title={tr("Nouveau carnet")} onClick={() => setDialog({ kind: "notebook" })}>
                <Icon d={ICONS.plus} size={13} stroke={2.6} />
              </button>
            </span>
          </div>
          <div className="notes-folders" data-sort="dossiers-notes">
          {folders.map((f, i) => {
            const key = `dossier:${f.id}`;
            const closed = collapsed.has(key);
            return (
              <div key={f.id} className="notes-folder" data-sort-id={f.id} style={f.color ? ({ "--folder-color": f.color } as CSSProperties) : undefined}>
                <div className="notes-book">
                  <button type="button" className="notes-book-toggle" aria-expanded={!closed} aria-label={tr("Carnets du dossier « {name} »", { name: f.name })} onClick={() => toggleBook(key)}>
                    <Icon d={ICONS.chevronDown} size={12} stroke={2.6} />
                  </button>
                  {navItem({ kind: "dossier", id: f.id }, f.name, symbolPath(f.icon, ICONS.folder), {
                    menu: itemMenu(() => folderEntries(f, i)),
                    chip: f.color,
                    drop: `dossier:${f.id}`,
                    accepts: "carnet",
                    onPointerDown: (e) =>
                      startDrag(e, { kind: "dossier-notes", ids: [f.id], label: f.name, color: f.color }, { sort: { group: "dossiers-notes", onSort: (ids) => void reorderFolders(ids) } }),
                  })}
                </div>
                {!closed && (
                  <div className="notes-folder-books">
                    {(rowsByFolder.get(f.id) ?? []).length === 0 && <p className="notes-nav-empty notes-folder-empty">{tr("Aucun carnet.")}</p>}
                    {bookRows(rowsByFolder.get(f.id) ?? [])}
                  </div>
                )}
              </div>
            );
          })}
          </div>
          {bookRows(rowsByFolder.get(null) ?? [])}
          {loaded && notebooks.length === 0 && <p className="notes-nav-empty">{tr("Aucun carnet.")}</p>}
          {tags.length > 0 && (
            <>
              <div className="section-label task-lists-tags-label">{tr("Étiquettes")}</div>
              {tags.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  className="task-list-item"
                  aria-current={!results && sameFilter(filter, { kind: "etiquette", tag: t.tag }) ? "page" : undefined}
                  onClick={() => setFilter({ kind: "etiquette", tag: t.tag })}
                  {...dropTarget(`etiquette:${t.tag}`, "note")}
                >
                  <Icon d={ICONS.tag} size={15} />
                  <span className="task-list-label">{t.tag}</span>
                  <span className="task-list-count">{t.count}</span>
                </button>
              ))}
            </>
          )}
          {(archivedCount > 0 || filter.kind === "archives") && (
            <>
              <div className="section-label task-lists-tags-label">{tr("Rangement")}</div>
              {navItem({ kind: "archives" }, tr("Archives"), ICONS.archive, { drop: "archives" })}
            </>
          )}
        </nav>

        <section className="task-panel glass notes-list" aria-label={filterLabel}>
          <div className="notes-list-head">
            <h2 className="notes-list-title">
              <button
                type="button"
                className="notes-list-pick"
                aria-haspopup="menu"
                title={tr("Carnets et étiquettes")}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu(
                    { clientX: r.left, clientY: r.bottom + 4, currentTarget: e.currentTarget, preventDefault: () => undefined, stopPropagation: () => undefined },
                    filterEntries(),
                  );
                }}
              >
                <span className="notes-list-pick-label">{filterLabel}</span>
                <Icon d={ICONS.chevronDown} size={13} stroke={2.6} />
              </button>
            </h2>
            <span className="task-section-sub">{shown.length}</span>
            <span className="tasks-header-spacer" />
            <button
              type="button"
              className="notes-list-add"
              aria-haspopup="menu"
              aria-label={tr("Trier les notes : {label}", { label: NOTE_SORTS.find((s) => s.value === sort)!.label.toLowerCase() })}
              title={tr("Trier les notes")}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openMenu(
                  { clientX: r.left, clientY: r.bottom + 4, currentTarget: e.currentTarget, preventDefault: () => undefined, stopPropagation: () => undefined },
                  NOTE_SORTS.map((s) => ({ label: s.label, checked: s.value === sort, run: () => setSort(s.value) })),
                );
              }}
            >
              <Icon d={ICONS.sort} size={15} stroke={2.4} />
            </button>
            <button
              type="button"
              className="notes-list-add"
              aria-label={filter.kind === "carnet" ? tr("Nouvelle note dans « {filterLabel} »", { filterLabel }) : tr("Nouvelle note")}
              title={filter.kind === "carnet" ? tr("Nouvelle note dans « {filterLabel} »", { filterLabel }) : tr("Nouvelle note ({create})", { create: KEYS.create })}
              onClick={() => void newNote()}
            >
              <Icon d={ICONS.plus} size={15} stroke={2.8} />
            </button>
          </div>
          {loaded && shown.length === 0 ? (
            <p className="tasks-empty">{results ? tr("Aucune note trouvée.") : filter.kind === "toutes" ? tr("Aucune note.") : tr("Aucune note ici.")}</p>
          ) : (
            <ul className="notes-cards" ref={listRef} onKeyDown={pick.onListKeyDown}>
              {shown.map((n) => {
                const book = n.notebookId ? notebooks.find((b) => b.id === n.notebookId) : undefined;
                const color = n.color ?? book?.color ?? null;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="note-card"
                      aria-current={n.id === openId ? "true" : undefined}
                      aria-pressed={pick.has(n.id) || undefined}
                      data-picked={pick.has(n.id) || undefined}
                      style={color ? ({ "--row-color": color } as CSSProperties) : undefined}
                      onClick={(e) => {
                        if (!pick.click(e, n.id)) open(n.id);
                      }}
                      onPointerDown={dragNotes(n)}
                      {...cardProps(n)}
                    >
                      <span className="note-card-title">
                        {n.pinned && <Icon d={ICONS.pin} size={12} stroke={2.4} className="note-card-pin" />}
                        <span className="note-card-name">{noteTitle(n)}</span>
                        {n.favorite && <Icon d={ICONS.star} size={12} stroke={2.4} className="note-card-star" />}
                      </span>
                      <span className="note-card-excerpt">{n.excerpt || tr("Aucun texte.")}</span>
                      <span className="note-card-meta">
                        <span>{updatedLabel(n.updatedAt, new Date())}</span>
                        {book && filter.kind !== "carnet" && <span className="note-card-book">{book.name}</span>}
                        {n.tags.slice(0, 3).map((t) => (
                          <span key={t} className="note-card-tag">
                            #{t}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <SelectionBar count={pick.count} label={[tr("note sélectionnée"), tr("notes sélectionnées")]} actions={bulkActions} onClear={pick.clear} />
        </section>

        <section className="glass notes-editor-panel" aria-label={opened ? noteTitle(opened) : tr("Note")}>
          {opened && detached.includes(opened.id) ? (
            <div className="notes-empty notes-detached">
              <Orb color={opened.color ?? NOTES_MODULE.color} icon={ICONS.windowOpen} size={72} />
              <p>{tr("Note ouverte dans une fenêtre à part.")}</p>
              <div className="notes-detached-actions">
                <button type="button" className="btn-gel" onClick={() => void openNoteWindow(opened.id, noteTitle(opened))}>
                  <Icon d={ICONS.windowOpen} size={15} stroke={2.4} />
                  {tr("Afficher la fenêtre")}
                </button>
                <button
                  type="button"
                  className="btn-glass"
                  onClick={() => void flushNoteWindows().then(() => closeNoteWindow(opened.id))}
                >
                  <Icon d={ICONS.windowReturn} size={15} stroke={2.2} />
                  {tr("Ramener ici")}
                </button>
              </div>
            </div>
          ) : opened ? (
            <NoteEditor
              key={opened.id}
              noteId={opened.id}
              focusTitle={focusId === opened.id}
              fresh={fresh.has(opened.id)}
              onOpen={(id) => open(id)}
              onOpenContact={(id) => {
                go("contacts");
                contactRequest.request(id);
              }}
              onDetach={
                inTauri
                  ? () =>
                      void openNoteWindow(opened.id, noteTitle(opened)).catch((err: DataError) => notify(dataErrorMessage(err)))
                  : undefined
              }
            />
          ) : (
            <EmptyState
              color={NOTES_MODULE.color}
              icon={NOTES_MODULE.icon}
              text={loaded && notes.length === 0 ? tr("Aucune note.") : tr("Aucune note ouverte.")}
              action={{ label: tr("Nouvelle note"), run: () => void newNote() }}
            />
          )}
        </section>
      </div>

      {dialog?.kind === "notebook" && (
        <NotebookDialog
          notebook={dialog.notebook}
          parentId={dialog.parentId}
          folderId={dialog.folderId}
          onSaved={(b) => !dialog.notebook && setFilter({ kind: "carnet", id: b.id })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "folder" && <FolderDialog folder={dialog.folder} onClose={() => setDialog(null)} />}
      {dialog?.kind === "delete-notebook" && (
        <Dialog title={tr("Supprimer le carnet")} onClose={() => setDialog(null)}>
          <p className="settings-intro">{deleteNotebookText(dialog.notebook, dialog.count, subtreeIds(dialog.notebook.id, notebooks).size - 1)}</p>
          <div className="onb-actions">
            <button type="button" className="btn-glass" onClick={() => setDialog(null)}>
              {tr("Annuler")}
            </button>
            <button
              type="button"
              className="btn-glass btn-danger"
              onClick={() => {
                const book = dialog.notebook;
                setDialog(null);
                if (filter.kind === "carnet" && subtreeIds(book.id, notebooks).has(filter.id)) setFilter({ kind: "toutes" });
                void removeNotebook(book);
              }}
            >
              {tr("Supprimer")}
            </button>
          </div>
        </Dialog>
      )}
      {dialog?.kind === "move" && <MoveNoteDialog note={dialog.note} onClose={() => setDialog(null)} />}
      {dialog?.kind === "template" && (
        <TemplateNameDialog note={dialog.note} content={async () => (await load(dialog.note.id)).content} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "templates" && <TemplatesDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
