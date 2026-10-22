/**
 * Fenêtre flottante attachée à un champ (liste déroulante, calendrier, liste d'heures) : placée
 * sous le champ ou au-dessus s'il n'y a pas la place, fermée par un clic ailleurs, un défilement
 * de la page ou un changement de taille de la fenêtre.
 */
import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

interface Options {
  /** Hauteur souhaitée (la fenêtre rétrécit si la place manque). */
  height: number;
  /** Largeur minimale ; par défaut celle du champ. */
  minWidth?: number;
}

export function useAnchoredPopover(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  popover: RefObject<HTMLElement | null>,
  close: () => void,
  { height, minWidth }: Options,
): CSSProperties {
  const [place, setPlace] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < Math.min(height, 180) && above > below;
    const width = Math.max(r.width, minWidth ?? 0);
    const left = Math.min(r.left, Math.max(8, window.innerWidth - width - 8));
    setPlace({
      left,
      minWidth: width,
      maxWidth: window.innerWidth - left - 8,
      maxHeight: Math.min(height, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }, [open, anchor, height, minWidth]);

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => !!t && (anchor.current?.contains(t as Node) || popover.current?.contains(t as Node));
    const outside = (e: PointerEvent) => !inside(e.target) && close();
    const scrolled = (e: Event) => !popover.current?.contains(e.target as Node) && close();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", close);
    };
  }, [open, anchor, popover, close]);

  return place;
}
