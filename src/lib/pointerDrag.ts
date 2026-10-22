/**
 * Glisser-déposer à la souris, au stylet ou au doigt, sans bibliothèque : le déplacement
 * commence après quelques pixels (un simple clic reste un clic), Échap l'annule, et le clic
 * qui suit un déplacement est ignoré.
 */

export interface DragHandlers {
  /** Le seuil est franchi : le déplacement commence. */
  onStart?: () => void;
  onMove: (x: number, y: number) => void;
  /** Fin du déplacement ; `cancelled` après Échap ou une interruption. */
  onEnd: (x: number, y: number, cancelled: boolean) => void;
}

interface PointerStart {
  button: number;
  clientX: number;
  clientY: number;
}

const THRESHOLD = 4;

export function trackDrag(event: PointerStart, handlers: DragHandlers): void {
  if (event.button !== 0) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let x = startX;
  let y = startY;
  let started = false;
  const root = document.documentElement;

  const finish = (cancelled: boolean) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key, true);
    if (!started) return;
    root.classList.remove("is-dragging");
    // Le clic envoyé au relâchement n'ouvre ni ne coche l'élément déplacé.
    const swallow = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    handlers.onEnd(x, y, cancelled);
  };
  const move = (e: PointerEvent) => {
    x = e.clientX;
    y = e.clientY;
    if (!started) {
      if (Math.hypot(x - startX, y - startY) < THRESHOLD) return;
      started = true;
      root.classList.add("is-dragging");
      window.getSelection()?.removeAllRanges();
      handlers.onStart?.();
    }
    e.preventDefault();
    handlers.onMove(x, y);
  };
  const up = () => finish(false);
  const cancel = () => finish(true);
  const key = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !started) return;
    e.preventDefault();
    e.stopPropagation();
    finish(true);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key, true);
}

/** Fait défiler `scroller` quand le pointeur approche de son bord haut ou bas. */
export function autoScroll(scroller: HTMLElement, y: number, edge = 40, speed = 14): void {
  const rect = scroller.getBoundingClientRect();
  if (y < rect.top + edge) scroller.scrollTop -= speed;
  else if (y > rect.bottom - edge) scroller.scrollTop += speed;
}
