/** Listes et leurs éléments, dans la base chiffrée (src-tauri/src/data/lists.rs). */
import { invoke } from "@tauri-apps/api/core";
import { tr } from "../i18n/i18n";
import { asDataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { listFromTemplate, templateOf, type List, type ListInput, type ListItem, type ListItemInput } from "./lists";

export interface ListsApi {
  lists(): Promise<List[]>;
  create(list: ListInput): Promise<List>;
  update(id: string, list: ListInput): Promise<List>;
  archive(id: string, archived: boolean): Promise<List>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<List>;
  items(): Promise<ListItem[]>;
  createItem(listId: string, item: ListItemInput): Promise<ListItem>;
  updateItem(id: string, item: ListItemInput): Promise<ListItem>;
  removeItem(id: string): Promise<void>;
  reorder(listId: string, ids: string[]): Promise<void>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: ListsApi = {
  lists: () => call("lists_list"),
  create: (list) => call("lists_create", { list }),
  update: (id, list) => call("lists_update", { id, list }),
  archive: (id, archived) => call("lists_archive", { id, archived }),
  remove: (id) => call("lists_delete", { id }),
  restore: (id) => call("lists_restore", { id }),
  items: () => call("list_items_list"),
  createItem: (listId, item) => call("list_items_create", { listId, item }),
  updateItem: (id, item) => call("list_items_update", { id, item }),
  removeItem: (id) => call("list_items_delete", { id }),
  reorder: (listId, ids) => call("list_items_reorder", { listId, ids }),
};

/** Listes d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): ListsApi {
  const now = () => Math.floor(Date.now() / 1000);
  let seq = 0;
  const nextId = (p: string) => `apercu-${p}${++seq}`;
  const makeList = (input: ListInput, position: number): List => ({ ...input, id: nextId("l"), archived: false, position, createdAt: now(), updatedAt: now() });
  let lists: List[] = [makeList(listFromTemplate(templateOf("courses")), 0), makeList(listFromTemplate(templateOf("livres"), demo("Livres à lire", "Books to read")), 1)];
  const [courses, livres] = lists as [List, List];
  const makeItem = (listId: string, input: Partial<ListItemInput> & { title: string }, position: number): ListItem => ({
    section: null,
    cells: {},
    done: false,
    image: null,
    ...input,
    id: nextId("i"),
    listId,
    position,
    createdAt: now(),
    updatedAt: now(),
  });
  let items: ListItem[] = [
    makeItem(courses.id, { title: demo("Pommes", "Apples"), section: tr("Fruits et légumes"), cells: { quantite: "1 kg", prix: 299 } }, 0),
    makeItem(courses.id, { title: demo("Lait", "Milk"), section: tr("Frais"), cells: { quantite: "2 L", prix: 230 } }, 1),
    makeItem(courses.id, { title: demo("Pâtes", "Pasta"), section: tr("Épicerie"), cells: { prix: 145 }, done: true }, 2),
    makeItem(courses.id, { title: demo("Pain", "Bread"), section: tr("Boulangerie") }, 3),
    makeItem(livres.id, { title: demo("Le Petit Prince", "Pride and Prejudice"), section: tr("Lus"), cells: { auteur: demo("Antoine de Saint-Exupéry", "Jane Austen"), note: 5, lu: "2026-09-12" } }, 0),
    makeItem(livres.id, { title: demo("L'Écume des jours", "The Wind in the Willows"), section: tr("À lire"), cells: { auteur: demo("Boris Vian", "Kenneth Grahame") } }, 1),
    makeItem(livres.id, { title: demo("Vingt mille lieues sous les mers", "Twenty Thousand Leagues Under the Seas"), section: tr("En cours"), cells: { auteur: "Jules Verne", note: 4 } }, 2),
  ];
  const deleted = new Map<string, List>();
  const findList = (id: string) => {
    const l = lists.find((x) => x.id === id);
    if (!l) throw asDataError({ code: "notFound" });
    return l;
  };
  return {
    lists: async () => lists,
    create: async (input) => {
      const l = makeList(input, lists.length);
      lists = [...lists, l];
      return l;
    },
    update: async (id, input) => {
      const l = { ...findList(id), ...input, updatedAt: now() };
      lists = lists.map((x) => (x.id === id ? l : x));
      const kept = new Set(input.columns.map((c) => c.id));
      items = items.map((i) =>
        i.listId === id
          ? { ...i, cells: Object.fromEntries(Object.entries(i.cells).filter(([k]) => kept.has(k))), section: i.section && input.sections.includes(i.section) ? i.section : null }
          : i,
      );
      return l;
    },
    archive: async (id, archived) => {
      const l = { ...findList(id), archived };
      lists = lists.map((x) => (x.id === id ? l : x));
      return l;
    },
    remove: async (id) => {
      deleted.set(id, findList(id));
      lists = lists.filter((l) => l.id !== id);
    },
    restore: async (id) => {
      const l = deleted.get(id);
      if (!l) throw asDataError({ code: "notFound" });
      lists = [...lists, l];
      return l;
    },
    items: async () => items.filter((i) => lists.some((l) => l.id === i.listId)),
    createItem: async (listId, input) => {
      const i = makeItem(listId, input, items.filter((x) => x.listId === listId).length);
      items = [...items, i];
      return i;
    },
    updateItem: async (id, input) => {
      const found = items.find((x) => x.id === id);
      if (!found) throw asDataError({ code: "notFound" });
      const i = { ...found, ...input, updatedAt: now() };
      items = items.map((x) => (x.id === id ? i : x));
      return i;
    },
    removeItem: async (id) => {
      items = items.filter((i) => i.id !== id);
    },
    reorder: async (_listId, ids) => {
      items = items.map((i) => (ids.includes(i.id) ? { ...i, position: ids.indexOf(i.id) } : i));
    },
  };
}

export const listsApi: ListsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
