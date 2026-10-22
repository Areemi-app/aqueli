/**
 * Liens entre éléments (src-tauri/src/data/links.rs) : une tâche, un événement, une obligation,
 * une note, un projet, un contact ou un document reliés à un autre, dans les deux sens.
 * Fonctions pures.
 */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { inTauri } from "../lib/windowControls";

export type LinkKind = "task" | "event" | "obligation" | "note" | "project" | "contact" | "document" | "goal";

export const LINK_KINDS: readonly LinkKind[] = ["task", "event", "obligation", "note", "project", "contact", "document", "goal"];

export interface Link {
  aKind: LinkKind;
  aId: string;
  bKind: LinkKind;
  bId: string;
}

/** Un bout d'un lien. */
export interface ItemRef {
  kind: LinkKind;
  id: string;
}

/** Les deux bouts dans l'ordre du cœur : un lien n'est rangé qu'une fois. */
export function linkOf(a: ItemRef, b: ItemRef): Link {
  const [first, second] = `${a.kind}\u0000${a.id}` <= `${b.kind}\u0000${b.id}` ? [a, b] : [b, a];
  return { aKind: first.kind, aId: first.id, bKind: second.kind, bId: second.id };
}

export const sameLink = (x: Link, y: Link) => x.aKind === y.aKind && x.aId === y.aId && x.bKind === y.bKind && x.bId === y.bId;

/** Éléments reliés à `item`, dans l'ordre des liens. */
export function linkedTo(links: readonly Link[], item: ItemRef): ItemRef[] {
  const found: ItemRef[] = [];
  for (const l of links) {
    if (l.aKind === item.kind && l.aId === item.id) found.push({ kind: l.bKind, id: l.bId });
    else if (l.bKind === item.kind && l.bId === item.id) found.push({ kind: l.aKind, id: l.aId });
  }
  return found;
}

export interface LinksApi {
  list(): Promise<Link[]>;
  add(link: Link): Promise<Link>;
  remove(link: Link): Promise<void>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: LinksApi = {
  list: () => call("links_list"),
  add: (link) => call("links_add", { link }),
  remove: (link) => call("links_remove", { link }),
};

/** Liens d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): LinksApi {
  let links: Link[] = [linkOf({ kind: "contact", id: "apercu-ct2" }, { kind: "task", id: "apercu2" })];
  return {
    list: async () => links,
    add: async (link) => {
      if (!links.some((l) => sameLink(l, link))) links = [...links, link];
      return link;
    },
    remove: async (link) => {
      links = links.filter((l) => !sameLink(l, link));
    },
  };
}

export const linksApi: LinksApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
