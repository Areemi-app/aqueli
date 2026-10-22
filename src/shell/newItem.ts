/**
 * Ctrl+N : nouvel élément de l'écran affiché (note, obligation, événement), une tâche
 * ailleurs. L'écran donne son action avec `useNewItem` tant qu'il est affiché.
 */
import { useEffect, useRef } from "react";

let current: (() => void) | null = null;

export function useNewItem(run: () => void): void {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    const action = () => latest.current();
    current = action;
    return () => {
      if (current === action) current = null;
    };
  }, []);
}

/** Lance l'action de l'écran affiché ; faux s'il n'en a pas. */
export function runNewItem(): boolean {
  if (!current) return false;
  current();
  return true;
}
