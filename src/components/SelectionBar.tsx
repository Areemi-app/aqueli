/**
 * Sélection de plusieurs éléments (Ctrl+clic, Maj+clic, Ctrl+A) et barre de ses actions, en bas
 * de la liste. La logique est dans src/lib/selection.ts ; l'annulation groupée dans src/app/bulk.ts.
 */
import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { tidyEntries, useContextMenu, type MenuAction, type MenuEntry } from "./ContextMenu";
import { NO_SELECTION, pick, pickAll, pickMode, prune, type Selection } from "../lib/selection";
import { tr } from "../i18n/i18n";

interface PickGesture {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface SelectionApi {
  ids: ReadonlySet<string>;
  count: number;
  has: (id: string) => boolean;
  /**
   * Clic sur un élément. Avec Ctrl ou Maj, il entre dans la sélection (ou en sort) et la fonction
   * renvoie vrai : l'élément ne s'ouvre pas. Un clic simple vide la sélection et renvoie faux.
   */
  click: (e: PickGesture, id: string) => boolean;
  /** Ce seul élément (liste sans détail à ouvrir, comme la corbeille). */
  only: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
  /** Sur le conteneur de la liste : Ctrl+A prend tout, Échap vide la sélection. */
  onListKeyDown: (e: KeyboardEvent) => void;
}

/** `order` : identifiants dans l'ordre affiché ; `current` : élément ouvert (détail), s'il y en a un. */
export function useSelection(order: readonly string[], current: string | null = null): SelectionApi {
  const [raw, setRaw] = useState<Selection>(NO_SELECTION);
  const sel = prune(raw, order);
  const latest = useRef({ order, current });
  latest.current = { order, current };

  const clear = useCallback(() => setRaw((s) => (s.ids.size === 0 ? s : NO_SELECTION)), []);
  const selectAll = useCallback(() => setRaw(pickAll(latest.current.order)), []);

  return {
    ids: sel.ids,
    count: sel.ids.size,
    has: (id) => sel.ids.has(id),
    click: (e, id) => {
      const mode = pickMode(e);
      const { order: list, current: open } = latest.current;
      if (mode === "seul") {
        // L'élément ouvert devient le point de départ d'un prochain Maj+clic.
        setRaw({ ids: new Set(), anchor: id });
        return false;
      }
      setRaw((s) => pick(prune(s, list), id, mode, list, open));
      return true;
    },
    only: (id) => setRaw((s) => pick(s, id, "seul", latest.current.order)),
    selectAll,
    clear,
    onListKeyDown: (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable='true']")) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Escape" && sel.ids.size > 0) {
        e.preventDefault();
        e.stopPropagation();
        clear();
      }
    },
  };
}

/** Action de la barre ; avec `menu`, le bouton ouvre la liste des choix (dossier, carnet…). */
export interface SelectionAction extends MenuAction {
  menu?: () => MenuEntry[];
}

/** Les actions de la barre, pour le clic droit d'un élément sélectionné (les choix à plat). */
export function selectionEntries(actions: readonly SelectionAction[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const a of actions) {
    if (a.menu) out.push("separator", ...a.menu(), "separator");
    else if (a.danger) out.push("separator", a);
    else out.push(a);
  }
  return tidyEntries(out);
}

interface SelectionBarProps {
  count: number;
  /** « tâche sélectionnée » / « tâches sélectionnées ». */
  label: [one: string, many: string];
  actions: readonly SelectionAction[];
  onClear: () => void;
}

/** Barre en bas de la liste quand des éléments sont sélectionnés. */
export function SelectionBar({ count, label, actions, onClear }: SelectionBarProps) {
  const openMenu = useContextMenu();
  if (count === 0) return null;
  return (
    <div className="selection-bar glass-popover" role="toolbar" aria-label={tr("Sélection")}>
      <div className="selection-inner">
      <span className="selection-count" aria-live="polite" title={`${count} ${count > 1 ? label[1] : label[0]}`}>
        <Icon d={ICONS.check} size={13} stroke={3} className="selection-check" />
        {count}
        <span className="selection-noun"> {count > 1 ? label[1] : label[0]}</span>
      </span>
      <span className="selection-actions">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="btn-glass btn-glass--sm selection-action"
            data-danger={a.danger || undefined}
            disabled={a.disabled}
            title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
            aria-label={a.label}
            aria-haspopup={a.menu ? "menu" : undefined}
            onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
              if (!a.menu) return a.run();
              const box = e.currentTarget.getBoundingClientRect();
              openMenu({ clientX: box.left, clientY: box.top - 4, currentTarget: e.currentTarget, preventDefault: () => {}, stopPropagation: () => {} }, a.menu());
            }}
          >
            {a.icon && <Icon d={a.icon} size={14} stroke={2.2} />}
            <span className="selection-label">{a.label}</span>
            {a.menu && <Icon d={ICONS.chevronDown} size={11} stroke={2.6} />}
          </button>
        ))}
      </span>
      <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Tout désélectionner (Échap)")} title={tr("Tout désélectionner (Échap)")} onClick={onClear}>
        <Icon d={ICONS.close} size={13} stroke={2.6} />
      </button>
      </div>
    </div>
  );
}
