import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import { ICONS } from "../../components/icons";
import { getModule } from "../../modules/modules";
import type { LinkMenuState } from "./extensions";
import { tr } from "../../i18n/i18n";

/**
 * Liste « [[ » (notes dont le titre correspond, ou « Créer la note ») ou « @ » (contacts).
 * Flèches, puis Entrée.
 */
export function LinkMenu({ state }: { state: LinkMenuState }) {
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

  return createPortal(
    <div ref={ref} className="note-link-menu glass-popover" style={position} role="listbox" aria-label={state.kind === "contact" ? tr("Citer un contact") : tr("Lier une note")}>
      {state.items.length === 0 ? (
        <p className="note-link-empty">{tr("Saisir le titre d'une note.")}</p>
      ) : (
        state.items.map((item, i) => (
          <div
            key={item.id ?? `nouvelle:${item.label}`}
            role="option"
            aria-selected={i === state.selected}
            className="note-link-option"
            onMouseDown={(e) => {
              e.preventDefault();
              state.pick(item);
            }}
          >
            <Icon d={state.kind === "contact" ? getModule("contacts").icon : item.id ? ICONS.notes : ICONS.plus} size={14} stroke={2.2} />
            <span className="note-link-label">{item.id ? item.label : tr("Créer la note « {label} »", { label: item.label })}</span>
          </div>
        ))
      )}
    </div>,
    document.body,
  );
}
