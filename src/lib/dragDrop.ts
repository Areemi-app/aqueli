/**
 * Glisser-déposer des éléments de liste, commun à tous les modules : une note vers un carnet,
 * une tâche vers « Aujourd'hui », un document vers un dossier, une habitude remise en ordre…
 *
 * Les cibles se déclarent dans le HTML (`dropTarget`) : `data-drop` (clé de la cible) et
 * `data-accepts` (sortes d'éléments reçues, séparées par des espaces). Les listes qui se
 * remettent en ordre portent `data-sort` (groupe) et chacun de leurs éléments `data-sort-id` ;
 * `data-sort-axis="x"` pour des éléments en ligne ou en grille (pastilles, cartes).
 * Pendant le déplacement, une étiquette suit le pointeur, les cibles possibles se signalent
 * (`data-drop-ready`), celle qui est survolée s'éclaire (`data-drop-over`) et un trait montre
 * la place d'insertion. Échap annule. Le clic droit de chaque élément reste l'équivalent au clavier.
 */
import { trackDrag } from "./pointerDrag";

export interface DragItem {
  /** Sorte d'élément : « note », « carnet », « tache »… */
  kind: string;
  ids: readonly string[];
  /** Texte de l'étiquette qui suit le pointeur : « Courses », « 3 notes ». */
  label: string;
  /** Pastille de couleur de l'élément, s'il en a une. */
  color?: string | null;
}

export interface DragOptions {
  /** La cible `key` reçoit-elle ces éléments ? (un carnet ne va pas dans lui-même…) */
  canDrop?: (key: string) => boolean;
  /** Dépôt sur une cible `data-drop`. */
  onDrop?: (key: string) => void;
  /**
   * Remise en ordre dans les listes `data-sort` de ce groupe : nouvel ordre des identifiants de
   * la liste d'arrivée, et sa valeur `data-sort-into` (section d'une liste, colonne…).
   */
  sort?: { group: string; onSort: (ids: string[], into: string | null) => void };
}

/** Attributs d'une cible de dépôt : `{...dropTarget("carnet:12", "note carnet")}`. */
export function dropTarget(key: string, accepts: string): { "data-drop": string; "data-accepts": string } {
  return { "data-drop": key, "data-accepts": accepts };
}

/** Nouvel ordre : les éléments `moved` retirés, puis replacés avant `before` (ou à la fin). */
export function reorderIds(order: readonly string[], moved: readonly string[], before: string | null): string[] {
  const out = order.filter((id) => !moved.includes(id));
  const at = before === null ? -1 : out.indexOf(before);
  out.splice(at < 0 ? out.length : at, 0, ...moved);
  return out;
}

/**
 * Ordre complet après la remise en ordre d'une partie des éléments (ceux qu'une vue filtrée
 * montre) : les autres gardent leur place, ceux de la partie prennent les leurs dans l'ordre nouveau.
 */
export function mergeOrder(all: readonly string[], part: readonly string[]): string[] {
  const inPart = new Set(part);
  let i = 0;
  return all.map((id) => (inPart.has(id) ? part[i++]! : id));
}

/** Ordre après avoir déplacé l'élément `index` d'un cran (« Monter », « Descendre » du clic droit). */
export function moved(order: readonly string[], index: number, by: -1 | 1): string[] {
  const out = [...order];
  const to = index + by;
  if (index < 0 || to < 0 || to >= out.length) return out;
  [out[index], out[to]] = [out[to]!, out[index]!];
  return out;
}

/** « 3 notes » ou le titre de l'élément seul. */
export function dragLabel(count: number, title: string, plural: string): string {
  return count > 1 ? `${count} ${plural}` : title;
}

const accepts = (el: HTMLElement, kind: string) => (el.dataset.accepts ?? "").split(" ").includes(kind);

/** Ne commence pas un déplacement depuis un champ de saisie ou une zone marquée `data-no-drag`. */
function startsInField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable='true'], [data-no-drag]") !== null;
}

