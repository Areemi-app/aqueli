/**
 * Paramètres › Sauvegardes › Emplacement des données (cahier des charges § 9) : le dossier où
 * vivent les données, à déplacer vers un autre disque ou à ramener au dossier d'origine.
 * Mot de passe exigé ; Aqueli redémarre ensuite sur le nouvel emplacement.
 */
import { useEffect, useId, useState, type FormEvent } from "react";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { PasswordField } from "../components/PasswordField";
import { stopSavingPrefs } from "../lib/storage";
import { vaultApi, type DataPlace, type VaultError } from "../vault/api";
import { vaultErrorMessage } from "../vault/messages";
import { tr } from "../i18n/i18n";

/** Emplacement des données, lu une fois. */
export function useDataPlace(): DataPlace | null {
  const [place, setPlace] = useState<DataPlace | null>(null);
  useEffect(() => {
    let alive = true;
    vaultApi
      .dataLocation()
      .then((p) => alive && setPlace(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return place;
}

function MoveDialog({ toDefault, onClose }: { toDefault: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<VaultError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const ids = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const path = await vaultApi.moveData(password, toDefault);
      if (path) {
        // Les réglages vivent désormais au nouvel emplacement : plus rien n'est écrit à l'ancien.
        stopSavingPrefs();
        setDone(path);
      }
    } catch (err) {
      setError(err as VaultError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={toDefault ? tr("Revenir au dossier d'origine") : tr("Déplacer les données")} onClose={done ? () => undefined : onClose} closeOnOutside={!busy && !done}>
      {done ? (
        <div className="settings-form">
          <p className="notice notice--ok">
            <Icon d={ICONS.check} size={16} stroke={2.4} />
            {tr("Données déplacées.")}
          </p>
          <p className="data-path">{done}</p>
          <p className="onb-text">{tr("Aqueli redémarre. Le mot de passe sera demandé.")}</p>
        </div>
      ) : (
        <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
          <p className="onb-text">
            {toDefault
              ? tr("Les données reviennent dans le dossier d'origine de ce PC (%APPDATA%\\Aqueli).")
              : tr("Les données sont copiées dans le dossier choisi, puis vérifiées. Elles sont ensuite effacées de l'emplacement actuel.")}{" "}
            {tr("Aqueli redémarre ensuite.")}
          </p>
          {!toDefault && (
            <p className="notice notice--warn">
              <Icon d={ICONS.warning} size={16} stroke={2.2} />
              {tr("Le disque choisi doit rester branché : sans lui, Aqueli ne peut pas s'ouvrir.")}
            </p>
          )}
          <PasswordField
            id={`${ids}-mdp`}
            label={tr("Mot de passe")}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            invalid={error !== null}
            describedBy={error ? `${ids}-erreur` : undefined}
          />
          {error && (
            <p id={`${ids}-erreur`} className="form-error" role="alert">
              {vaultErrorMessage(error)}
            </p>
          )}
          <div className="onb-actions">
            <button type="button" className="btn-glass" onClick={onClose} disabled={busy}>
              {tr("Annuler")}
            </button>
            <button type="submit" className="btn-gel" disabled={!password || busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {toDefault ? tr("Ramener les données") : tr("Choisir le dossier…")}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function DataLocationSection() {
  const place = useDataPlace();
  const [dialog, setDialog] = useState<"choisir" | "origine" | null>(null);
  if (!place) return null;

  return (
    <>
      <h2 className="settings-heading">{tr("Emplacement des données")}</h2>
      <div className="settings-card glass">
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Dossier des données")}</span>
            <span className="setting-desc data-path">{place.path}</span>
            {!place.movable && <span className="setting-desc">{tr("Déplacement indisponible dans cette version.")}</span>}
          </div>
          <div className="data-place-actions">
            {place.moved && (
              <button type="button" className="btn-glass btn-glass--sm" disabled={!place.movable} onClick={() => setDialog("origine")}>
                {tr("Revenir au dossier d'origine…")}
              </button>
            )}
            <button type="button" className="btn-glass btn-glass--sm" disabled={!place.movable} onClick={() => setDialog("choisir")}>
              <Icon d={ICONS.folder} size={14} stroke={2.2} />
              {tr("Déplacer…")}
            </button>
          </div>
        </div>
      </div>
      {dialog && <MoveDialog toDefault={dialog === "origine"} onClose={() => setDialog(null)} />}
    </>
  );
}
