import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { mergeOrder } from "../lib/dragDrop";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useSpaces } from "../spaces/SpacesProvider";
import { documentsApi, type RefusedFile } from "./api";
import { guessFromName, toMeta, type Document, type DocumentMeta, type Folder, type FolderInput } from "./documents";
import { tr } from "../i18n/i18n";

interface DocumentsContextValue {
  /** Tous les documents, du plus récent au plus ancien. */
  documents: readonly Document[];
  /** Documents de l'espace choisi dans la barre de titre. */
  visible: readonly Document[];
  folders: readonly Folder[];
  loaded: boolean;
  /** Ajoute des fichiers choisis ou glissés ; renvoie les documents créés. */
  add: (paths: string[], folderId: string | null) => Promise<Document[]>;
  /** Fenêtre « Ouvrir », puis ajout. */
  pickAndAdd: (folderId: string | null) => Promise<Document[]>;
  update: (doc: Document, changes: Partial<DocumentMeta>) => Promise<void>;
  /** Met le document à la corbeille, avec « Annuler ». */
  remove: (doc: Document) => Promise<void>;
  exportTo: (doc: Document) => Promise<void>;
  /** Exporte plusieurs documents dans un dossier choisi. */
  exportMany: (docs: readonly Document[]) => Promise<void>;
  createFolder: (input: FolderInput) => Promise<Folder | null>;
  updateFolder: (folder: Folder, input: FolderInput) => Promise<void>;
  removeFolder: (folder: Folder) => Promise<void>;
  /** Nouvel ordre d'une partie (glisser-déposer) ; les autres gardent leur place. Ctrl+Z le défait. */
  reorderFolders: (ids: string[]) => Promise<void>;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

const sortDocuments = (list: readonly Document[]) => [...list].sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name, "fr"));

