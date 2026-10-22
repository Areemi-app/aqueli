/**
 * « Plus d'options » : dans une fenêtre de saisie, l'essentiel d'abord ; les réglages
 * secondaires (notes, espace, fin d'une répétition…) restent repliés jusqu'au clic. Ouvert
 * d'emblée quand l'élément modifié en utilise déjà un.
 */
import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { tr } from "../i18n/i18n";

export function MoreOptions({ children, open: initial = false }: { children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  const id = useId();
  return (
    <div className="more-options" data-open={open || undefined}>
      <button type="button" className="more-options-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Icon d={ICONS.chevronDown} size={14} stroke={2.4} className="more-options-chevron" />
        {open ? tr("Moins d'options") : tr("Plus d'options")}
      </button>
      {open && (
        <div id={id} className="more-options-body">
          {children}
        </div>
      )}
    </div>
  );
}
