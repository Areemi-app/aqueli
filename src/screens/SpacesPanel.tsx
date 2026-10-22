import { useId, useState, type FormEvent } from "react";
import { useToast } from "../app/ToastProvider";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { useItemMenu } from "../components/ContextMenu";
import { KEYS } from "../lib/itemKeys";
import { startDrag } from "../lib/dragDrop";
import { dataErrorMessage, type DataError } from "../spaces/api";
import { SymbolPicker } from "../components/SymbolPicker";
import { SPACE_COLORS, spaceIconPath, type Space, type SpaceIcon } from "../spaces/spaces";
import { useSpaces } from "../spaces/SpacesProvider";
import { useShortcut } from "../prefs/PreferencesProvider";
import { tr } from "../i18n/i18n";

interface EditorProps {
  /** Espace à modifier, ou `null` pour en créer un. */
  space: Space | null;
  onClose: () => void;
}

/** Fenêtre de création ou de modification d'un espace : nom, couleur, icône. */
function SpaceEditor({ space, onClose }: EditorProps) {
  const { createSpace, updateSpace } = useSpaces();
  const notify = useToast();
  const [name, setName] = useState(space?.name ?? "");
  const [color, setColor] = useState(space?.color ?? "#2fae4a");
  const [icon, setIcon] = useState<SpaceIcon>(space?.icon ?? "etoile");
  const [error, setError] = useState<DataError | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const errorId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (space) {
        await updateSpace(space.id, name, color, icon);
        notify(tr("Espace modifié."));
      } else {
        await createSpace(name, color, icon);
        notify(tr("Espace créé."));
      }
      onClose();
    } catch (err) {
      setError(err as DataError);
      setBusy(false);
    }
  };

  return (
    <Dialog title={space ? tr("Modifier l'espace") : tr("Nouvel espace")} onClose={onClose}>
      <form className="settings-form space-editor" onSubmit={submit} noValidate>
        <div className="space-preview" aria-hidden="true">
          <ModuleChip color={color} icon={spaceIconPath(icon)} size={44} />
          <span className="space-preview-name">{name.trim() || tr("Nom de l'espace")}</span>
        </div>

        <div className="field">
          <label htmlFor={nameId} className="field-label">
            {tr("Nom")}
          </label>
          <div className="field-box" data-invalid={error?.code === "invalid" || error?.code === "duplicate" || undefined}>
            <input
              id={nameId}
              className="field-input"
              value={name}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        </div>

        <fieldset className="picker">
          <legend className="field-label">{tr("Couleur")}</legend>
          <div className="picker-grid" role="radiogroup" aria-label={tr("Couleur")}>
            {SPACE_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={color === c.value}
                aria-label={c.label}
                title={c.label}
                className="swatch-button"
                style={{ background: c.value }}
                onClick={() => setColor(c.value)}
              >
                {color === c.value && <Icon d={ICONS.check} size={14} stroke={3.4} />}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="picker">
          <legend className="field-label">{tr("Symbole")}</legend>
          <SymbolPicker value={icon} onChange={setIcon} label={tr("Symbole de l'espace")} color={color} />
        </fieldset>

        {error && (
          <p id={errorId} className="form-error" role="alert">
            {dataErrorMessage(error)}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel" disabled={busy || name.trim() === ""}>
            {space ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function SpacesPanel() {
  const { spaces, deleteSpace, restoreSpace, moveSpace, reorderSpaces } = useSpaces();
  const spacesKeys = useShortcut("spaces");
  const notify = useToast();
  const [editing, setEditing] = useState<Space | "nouveau" | null>(null);

  const remove = async (space: Space) => {
    try {
      const removed = await deleteSpace(space.id);
      notify(tr("Espace « {name} » supprimé.", { name: removed.name }), {
        label: tr("Annuler|action"),
        undo: tr("suppression de l'espace"),
        run: () => {
          restoreSpace(removed).catch((err: DataError) => notify(dataErrorMessage(err)));
        },
      });
    } catch (err) {
      notify(dataErrorMessage(err as DataError));
    }
  };

  const move = (space: Space, direction: -1 | 1) => {
    moveSpace(space.id, direction).catch((err: DataError) => notify(dataErrorMessage(err)));
  };
  // Clic droit sur un espace, et au clavier F2 (modifier) et Suppr (supprimer).
  const itemMenu = useItemMenu();
  const spaceMenu = (space: Space, i: number) =>
    itemMenu(() => [
      { label: tr("Modifier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setEditing(space) },
      "separator",
      { label: tr("Monter"), icon: ICONS.arrowUp, disabled: i === 0, run: () => move(space, -1) },
      { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: i === spaces.length - 1, run: () => move(space, 1) },
      "separator",
      { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, disabled: spaces.length <= 1, run: () => void remove(space) },
    ]);

  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Espaces")}</h2>
      <div className="settings-card glass" data-sort="espaces">
        {spaces.map((space, i) => (
          <div
            key={space.id}
            className="setting-row space-row"
            data-sort-id={space.id}
            // Glisser pour remettre en ordre ; les flèches et le clic droit restent l'équivalent.
            onPointerDown={(e) =>
              startDrag(e, { kind: "espace", ids: [space.id], label: space.name, color: space.color }, {
                sort: { group: "espaces", onSort: (ids) => void reorderSpaces(ids).catch((err: DataError) => notify(dataErrorMessage(err))) },
              })
            }
            {...spaceMenu(space, i)}
          >
            <ModuleChip color={space.color} icon={spaceIconPath(space.icon)} size={30} />
            <span className="setting-label space-name-cell">{space.name}</span>
            <div className="row-actions">
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={tr("Monter « {name} »", { name: space.name })}
                title={tr("Monter")}
                disabled={i === 0}
                onClick={() => move(space, -1)}
              >
                <Icon d={ICONS.arrowUp} size={15} stroke={2.2} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={tr("Descendre « {name} »", { name: space.name })}
                title={tr("Descendre")}
                disabled={i === spaces.length - 1}
                onClick={() => move(space, 1)}
              >
                <Icon d={ICONS.arrowDown} size={15} stroke={2.2} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={tr("Modifier « {name} »", { name: space.name })}
                title={tr("Modifier")}
                onClick={() => setEditing(space)}
              >
                <Icon d={ICONS.pencil} size={15} stroke={2.2} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={tr("Supprimer « {name} »", { name: space.name })}
                title={tr("Supprimer")}
                disabled={spaces.length <= 1}
                onClick={() => void remove(space)}
              >
                <Icon d={ICONS.trash} size={15} stroke={2.2} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <button type="button" className="btn-glass" onClick={() => setEditing("nouveau")}>
          <Icon d={ICONS.plus} size={16} stroke={2.6} />
          {tr("Nouvel espace")}
        </button>
      </div>
      <p className="settings-hint">{tr("Le menu des espaces, en haut de la fenêtre, filtre l'affichage ({keys}).", { keys: spacesKeys })}</p>
      {editing && <SpaceEditor space={editing === "nouveau" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
