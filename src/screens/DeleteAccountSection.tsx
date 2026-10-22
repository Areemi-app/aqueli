/**
 * Paramètres › Sécurité › Suppression du compte (cahier des charges § 8 : « suppression
 * définitive du compte, avec écrasement des fichiers »). Mot de passe et mot de confirmation
 * exigés. Ensuite, Aqueli repart de l'écran de bienvenue, ou redémarre sur un autre compte de ce PC.
 */
import { useId, useState, type FormEvent } from "react";
import { Checkbox } from "../components/Checkbox";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { PasswordField } from "../components/PasswordField";
import { stopSavingPrefs } from "../lib/storage";
import { vaultApi, type VaultError } from "../vault/api";
import { vaultErrorMessage } from "../vault/messages";
import { tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

/** Mot à saisir pour confirmer. */
export const CONFIRM_WORD = tr("SUPPRIMER");

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [word, setWord] = useState("");
  const [includeBackups, setIncludeBackups] = useState(true);
  const [error, setError] = useState<VaultError | null>(null);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const ids = useId();
  const confirmed = word.trim().toUpperCase() === CONFIRM_WORD;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const otherAccounts = await vaultApi.deleteAccount(password, includeBackups);
      // Plus rien n'est enregistré : Aqueli repart de l'écran de bienvenue, ou le cœur le
      // redémarre sur un autre compte.
      stopSavingPrefs();
      if (otherAccounts) setRestarting(true);
      else window.location.reload();
    } catch (err) {
      setError(err as VaultError);
      setBusy(false);
    }
  };

  return (
    <Dialog title={tr("Supprimer le compte")} onClose={onClose}>
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        <p className="notice notice--danger">
          <Icon d={ICONS.warning} size={16} stroke={2.2} />
          <Sentences text={tr("Toutes les données de ce compte seront effacées de ce PC. Cette action est définitive.")} />
        </p>
        <Checkbox label={tr("Supprimer aussi les sauvegardes enregistrées sur ce PC")} checked={includeBackups} onChange={setIncludeBackups} />
        <p className="settings-hint">{tr("Les sauvegardes copiées ailleurs (clé USB, disque externe) ne sont pas supprimées.")}</p>
        <PasswordField
          id={`${ids}-mdp`}
          label={tr("Mot de passe")}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          invalid={error !== null}
          describedBy={error ? `${ids}-erreur` : undefined}
        />
        <div className="field">
          <label htmlFor={`${ids}-mot`} className="field-label">
            {tr("Pour confirmer, saisir {word}", { word: CONFIRM_WORD })}
          </label>
          <div className="field-box">
            <input id={`${ids}-mot`} className="field-input" value={word} autoComplete="off" spellCheck={false} onChange={(e) => setWord(e.target.value)} />
          </div>
        </div>
        {error && (
          <p id={`${ids}-erreur`} className="form-error" role="alert">
            {vaultErrorMessage(error)}
          </p>
        )}
        {restarting && (
          <p className="notice" role="status">
            <span className="spinner" aria-hidden="true" />
            {tr("Compte supprimé. Aqueli s'ouvre sur un autre compte.")}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose} disabled={restarting}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-glass btn-danger" disabled={!password || !confirmed || busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {tr("Supprimer définitivement")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Suppression du compte")}</h2>
      <div className="settings-card settings-card--padded glass">
        <p className="settings-intro"><Sentences text={tr("Efface définitivement le compte et toutes ses données de ce PC. Les fichiers sont écrasés avant d'être supprimés.")} /></p>
        <div>
          <button type="button" className="btn-glass btn-danger" onClick={() => setOpen(true)}>
            <Icon d={ICONS.trash} size={15} stroke={2.2} />
            {tr("Supprimer le compte…")}
          </button>
        </div>
      </div>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
