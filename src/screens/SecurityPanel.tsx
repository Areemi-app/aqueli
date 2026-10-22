import { useId, useState, type FormEvent } from "react";
import { useToast } from "../app/ToastProvider";
import { usePreferences, useShortcut } from "../prefs/PreferencesProvider";
import { AccountsSection, ProfileSection } from "../accounts/AccountsSection";
import { Dialog } from "../components/Dialog";
import { SecurityLogSection } from "../security/SecurityLogSection";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { useDataPlace } from "../backups/DataLocationSection";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { PasswordField } from "../components/PasswordField";
import { StrengthMeter } from "../components/StrengthMeter";
import { SwitchRow } from "../components/Switch";
import type { VaultError } from "../vault/api";
import { vaultErrorMessage } from "../vault/messages";
import { passwordStrength } from "../vault/password";
import { RecoveryKeyPanel } from "../vault/RecoveryKeyPanel";
import { AUTO_LOCK_CHOICES, useVault, type AutoLockMinutes } from "../vault/VaultProvider";
import { Select } from "../components/Select";
import { tr } from "../i18n/i18n";

function AutoLockSetting() {
  const { autoLockMinutes, setAutoLockMinutes } = useVault();
  const lockKeys = useShortcut("lock");
  const id = useId();
  return (
    <div className="setting-row">
      <div className="setting-text">
        <label htmlFor={id} className="setting-label">
          {tr("Verrouiller automatiquement après")}
        </label>
        <span className="setting-desc">{tr("Délai d'inactivité. {keys} verrouille immédiatement.", { keys: lockKeys })}</span>
      </div>
      <Select
        id={id}
        value={String(autoLockMinutes)}
        options={AUTO_LOCK_CHOICES.map((m) => ({ value: String(m), label: `${m} min` }))}
        onChange={(v) => setAutoLockMinutes(Number(v) as AutoLockMinutes)}
      />
    </div>
  );
}

function HelloSetting() {
  const { hello, enableHello, disableHello } = useVault();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<VaultError | null>(null);
  const unsupported = hello.supported === false;

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (on) {
        await enableHello();
        notify(tr("Windows Hello activé."));
      } else {
        await disableHello();
        notify(tr("Windows Hello désactivé."));
      }
    } catch (err) {
      const vaultError = err as VaultError;
      if (vaultError.code !== "helloCancelled") setError(vaultError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SwitchRow
        label={tr("Déverrouiller avec Windows Hello")}
        description={tr("Visage, empreinte ou code PIN. Le mot de passe reste demandé à chaque nouvelle session Windows.")}
        checked={hello.enabled}
        onChange={(on) => void toggle(on)}
        disabled={busy || unsupported}
        note={unsupported ? tr("Windows Hello n'est pas configuré sur ce PC.") : undefined}
      />
      {error && (
        <p className="form-error setting-error" role="alert">
          {vaultErrorMessage(error)}
        </p>
      )}
    </>
  );
}

