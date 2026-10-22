/** Espaces enregistrés dans la base chiffrée (commandes du cœur, src-tauri/src/data/spaces.rs). */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../lib/windowControls";
import { tr } from "../i18n/i18n";
import { asDataError, type DataError } from "../lib/dataError";
import type { Space } from "./spaces";

export { dataErrorMessage, type DataError } from "../lib/dataError";

export interface SpacesApi {
  list(): Promise<Space[]>;
  create(name: string, color: string, icon: string): Promise<Space>;
  update(id: string, name: string, color: string, icon: string): Promise<Space>;
  remove(id: string): Promise<void>;
  restore(space: Space): Promise<Space>;
  reorder(ids: string[]): Promise<Space[]>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: SpacesApi = {
  list: () => call("spaces_list"),
  create: (name, color, icon) => call("spaces_create", { name, color, icon }),
  update: (id, name, color, icon) => call("spaces_update", { id, name, color, icon }),
  remove: (id) => call("spaces_delete", { id }),
  restore: (space) => call("spaces_restore", { space }),
  reorder: (ids) => call("spaces_reorder", { ids }),
};

/** Espaces en mémoire pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): SpacesApi {
  let spaces: Space[] = [
    { id: "perso", name: tr("Perso"), color: "#0a9fd8", icon: "maison", position: 0 },
    { id: "travail", name: tr("Travail"), color: "#7a5ce6", icon: "valise", position: 1 },
    { id: "sante", name: tr("Santé"), color: "#e0508a", icon: "coeur", position: 2 },
    { id: "famille", name: tr("Famille"), color: "#e89a1c", icon: "famille", position: 3 },
  ];
  const sorted = () => [...spaces].sort((a, b) => a.position - b.position);
  const clean = (name: string) => name.split(/\s+/).filter(Boolean).join(" ");
  const check = (name: string, exceptId?: string) => {
    const n = clean(name);
    if (n.length === 0 || n.length > 40) throw { code: "invalid", field: "name" } satisfies DataError;
    if (spaces.some((s) => s.id !== exceptId && s.name.toLowerCase() === n.toLowerCase()))
      throw { code: "duplicate", field: "name" } satisfies DataError;
    return n;
  };
  return {
    list: async () => sorted(),
    create: async (name, color, icon) => {
      const space = {
        id: Math.random().toString(16).slice(2, 18),
        name: check(name),
        color,
        icon,
        position: Math.max(-1, ...spaces.map((s) => s.position)) + 1,
      } as Space;
      spaces.push(space);
      return space;
    },
    update: async (id, name, color, icon) => {
      const n = check(name, id);
      spaces = spaces.map((s) => (s.id === id ? ({ ...s, name: n, color, icon } as Space) : s));
      return spaces.find((s) => s.id === id)!;
    },
    remove: async (id) => {
      if (spaces.length <= 1) throw { code: "lastSpace" } satisfies DataError;
      spaces = spaces.filter((s) => s.id !== id);
    },
    restore: async (space) => {
      spaces.push(space);
      return space;
    },
    reorder: async (ids) => {
      spaces = spaces.map((s) => ({ ...s, position: ids.indexOf(s.id) }));
      return sorted();
    },
  };
}

export const spacesApi: SpacesApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
