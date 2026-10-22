import { useEffect, useLayoutEffect, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { useContextMenu } from "./ContextMenu";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { tr } from "../i18n/i18n";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Petites pastilles de couleur devant le libellé (familles de thèmes). */
  dots?: readonly string[];
  /** Nombre d'éléments, après le libellé. */
  count?: number;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix: string;
}

/**
 * Onglets affichés quand seuls `count` tiennent : les premiers, et l'onglet actif à la
 * place du dernier s'il se trouvait plus loin.
 */
export function shownTabs(total: number, count: number, active: number): number[] {
  if (count >= total) return Array.from({ length: total }, (_, i) => i);
  const shown = Array.from({ length: Math.max(1, count) }, (_, i) => i);
  if (active >= shown.length) shown[shown.length - 1] = active;
  return shown;
}

/**
 * Contrôle segmenté : l'onglet actif est une pastille surélevée (maquette Tâches). Quand la
 * place manque, les onglets qui ne tiennent pas passent dans « Plus », un menu déroulant.
 */
export function Tabs<T extends string>({ items, value, onChange, label, idPrefix }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const fitRef = useRef<HTMLDivElement>(null);
  const focusActive = useRef(false);
  const [count, setCount] = useState(items.length);
  // Nouvelle mesure demandée (la largeur a changé sans autre raison de redessiner).
  const [, remeasure] = useReducer((n: number) => n + 1, 0);
  const openMenu = useContextMenu();
  const active = Math.max(0, items.findIndex((i) => i.id === value));
  const shown = shownTabs(items.length, count, active);
  const hidden = items.filter((_, i) => !shown.includes(i));

  // Tant que les onglets débordent, un de moins (avant l'affichage : rien ne clignote).
  useLayoutEffect(() => {
    const fit = fitRef.current;
    if (fit && count > 1 && fit.scrollWidth > fit.clientWidth + 1) setCount((c) => c - 1);
  });

  // La place change (fenêtre, panneau) : on recommence avec tous les onglets.
  useEffect(() => {
    const parent = fitRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    let width = parent.clientWidth;
    const observer = new ResizeObserver(() => {
      if (parent.clientWidth === width) return;
      width = parent.clientWidth;
      setCount(items.length);
      remeasure();
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [items.length]);

  // Onglet choisi au clavier : il garde le focus, même s'il vient de « Plus ».
  useLayoutEffect(() => {
    if (!focusActive.current) return;
    focusActive.current = false;
    refs.current[active]?.focus();
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (e.key === "ArrowRight") next = (active + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (active - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    const item = items[next];
    if (item) {
      focusActive.current = true;
      onChange(item.id);
    }
  };

  return (
    <div className="tabs-fit" ref={fitRef}>
      <div className="segmented">
        <div role="tablist" aria-label={label} className="segmented-tabs" onKeyDown={onKeyDown}>
          {shown.map((i) => {
            const item = items[i]!;
            const selected = item.id === value;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${idPrefix}-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`${idPrefix}-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                className="segment"
                onClick={() => onChange(item.id)}
              >
                {item.dots && item.dots.length > 0 && (
                  <span className="segment-dots" aria-hidden="true">
                    {item.dots.map((c) => (
                      <span key={c} className="segment-dot" style={{ background: c }} />
                    ))}
                  </span>
                )}
                {item.label}
                {item.count !== undefined && <span className="segment-count">{item.count}</span>}
              </button>
            );
          })}
        </div>
        {hidden.length > 0 && (
          <button
            type="button"
            className="segment segment-more"
            aria-haspopup="menu"
            aria-label={tr("Autres onglets : {x}", { x: hidden.map((h) => h.label).join(", ") })}
            onClick={(e) =>
              openMenu(
                { clientX: 0, clientY: 0, currentTarget: e.currentTarget, preventDefault: () => {}, stopPropagation: () => {} },
                hidden.map((h) => ({ label: h.label, run: () => onChange(h.id) })),
              )
            }
          >
            {tr("Plus")}
            <Icon d={ICONS.chevronDown} size={13} stroke={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}