/** Premier ancêtre qui défile, pour le faire défiler près de ses bords. */
function scrollerAt(el: Element | null): HTMLElement | null {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue;
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

/**
 * Commence le suivi d'un déplacement à l'appui du pointeur sur un élément (`onPointerDown`).
 * Le déplacement ne démarre qu'après quelques pixels : un simple clic reste un clic.
 */
export function startDrag(event: { button: number; clientX: number; clientY: number; target: EventTarget | null; currentTarget: EventTarget | null }, item: DragItem, options: DragOptions): void {
  if (event.button !== 0 || startsInField(event.target) || item.ids.length === 0) return;
  const source = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const root = document.documentElement;
  let ghost: HTMLDivElement | null = null;
  let line: HTMLDivElement | null = null;
  let over: HTMLElement | null = null;
  let drop: { key: string } | { ids: string[]; into: string | null } | null = null;
  let ready: HTMLElement[] = [];

  const allowed = (el: HTMLElement) => accepts(el, item.kind) && (options.canDrop?.(el.dataset.drop ?? "") ?? true);

  const highlight = (el: HTMLElement | null) => {
    if (over === el) return;
    over?.removeAttribute("data-drop-over");
    over = el;
    over?.setAttribute("data-drop-over", "");
  };

  const showLine = (rect: DOMRect | null, after: boolean, across = false) => {
    if (!line) return;
    if (!rect) {
      line.hidden = true;
      return;
    }
    line.hidden = false;
    if (across) {
      // Éléments en ligne : trait vertical avant ou après l'élément visé.
      line.style.left = `${(after ? rect.right : rect.left) - 1.5}px`;
      line.style.top = `${rect.top + 2}px`;
      line.style.width = "3px";
      line.style.height = `${Math.max(0, rect.height - 4)}px`;
    } else {
      line.style.left = `${rect.left + 4}px`;
      line.style.top = `${(after ? rect.bottom : rect.top) - 1.5}px`;
      line.style.width = `${Math.max(0, rect.width - 8)}px`;
      line.style.height = "3px";
    }
  };

  /** Place d'insertion dans une liste du même groupe, sous le pointeur. */
  const sortAt = (hit: Element | null, x: number, y: number) => {
    const sort = options.sort;
    if (!sort || !hit) return null;
    const list = hit.closest<HTMLElement>("[data-sort]");
    if (!list || list.dataset.sort !== sort.group) return null;
    const rows = [...list.querySelectorAll<HTMLElement>("[data-sort-id]")].filter((r) => r.closest("[data-sort]") === list);
    const order = rows.map((r) => r.dataset.sortId!);
    const row = hit.closest<HTMLElement>("[data-sort-id]");
    const across = list.dataset.sortAxis === "x";
    let before: string | null = null;
    let rect: DOMRect | null = null;
    let after = false;
    if (row && row.closest("[data-sort]") === list) {
      rect = row.getBoundingClientRect();
      after = across ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2;
      const i = order.indexOf(row.dataset.sortId!);
      before = after ? (order[i + 1] ?? null) : order[i]!;
    } else if (rows.length > 0) {
      // Sous la dernière ligne (ou dans une liste vide) : à la fin.
      rect = rows[rows.length - 1]!.getBoundingClientRect();
      after = true;
    } else {
      rect = list.getBoundingClientRect();
      rect = new DOMRect(rect.left, rect.top + 6, rect.width, 0);
    }
    const ids = reorderIds(order, item.ids, before);
    const into = list.dataset.sortInto ?? null;
    const unchanged = ids.join() === order.join() && into === (source?.closest<HTMLElement>("[data-sort]")?.dataset.sortInto ?? null);
    return { ids, into, rect, after, across, unchanged };
  };

  trackDrag(event, {
    onStart: () => {
      root.dataset.dragKind = item.kind;
      source?.setAttribute("data-drag-source", "");
      ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.setAttribute("aria-hidden", "true");
      if (item.color) {
        const dot = document.createElement("span");
        dot.className = "drag-ghost-dot";
        dot.style.setProperty("--ghost-color", item.color);
        ghost.append(dot);
      }
      const text = document.createElement("span");
      text.className = "drag-ghost-text";
      text.textContent = item.label;
      ghost.append(text);
      document.body.append(ghost);
      if (options.sort) {
        line = document.createElement("div");
        line.className = "drag-insert";
        line.hidden = true;
        document.body.append(line);
      }
      ready = [...document.querySelectorAll<HTMLElement>("[data-accepts]")].filter(allowed);
      for (const el of ready) el.setAttribute("data-drop-ready", "");
    },
    onMove: (x, y) => {
      if (ghost) {
        ghost.style.left = `${x}px`;
        ghost.style.top = `${y}px`;
      }
      const hit = document.elementFromPoint(x, y);
      const sorted = sortAt(hit, x, y);
      if (sorted) {
        highlight(null);
        showLine(sorted.unchanged ? null : sorted.rect, sorted.after, sorted.across);
        drop = sorted.unchanged ? null : { ids: sorted.ids, into: sorted.into };
      } else {
        showLine(null, false);
        let target = hit?.closest<HTMLElement>("[data-drop]") ?? null;
        while (target && !allowed(target)) target = target.parentElement?.closest<HTMLElement>("[data-drop]") ?? null;
        highlight(target);
        drop = target ? { key: target.dataset.drop! } : null;
      }
      const scroller = scrollerAt(hit);
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        if (y < rect.top + 36) scroller.scrollTop -= 12;
        else if (y > rect.bottom - 36) scroller.scrollTop += 12;
      }
    },
    onEnd: (_x, _y, cancelled) => {
      ghost?.remove();
      line?.remove();
      highlight(null);
      for (const el of ready) el.removeAttribute("data-drop-ready");
      source?.removeAttribute("data-drag-source");
      delete root.dataset.dragKind;
      if (cancelled || !drop) return;
      if ("key" in drop) options.onDrop?.(drop.key);
      else options.sort?.onSort(drop.ids, drop.into);
    },
  });
}
