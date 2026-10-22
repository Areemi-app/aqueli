import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { mergeOrder } from "../lib/dragDrop";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { notesApi } from "./api";
import { isNoteWindow, onNoteChangedElsewhere } from "./noteWindows";
import {
  metaOf,
  noteTitle,
  plainOf,
  type Note,
  type NoteBody,
  type Notebook,
  type NotebookInput,
  type NoteFolder,
  type NoteFolderInput,
  type NoteMeta,
  type NoteSummary,
  type NoteTemplate,
} from "./notes";
import { tr } from "../i18n/i18n";

interface NotesContextValue {
  notes: readonly NoteSummary[];
  notebooks: readonly Notebook[];
  /** Dossiers où ranger les carnets. */
  folders: readonly NoteFolder[];
  templates: readonly NoteTemplate[];
  loaded: boolean;
  /** Contenu complet d'une note (éditeur). */
  load: (id: string) => Promise<Note>;
  create: (body: NoteBody, meta: NoteMeta) => Promise<NoteSummary>;
  /** Enregistre le texte (saisie) ; les enregistrements passent dans l'ordre. */
  saveBody: (id: string, body: NoteBody) => Promise<void>;
  /** Range la note ; l'affichage suit tout de suite, puis la base confirme. */
  updateMeta: (note: NoteSummary, changes: Partial<NoteMeta>) => Promise<void>;
  duplicate: (note: NoteSummary) => Promise<NoteSummary | null>;
  /** Met la note à la corbeille, avec « Annuler ». */
  remove: (note: NoteSummary) => Promise<void>;
  /** Retire sans message une note nouvelle restée vide. */
  discard: (id: string) => Promise<void>;
  /** Remplace la note par une version de son historique. */
  restoreVersion: (id: string, version: number) => Promise<Note | null>;
  search: (query: string) => Promise<string[]>;
  createNotebook: (input: NotebookInput) => Promise<Notebook>;
  updateNotebook: (id: string, input: NotebookInput) => Promise<Notebook>;
  /** Met le carnet à la corbeille avec ses sous-carnets et leurs notes, avec « Annuler ». */
  removeNotebook: (notebook: Notebook) => Promise<void>;
  createFolder: (input: NoteFolderInput) => Promise<NoteFolder>;
  updateFolder: (id: string, input: NoteFolderInput) => Promise<NoteFolder>;
  /** Retire le dossier ; ses carnets restent, hors dossier (« Annuler » le rétablit). */
  removeFolder: (folder: NoteFolder) => Promise<void>;
  /** Nouvel ordre d'une partie (glisser-déposer) ; les autres gardent leur place. Ctrl+Z le défait. */
  reorderFolders: (ids: string[]) => Promise<void>;
  createTemplate: (name: string, content: string) => Promise<NoteTemplate>;
  removeTemplate: (template: NoteTemplate) => Promise<void>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

/** Notes, carnets et modèles, chargés une fois le compte déverrouillé. */
export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();

