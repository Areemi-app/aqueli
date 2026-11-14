/**
 * Interface de droite à gauche dans WebKit (Linux) : un texte de gauche à droite coupé par « … »
 * (titre anglais d'une tâche en arabe, par exemple) l'était des deux côtés, car WebKit place les
 * points d'après le sens de la page, et non d'après celui du texte (`unicode-bidi: plaintext`).
 * `dir="auto"` donne à l'élément le sens de sa première lettre : les points vont à la fin du
 * texte. Chromium (Windows) place déjà les points correctement : rien n'y change.
 */
import { isRtl } from "../i18n/i18n";

/** Éléments coupés par « … », dans `root` et ses descendants, sans sens choisi. */
function mark(root: Element) {
  const all = [root, ...root.querySelectorAll("*")];
  for (const el of all) {
    if (!el.hasAttribute("dir") && getComputedStyle(el).textOverflow === "ellipsis") el.setAttribute("dir", "auto");
  }
}

export function needsEllipsisDirection(rtl: boolean, userAgent: string): boolean {
  return rtl && /AppleWebKit/.test(userAgent) && !/Chrome\//.test(userAgent);
}

export function installEllipsisDirection(): () => void {
  if (!needsEllipsisDirection(isRtl(), navigator.userAgent)) return () => undefined;
  const pending = new Set<Element>();
  let frame = 0;
  const flush = () => {
    frame = 0;
    for (const el of pending) if (el.isConnected) mark(el);
    pending.clear();
  };
  const observer = new MutationObserver((records) => {
    for (const r of records) for (const node of r.addedNodes) if (node instanceof Element) pending.add(node);
    if (pending.size && !frame) frame = requestAnimationFrame(flush);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  mark(document.body);
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}
