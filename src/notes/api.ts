/** Notes enregistrées dans la base chiffrée (commandes du cœur, src-tauri/src/data/notes.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError, type DataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { containsExactly, fold, hasAccents } from "../lib/fold";
import { inTauri } from "../lib/windowControls";
import {
  type DocNode,
  type Note,
  type NoteBody,
  type Notebook,
  type NotebookInput,
  type NoteFolder,
  type NoteFolderInput,
  type NoteMeta,
  type NoteSummary,
  type NoteTemplate,
  type NoteVersion,
  type NoteVersionContent,
  plainOf,
} from "./notes";

export interface NotesApi {
  list(): Promise<NoteSummary[]>;
  get(id: string): Promise<Note>;
  create(body: NoteBody, meta: NoteMeta): Promise<NoteSummary>;
  updateBody(id: string, body: NoteBody): Promise<NoteSummary>;
  updateMeta(id: string, meta: NoteMeta): Promise<NoteSummary>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<NoteSummary>;
  /** Identifiants des notes trouvées, les meilleures d'abord. */
  search(query: string): Promise<string[]>;
  versions(id: string): Promise<NoteVersion[]>;
  version(id: string, version: number): Promise<NoteVersionContent>;
  restoreVersion(id: string, version: number): Promise<Note>;
  notebooks(): Promise<Notebook[]>;
  createNotebook(notebook: NotebookInput): Promise<Notebook>;
  updateNotebook(id: string, notebook: NotebookInput): Promise<Notebook>;
  removeNotebook(id: string): Promise<void>;
  restoreNotebook(id: string): Promise<void>;
  folders(): Promise<NoteFolder[]>;
  createFolder(folder: NoteFolderInput): Promise<NoteFolder>;
  updateFolder(id: string, folder: NoteFolderInput): Promise<NoteFolder>;
  removeFolder(id: string): Promise<void>;
  /** Nouvel ordre (glisser-déposer). */
  reorderFolders(ids: string[]): Promise<void>;
  templates(): Promise<NoteTemplate[]>;
  createTemplate(name: string, content: string): Promise<NoteTemplate>;
  removeTemplate(id: string): Promise<void>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: NotesApi = {
  list: () => call("notes_list"),
  get: (id) => call("notes_get", { id }),
  create: (body, meta) => call("notes_create", { body, meta }),
  updateBody: (id, body) => call("notes_update_body", { id, body }),
  updateMeta: (id, meta) => call("notes_update_meta", { id, meta }),
  remove: (id) => call("notes_delete", { id }),
  restore: (id) => call("notes_restore", { id }),
  search: (query) => call("notes_search", { query }),
  versions: (id) => call("note_versions_list", { id }),
  version: (id, version) => call("note_versions_get", { id, version }),
  restoreVersion: (id, version) => call("note_versions_restore", { id, version }),
  notebooks: () => call("notebooks_list"),
  createNotebook: (notebook) => call("notebooks_create", { notebook }),
  updateNotebook: (id, notebook) => call("notebooks_update", { id, notebook }),
  removeNotebook: (id) => call("notebooks_delete", { id }),
  restoreNotebook: (id) => call("notebooks_restore", { id }),
  folders: () => call("note_folders_list"),
  createFolder: (folder) => call("note_folders_create", { folder }),
  updateFolder: (id, folder) => call("note_folders_update", { id, folder }),
  removeFolder: (id) => call("note_folders_delete", { id }),
  reorderFolders: (ids) => call("order_save", { kind: "dossiers-notes", ids }),
  templates: () => call("note_templates_list"),
  createTemplate: (name, content) => call("note_templates_create", { name, content }),
  removeTemplate: (id) => call("note_templates_delete", { id }),
};

/** Même calcul que le cœur (`notes::excerpt`). */
const excerptOf = (plain: string) => {
  const flat = plain
    .split("\n")
    .map((line) => line.split(/\s+/).filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" · ");
  return flat.length <= 180 ? flat : `${flat.slice(0, 180).trimEnd()}…`;
};

