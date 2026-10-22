import { useEffect, useId, useState, type FormEvent } from "react";
import { Dialog } from "../components/Dialog";
import { PasswordField } from "../components/PasswordField";
import type { VaultError } from "../vault/api";
import { vaultErrorMessage } from "../vault/messages";
import { backupsApi, ORIGIN_LABELS, previewText, type BackupInfo, type Preview } from "./backupsApi";
import { locale, tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

/** Après le rechargement de la fenêtre : « Sauvegarde restaurée. ». */
export const RESTORED_FLAG = "aqueli:sauvegarde-restauree";

export const backupDate = (b: Pick<BackupInfo, "createdAt">) =>
  new Date(b.createdAt * 1000).toLocaleString(locale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

interface RestoreDialogProps {
  backup: BackupInfo;
  /** Aucun compte sur ce PC (écran d'accueil) : le mot de passe de la sauvegarde est demandé. */
  newAccount?: boolean;
  onClose: () => void;
}

/**
 * Restauration d'une sauvegarde : date, contenu, ce qui va changer, puis « Restaurer ». Une
 * sauvegarde d'un autre compte (autre PC, ancien mot de passe) demande son mot de passe.
 */
export function RestoreDialog({ backup, newAccount = false, onClose }: RestoreDialogProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [needsPassword, setNeedsPassword] = useState(newAccount);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordId = useId();
  const errorId = useId();

  // Même compte : le contenu s'affiche tout de suite, avec la clé du compte ouvert.
  useEffect(() => {
    if (newAccount) return;
    backupsApi
      .preview(backup.path)
      .then((p) => {
        if (p) setPreview(p);
        else setNeedsPassword(true);
      })
      .catch((e: VaultError) => setError(vaultErrorMessage(e)));
  }, [backup.path, newAccount]);

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await backupsApi.preview(backup.path, password));
    } catch (err) {
      setError(vaultErrorMessage(err as VaultError));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      await backupsApi.restore(backup.path, needsPassword ? password : undefined);
      try {
        window.sessionStorage.setItem(RESTORED_FLAG, "1");
      } catch {
        // Stockage indisponible : pas de message après le rechargement.
      }
      // Tout se recharge sur les données restaurées.
      window.location.reload();
    } catch (err) {
      setError(vaultErrorMessage(err as VaultError));
      setBusy(false);
    }
  };

  const consequence = newAccount
    ? tr("Le compte de la sauvegarde s'ouvre sur ce PC, avec son mot de passe et sa clé de récupération.")
    : needsPassword
      ? tr("Cette sauvegarde vient d'un autre compte. Elle remplace le compte actuel, avec son mot de passe et sa clé de récupération. Les données actuelles sont d'abord sauvegardées.")
      : tr("Les données actuelles sont remplacées. Elles sont d'abord sauvegardées (« Avant restauration »).");

  return (
    <Dialog title={tr("Restaurer une sauvegarde")} onClose={onClose}>
      <div className="settings-form">
        <div className="restore-summary">
          <span className="restore-date">{backupDate(backup)}</span>
          <span className="restore-origin">
            {ORIGIN_LABELS[backup.origin]}
            {backup.external ? tr(" · destination externe") : ""}{tr(" · version {version}", { version: backup.appVersion })}
          </span>
          {preview ? (
            <span className="restore-content">{previewText(preview)}</span>
          ) : (
            !needsPassword && !error && <span className="restore-content">{tr("Lecture du contenu…")}</span>
          )}
        </div>

        {needsPassword && !preview && (
          <form onSubmit={(e) => void unlock(e)} noValidate className="restore-password">
            <PasswordField
              id={passwordId}
              label={tr("Mot de passe de la sauvegarde")}
              value={password}
              onChange={(v) => {
                setPassword(v);
                setError(null);
              }}
              autoComplete="current-password"
              autoFocus
              invalid={Boolean(error)}
              describedBy={error ? errorId : undefined}
            />
            <div className="onb-actions">
              <button type="submit" className="btn-glass" disabled={!password || busy}>
                {tr("Afficher le contenu")}
              </button>
            </div>
          </form>
        )}

        <p className="settings-intro">
          <Sentences text={consequence} />
        </p>

        {error && (
          <p id={errorId} className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose} disabled={busy}>
            {tr("Annuler")}
          </button>
          <button type="button" className="btn-gel" disabled={busy || !preview} onClick={() => void restore()}>
            {tr("Restaurer")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
