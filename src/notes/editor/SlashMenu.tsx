import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import type { SlashMenuState } from "./slash";
import { tr } from "../../i18n/i18n";

/** Liste du menu « / » : blocs à insérer, filtrés par ce qui suit « / ». Flèches, puis Entrée. */
export function SlashMenu({ state }: { state: SlashMenuState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: state.rect?.left ?? 0, top: (state.rect?.bottom ?? 0) + 6 });

  // Reste dans la fenêtre : au-dessus du texte s'il n'y a pas la place dessous.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    const rect = state.rect;
    if (!box || !rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8));
    const below = rect.bottom + 6;
    const top = below + box.height > window.innerHeight - 8 ? Math.max(8, rect.top - box.height - 6) : below;
    setPosition({ left, top });
  }, [state.rect, state.items.length]);

  // L'élément choisi au clavier reste visible.
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [state.selected]);

  return createPortal(
    <div ref={ref} className="note-link-menu slash-menu glass-popover" style={position} role="listbox" aria-label={tr("Insérer un bloc")}>
      {state.items.length === 0 ? (
        <p className="note-link-empty">{tr("Aucun bloc ne correspond.")}</p>
      ) : (
        state.items.map((item, i) => (
          <div
            key={item.id}
            role="option"
            aria-selected={i === state.selected}
            className="note-link-option slash-option"
            onMouseDown={(e) => {
              e.preventDefault();
              state.pick(item);
            }}
          >
            <span className="slash-icon">
              <Icon d={item.icon} size={15} stroke={2.2} />
            </span>
            <span className="slash-text">
              <span className="note-link-label">{item.label}</span>
              <span className="slash-hint">{item.hint}</span>
            </span>
          </div>
        ))
      )}
    </div>,
    document.body,
  );
}
