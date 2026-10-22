import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { Dialog } from "../components/Dialog";
import { Select } from "../components/SelectRow";
import { SymbolPicker } from "../components/SymbolPicker";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { TASK_COLORS } from "../tasks/colors";
import { depthOf, heightOf, MAX_NOTEBOOK_DEPTH, notebookTree, subtreeIds, type Notebook, type NoteFolder } from "./notes";
import { useNotes } from "./NotesProvider";
import { tr } from "../i18n/i18n";

interface NotebookDialogProps {
  /** Carnet renommé ; absent pour en créer un. */
  notebook?: Notebook;
  /** Carnet parent proposé (« Nouveau sous-carnet »). */
  parentId?: string | null;
  /** Dossier proposé (« Nouveau carnet » dans un dossier). */
  folderId?: string | null;
  onSaved?: (notebook: Notebook) => void;
  onClose: () => void;
}

const INDENT = "    ";

/** Nouveau carnet, ou nom, emplacement et couleur d'un carnet. */
export function NotebookDialog({ notebook, parentId = null, folderId = null, onSaved, onClose }: NotebookDialogProps) {
  const { notebooks, folders, createNotebook, updateNotebook } = useNotes();
  const [name, setName] = useState(notebook?.name ?? "");
  const [parent, setParent] = useState<string>(notebook?.parentId ?? parentId ?? "");
  const [folder, setFolder] = useState<string>(notebook?.folderId ?? folderId ?? "");
  const folderSelectId = useId();
  const [color, setColor] = useState<string | null>(notebook?.color ?? null);
  const [icon, setIcon] = useState<string>(notebook?.icon ?? "carnet");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const placeId = useId();
  const errorId = useId();

  // Emplacements possibles : pas dans lui-même, et 3 niveaux au plus avec ses sous-carnets.
  const own = notebook ? subtreeIds(notebook.id, notebooks) : new Set<string>();
  const height = notebook ? heightOf(notebook.id, notebooks) : 1;
  const places = [
    { value: "", label: tr("Aucun (premier niveau)") },
    ...notebookTree(notebooks)
      .filter((r) => !own.has(r.notebook.id) && depthOf(r.notebook.id, notebooks) + height <= MAX_NOTEBOOK_DEPTH)
      .map((r) => ({ value: r.notebook.id, label: `${INDENT.repeat(r.depth)}${r.notebook.name}` })),
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.split(/\s+/).filter(Boolean).join(" ");
    if (!clean) {
      setError(tr("Saisissez un nom."));
      return;
    }
    setBusy(true);
    try {
      const input = { name: clean, parentId: parent || null, color, icon, folderId: parent ? null : folder || null };
      const saved = notebook ? await updateNotebook(notebook.id, input) : await createNotebook(input);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      const e2 = err as DataError;
      setError(e2.code === "duplicate" ? tr("Un carnet porte déjà ce nom à cet endroit.") : dataErrorMessage(e2));
      setBusy(false);
    }
  };

  return (
    <Dialog title={notebook ? tr("Carnet") : parent ? tr("Nouveau sous-carnet") : tr("Nouveau carnet")} onClose={onClose}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor={nameId} className="field-label">
            {tr("Nom")}
          </label>
          <div className="field-box" data-invalid={error ? true : undefined}>
            <input
              id={nameId}
              className="field-input"
              value={name}
              maxLength={40}
              autoComplete="off"
              placeholder={tr("Travail, Recettes…")}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={placeId} className="field-label">
            {tr("Dans le carnet")}
          </label>
          <Select id={placeId} value={parent} options={places} onChange={setParent} />
        </div>
        {!parent && folders.length > 0 && (
          <div className="field">
            <label htmlFor={folderSelectId} className="field-label">
              {tr("Dossier")}
            </label>
            <Select
              id={folderSelectId}
              value={folder}
              options={[{ value: "", label: tr("Aucun dossier") }, ...folders.map((f) => ({ value: f.id, label: f.name }))]}
              onChange={setFolder}
            />
          </div>
        )}
        <div className="field">
          <span className="field-label">{tr("Symbole")}</span>
          <SymbolPicker value={icon} onChange={setIcon} label={tr("Symbole du carnet")} color={color} />
        </div>
        <div className="field">
          <span className="field-label">{tr("Couleur")}</span>
          <div className="color-choices" role="radiogroup" aria-label={tr("Couleur du carnet")}>
            <button
              type="button"
              role="radio"
              aria-checked={color === null}
              className="color-choice color-choice--theme"
              title={tr("Couleur du thème")}
              aria-label={tr("Couleur du thème")}
              onClick={() => setColor(null)}
            />
            {TASK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={color === c.value}
                className="color-choice"
                title={c.label}
                aria-label={c.label}
                style={{ "--swatch": c.value } as CSSProperties}
                onClick={() => setColor(c.value)}
              />
            ))}
          </div>
        </div>
        {error && (
          <p id={errorId} className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel" disabled={busy}>
            {notebook ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

interface FolderDialogProps {
  /** Dossier à personnaliser ; absent pour en créer un. */
  folder?: NoteFolder;
  onClose: () => void;
}

/** Nouveau dossier, ou nom, couleur et symbole d'un dossier de carnets. */
export function FolderDialog({ folder, onClose }: FolderDialogProps) {
  const { createFolder, updateFolder } = useNotes();
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState<string | null>(folder?.color ?? null);
  const [icon, setIcon] = useState<string>(folder?.icon ?? "carte");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.split(/\s+/).filter(Boolean).join(" ");
    if (!clean) {
      setError(tr("Saisissez un nom."));
      return;
    }
    setBusy(true);
    try {
      const input = { name: clean, color, icon };
      if (folder) await updateFolder(folder.id, input);
      else await createFolder(input);
      onClose();
    } catch (err) {
      const e2 = err as DataError;
      setError(e2.code === "duplicate" ? tr("Un dossier porte déjà ce nom.") : dataErrorMessage(e2));
      setBusy(false);
    }
  };

  return (
    <Dialog title={folder ? tr("Dossier") : tr("Nouveau dossier")} onClose={onClose}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor={nameId} className="field-label">
            {tr("Nom")}
          </label>
          <div className="field-box" data-invalid={error ? true : undefined}>
            <input
              id={nameId}
              className="field-input"
              value={name}
              maxLength={40}
              autoComplete="off"
              placeholder={tr("Vie perso, Études…")}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
        </div>
        <div className="field">
          <span className="field-label">{tr("Symbole")}</span>
          <SymbolPicker value={icon} onChange={setIcon} label={tr("Symbole du dossier")} color={color} />
        </div>
        <div className="field">
          <span className="field-label">{tr("Couleur")}</span>
          <div className="color-choices" role="radiogroup" aria-label={tr("Couleur du dossier")}>
            <button
              type="button"
              role="radio"
              aria-checked={color === null}
              className="color-choice color-choice--theme"
              title={tr("Couleur du thème")}
              aria-label={tr("Couleur du thème")}
              onClick={() => setColor(null)}
            />
            {TASK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={color === c.value}
                className="color-choice"
                title={c.label}
                aria-label={c.label}
                style={{ "--swatch": c.value } as CSSProperties}
                onClick={() => setColor(c.value)}
              />
            ))}
          </div>
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
          <button type="submit" className="btn-gel" disabled={busy}>
            {folder ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