  const listRef = useRef<NoteSummary[]>([]);
  const setAll = useCallback((change: (list: NoteSummary[]) => NoteSummary[]) => {
    listRef.current = change(listRef.current);
    setNotes(listRef.current);
  }, []);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);
  const replace = useCallback((n: NoteSummary) => setAll((list) => list.map((x) => (x.id === n.id ? n : x))), [setAll]);

  const reload = useCallback(async () => {
    const [list, books, models, dirs] = await enqueue(() => Promise.all([notesApi.list(), notesApi.notebooks(), notesApi.templates(), notesApi.folders()]));
    setAll(() => list);
    setNotebooks(books);
    setFolders([...dirs].sort((a, b) => a.position - b.position));
    setTemplates(models);
  }, [enqueue, setAll]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);

  // Fenêtre principale : une note modifiée dans sa propre fenêtre est relue.
  useEffect(() => {
    if (isNoteWindow()) return;
    let timer = 0;
    const stop = onNoteChangedElsewhere(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reload().catch(() => undefined), 300);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [reload]);

  // Élément ajouté par la capture rapide : la liste est relue.
  useEffect(
    () =>
      onDataAdded("note", () => {
        reload().catch(() => undefined);
      }),
    [reload],
  );

  const value = useMemo<NotesContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const create = async (body: NoteBody, meta: NoteMeta) => {
      const n = await enqueue(() => notesApi.create(body, meta));
      setAll((list) => [n, ...list]);
      return n;
    };
    const remove = async (note: NoteSummary) => {
      try {
        await enqueue(() => notesApi.remove(note.id));
      } catch (err) {
        fail(err);
        return;
      }
      setAll((list) => list.filter((n) => n.id !== note.id));
      notify(tr("Note supprimée."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de la note"),
        run: () => {
          enqueue(() => notesApi.restore(note.id))
            .then((back) => setAll((list) => [...list.filter((n) => n.id !== back.id), back]))
            .catch(fail);
        },
      });
    };
    const updateMeta = async (note: NoteSummary, changes: Partial<NoteMeta>) => {
      const base = listRef.current.find((n) => n.id === note.id) ?? note;
      // Ctrl+Z : épinglage, favori, carnet, étiquettes, couleur tels qu'avant.
      recordUndo(tr("modification de la note"), () => updateMeta(base, metaOf(base)), `note:${base.id}`);
      const meta = { ...metaOf(base), ...changes };
      replace({ ...base, ...meta });
      try {
        replace(await enqueue(() => notesApi.updateMeta(base.id, meta)));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    const removeNotebook = async (notebook: Notebook) => {
      try {
        await enqueue(() => notesApi.removeNotebook(notebook.id));
        await reload();
      } catch (err) {
        fail(err);
        return;
      }
      notify(tr("Carnet « {name} » supprimé.", { name: notebook.name }), {
        label: tr("Annuler|action"),
        undo: tr("suppression du carnet"),
        run: () => {
          enqueue(() => notesApi.restoreNotebook(notebook.id))
            .then(reload)
            .catch(fail);
        },
      });
    };
    const updateNotebook = async (id: string, input: NotebookInput) => {
      const before = notebooks.find((x) => x.id === id);
      const nb = await enqueue(() => notesApi.updateNotebook(id, input));
      setNotebooks((list) => list.map((x) => (x.id === id ? nb : x)));
      if (before) {
        const { name, parentId, color, icon, folderId } = before;
        recordUndo(tr("modification du carnet"), () => updateNotebook(id, { name, parentId, color, icon, folderId }).catch(fail));
      }
      return nb;
    };
    const updateFolder = async (id: string, input: NoteFolderInput) => {
      const before = folders.find((f) => f.id === id);
      const f = await enqueue(() => notesApi.updateFolder(id, input));
      setFolders((list) => list.map((x) => (x.id === id ? f : x)));
      if (before) recordUndo(tr("modification du dossier"), () => updateFolder(id, { name: before.name, color: before.color, icon: before.icon }).catch(fail));
      return f;
    };
    const removeFolder = async (folder: NoteFolder) => {
      const inside = notebooks.filter((b) => b.folderId === folder.id);
      try {
        await enqueue(() => notesApi.removeFolder(folder.id));
      } catch (err) {
        fail(err);
        return;
      }
      setFolders((list) => list.filter((f) => f.id !== folder.id));
      setNotebooks((list) => list.map((b) => (b.folderId === folder.id ? { ...b, folderId: null } : b)));
      notify(tr("Dossier supprimé."), {
        label: tr("Annuler|action"),
        undo: tr("suppression du dossier"),
        run: () => {
          void (async () => {
            const again = await enqueue(() => notesApi.createFolder({ name: folder.name, color: folder.color, icon: folder.icon }));
            for (const b of inside) await enqueue(() => notesApi.updateNotebook(b.id, { name: b.name, parentId: b.parentId, color: b.color, icon: b.icon, folderId: again.id }));
            await reload();
          })().catch(fail);
        },
      });
    };
    return {
      reorderFolders: async (part: string[]) => {
        const before = folders.map((x) => x.id);
        const ids = mergeOrder(before, part);
        if (ids.join() === before.join()) return;
        const apply = async (order: string[]) => {
          setFolders((list) => [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((x, position) => ({ ...x, position })));
          await enqueue(() => notesApi.reorderFolders(order));
        };
        try {
          await apply(ids);
          recordUndo(tr("déplacement du dossier"), () => apply(before));
        } catch (err) {
          fail(err);
        }
      },
      notes,
      notebooks,
      folders,
      templates,
      loaded,
      load: (id) => enqueue(() => notesApi.get(id)),
      create,
      saveBody: async (id, body) => {
        try {
          replace(await enqueue(() => notesApi.updateBody(id, body)));
        } catch (err) {
          fail(err);
        }
      },
      updateMeta,
      duplicate: async (note) => {
        try {
          const full = await enqueue(() => notesApi.get(note.id));
          const plain = plainOf(JSON.parse(full.content));
          const copy = await create(
            { title: `${noteTitle(full)} (copie)`, content: full.content, plain, links: full.links },
            { ...metaOf(full), pinned: false, archived: false },
          );
          recordUndo(tr("copie de la note"), () => remove(copy));
          return copy;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      remove,
      discard: async (id) => {
        setAll((list) => list.filter((n) => n.id !== id));
        await enqueue(() => notesApi.remove(id)).catch(() => undefined);
      },
      restoreVersion: async (id, version) => {
        try {
          const note = await enqueue(() => notesApi.restoreVersion(id, version));
          const { content: _content, ...summary } = note;
          replace(summary);
          notify(tr("Version rétablie."));
          return note;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      search: (query) => enqueue(() => notesApi.search(query)),
      createNotebook: async (input) => {
        const nb = await enqueue(() => notesApi.createNotebook(input));
        setNotebooks((list) => [...list, nb]);
        recordUndo(tr("ajout du carnet"), () => removeNotebook(nb));
        return nb;
      },
      updateNotebook,
      removeNotebook,
      createFolder: async (input) => {
        const f = await enqueue(() => notesApi.createFolder(input));
        setFolders((list) => [...list, f]);
        recordUndo(tr("ajout du dossier"), () => removeFolder(f));
        return f;
      },
      updateFolder,
      removeFolder,
      createTemplate: async (name, content) => {
        const t = await enqueue(() => notesApi.createTemplate(name, content));
        setTemplates((list) => [...list, t].sort((a, b) => a.name.localeCompare(b.name, "fr")));
        return t;
      },
      removeTemplate: async (template) => {
        try {
          await enqueue(() => notesApi.removeTemplate(template.id));
          setTemplates((list) => list.filter((t) => t.id !== template.id));
          notify(tr("Modèle « {name} » supprimé.", { name: template.name }));
        } catch (err) {
          fail(err);
        }
      },
    };
  }, [notes, notebooks, folders, templates, loaded, enqueue, setAll, replace, notify, reload]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes doit être utilisé dans NotesProvider");
  return ctx;
}