/** « Trop volumineux (30 Mo au plus) »… pour un fichier refusé. */
function refusedMessage(refused: readonly RefusedFile[]): string {
  const first = refused[0]!;
  const reason = first.reason === "tooLarge" ? tr("fichier trop volumineux (30 Mo au plus)") : first.reason === "tooMany" ? tr("nombre maximal de documents atteint") : tr("fichier illisible");
  return refused.length === 1
    ? tr("« {name} » non ajouté : {reason}.", { name: first.name, reason })
    : tr("{n} fichiers non ajoutés, dont « {name} » : {reason}.", { n: refused.length, name: first.name, reason });
}

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const { filter, spaces } = useSpaces();

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const reload = useCallback(async () => {
    const [list, dirs] = await enqueue(() => Promise.all([documentsApi.list(), documentsApi.folders()]));
    setDocuments(sortDocuments(list));
    setFolders([...dirs].sort((a, b) => a.position - b.position));
  }, [enqueue]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);
  useEffect(() => onDataAdded("document", () => void reload().catch(() => undefined)), [reload]);

  const docsRef = useRef(documents);
  docsRef.current = documents;

  const value = useMemo<DocumentsContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const put = (d: Document) => setDocuments((list) => sortDocuments(list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [...list, d]));
    const remove = async (doc: Document) => {
      try {
        await enqueue(() => documentsApi.remove(doc.id));
      } catch (err) {
        fail(err);
        return;
      }
      setDocuments((list) => list.filter((d) => d.id !== doc.id));
      notify(tr("Document supprimé."), {
        label: tr("Annuler|action"),
        undo: tr("suppression du document"),
        run: () => {
          enqueue(() => documentsApi.restore(doc.id))
            .then(put)
            .catch(fail);
        },
      });
    };
    const add = async (paths: string[], folderId: string | null) => {
      if (paths.length === 0) return [];
      const spaceId = filter !== "tous" && spaces.some((s) => s.id === filter) ? filter : (spaces[0]?.id ?? null);
      try {
        const { added: raw, refused } = await enqueue(() => documentsApi.add(paths, folderId, spaceId));
        // Sorte et date devinées d'après le nom du fichier (facture, relevé…), modifiables ensuite.
        const added: Document[] = [];
        for (const d of raw) {
          const guess = guessFromName(d.name);
          added.push(guess.docType || guess.docDate ? await enqueue(() => documentsApi.update(d.id, { ...toMeta(d), ...guess })).catch(() => d) : d);
        }
        setDocuments((list) => sortDocuments([...list, ...added]));
        if (added.length > 0) {
          recordUndo(added.length > 1 ? tr("ajout des documents") : tr("ajout du document"), async () => {
            for (const d of added) await enqueue(() => documentsApi.remove(d.id));
            setDocuments((list) => list.filter((d) => !added.some((a) => a.id === d.id)));
          });
        }
        if (refused.length > 0) notify(refusedMessage(refused));
        else if (added.length > 0) notify(added.length === 1 ? tr("Document ajouté.") : tr("{length} documents ajoutés.", { length: added.length }));
        return added;
      } catch (err) {
        fail(err);
        return [];
      }
    };
    return {
      reorderFolders: async (part: string[]) => {
        const before = folders.map((x) => x.id);
        const ids = mergeOrder(before, part);
        if (ids.join() === before.join()) return;
        const apply = async (order: string[]) => {
          setFolders((list) => [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((x, position) => ({ ...x, position })));
          await enqueue(() => documentsApi.reorderFolders(order));
        };
        try {
          await apply(ids);
          recordUndo(tr("déplacement du dossier"), () => apply(before));
        } catch (err) {
          fail(err);
        }
      },
      documents,
      visible: filter === "tous" ? documents : documents.filter((d) => d.spaceId === filter),
      folders,
      loaded,
      add,
      pickAndAdd: async (folderId) => {
        try {
          return await add(await documentsApi.pick(), folderId);
        } catch (err) {
          fail(err);
          return [];
        }
      },
      update: async (doc, changes) => {
        const base = docsRef.current.find((d) => d.id === doc.id) ?? doc;
        recordUndo(tr("modification du document"), () => enqueue(() => documentsApi.update(base.id, toMeta(base))).then(put), `document:${base.id}`);
        put({ ...base, ...changes });
        try {
          put(await enqueue(() => documentsApi.update(base.id, { ...toMeta(base), ...changes })));
        } catch (err) {
          fail(err);
          await reload().catch(() => undefined);
        }
      },
      remove,
      exportTo: async (doc) => {
        try {
          const path = await documentsApi.exportTo(doc.id);
          if (path) notify(tr("Document exporté."));
        } catch {
          notify(tr("Export impossible. Choisissez un autre dossier."));
        }
      },
      exportMany: async (docs) => {
        try {
          const count = await documentsApi.exportMany(docs.map((d) => d.id));
          if (count !== null) notify(count > 1 ? tr("{count} documents exportés.", { count }) : tr("Document exporté."));
        } catch {
          notify(tr("Export impossible. Choisissez un autre dossier."));
        }
      },
      createFolder: async (input) => {
        try {
          const f = await enqueue(() => documentsApi.createFolder(input));
          setFolders((list) => [...list, f]);
          return f;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      updateFolder: async (folder, input) => {
        try {
          const f = await enqueue(() => documentsApi.updateFolder(folder.id, input));
          setFolders((list) => list.map((x) => (x.id === f.id ? f : x)));
        } catch (err) {
          fail(err);
        }
      },
      removeFolder: async (folder) => {
        try {
          await enqueue(() => documentsApi.removeFolder(folder.id));
          setFolders((list) => list.filter((f) => f.id !== folder.id));
          setDocuments((list) => list.map((d) => (d.folderId === folder.id ? { ...d, folderId: null } : d)));
          notify(tr("Dossier supprimé."));
        } catch (err) {
          fail(err);
        }
      },
    };
  }, [documents, folders, loaded, filter, spaces, enqueue, notify, reload]);

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error("useDocuments doit être utilisé dans DocumentsProvider");
  return ctx;
}

export function useDocumentsIfAny(): DocumentsContextValue | null {
  return useContext(DocumentsContext);
}