function ChangePasswordForm() {
  const { changePassword } = useVault();
  const notify = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<VaultError | null>(null);
  const [busy, setBusy] = useState(false);
  const strengthId = useId();
  const errorId = useId();
  const strength = passwordStrength(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current.length > 0 && strength.acceptable && confirm === next && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      notify(tr("Mot de passe modifié."));
    } catch (err) {
      setError(err as VaultError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings-form" onSubmit={submit} noValidate>
      <PasswordField
        id="mot-de-passe-actuel"
        label={tr("Mot de passe actuel")}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        invalid={error?.code === "wrongPassword"}
        describedBy={error ? errorId : undefined}
      />
      <PasswordField
        id="mot-de-passe-neuf"
        label={tr("Nouveau mot de passe")}
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        describedBy={strengthId}
      />
      <StrengthMeter strength={strength} id={strengthId} />
      <PasswordField
        id="mot-de-passe-neuf-confirmation"
        label={tr("Confirmer le mot de passe")}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        invalid={mismatch}
      />
      {mismatch && <p className="field-note">{tr("Les mots de passe ne correspondent pas.")}</p>}
      {error && (
        <p id={errorId} className="form-error" role="alert">
          {vaultErrorMessage(error)}
        </p>
      )}
      <div>
        <button type="submit" className="btn-gel" disabled={!ready}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {tr("Modifier le mot de passe")}
        </button>
      </div>
    </form>
  );
}

/** Nouvelle clé de récupération : mot de passe, puis affichage et vérification de la clé. */
function NewRecoveryKeyDialog({ onClose }: { onClose: () => void }) {
  const { newRecoveryKey, setRecoveryKeyVerified } = useVault();
  const notify = useToast();
  const [password, setPassword] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<VaultError | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      setKey(await newRecoveryKey(password));
      setPassword("");
    } catch (err) {
      setError(err as VaultError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={key ? tr("Votre nouvelle clé de récupération") : tr("Nouvelle clé de récupération")} onClose={onClose}>
      {key ? (
        <RecoveryKeyPanel
          recoveryKey={key}
          verifyLabel={tr("Terminer")}
          onVerified={() => {
            setRecoveryKeyVerified(true);
            notify(tr("Nouvelle clé de récupération enregistrée."));
            onClose();
          }}
        />
      ) : (
        <form className="settings-form" onSubmit={submit} noValidate>
          <p className="onb-text">
            {tr("La clé actuelle cessera de fonctionner. Saisissez votre mot de passe pour continuer.")}
          </p>
          <PasswordField
            id="mot-de-passe-nouvelle-cle"
            label={tr("Mot de passe")}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            invalid={error !== null}
            describedBy={error ? errorId : undefined}
          />
          {error && (
            <p id={errorId} className="form-error" role="alert">
              {vaultErrorMessage(error)}
            </p>
          )}
          <div className="onb-actions">
            <button type="button" className="btn-glass" onClick={onClose}>
              {tr("Annuler")}
            </button>
            <button type="submit" className="btn-gel" disabled={!password || busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {tr("Générer")}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** Mode discret : rien d'Aqueli dans les captures ni les partages d'écran. */
function DiscreetSetting() {
  const { prefs, setPref } = usePreferences();
  return (
    <SwitchRow
      label={tr("Mode discret")}
      description={tr("Masque le contenu d'Aqueli dans les captures d'écran et les partages d'écran (réunions en ligne, enregistrements).")}
      checked={prefs.discreetMode}
      onChange={(v) => setPref("discreetMode", v)}
    />
  );
}

export function SecurityPanel() {
  const dataPlace = useDataPlace();
  const { recoveryKeyVerified } = useVault();
  const [keyDialog, setKeyDialog] = useState(false);

  return (
    <>
      <ProfileSection />

      <div className="settings-section">
        <h2 className="settings-heading">{tr("Verrouillage")}</h2>
        <div className="settings-card glass">
          <AutoLockSetting />
          <HelloSetting />
        </div>
      </div>

      <AccountsSection />

      <div className="settings-section">
        <h2 className="settings-heading">{tr("Confidentialité")}</h2>
        <div className="settings-card glass">
          <DiscreetSetting />
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-heading">{tr("Mot de passe")}</h2>
        <div className="settings-card settings-card--padded glass">
          <ChangePasswordForm />
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-heading">{tr("Clé de récupération")}</h2>
        <div className="settings-card settings-card--padded glass">
          {!recoveryKeyVerified && (
            <p className="notice notice--warn">
              <Icon d={ICONS.warning} size={16} stroke={2.2} />
              {tr("Votre clé de récupération n'a pas été vérifiée.")}
            </p>
          )}
          <p className="settings-intro">{tr("Une nouvelle clé remplace la clé actuelle.")}</p>
          <div>
            <button type="button" className="btn-glass" onClick={() => setKeyDialog(true)}>
              <Icon d={ICONS.key} size={16} />
              {tr("Générer une nouvelle clé")}
            </button>
          </div>
        </div>
      </div>

      <SecurityLogSection />

      <DeleteAccountSection />

      <p className="settings-hint">{tr("Données chiffrées (AES-256) dans {path}.", { path: dataPlace?.path ?? "%APPDATA%\\Aqueli" })}</p>

      {keyDialog && <NewRecoveryKeyDialog onClose={() => setKeyDialog(false)} />}
    </>
  );
}
