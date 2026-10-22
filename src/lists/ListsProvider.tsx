import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useSpaces } from "../spaces/SpacesProvider";
import { listsApi } from "./api";
import { toItemInput, toListInput, type List, type ListInput, type ListItem, type ListItemInput } from "./lists";
import { tr } from "../i18n/i18n";

interface ListsContextValue {
  /** Toutes les listes, archivées comprises, dans l'ordre. */
  lists: readonly List[];
  /** Listes de l'espace choisi dans la barre de titre. */
  visible: readonly List[];
  /** Éléments, par liste, dans l'ordre. */
  items: ReadonlyMap<string, readonly ListItem[]>;
  loaded: boolean;
  createList: (input: ListInput) => Promise<List | null>;
  updateList: (list: List, changes: Partial<ListInput>) => Promise<void>;
  archiveList: (list: List, archived: boolean) => Promise<void>;
  /** Met la liste à la corbeille, avec « Annuler ». */
  removeList: (list: List) => Promise<void>;
  createItem: (list: List, input: ListItemInput) => Promise<ListItem | null>;
  updateItem: (item: ListItem, changes: Partial<ListItemInput>) => Promise<void>;
  /** Supprime l'élément, avec « Annuler ». */
  removeItem: (item: ListItem) => Promise<void>;
  duplicateItem: (item: ListItem) => Promise<void>;
  /** Nouvel ordre des éléments d'une liste (glisser-déposer). */
  reorder: (list: List, ids: string[]) => Promise<void>;
}

const ListsContext = createContext<ListsContextValue | null>(null);

const byPosition = <T extends { position: number; createdAt: number }>(a: T, b: T) => a.position - b.position || a.createdAt - b.createdAt;

