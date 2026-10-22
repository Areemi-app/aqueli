/** Menu « Affichage » des tâches : tri, regroupement, priorité, tâches terminées. */
import { useEffect, useId, useRef, useState } from "react";
import { Checkbox } from "../components/Checkbox";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select } from "../components/Select";
import { DEFAULT_DISPLAY, GROUPS, isDefaultDisplay, PRIORITY_FILTERS, SORTS, type ListDisplay } from "./taskDisplay";
import { tr } from "../i18n/i18n";

interface TaskDisplayMenuProps {
  display: ListDisplay;
  onChange: (display: ListDisplay) => void;
  /** Les options de regroupement et de tâches terminées ne valent que pour la vue Liste. */
  listView: boolean;
}

export function TaskDisplayMenu({ display, onChange, listView }: TaskDisplayMenuProps) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const ids = useId();
  const set = (changes: Partial<ListDisplay>) => onChange({ ...display, ...changes });

  // Fermé au clic ailleurs (sauf dans une liste déroulante ouverte depuis le menu) ou avec Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!boxRef.current?.contains(t) && !t.closest?.(".select-list")) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <div className="tasks-filter" ref={boxRef}>
      <button
        type="button"
        className="btn-glass"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-active={!isDefaultDisplay(display) || undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon d={ICONS.settings} size={16} stroke={2.2} />
        <span>{tr("Affichage")}</span>
      </button>
      {open && (
        <div
          className="display-menu glass-popover"
          role="dialog"
          aria-label={tr("Affichage des tâches")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {listView && (
            <>
              <label htmlFor={`${ids}-tri`} className="display-label">
                {tr("Trier par")}
              </label>
              <Select id={`${ids}-tri`} value={display.sort} options={SORTS} onChange={(sort) => set({ sort })} />
              <label htmlFor={`${ids}-groupes`} className="display-label">
                {tr("Regrouper par")}
              </label>
              <Select id={`${ids}-groupes`} value={display.group} options={GROUPS} onChange={(group) => set({ group })} />
            </>
          )}
          <label htmlFor={`${ids}-priorite`} className="display-label">
            {tr("Priorité")}
          </label>
          <Select
            id={`${ids}-priorite`}
            value={String(display.minPriority)}
            options={PRIORITY_FILTERS.map((p) => ({ value: String(p.value), label: p.label }))}
            onChange={(v) => set({ minPriority: Number(v) as ListDisplay["minPriority"] })}
          />
          {listView && (
            <div className="display-wide">
              <Checkbox label={tr("Afficher les tâches terminées")} checked={display.showDone} onChange={(showDone) => set({ showDone })} />
            </div>
          )}
          <div className="display-wide display-actions">
            <button type="button" className="link-btn" disabled={isDefaultDisplay(display)} onClick={() => onChange(DEFAULT_DISPLAY)}>
              {tr("Rétablir l'affichage par défaut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
