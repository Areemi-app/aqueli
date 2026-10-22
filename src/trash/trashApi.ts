/** Corbeille (src-tauri/src/data/trash.rs) : éléments supprimés depuis moins de 30 jours. */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { inTauri } from "../lib/windowControls";
import { tr } from "../i18n/i18n";

export type TrashKind = "task" | "event" | "obligation" | "note" | "notebook" | "journal" | "habit" | "project" | "contact" | "document" | "list" | "goal" | "transaction";

export interface TrashItem {
  kind: TrashKind;
  id: string;
  /** Titre ; jour « AAAA-MM-JJ » pour une page du journal. */
  title: string;
  /** Secondes Unix. */
  deletedAt: number;
  /** Notes supprimées avec un carnet. */
  count: number;
}

export interface TrashApi {
  list(): Promise<TrashItem[]>;
  restore(kind: TrashKind, id: string): Promise<void>;
  purge(kind: TrashKind, id: string): Promise<void>;
  /** Nombre d'éléments supprimés. */
  empty(): Promise<number>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: TrashApi = {
  list: () => call("trash_list"),
  restore: (kind, id) => call("trash_restore", { kind, id }),
  purge: (kind, id) => call("trash_purge", { kind, id }),
  empty: () => call("trash_empty"),
};

/** Corbeille d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function previewApi(): TrashApi {
  const now = Math.floor(Date.now() / 1000);
  const day = 86_400;
  let items: TrashItem[] = [
    { kind: "task", id: "c1", title: tr("Rappeler la mutuelle"), deletedAt: now - 3600, count: 0 },
    { kind: "note", id: "c2", title: tr("Idées de vacances"), deletedAt: now - 2 * day, count: 0 },
    { kind: "notebook", id: "c3", title: tr("Anciens projets"), deletedAt: now - 5 * day, count: 4 },
    { kind: "event", id: "c4", title: tr("Cours de piano"), deletedAt: now - 9 * day, count: 0 },
    { kind: "journal", id: "2026-09-12", title: "2026-09-12", deletedAt: now - 12 * day, count: 0 },
    { kind: "obligation", id: "c5", title: tr("Ancienne assurance auto"), deletedAt: now - 27 * day, count: 0 },
  ];
  const drop = (kind: TrashKind, id: string) => {
    items = items.filter((i) => !(i.kind === kind && i.id === id));
  };
  return {
    list: async () => items,
    restore: async (kind, id) => drop(kind, id),
    purge: async (kind, id) => drop(kind, id),
    empty: async () => {
      const n = items.length;
      items = [];
      return n;
    },
  };
}

export const trashApi: TrashApi = inTauri || !import.meta.env.DEV ? tauriApi : previewApi();

/** Durée de conservation dans la corbeille. */
export const TRASH_DAYS = 30;

/** Jours restants avant la suppression définitive (au moins 1). */
export function daysLeft(deletedAt: number, now: number): number {
  return Math.max(1, TRASH_DAYS - Math.floor((now - deletedAt) / 86_400));
}