export function ListsProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = useState<List[]>([]);
  const [itemList, setItemList] = useState<ListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const { filter } = useSpaces();

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const reload = useCallback(async () => {
    const [ls, its] = await enqueue(() => Promise.all([listsApi.lists(), listsApi.items()]));
    setLists([...ls].sort(byPosition));
    setItemList(its);
  }, [enqueue]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);
  useEffect(() => onDataAdded("list", () => void reload().catch(() => undefined)), [reload]);

  const items = useMemo(() => {
    const map = new Map<string, ListItem[]>();
    for (const i of itemList) map.set(i.listId, [...(map.get(i.listId) ?? []), i]);
    for (const [k, v] of map) map.set(k, v.sort(byPosition));
    return map;
  }, [itemList]);

  const listsRef = useRef(lists);
  listsRef.current = lists;
  const itemsRef = useRef(itemList);
  itemsRef.current = itemList;

  const value = useMemo<ListsContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const putList = (l: List) => setLists((all) => (all.some((x) => x.id === l.id) ? all.map((x) => (x.id === l.id ? l : x)) : [...all, l]).sort(byPosition));
    const putItem = (i: ListItem) => setItemList((all) => (all.some((x) => x.id === i.id) ? all.map((x) => (x.id === i.id ? i : x)) : [...all, i]));

    const removeList = async (list: List) => {
      try {
        await enqueue(() => listsApi.remove(list.id));
      } catch (err) {
        fail(err);
        return;
      }
      setLists((all) => all.filter((l) => l.id !== list.id));
      notify(tr("Liste supprimée."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de la liste"),
        run: () => {
          enqueue(() => listsApi.restore(list.id))
            .then(() => reload())
            .catch(fail);
        },
      });
    };
    const updateList = async (list: List, changes: Partial<ListInput>) => {
      const base = listsRef.current.find((l) => l.id === list.id) ?? list;
      const before = itemsRef.current.filter((i) => i.listId === base.id);
      recordUndo(
        tr("modification de la liste"),
        async () => {
          await updateList(base, toListInput(base));
          // Les valeurs d'une colonne retirée reviennent avec elle.
          for (const i of before) await enqueue(() => listsApi.updateItem(i.id, toItemInput(i))).then(putItem);
        },
        `list:${base.id}`,
      );
      putList({ ...base, ...changes });
      try {
        putList(await enqueue(() => listsApi.update(base.id, { ...toListInput(base), ...changes })));
        if (changes.columns || changes.sections) setItemList(await enqueue(() => listsApi.items()));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    const removeItem = async (item: ListItem) => {
      setItemList((all) => all.filter((i) => i.id !== item.id));
      try {
        await enqueue(() => listsApi.removeItem(item.id));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
        return;
      }
      notify(tr("Élément supprimé."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de l'élément"),
        run: () => {
          void (async () => {
            const again = await enqueue(() => listsApi.createItem(item.listId, toItemInput(item)));
            putItem(again);
            // Il reprend sa place dans la liste.
            const ids = (itemsRef.current.filter((i) => i.listId === item.listId && i.id !== again.id).sort(byPosition)).map((i) => i.id);
            ids.splice(Math.min(item.position, ids.length), 0, again.id);
            await enqueue(() => listsApi.reorder(item.listId, ids));
            setItemList((all) => all.map((i) => (i.listId === item.listId ? { ...i, position: ids.indexOf(i.id) } : i)));
          })().catch(fail);
        },
      });
    };
    const createItem = async (list: List, input: ListItemInput) => {
      try {
        const i = await enqueue(() => listsApi.createItem(list.id, input));
        putItem(i);
        recordUndo(tr("ajout de l'élément"), () => removeItem(i));
        return i;
      } catch (err) {
        fail(err);
        return null;
      }
    };
    const updateItem = async (item: ListItem, changes: Partial<ListItemInput>) => {
      const base = itemsRef.current.find((i) => i.id === item.id) ?? item;
      recordUndo(tr("modification de l'élément"), () => updateItem(base, toItemInput(base)), `list-item:${base.id}`);
      putItem({ ...base, ...changes });
      try {
        putItem(await enqueue(() => listsApi.updateItem(base.id, { ...toItemInput(base), ...changes })));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    return {
      lists,
      visible: filter === "tous" ? lists : lists.filter((l) => l.spaceId === filter || l.spaceId === null),
      items,
      loaded,
      createList: async (input) => {
        try {
          const l = await enqueue(() => listsApi.create(input));
          putList(l);
          recordUndo(tr("ajout de la liste"), () => removeList(l));
          return l;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      updateList,
      archiveList: async (list, archived) => {
        try {
          putList(await enqueue(() => listsApi.archive(list.id, archived)));
          recordUndo(archived ? tr("archivage de la liste") : tr("sortie des archives"), () => enqueue(() => listsApi.archive(list.id, !archived)).then(putList));
          notify(archived ? tr("Liste archivée.") : tr("Liste ressortie des archives."));
        } catch (err) {
          fail(err);
        }
      },
      removeList,
      createItem,
      updateItem,
      removeItem,
      duplicateItem: async (item) => {
        const list = listsRef.current.find((l) => l.id === item.listId);
        if (list) await createItem(list, toItemInput(item));
      },
      reorder: async (list, ids) => {
        const before = itemsRef.current.filter((i) => i.listId === list.id).sort(byPosition).map((i) => i.id);
        setItemList((all) => all.map((i) => (i.listId === list.id && ids.includes(i.id) ? { ...i, position: ids.indexOf(i.id) } : i)));
        try {
          await enqueue(() => listsApi.reorder(list.id, ids));
          recordUndo(tr("déplacement de l'élément"), async () => {
            await enqueue(() => listsApi.reorder(list.id, before));
            setItemList((all) => all.map((i) => (i.listId === list.id && before.includes(i.id) ? { ...i, position: before.indexOf(i.id) } : i)));
          });
        } catch (err) {
          fail(err);
          await reload().catch(() => undefined);
        }
      },
    };
  }, [lists, items, loaded, filter, enqueue, notify, reload]);

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

export function useListsIfAny(): ListsContextValue | null {
  return useContext(ListsContext);
}

export function useLists(): ListsContextValue {
  const ctx = useContext(ListsContext);
  if (!ctx) throw new Error("useLists doit être utilisé dans ListsProvider");
  return ctx;
}
