/**
 * Menu du clic droit, propre à Aqueli : actions de l'élément visé (tâche, événement, carte,
 * module…) avec leurs raccourcis. Il s'ouvre aussi au clavier (touche Menu ou Maj+F10) ;
 * flèches pour choisir, Entrée pour valider, Échap pour fermer.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { menuKeys, onItemKeys } from "../lib/itemKeys";
import { tr } from "../i18n/i18n";

export interface MenuAction {
  label: string;
  /** Tracé d'icône (ICONS). */
  icon?: string;
  /** Raccourci affiché à droite (« Ctrl+N », « Suppr »). */
  shortcut?: string;
  /** Précision affichée à droite, qui n'est pas un raccourci (« Aujourd'hui · 14:00 »). */
  detail?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Choix parmi plusieurs (vue affichée…) : coche à droite. */
  checked?: boolean;
  /** Sous-menu (« Planifier › Aujourd'hui, Demain… ») : s'ouvre au survol, avec → ou Entrée ; `run` est alors ignoré. */
  submenu?: MenuEntry[];
  run: () => void;
}

export type MenuEntry = MenuAction | "separator";

/** Entrée qui ouvre un sous-menu ; absente du menu si le sous-menu est vide. */
export function submenuEntry(label: string, icon: string | undefined, entries: MenuEntry[]): MenuAction {
  return { label, icon, submenu: entries, run: () => {} };
}

/** Événement qui ouvre le menu : souris, ou clavier (coordonnées nulles). */
interface MenuTrigger {
  clientX: number;
  clientY: number;
  currentTarget: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
}

type OpenMenu = (e: MenuTrigger, entries: MenuEntry[]) => void;

const ContextMenuContext = createContext<OpenMenu | null>(null);

interface ScreenMenu {
  /** L'écran affiché donne ses actions ; renvoie de quoi les retirer. */
  register: (build: () => MenuEntry[]) => () => void;
  /** Actions de l'écran affiché, en tête du menu général. */
  current: () => MenuEntry[];
}

const ScreenMenuContext = createContext<ScreenMenu | null>(null);

/** Entrées de rangement (ordre, dossier, colonne) : réunies dans « Déplacer » dès qu'il y en a deux. */
function moveKind(label: string): "order" | "file" | null {
  const order = [tr("Monter"), tr("Descendre"), tr("Déplacer vers la gauche"), tr("Déplacer vers la droite"), tr("Déplacer vers l'avant"), tr("Déplacer vers l'arrière")];
  if (order.includes(label)) return "order";
  if (label === tr("Sortir du dossier") || label === tr("Retirer de sa catégorie")) return "file";
  const mark = "\u0000";
  const templates = [tr("Ranger dans « {name} »", { name: mark }), tr("Ranger dans « {s} »", { s: mark }), tr("Vers « {label} »", { label: mark })];
  return templates.some((t) => {
    const [before = "", after = ""] = t.split(mark);
    return label.length > before.length + after.length && label.startsWith(before) && label.endsWith(after);
  })
    ? "file"
    : null;
}

/**
 * Menu plus court et toujours rangé de la même façon : « Monter », « Descendre », « Ranger dans… »
 * et « Vers… » passent dans un sous-menu « Déplacer », à la place de la première d'entre elles.
 */
export function groupMoves(entries: readonly MenuEntry[]): MenuEntry[] {
  const kinds = entries.map((e) => (e === "separator" || e.submenu ? null : moveKind(e.label)));
  if (kinds.filter(Boolean).length < 2) return [...entries];
  const pick = (kind: "order" | "file") => entries.filter((_e, i) => kinds[i] === kind);
  const grouped = submenuEntry(tr("Déplacer"), ICONS.sort, [...pick("order"), "separator", ...pick("file")]);
  const first = kinds.findIndex(Boolean);
  return entries.flatMap((e, i) => (i === first ? [grouped] : kinds[i] ? [] : [e]));
}

/** Retire les séparateurs en tête, en fin et en double, et les sous-menus vides. */
export function tidyEntries(entries: readonly MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const raw of entries) {
    const entry = raw !== "separator" && raw.submenu ? { ...raw, submenu: tidyEntries(raw.submenu) } : raw;
    if (entry !== "separator" && entry.submenu?.length === 0) continue;
    if (entry === "separator" && (out.length === 0 || out[out.length - 1] === "separator")) continue;
    out.push(entry);
  }
  while (out[out.length - 1] === "separator") out.pop();
  return out;
}

interface MenuState {
  x: number;
  y: number;
  /** Bas du menu s'il s'ouvre vers le haut : le pointeur, ou le haut de l'élément qui l'a ouvert. */
  above: number;
  entries: MenuEntry[];
  restore: HTMLElement | null;
}

