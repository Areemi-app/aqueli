/**
 * Notes (cahier des charges § 4.5) : types partagés avec le cœur (src-tauri/src/data/notes.rs)
 * et fonctions pures (arbre des carnets, filtres, liens entre notes, dates).
 */
import { containsExactly, fold, hasAccents } from "../lib/fold";
import { locale, tr } from "../i18n/i18n";

/** Document de l'éditeur (format JSON de TipTap). */
export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export const EMPTY_DOC: DocNode = { type: "doc", content: [{ type: "paragraph" }] };

export interface Notebook {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  /** Symbole (src/components/symbols.ts) ; celui des carnets s'il est absent. */
  icon: string | null;
  /** Dossier où le carnet est rangé (carnets de premier niveau seulement). */
  folderId: string | null;
  createdAt: number;
}

export interface NotebookInput {
  name: string;
  parentId: string | null;
  color: string | null;
  icon: string | null;
  folderId?: string | null;
}

/** Dossier où ranger des carnets. */
export interface NoteFolder {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  position: number;
}

export type NoteFolderInput = Pick<NoteFolder, "name" | "color" | "icon">;

/** Note sans son contenu (liste, recherche, rétroliens). */
export interface NoteSummary {
  id: string;
  title: string;
  excerpt: string;
  notebookId: string | null;
  spaceId: string | null;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  color: string | null;
  /** Rangée hors de vue (archive) ; toujours cherchable. */
  archived: boolean;
  /** Notes citées par celle-ci. */
  links: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Note extends NoteSummary {
  /** Document de l'éditeur, en JSON. */
  content: string;
}

/** Texte d'une note, envoyé par l'éditeur. */
export interface NoteBody {
  title: string;
  content: string;
  plain: string;
  links: string[];
}

/** Rangement d'une note. */
export interface NoteMeta {
  notebookId: string | null;
  spaceId: string | null;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  color: string | null;
  archived: boolean;
}

export interface NoteVersion {
  id: number;
  title: string;
  excerpt: string;
  savedAt: number;
}

export interface NoteVersionContent {
  id: number;
  title: string;
  content: string;
  savedAt: number;
}

export interface NoteTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

/** Carnets 3 niveaux au plus (carnet, sous-carnet, et un de plus). */
export const MAX_NOTEBOOK_DEPTH = 3;

export const metaOf = (n: NoteSummary): NoteMeta => ({
  notebookId: n.notebookId,
  spaceId: n.spaceId,
  tags: n.tags,
  pinned: n.pinned,
  favorite: n.favorite,
  color: n.color,
  archived: n.archived,
});

export const noteTitle = (n: { title: string }): string => n.title.trim() || tr("Sans titre");


const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" });

export interface NotebookRow {
  notebook: Notebook;
  /** 0 pour un carnet, 1 pour un sous-carnet… */
  depth: number;
  hasChildren: boolean;
}

/** Carnets dans l'ordre d'affichage : chacun suivi de ses sous-carnets, par ordre alphabétique. */
export function notebookTree(notebooks: readonly Notebook[]): NotebookRow[] {
  const known = new Set(notebooks.map((n) => n.id));
  const childrenOf = (parent: string | null) =>
    notebooks.filter((n) => (parent === null ? n.parentId === null || !known.has(n.parentId) : n.parentId === parent)).sort(byName);
  const rows: NotebookRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const notebook of childrenOf(parent)) {
      const children = childrenOf(notebook.id);
      rows.push({ notebook, depth, hasChildren: children.length > 0 });
      if (depth < MAX_NOTEBOOK_DEPTH) walk(notebook.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Chemin d'un carnet : « Travail › Projets ». */
export function notebookPath(id: string, notebooks: readonly Notebook[]): string {
  const names: string[] = [];
  let current = notebooks.find((n) => n.id === id);
  while (current && names.length <= MAX_NOTEBOOK_DEPTH) {
    names.unshift(current.name);
    const parent = current.parentId;
    current = parent ? notebooks.find((n) => n.id === parent) : undefined;
  }
  return names.join(" › ");
}

/** Le carnet et tous ses sous-carnets. */
export function subtreeIds(id: string, notebooks: readonly Notebook[]): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of notebooks) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Niveau d'un carnet (1 pour un carnet) et hauteur de son arbre (1 sans sous-carnet). */
export function depthOf(id: string, notebooks: readonly Notebook[]): number {
  return notebookPath(id, notebooks).split(" › ").length;
}

export function heightOf(id: string, notebooks: readonly Notebook[]): number {
  const children = notebooks.filter((n) => n.parentId === id);
  return 1 + Math.max(0, ...children.map((c) => heightOf(c.id, notebooks)));
}

/**
 * Le carnet `id` peut-il devenir un sous-carnet de `parentId` (glisser-déposer, « Déplacer ») ?
 * Ni dans lui-même, ni dans un de ses sous-carnets, ni au-delà des niveaux permis.
 */
export function canNestNotebook(id: string, parentId: string, notebooks: readonly Notebook[]): boolean {
  if (subtreeIds(id, notebooks).has(parentId)) return false;
  if (notebooks.find((n) => n.id === id)?.parentId === parentId) return false;
  return depthOf(parentId, notebooks) + heightOf(id, notebooks) <= MAX_NOTEBOOK_DEPTH;
}

export type NoteFilter =
  | { kind: "toutes" }
  | { kind: "favoris" }
  | { kind: "sans-carnet" }
  | { kind: "archives" }
  | { kind: "carnet"; id: string }
  | { kind: "dossier"; id: string }
  | { kind: "etiquette"; tag: string };

export function sameFilter(a: NoteFilter, b: NoteFilter): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Les notes d'un filtre ; un carnet montre aussi celles de ses sous-carnets. Les notes
 * archivées ne figurent que dans « Archives ». */
export function filterNotes<T extends NoteSummary>(all: readonly T[], filter: NoteFilter, notebooks: readonly Notebook[]): T[] {
  if (filter.kind === "archives") return all.filter((n) => n.archived);
  const notes = all.filter((n) => !n.archived);
  switch (filter.kind) {
    case "toutes":
      return [...notes];
    case "favoris":
      return notes.filter((n) => n.favorite);
    case "sans-carnet":
      return notes.filter((n) => n.notebookId === null || !notebooks.some((b) => b.id === n.notebookId));
    case "carnet": {
      const ids = subtreeIds(filter.id, notebooks);
      return notes.filter((n) => n.notebookId !== null && ids.has(n.notebookId));
    }
    case "dossier": {
      const ids = new Set<string>();
      for (const b of notebooks) if (b.parentId === null && b.folderId === filter.id) for (const id of subtreeIds(b.id, notebooks)) ids.add(id);
      return notes.filter((n) => n.notebookId !== null && ids.has(n.notebookId));
    }
    case "etiquette": {
      const tag = filter.tag.toLowerCase();
      return notes.filter((n) => n.tags.some((t) => t.toLowerCase() === tag || t.toLowerCase().startsWith(`${tag}/`)));
    }
  }
}

/** Épinglées d'abord, puis les plus récemment modifiées. */
export type NoteSort = "modifiee" | "creee" | "titre";

export const NOTE_SORTS: readonly { value: NoteSort; label: string }[] = [
  { value: "modifiee", label: tr("Dernière modification") },
  { value: "creee", label: tr("Date de création") },
  { value: "titre", label: tr("Titre (de A à Z)") },
];

export const isNoteSort = (v: unknown): v is NoteSort => NOTE_SORTS.some((s) => s.value === v);

const titleOrder = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Notes épinglées d'abord, puis selon le tri choisi (la plus récemment modifiée par défaut). */
export function sortNotes<T extends NoteSummary>(notes: readonly T[], by: NoteSort = "modifiee"): T[] {
  const compare: Record<NoteSort, (a: T, b: T) => number> = {
    modifiee: (a, b) => b.updatedAt - a.updatedAt,
    creee: (a, b) => b.createdAt - a.createdAt,
    titre: (a, b) => titleOrder.compare(a.title.trim() || "\uffff", b.title.trim() || "\uffff"),
  };
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || compare[by](a, b) || a.id.localeCompare(b.id));
}

/** Étiquettes utilisées, avec leur nombre de notes, par ordre alphabétique. */
export function tagCounts(notes: readonly NoteSummary[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = tag.toLowerCase();
      const entry = counts.get(key) ?? { tag, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag, "fr", { sensitivity: "base" }));
}

/** Nom du nœud « lien vers une note » dans l'éditeur. */
export const NOTE_LINK = "noteLink";
/** Contact cité par « @Léa » dans une note (relié à la note). */
export const CONTACT_MENTION = "contactMention";

/** Notes citées par un document (liens « [[ »), sans doublon. */
export function linksIn(doc: DocNode): string[] {
  const ids: string[] = [];
  const walk = (node: DocNode) => {
    if (node.type === NOTE_LINK && typeof node.attrs?.id === "string" && !ids.includes(node.attrs.id)) ids.push(node.attrs.id);
    node.content?.forEach(walk);
  };
  walk(doc);
  return ids;
}

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem", "tableRow", "horizontalRule"]);

/** Texte brut d'un document (recherche, aperçu) : un bloc par ligne. */
export function plainOf(doc: DocNode): string {
  const parts: string[] = [];
  const walk = (node: DocNode) => {
    if (node.text !== undefined) parts.push(node.text);
    else if (node.type === NOTE_LINK) parts.push(String(node.attrs?.label ?? ""));
    else if (node.type === CONTACT_MENTION) parts.push(`@${String(node.attrs?.label ?? "")}`);
    else if (node.type === "tableCell" || node.type === "tableHeader") parts.push(" ");
    node.content?.forEach(walk);
    if (BLOCKS.has(node.type)) parts.push("\n");
  };
  walk(doc);
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Notes qui citent `id` (rétroliens). */
export function backlinks<T extends NoteSummary>(id: string, notes: readonly T[]): T[] {
  return sortNotes(notes.filter((n) => n.id !== id && n.links.includes(id)));
}

/** Notes dont le titre contient `query` (suggestions « [[ »). */
/** Notes dont le titre contient `query` (suggestions « [[ ») : sans tenir compte des accents,
 * mais l'orthographe exacte d'abord si la saisie en porte, puis les titres qui commencent
 * par la saisie, puis les plus récentes. */
export function titleMatches<T extends NoteSummary>(query: string, notes: readonly T[], limit = 8): T[] {
  const raw = query.trim();
  const q = fold(raw);
  const accented = hasAccents(raw);
  const scored = notes
    .map((n) => ({ n, at: fold(noteTitle(n)).indexOf(q), exact: accented && containsExactly(noteTitle(n), raw) }))
    .filter((x) => x.at >= 0)
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) || Number(a.at !== 0) - Number(b.at !== 0) || b.n.updatedAt - a.n.updatedAt,
    );
  return scored.slice(0, limit).map((x) => x.n);
}

/** Date de modification dans la liste : l'heure aujourd'hui, « Hier », puis la date. */
export function updatedLabel(updatedAt: number, now: Date): string {
  const date = new Date(updatedAt * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) {
    return date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  }
  if (time >= startOfToday - 24 * 3600 * 1000) return tr("Hier");
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(locale(), sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** « Modifiée à 14:05 », « Modifiée hier », « Modifiée le 12 sept. ». */
export function modifiedLabel(updatedAt: number, now: Date): string {
  const label = updatedLabel(updatedAt, now);
  if (label === tr("Hier")) return tr("Modifiée hier");
  return /^\d{2}:\d{2}$/.test(label) ? tr("Modifiée à {time}", { time: label }) : tr("Modifiée le {date}", { date: label });
}

/** Nombre de mots d'un texte. */
export function wordCount(plain: string): number {
  return plain.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
