import { useCallback, useState } from "react";
import { readPref, writePref } from "../lib/storage";
import { sanitizeLayouts, type HomeLayouts } from "./layout";

const KEY = "accueil";
const anyValue = (_value: unknown): _value is unknown => true;

/** Mises en page de l'Accueil, enregistrées dans les préférences. */
export function useHomeLayouts(): [HomeLayouts, (next: HomeLayouts) => void] {
  const [layouts, setLayouts] = useState(() => sanitizeLayouts(readPref<unknown>(KEY, null, anyValue)));
  const change = useCallback((next: HomeLayouts) => {
    setLayouts(next);
    writePref(KEY, next);
  }, []);
  return [layouts, change];
}
