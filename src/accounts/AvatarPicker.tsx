import { useRef, useState, type KeyboardEvent } from "react";
import { Dialog } from "../components/Dialog";
import { Tabs } from "../components/Tabs";
import { tr } from "../i18n/i18n";
import { AvatarImage } from "./AvatarImage";
import { AVATAR_CATEGORIES, AVATARS, avatarById, type AvatarCategory } from "./avatars";

interface AvatarPickerProps {
  value: string;
  name: string;
  onChoose: (avatar: string) => void;
  onClose: () => void;
}

/**
 * Choix de l'image de profil dans la banque d'images : un onglet par thème, une grille de bulles.
 * Flèches pour se déplacer dans la grille, Entrée pour choisir.
 */
export function AvatarPicker({ value, name, onChoose, onClose }: AvatarPickerProps) {
  const [category, setCategory] = useState<AvatarCategory>(avatarById(value)?.category ?? "nature");
  const [selected, setSelected] = useState(value);
  const gridRef = useRef<HTMLDivElement>(null);
  const shown = AVATARS.filter((a) => a.category === category);
  const tabs = AVATAR_CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: AVATARS.filter((a) => a.category === c.id).length }));

  // Flèches : bulle voisine (la grille compte autant de colonnes que sa première rangée).
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const top = buttons[0]?.offsetTop ?? 0;
    const columns = Math.max(1, buttons.filter((b) => b.offsetTop === top).length);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, i + step))]?.focus();
  };

  return (
    <Dialog title={tr("Image de profil")} onClose={onClose} className="dialog--wide avatar-dialog">
      <div className="avatar-picker">
        <div className="avatar-picker-current">
          <AvatarImage avatar={selected} name={name} size={88} />
          <span>{avatarById(selected)?.label ?? tr("Initiale du pseudo")}</span>
        </div>
        <Tabs items={tabs} value={category} onChange={setCategory} label={tr("Thèmes d'images")} idPrefix="avatars" />
        <div
          ref={gridRef}
          className="avatar-grid"
          role="radiogroup"
          aria-label={AVATAR_CATEGORIES.find((c) => c.id === category)?.label}
          id={`avatars-panel-${category}`}
          onKeyDown={onGridKey}
        >
          {shown.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={a.id === selected}
              aria-label={a.label}
              title={a.label}
              className="avatar-choice"
              onClick={() => setSelected(a.id)}
              onDoubleClick={() => onChoose(a.id)}
            >
              <AvatarImage avatar={a.id} name={name} size={64} />
            </button>
          ))}
        </div>
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={() => setSelected("")}>
            {tr("Utiliser l'initiale")}
          </button>
          <span className="onb-actions-spacer" />
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="button" className="btn-gel" onClick={() => onChoose(selected)} data-autofocus>
            {tr("Choisir")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
