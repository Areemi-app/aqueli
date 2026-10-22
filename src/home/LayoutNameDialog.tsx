import { useId, useState, type FormEvent } from "react";
import { Dialog } from "../components/Dialog";
import { cleanName, nameTaken, type HomeLayouts } from "./layout";
import { tr } from "../i18n/i18n";

interface LayoutNameDialogProps {
  layouts: HomeLayouts;
  /** Mise en page renommée ; absente pour en créer une. */
  renaming?: { id: string; name: string };
  onSave: (name: string) => void;
  onClose: () => void;
}

/** Nom d'une nouvelle mise en page de l'Accueil, ou nouveau nom d'une mise en page. */
export function LayoutNameDialog({ layouts, renaming, onSave, onClose }: LayoutNameDialogProps) {
  const [name, setName] = useState(renaming?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const errorId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) {
      setError(tr("Saisissez un nom."));
      return;
    }
    if (nameTaken(layouts, clean, renaming?.id)) {
      setError(tr("Ce nom est déjà utilisé."));
      return;
    }
    onSave(clean);
  };

  return (
    <Dialog title={renaming ? tr("Renommer la mise en page") : tr("Nouvelle mise en page")} onClose={onClose}>
      <form className="settings-form" onSubmit={submit} noValidate>
        {!renaming && <p className="settings-intro">{tr("La nouvelle mise en page reprend les cartes affichées.")}</p>}
        <div className="field">
          <label htmlFor={nameId} className="field-label">
            {tr("Nom")}
          </label>
          <div className="field-box" data-invalid={error ? true : undefined}>
            <input
              id={nameId}
              className="field-input"
              value={name}
              maxLength={30}
              autoComplete="off"
              placeholder={tr("Travail, Week-end…")}
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
          <button type="submit" className="btn-gel">
            {renaming ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