/** Sous-menu ouvert depuis une entrée : il se referme seul (←, Échap) et rend le focus à son entrée. */
interface ParentLink {
  close: () => void;
  /** Bord gauche de l'entrée : le sous-menu s'y ouvre à gauche s'il manque de place à droite. */
  left: number;
  /** Ouvert au clavier : son premier choix reçoit le focus. */
  focusFirst: boolean;
  /** Le pointeur entre dans le sous-menu : il reste ouvert. */
  keep: () => void;
}

function Menu({
  x,
  y,
  above,
  entries,
  onClose,
  parent,
}: MenuState & { onClose: (refocus: boolean) => void; parent?: ParentLink }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [sub, setSub] = useState<{ index: number; item: HTMLElement; focusFirst: boolean } | null>(null);
  const closeTimer = useRef(0);
  // Colonne des icônes seulement si au moins un choix en a une.
  const withIcons = entries.some((entry) => entry !== "separator" && entry.icon);

  // Le menu reste dans la fenêtre ; le premier choix reçoit le focus.
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    // Taille réelle, sans l'effet de l'animation d'ouverture.
    const r = { width: box.offsetWidth, height: box.offsetHeight };
    // Un sous-menu s'ouvre à droite de son entrée, ou à gauche s'il n'y a pas la place.
    const left = parent && x + r.width > window.innerWidth - 8 ? parent.left - r.width + 4 : x;
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - r.width - 8)),
      top: y + r.height > window.innerHeight - 8 ? Math.max(8, above - r.height) : y,
    });
    if (!parent || parent.focusFirst) box.querySelector<HTMLElement>(".ctx-item:not(:disabled)")?.focus();
  }, [x, y, above]);

  // Le menu principal se ferme si l'on clique ailleurs, quitte la fenêtre ou la redimensionne.
  useEffect(() => {
    if (parent) return;
    const onPointer = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.(".ctx-menu")) onClose(false);
    };
    const onLeave = () => onClose(false);
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("blur", onLeave);
    window.addEventListener("resize", onLeave);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("resize", onLeave);
    };
  }, [onClose, parent]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openSub = (index: number, item: HTMLElement, focusFirst: boolean) => {
    window.clearTimeout(closeTimer.current);
    setSub({ index, item, focusFirst });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(":scope > .ctx-item:not(:disabled)") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    const focused = items[index];
    if (e.key === "ArrowDown") go(index + 1);
    else if (e.key === "ArrowUp") go(index - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "ArrowRight" && focused?.dataset.sub !== undefined) openSub(Number(focused.dataset.sub), focused, true);
    else if (e.key === "ArrowLeft" && parent) parent.close();
    else if (e.key === "Escape") (parent ? parent.close() : onClose(true));
    else if (e.key === "Tab") onClose(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const subEntry = sub ? entries[sub.index] : undefined;
  const subRect = sub?.item.getBoundingClientRect();

  return (
    <div
      ref={ref}
      className="ctx-menu glass-popover"
      role="menu"
      style={position}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      onPointerEnter={parent?.keep}
    >
      {entries.map((entry, i) =>
        entry === "separator" ? (
          <div key={`sep-${i}`} className="ctx-sep" role="separator" />
        ) : (
          <button
            key={entry.label}
            type="button"
            role={entry.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={entry.checked}
            aria-haspopup={entry.submenu ? "menu" : undefined}
            aria-expanded={entry.submenu ? sub?.index === i : undefined}
            data-sub={entry.submenu ? i : undefined}
            className="ctx-item"
            data-danger={entry.danger || undefined}
            disabled={entry.disabled}
            aria-keyshortcuts={entry.shortcut?.replace(tr("Suppr"), "Delete").replace(tr("Entrée"), "Enter").replace(tr("Maj"), "Shift")}
            // La souris déplace le focus : un seul choix éclairé à la fois.
            onPointerMove={(e) => {
              if (!entry.disabled && document.activeElement !== e.currentTarget) e.currentTarget.focus();
            }}
            onPointerEnter={(e) => {
              if (entry.disabled) return;
              if (entry.submenu) openSub(i, e.currentTarget, false);
              else if (sub) {
                window.clearTimeout(closeTimer.current);
                closeTimer.current = window.setTimeout(() => setSub(null), 200);
              }
            }}
            onClick={(e) => {
              if (entry.submenu) return openSub(i, e.currentTarget, true);
              onClose(true);
              entry.run();
            }}
          >
            {withIcons && (
              <span className="ctx-icon" aria-hidden="true">
                {entry.icon && <Icon d={entry.icon} size={15} />}
              </span>
            )}
            <span className="ctx-label">{entry.label}</span>
            {entry.shortcut && <kbd className="ctx-shortcut">{entry.shortcut}</kbd>}
            {entry.detail && <span className="ctx-detail">{entry.detail}</span>}
            {entry.checked && <Icon d={ICONS.check} size={14} stroke={2.6} className="ctx-check" />}
            {entry.submenu && <Icon d={ICONS.chevronRight} size={14} stroke={2.4} className="ctx-more" />}
          </button>
        ),
      )}
      {sub && subEntry && subEntry !== "separator" && subEntry.submenu && subRect &&
        createPortal(
          <Menu
            x={subRect.right - 4}
            y={subRect.top - 7}
            above={subRect.bottom + 7}
            entries={subEntry.submenu}
            restore={sub.item}
            onClose={onClose}
            parent={{
              close: () => {
                setSub(null);
                sub.item.focus();
              },
              left: subRect.left,
              focusFirst: sub.focusFirst,
              keep: () => window.clearTimeout(closeTimer.current),
            }}
          />,
          document.body,
        )}
    </div>
  );
}

/** `closed` : aucun menu (compte verrouillé) ; un menu ouvert se ferme aussitôt. */
export function ContextMenuProvider({ children, closed = false }: { children: ReactNode; closed?: boolean }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  useEffect(() => {
    if (closed) setMenu(null);
  }, [closed]);

  const open = useCallback<OpenMenu>((e, entries) => {
    e.preventDefault();
    e.stopPropagation();
    const tidy = tidyEntries(groupMoves(entries));
    if (tidy.length === 0 || closed) return;
    let { clientX: x, clientY: y } = e;
    let above = y;
    // Ouvert au clavier ou par un bouton : sous l'élément, ou au-dessus de lui (et de la barre qui
    // le porte, marquée `data-menu-edge`) s'il est en bas de la fenêtre.
    if (x === 0 && y === 0 && e.currentTarget instanceof HTMLElement) {
      const r = e.currentTarget.getBoundingClientRect();
      x = r.left + 16;
      y = r.bottom + 4;
      above = (e.currentTarget.closest<HTMLElement>("[data-menu-edge]") ?? e.currentTarget).getBoundingClientRect().top - 6;
    }
    setMenu({ x, y, above, entries: tidy, restore: document.activeElement as HTMLElement | null });
  }, [closed]);
  const menuRef = useRef<MenuState | null>(null);
  menuRef.current = menu;
  const closeMenu = useCallback((refocus: boolean) => {
    const restore = menuRef.current?.restore;
    setMenu(null);
    if (refocus) restore?.focus?.();
  }, []);
  const screenBuild = useRef<(() => MenuEntry[]) | null>(null);
  const screen = useMemo<ScreenMenu>(
    () => ({
      register: (build) => {
        screenBuild.current = build;
        return () => {
          if (screenBuild.current === build) screenBuild.current = null;
        };
      },
      current: () => screenBuild.current?.() ?? [],
    }),
    [],
  );

  return (
    <ContextMenuContext.Provider value={open}>
      <ScreenMenuContext.Provider value={screen}>
        {children}
        {menu && !closed && createPortal(<Menu {...menu} onClose={closeMenu} />, document.body)}
      </ScreenMenuContext.Provider>
    </ContextMenuContext.Provider>
  );
}

/** Actions propres à l'écran affiché, en tête du menu du clic droit ailleurs dans l'écran. */
export function useScreenMenu(build: () => MenuEntry[]): void {
  const screen = useContext(ScreenMenuContext);
  const latest = useRef(build);
  latest.current = build;
  useEffect(() => screen?.register(() => latest.current()), [screen]);
}

/** Actions de l'écran affiché (menu général de la fenêtre). */
export function useScreenMenuEntries(): () => MenuEntry[] {
  const screen = useContext(ScreenMenuContext);
  return screen ? screen.current : () => [];
}

/**
 * Clic droit et raccourcis d'un élément de liste, à étaler sur l'élément :
 * `<li {...itemMenu(() => entrees)}>`. Les touches affichées dans le menu (Entrée, Suppr, F2,
 * Ctrl+D) agissent aussi quand l'élément ou l'un de ses boutons a le focus.
 */
export function useItemMenu(): (build: () => MenuEntry[]) => {
  onContextMenu: (e: ReactMouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
} {
  const open = useContextMenu();
  return (build) => ({
    onContextMenu: (e) => open(e, build()),
    onKeyDown: (e) => onItemKeys(menuKeys(build()))(e),
  });
}

/** Ouvre le menu du clic droit : `onContextMenu={(e) => openMenu(e, [...])}`. */
export function useContextMenu(): OpenMenu {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error("useContextMenu doit être utilisé dans ContextMenuProvider");
  return ctx;
}
