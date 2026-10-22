/**
 * Catégories de contacts (« Voisins », « Club de tennis »…) : pastilles de filtre au-dessus de la
 * liste, et fenêtre pour en créer ou en modifier une (nom, symbole, couleur).
 */
import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { useItemMenu } from "../components/ContextMenu";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { SymbolPicker } from "../components/SymbolPicker";
import { symbolPath } from "../components/symbols";
import { KEYS } from "../lib/itemKeys";
import { dropTarget, moved, startDrag } from "../lib/dragDrop";
import { ColorChoices } from "../components/ColorChoices";
import type { Contact, ContactGroup } from "./contacts";
import { useContacts } from "./ContactsProvider";
import { tr } from "../i18n/i18n";

/** Filtre : toutes les catégories, ou une seule. */
export type CategoryFilter = "toutes" | string;

export function GroupDialog({ group, onClose }: { group?: ContactGroup; onClose: () => void }) {
  const { createGroup, updateGroup } = useContacts();
  const [name, setName] = useState(group?.name ?? "");
  const [icon, setIcon] = useState(group?.icon ?? "personne");
  const [color, setColor] = useState<string | null>(group?.color ?? "#2fae4a");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError(tr("Saisissez un nom."));
      return;
    }
    const input = { name: clean, icon, color };
    if (group) await updateGroup(group, input);
    else await createGroup(input);
    onClose();
  };
  return (
    <Dialog title={group ? tr("Catégorie") : tr("Nouvelle catégorie")} onClose={onClose}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor={id} className="field-label">
            {tr("Nom")}
          </label>
          <div className="field-box" data-invalid={error ? true : undefined}>
            <input
              id={id}
              className="field-input"
              value={name}
              maxLength={40}
              autoComplete="off"
              placeholder={tr("Voisins, Club de tennis, Collègues…")}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
        </div>
        <div className="field">
          <span className="field-label">{tr("Symbole")}</span>
          <SymbolPicker value={icon} onChange={setIcon} label={tr("Symbole de la catégorie")} color={color} />
        </div>
        <div className="field">
          <span className="field-label">{tr("Couleur")}</span>
          <ColorChoices value={color} onChange={setColor} label={tr("Couleur de la catégorie")} />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel">
            {group ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

interface ChipsProps {
  contacts: readonly Contact[];
  value: CategoryFilter;
  onChange: (value: CategoryFilter) => void;
  onEdit: (group: ContactGroup | "nouvelle") => void;
}

/** Pastilles « Toutes » et une par catégorie, avec leur nombre de contacts ; « + » en crée une. */
export function CategoryChips({ contacts, value, onChange, onEdit }: ChipsProps) {
  const { groups, removeGroup, reorderGroups } = useContacts();
  const itemMenu = useItemMenu();
  return (
    <div className="contact-categories" role="radiogroup" aria-label={tr("Catégorie")} data-sort="categories-contacts" data-sort-axis="x">
      <button type="button" role="radio" aria-checked={value === "toutes"} className="contact-category" onClick={() => onChange("toutes")}>
        {tr("Toutes")}
        <span className="contact-category-count">{contacts.length}</span>
      </button>
      {groups.map((g, i) => {
        const menu = itemMenu(() => [
          { label: tr("Modifier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => onEdit(g) },
          "separator",
          { label: tr("Déplacer vers la gauche"), icon: ICONS.arrowLeft, disabled: i === 0, run: () => void reorderGroups(moved(groups.map((x) => x.id), i, -1)) },
          { label: tr("Déplacer vers la droite"), icon: ICONS.arrowRight, disabled: i === groups.length - 1, run: () => void reorderGroups(moved(groups.map((x) => x.id), i, 1)) },
          "separator",
          {
            label: tr("Supprimer la catégorie"),
            icon: ICONS.trash,
            shortcut: KEYS.remove,
            danger: true,
            run: () => {
              if (value === g.id) onChange("toutes");
              void removeGroup(g);
            },
          },
        ]);
        return (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={value === g.id}
            className="contact-category"
            style={{ "--category-color": g.color ?? "var(--aq-accent)" } as CSSProperties}
            onClick={() => onChange(g.id)}
            {...dropTarget(`categorie:${g.id}`, "contact")}
            data-sort-id={g.id}
            onPointerDown={(e) =>
              startDrag(e, { kind: "categorie-contacts", ids: [g.id], label: g.name, color: g.color }, { sort: { group: "categories-contacts", onSort: (ids) => void reorderGroups(ids) } })
            }
            {...menu}
          >
            <span className="contact-category-chip" aria-hidden="true">
              <Icon d={symbolPath(g.icon, ICONS.spaces)} size={11} stroke={2.4} />
            </span>
            {g.name}
            <span className="contact-category-count">{contacts.filter((c) => c.groupId === g.id).length}</span>
          </button>
        );
      })}
      <button type="button" className="contact-category contact-category--add" aria-label={tr("Nouvelle catégorie")} title={tr("Nouvelle catégorie")} onClick={() => onEdit("nouvelle")}>
        <Icon d={ICONS.plus} size={13} stroke={2.6} />
      </button>
    </div>
  );
}
