/**
 * Texte coupé par « … » faute de place : son contenu entier s'affiche au survol, dans une
 * infobulle. Une infobulle déjà écrite par l'interface est gardée telle quelle.
 */
export function installTruncationTitles(): () => void {
  const onOver = (e: PointerEvent) => {
    let el = e.target instanceof HTMLElement ? e.target : null;
    for (let depth = 0; el && depth < 3; depth++, el = el.parentElement) {
      const auto = el.dataset.autoTitle === "";
      if (el.hasAttribute("title") && !auto) return;
      const style = getComputedStyle(el);
      if (style.textOverflow !== "ellipsis" && style.webkitLineClamp === "none") continue;
      const cut = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      const text = el.textContent?.trim() ?? "";
      if (cut && text) {
        el.title = text;
        el.dataset.autoTitle = "";
      } else if (auto) {
        el.removeAttribute("title");
        delete el.dataset.autoTitle;
      }
      return;
    }
  };
  document.addEventListener("pointerover", onOver);
  return () => document.removeEventListener("pointerover", onOver);
}
