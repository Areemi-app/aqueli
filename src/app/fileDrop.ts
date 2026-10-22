/**
 * Fichiers glissés sur la fenêtre : importés par défaut ; un écran qui les accepte autrement
 * (Documents) les reçoit tant qu'il est affiché.
 */
import { useEffect, useRef } from "react";

export interface DropTarget {
  title: string;
  text: string;
  drop: (paths: string[]) => void;
}

let current: DropTarget | null = null;

/** Écran qui reçoit les fichiers glissés, s'il y en a un. */
export function dropTarget(): DropTarget | null {
  return current;
}

export function useDropTarget(title: string, text: string, drop: (paths: string[]) => void): void {
  const latest = useRef(drop);
  latest.current = drop;
  useEffect(() => {
    const target: DropTarget = { title, text, drop: (paths) => latest.current(paths) };
    current = target;
    return () => {
      if (current === target) current = null;
    };
  }, [title, text]);
}