/** Notes d'exemple en mémoire pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): NotesApi {
  const now = () => Math.floor(Date.now() / 1000);
  let seq = 0;
  const nextId = (prefix: string) => `apercu${prefix}${(seq += 1)}`;
  type Stored = Note & { plain: string; deletedAt: number | null };
  const t = (value: string): DocNode => ({ type: "text", text: value });
  const para = (value: string): DocNode => ({ type: "paragraph", content: [t(value)] });

  let notebooks: (Notebook & { deletedAt: number | null })[] = [
    { id: "apercuc1", name: demo("Travail", "Work"), parentId: null, color: null, icon: null, folderId: null, createdAt: now(), deletedAt: null },
    { id: "apercuc2", name: demo("Réunions", "Meetings"), parentId: "apercuc1", color: null, icon: null, folderId: null, createdAt: now(), deletedAt: null },
    { id: "apercuc3", name: demo("Maison", "Home"), parentId: null, color: null, icon: null, folderId: "apercud1", createdAt: now(), deletedAt: null },
    { id: "apercuc4", name: demo("Cuisine", "Cooking"), parentId: "apercuc3", color: null, icon: null, folderId: null, createdAt: now(), deletedAt: null },
  ];
  let folders: NoteFolder[] = [{ id: "apercud1", name: demo("Vie perso", "Personal life"), color: "#e0508a", icon: "coeur", position: 0 }];
  const store: Stored[] = [];
  const add = (title: string, doc: DocNode, meta: Partial<NoteMeta & { links: string[] }>, ago: number) => {
    const at = now() - ago;
    const plain = plainOf(doc);
    store.push({
      id: nextId("n"),
      title,
      content: JSON.stringify(doc),
      plain,
      excerpt: excerptOf(plain),
      notebookId: null,
      spaceId: "perso",
      tags: [],
      pinned: false,
      favorite: false,
      color: null,
      archived: false,
      links: [],
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      ...meta,
    });
  };
  add(
    demo("Réunion d'équipe", "Team meeting"),
    {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [t(demo("Ordre du jour", "Agenda"))] },
        { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [para(demo("Budget du trimestre", "Quarterly budget"))] }, { type: "listItem", content: [para(demo("Planning des congés", "Holiday rota"))] }] },
        { type: "heading", attrs: { level: 2 }, content: [t(demo("Actions", "Actions"))] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [para(demo("Envoyer le compte rendu", "Send the minutes"))] }, { type: "taskItem", attrs: { checked: false }, content: [para(demo("Réserver la salle", "Book the meeting room"))] }] },
      ],
    },
    { notebookId: "apercuc2", tags: [demo("réunion", "meeting")], pinned: true, spaceId: "travail" },
    3600,
  );
  add(
    demo("Crêpes", "Pancakes"),
    {
      type: "doc",
      content: [
        para(demo("Pour 4 personnes · Préparation : 10 min", "Serves 4 · Preparation: 10 min")),
        { type: "heading", attrs: { level: 2 }, content: [t(demo("Ingrédients", "Ingredients"))] },
        { type: "bulletList", content: [demo("250 g de farine", "250 g plain flour"), demo("4 œufs", "4 eggs"), demo("50 cl de lait", "500 ml milk")].map((i) => ({ type: "listItem", content: [para(i)] })) },
      ],
    },
    { notebookId: "apercuc4", tags: [demo("recette", "recipe")], favorite: true },
    86400 * 2,
  );
  add(
    demo("Idées de cadeaux", "Gift ideas"),
    { type: "doc", content: [para(demo("Un livre sur les jardins japonais. Voir aussi ", "A book on Japanese gardens. See also ")), { type: "paragraph", content: [{ type: "noteLink", attrs: { id: "apercun2", label: demo("Crêpes", "Pancakes") } }] }] },
    { tags: [demo("famille", "family")], links: ["apercun2"] },
    86400 * 9,
  );
  const versions: (NoteVersionContent & { noteId: string; plain: string })[] = [];
  let templates: NoteTemplate[] = [];
  const deletedNotebooks = new Map<string, number>();

  const find = (id: string): Stored => {
    const n = store.find((x) => x.id === id && x.deletedAt === null);
    if (!n) throw { code: "notFound" } satisfies DataError;
    return n;
  };
  const summaryOf = ({ content: _content, plain: _plain, deletedAt: _deletedAt, ...s }: Stored): NoteSummary => s;
  const noteOf = ({ plain: _plain, deletedAt: _deletedAt, ...n }: Stored): Note => n;
  const checkBody = (body: NoteBody, id?: string): NoteBody => {
    try {
      JSON.parse(body.content);
    } catch {
      throw { code: "invalid", field: "content" } satisfies DataError;
    }
    return { ...body, title: body.title.split(/\s+/).filter(Boolean).join(" "), links: [...new Set(body.links)].filter((l) => l !== id) };
  };
  const snapshot = (n: Stored, always: boolean) => {
    if (!n.plain.trim() && !n.title) return;
    const last = versions.filter((v) => v.noteId === n.id).sort((a, b) => b.savedAt - a.savedAt)[0];
    if (last && last.content === n.content) return;
    if (!last || always || now() - last.savedAt >= 600) {
      versions.push({ id: (seq += 1), noteId: n.id, title: n.title, content: n.content, plain: n.plain, savedAt: always ? now() : n.updatedAt });
    }
  };

  return {
    list: async () =>
      store
        .filter((n) => n.deletedAt === null)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
        .map(summaryOf),
    get: async (id) => noteOf(find(id)),
    create: async (body, meta) => {
      const b = checkBody(body);
      const n: Stored = { id: nextId("n"), ...b, ...meta, excerpt: excerptOf(b.plain), createdAt: now(), updatedAt: now(), deletedAt: null };
      store.push(n);
      return summaryOf(n);
    },
    updateBody: async (id, body) => {
      const n = find(id);
      const b = checkBody(body, id);
      if (n.title !== b.title || n.content !== b.content) snapshot(n, false);
      Object.assign(n, b, { excerpt: excerptOf(b.plain), updatedAt: now() });
      return summaryOf(n);
    },
    updateMeta: async (id, meta) => {
      const n = find(id);
      Object.assign(n, meta);
      return summaryOf(n);
    },
    remove: async (id) => {
      find(id).deletedAt = now();
    },
    restore: async (id) => {
      const n = store.find((x) => x.id === id && x.deletedAt !== null);
      if (!n) throw { code: "notFound" } satisfies DataError;
      n.deletedAt = null;
      return summaryOf(n);
    },
    search: async (query) => {
      const words = fold(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      if (words.length === 0) return [];
      const text = (n: Stored) => `${n.title} ${n.plain} ${n.tags.join(" ")}`;
      const found = store
        .filter((n) => n.deletedAt === null)
        .filter((n) => {
          const haystack = fold(text(n)).split(/[^\p{L}\p{N}]+/u);
          return words.every((w) => haystack.some((h) => h.startsWith(w)));
        });
      // Orthographe exacte d'abord quand la saisie porte des accents (comme le cœur).
      const exact = (n: Stored) => hasAccents(query) && containsExactly(text(n), query.trim());
      return [...found.filter(exact), ...found.filter((n) => !exact(n))].map((n) => n.id);
    },
    versions: async (id) => {
      find(id);
      return versions
        .filter((v) => v.noteId === id)
        .sort((a, b) => b.savedAt - a.savedAt || b.id - a.id)
        .map((v) => ({ id: v.id, title: v.title, excerpt: excerptOf(v.plain), savedAt: v.savedAt }));
    },
    version: async (id, version) => {
      const v = versions.find((x) => x.id === version && x.noteId === id);
      if (!v) throw { code: "notFound" } satisfies DataError;
      return { id: v.id, title: v.title, content: v.content, savedAt: v.savedAt };
    },
    restoreVersion: async (id, version) => {
      const n = find(id);
      const v = versions.find((x) => x.id === version && x.noteId === id);
      if (!v) throw { code: "notFound" } satisfies DataError;
      snapshot(n, true);
      Object.assign(n, { title: v.title, content: v.content, plain: v.plain, excerpt: excerptOf(v.plain), updatedAt: now() });
      return noteOf(n);
    },
    notebooks: async () => notebooks.filter((n) => n.deletedAt === null).map(({ deletedAt: _d, ...n }) => n),
    folders: async () => folders,
    createFolder: async (input) => {
      const f = { ...input, name: input.name.trim(), id: nextId("d"), position: folders.length };
      folders = [...folders, f];
      return f;
    },
    updateFolder: async (id, input) => {
      const f = { ...folders.find((x) => x.id === id)!, ...input, name: input.name.trim() };
      folders = folders.map((x) => (x.id === id ? f : x));
      return f;
    },
    reorderFolders: async (ids) => {
      folders = folders.map((x) => (ids.includes(x.id) ? { ...x, position: ids.indexOf(x.id) } : x)).sort((a, b) => a.position - b.position);
    },
    removeFolder: async (id) => {
      folders = folders.filter((f) => f.id !== id);
      for (const n of notebooks) if (n.folderId === id) n.folderId = null;
    },
    createNotebook: async (input) => {
      const name = input.name.split(/\s+/).filter(Boolean).join(" ");
      if (!name) throw { code: "invalid", field: "name" } satisfies DataError;
      const duplicate = notebooks.some((n) => n.deletedAt === null && n.parentId === input.parentId && n.name.toLowerCase() === name.toLowerCase());
      if (duplicate) throw { code: "duplicate", field: "name" } satisfies DataError;
      const n = { id: nextId("c"), name, parentId: input.parentId, color: input.color, icon: input.icon, folderId: input.parentId ? null : (input.folderId ?? null), createdAt: now(), deletedAt: null };
      notebooks.push(n);
      const { deletedAt: _d, ...rest } = n;
      return rest;
    },
    updateNotebook: async (id, input) => {
      const n = notebooks.find((x) => x.id === id && x.deletedAt === null);
      if (!n) throw { code: "notFound" } satisfies DataError;
      Object.assign(n, { name: input.name.trim(), parentId: input.parentId, color: input.color, icon: input.icon, folderId: input.parentId ? null : (input.folderId ?? null) });
      const { deletedAt: _d, ...rest } = n;
      return rest;
    },
    removeNotebook: async (id) => {
      const at = now();
      const ids = new Set([id]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const n of notebooks) {
          if (n.parentId && ids.has(n.parentId) && !ids.has(n.id) && n.deletedAt === null) {
            ids.add(n.id);
            grew = true;
          }
        }
      }
      notebooks = notebooks.map((n) => (ids.has(n.id) ? { ...n, deletedAt: at } : n));
      for (const note of store) if (note.deletedAt === null && note.notebookId && ids.has(note.notebookId)) note.deletedAt = at;
      deletedNotebooks.set(id, at);
    },
    restoreNotebook: async (id) => {
      const at = deletedNotebooks.get(id);
      if (at === undefined) throw { code: "notFound" } satisfies DataError;
      notebooks = notebooks.map((n) => (n.deletedAt === at ? { ...n, deletedAt: null } : n));
      for (const note of store) if (note.deletedAt === at) note.deletedAt = null;
      deletedNotebooks.delete(id);
    },
    templates: async () => templates,
    createTemplate: async (name, content) => {
      const clean = name.trim();
      if (templates.some((x) => x.name.toLowerCase() === clean.toLowerCase())) throw { code: "duplicate", field: "name" } satisfies DataError;
      const template = { id: nextId("m"), name: clean, content, createdAt: now() };
      templates = [...templates, template];
      return template;
    },
    removeTemplate: async (id) => {
      templates = templates.filter((x) => x.id !== id);
    },
  };
}

/** Enregistre une note exportée (.md ou .txt) dans un fichier choisi ; chemin, ou `null` si annulé. */
export async function exportNoteFile(name: string, format: "md" | "txt", content: string): Promise<string | null> {
  if (!inTauri && import.meta.env.DEV) return `C:\\Users\\…\\Documents\\${name}.${format}`;
  try {
    return await invoke<string | null>("export_file", { name, format, content });
  } catch (e) {
    throw asDataError(e);
  }
}

export const notesApi: NotesApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
