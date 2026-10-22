import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { recordUndo } from "../app/undo";
import { readPref, writePref } from "../lib/storage";
import { spacesApi } from "./api";
import { isSpaceFilter, moveSpace, type Space, type SpaceFilter } from "./spaces";
import { tr } from "../i18n/i18n";

interface SpacesContextValue {
  spaces: readonly Space[];
  /** Vrai une fois la liste lue dans la base. */
  loaded: boolean;
  filter: SpaceFilter;
  setFilter: (filter: SpaceFilter) => void;
  createSpace: (name: string, color: string, icon: string) => Promise<Space>;
  updateSpace: (id: string, name: string, color: string, icon: string) => Promise<Space>;
  /** Supprime l'espace et renvoie de quoi le restaurer (bouton « Annuler »). */
  deleteSpace: (id: string) => Promise<Space>;
  restoreSpace: (space: Space) => Promise<void>;
  moveSpace: (id: string, direction: -1 | 1) => Promise<void>;
  /** Nouvel ordre des espaces (glisser-déposer), avec Ctrl+Z. */
  reorderSpaces: (ids: string[]) => Promise<void>;
}

const SpacesContext = createContext<SpacesContextValue | null>(null);

/** Espaces lus dans la base chiffrée ; le filtre choisi est retenu d'une ouverture à l'autre. */
export function SpacesProvider({ children }: { children: ReactNode }) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilterState] = useState<SpaceFilter>(() => readPref("espace", "tous", isSpaceFilter));

  const reload = useCallback(async () => {
    const list = await spacesApi.list();
    setSpaces(list);
    setLoaded(true);
    return list;
  }, []);

  useEffect(() => {
    reload().catch(() => setLoaded(true));
  }, [reload]);

  // Un espace supprimé ne peut pas rester sélectionné.
  useEffect(() => {
    if (loaded && filter !== "tous" && !spaces.some((s) => s.id === filter)) {
      setFilterState("tous");
      writePref("espace", "tous");
    }
  }, [loaded, spaces, filter]);

  const setFilter = useCallback((f: SpaceFilter) => {
    setFilterState(f);
    writePref("espace", f);
  }, []);

  const value = useMemo<SpacesContextValue>(() => {
    const deleteSpace = async (id: string) => {
      const removed = spaces.find((s) => s.id === id);
      if (!removed) throw { code: "notFound" };
      await spacesApi.remove(id);
      await reload();
      return removed;
    };
    const updateSpace = async (id: string, name: string, color: string, icon: string) => {
      const before = spaces.find((s) => s.id === id);
      const space = await spacesApi.update(id, name, color, icon);
      await reload();
      if (before) recordUndo(tr("modification de l'espace"), () => updateSpace(id, before.name, before.color, before.icon));
      return space;
    };
    const move = async (id: string, direction: -1 | 1) => {
      const order = moveSpace(
        spaces.map((s) => s.id),
        id,
        direction,
      );
      setSpaces(await spacesApi.reorder(order));
      recordUndo(tr("déplacement de l'espace"), () => spacesApi.reorder(spaces.map((s) => s.id)).then(setSpaces));
    };
    return {
      spaces,
      loaded,
      filter,
      setFilter,
      createSpace: async (name, color, icon) => {
        const space = await spacesApi.create(name, color, icon);
        await reload();
        recordUndo(tr("ajout de l'espace"), () => deleteSpace(space.id));
        return space;
      },
      updateSpace,
      deleteSpace,
      restoreSpace: async (space) => {
        await spacesApi.restore(space);
        await reload();
      },
      moveSpace: move,
      reorderSpaces: async (ids) => {
        const before = spaces.map((s) => s.id);
        if (ids.join() === before.join()) return;
        setSpaces(await spacesApi.reorder(ids));
        recordUndo(tr("déplacement de l'espace"), () => spacesApi.reorder(before).then(setSpaces));
      },
    };
  }, [spaces, loaded, filter, setFilter, reload]);

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}

export function useSpaces(): SpacesContextValue {
  const ctx = useContext(SpacesContext);
  if (!ctx) throw new Error("useSpaces doit être utilisé dans SpacesProvider");
  return ctx;
}
