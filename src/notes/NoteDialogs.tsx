import { useId, useState, type FormEvent } from "react";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select } from "../components/SelectRow";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { noteTitle, notebookTree, type NoteSummary } from "./notes";
import { useNotes } from "./NotesProvider";
import { tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

const INDENT = "    ";

/** Choix du carnet : « Sans carnet », puis l'arbre des carnets. */
export function useNotebookOptions(): { value: string; label: string }[] {
  const { notebooks } = useNotes();
  return [
    { value: "", label: tr("Sans carnet") },
    ...notebookTree(notebooks).map((r) => ({ value: r.notebook.id, label: `${INDENT.repeat(r.depth)}${r.notebook.name}` })),
  ];
}

/** « Enregistrer comme modèle » : nom du modèle personnel. */
export function TemplateNameDialog({ note, content, onClose }: { note: NoteSummary; content: () => Promise<string>; onClose: () => void }) {
  const { createTemplate } = useNotes();
  const [name, setName] = useState(note.title.trim());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const errorId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.split(/\s+/).filter(Boolean).join(" ");
    if (!clean) {
      setError(tr("Saisissez un nom."));
      return;
    }
    setBusy(true);
    try {
      await createTemplate(clean, await content());
      onClose();
    } catch (err) {
      const e2 = err as DataError;
      setError(e2.code === "duplicate" ? tr("Un modèle porte déjà ce nom.") : dataErrorMessage(e2));
      setBusy(false);
    }
  };

  return (
    <Dialog title={tr("Enregistrer comme modèle")} onClose={onClose}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        <p className="settings-intro"><Sentences text={tr("Le modèle reprend le texte de la note. Il figure ensuite dans « Nouvelle note ».")} /></p>
        <div className="field">
          <label htmlFor={nameId} className="field-label">
            {tr("Nom du modèle")}
          </label>
          <div className="field-box" data-invalid={error ? true : undefined}>
            <input
              id={nameId}
              className="field-input"
              value={name}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
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
            {tr("Enregistrer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** « Déplacer vers un carnet ». */
export function MoveNoteDialog({ note, onClose }: { note: NoteSummary; onClose: () => void }) {
  const { updateMeta } = useNotes();
  const options = useNotebookOptions();
  const [target, setTarget] = useState(note.notebookId ?? "");
  const selectId = useId();

  return (
    <Dialog title={tr("Déplacer la note")} onClose={onClose}>
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void updateMeta(note, { notebookId: target || null });
          onClose();
        }}
      >
        <p className="settings-intro">« {noteTitle(note)} »</p>
        <div className="field">
          <label htmlFor={selectId} className="field-label">
            {tr("Carnet")}
          </label>
          <Select id={selectId} value={target} options={options} onChange={setTarget} />
        </div>
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel">
            {tr("Déplacer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Modèles personnels : liste et suppression. */
export function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const { templates, removeTemplate } = useNotes();
  return (
    <Dialog title={tr("Modèles personnels")} onClose={onClose}>
      {templates.length === 0 ? (
        <p className="settings-intro"><Sentences text={tr("Aucun modèle personnel. « Enregistrer comme modèle », dans le menu d'une note, en crée un.")} /></p>
      ) : (
        <ul className="note-templates">
          {templates.map((t) => (
            <li key={t.id} className="note-template-row">
              <Icon d={ICONS.template} size={16} />
              <span className="note-template-name">{t.name}</span>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={tr("Supprimer le modèle « {name} »", { name: t.name })}
                title={tr("Supprimer")}
                onClick={() => void removeTemplate(t)}
              >
                <Icon d={ICONS.trash} size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="onb-actions">
        <button type="button" className="btn-gel" onClick={onClose}>
          {tr("Fermer")}
        </button>
      </div>
    </Dialog>
  );
}
