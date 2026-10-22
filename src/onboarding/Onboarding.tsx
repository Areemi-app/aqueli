import { useId, useState, type FormEvent } from "react";
import { backupsApi, type BackupInfo } from "../backups/backupsApi";
import { RestoreDialog } from "../backups/RestoreDialog";
import logo from "../assets/aqueli-logo-256.png";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { PasswordField } from "../components/PasswordField";
import { planWelcomeTour } from "../tour/tourRequest";
import { StrengthMeter } from "../components/StrengthMeter";
import { ThemeGallery } from "../components/ThemeGallery";
import { FullWindow } from "../lock/FullWindow";
import type { VaultError } from "../vault/api";
import { vaultErrorMessage } from "../vault/messages";
import { passwordStrength } from "../vault/password";
import { RecoveryKeyPanel } from "../vault/RecoveryKeyPanel";
import { useVault } from "../vault/VaultProvider";
import { cleanDisplayName, MAX_DISPLAY_NAME, usePreferences } from "../prefs/PreferencesProvider";
import { LanguagePicker } from "../components/LanguagePicker";
import { flushPrefs } from "../lib/storage";
import { tr } from "../i18n/i18n";
import { accountsApi } from "../accounts/accountsApi";
import { openAccount, useAccounts } from "../accounts/AccountSwitcher";
import { AvatarImage } from "../accounts/AvatarImage";
import { AvatarPicker } from "../accounts/AvatarPicker";
import { randomAvatarId } from "../accounts/avatars";
import { Sentences } from "../components/Sentences";

type Step = "bienvenue" | "mot-de-passe" | "cle" | "windows-hello" | "theme";
const ALL_STEPS: readonly Step[] = ["bienvenue", "mot-de-passe", "cle", "windows-hello", "theme"];
const TITLES: Record<Step, string> = {
  bienvenue: tr("Bienvenue dans Aqueli"),
  "mot-de-passe": tr("Votre compte"),
  cle: tr("Clé de récupération"),
  "windows-hello": "Windows Hello",
  theme: tr("Thème"),
};

function StepDots({ step, steps }: { step: Step; steps: readonly Step[] }) {
  const index = steps.indexOf(step);
  return (
    <div className="onb-dots" role="img" aria-label={tr("Étape {x} sur {length}", { x: index + 1, length: steps.length })}>
      {steps.map((s, i) => (
        <span key={s} className="onb-dot" data-state={i < index ? "fait" : i === index ? "actuel" : undefined} />
      ))}
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const [backup, setBackup] = useState<BackupInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Compte ajouté à un PC qui en a déjà : on peut revenir aux autres comptes.
  const accounts = useAccounts();
  const added = (accounts ?? []).some((a) => !a.current);
  const back = async () => {
    setError(null);
    const failed = await openAccount(accountsApi.cancelNew);
    if (failed) setError(failed);
  };
  // Nouveau PC : le compte revient d'une sauvegarde (clé USB, export).
  const restore = async () => {
    setError(null);
    try {
      const picked = await backupsApi.pickFile();
      if (picked) setBackup(picked);
    } catch (e) {
      setError(vaultErrorMessage(e as VaultError));
    }
  };
  return (
    <>
      <img className="onb-logo" src={logo} alt="" draggable={false} />
      <p className="onb-text">
        {tr("Tâches, agenda, obligations et notes réunis dans une seule application. Vos données sont chiffrées et restent sur ce PC.")}
      </p>
      <div className="onb-actions onb-actions--center">
        <button type="button" className="btn-gel" onClick={onNext} autoFocus>
          {tr("Commencer")}
        </button>
      </div>
      <button type="button" className="link-btn onb-restore" onClick={() => void restore()}>
        {tr("Restaurer une sauvegarde")}
      </button>
      {added && (
        <button type="button" className="link-btn onb-restore" onClick={() => void back()}>
          {tr("Revenir aux comptes de ce PC")}
        </button>
      )}
      <div className="onb-language">
        <LanguagePicker />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {backup && <RestoreDialog backup={backup} newAccount onClose={() => setBackup(null)} />}
    </>
  );
}

function CreatePassword({ onBack, onCreated }: { onBack: () => void; onCreated: (key: string) => void }) {
  const { create } = useVault();
  const { setPref } = usePreferences();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(randomAvatarId);
  const [picking, setPicking] = useState(false);
  const [nameMissing, setNameMissing] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<VaultError | null>(null);
  const [busy, setBusy] = useState(false);
  const strengthId = useId();
  const errorId = useId();
  const nameId = useId();
  const nameNoteId = useId();
  const strength = passwordStrength(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = strength.acceptable && confirm === password && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pseudo = cleanDisplayName(name);
    setNameMissing(!pseudo);
    if (!ready || !pseudo) return;
    setBusy(true);
    setError(null);
    try {
      // Pseudo enregistré avant le coffre : le cœur nomme d'après lui le dossier d'import du compte.
      setPref("displayName", pseudo);
      setPref("avatar", avatar);
      await flushPrefs();
      const key = await create(password);
      onCreated(key);
    } catch (err) {
      setError(err as VaultError);
      setBusy(false);
    }
  };

  return (
    <form className="onb-form" onSubmit={submit} noValidate>
      <div className="onb-profile">
        <button type="button" className="profile-avatar" onClick={() => setPicking(true)} title={tr("Changer l'image")} disabled={busy}>
          <AvatarImage avatar={avatar} name={name} size={64} />
          <span className="profile-avatar-edit" aria-hidden="true">
            <Icon d={ICONS.pencil} size={12} stroke={2.6} />
          </span>
          <span className="sr-only">{tr("Changer l'image")}</span>
        </button>
        <div className="field">
          <label htmlFor={nameId} className="field-label">
            {tr("Pseudo")}
          </label>
          <div className="field-box" data-invalid={nameMissing || undefined}>
            <input
              id={nameId}
              className="field-input"
              value={name}
              maxLength={MAX_DISPLAY_NAME}
              autoComplete="nickname"
              autoFocus
              disabled={busy}
              aria-describedby={nameNoteId}
              aria-invalid={nameMissing || undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (nameMissing && cleanDisplayName(e.target.value)) setNameMissing(false);
              }}
            />
          </div>
          <p id={nameNoteId} className={nameMissing ? "form-error" : "field-note"}>
            {nameMissing ? tr("Saisissez un pseudo.") : tr("Affiché sur l'écran de verrouillage, sans mot de passe.")}
          </p>
        </div>
      </div>
      {picking && (
        <AvatarPicker
          value={avatar}
          name={name}
          onClose={() => setPicking(false)}
          onChoose={(chosen) => {
            setAvatar(chosen);
            setPicking(false);
          }}
        />
      )}
      <p className="onb-text">
        {tr("Ce mot de passe sera demandé à chaque ouverture d'Aqueli.")}
      </p>
      <PasswordField
        id="nouveau-mot-de-passe"
        label={tr("Mot de passe")}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        disabled={busy}
        describedBy={strengthId}
      />
      <StrengthMeter strength={strength} id={strengthId} />
      <PasswordField
        id="confirmation-mot-de-passe"
        label={tr("Confirmer le mot de passe")}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={busy}
        invalid={mismatch}
      />
      {mismatch && <p className="field-note">{tr("Les mots de passe ne correspondent pas.")}</p>}
      <p className="notice onb-recovery-note">
        <Icon d={ICONS.key} size={16} stroke={2.2} />
        <span>
          <Sentences text={tr("Aucune adresse e-mail n'est demandée. En cas d'oubli du mot de passe, seule la clé de récupération, donnée à l'étape suivante, permet de rouvrir le compte.")} />
        </span>
      </p>
      {error && (
        <p id={errorId} className="form-error" role="alert">
          {vaultErrorMessage(error)}
        </p>
      )}
      <div className="onb-actions">
        <button type="button" className="btn-glass" onClick={onBack} disabled={busy}>
          {tr("Retour")}
        </button>
        <button type="submit" className="btn-gel" disabled={!ready}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? tr("Création…") : tr("Créer le compte")}
        </button>
      </div>
    </form>
  );
}

function HelloStep({ onDone }: { onDone: () => void }) {
  const { enableHello } = useVault();
  const [error, setError] = useState<VaultError | null>(null);
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      await enableHello();
      onDone();
    } catch (err) {
      const vaultError = err as VaultError;
      if (vaultError.code !== "helloCancelled") setError(vaultError);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hello-intro" aria-hidden="true">
        <Icon d={ICONS.faceId} size={72} stroke={1.6} />
      </div>
      <p className="onb-text">
        {tr("Déverrouillez Aqueli avec votre visage, votre empreinte ou votre code PIN. Le mot de passe reste demandé à chaque nouvelle session Windows.")}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {vaultErrorMessage(error)}
        </p>
      )}
      <div className="onb-actions">
        <button type="button" className="btn-glass" onClick={onDone} disabled={busy}>
          {tr("Plus tard")}
        </button>
        <button type="button" className="btn-gel" onClick={() => void activate()} disabled={busy} autoFocus>
          {busy && <span className="spinner" aria-hidden="true" />}
          {tr("Activer Windows Hello")}
        </button>
      </div>
    </>
  );
}

/** Assistant du premier lancement. */
export function Onboarding() {
  const { finishOnboarding, setRecoveryKeyVerified, hello } = useVault();
  // L'étape Windows Hello n'apparaît que si le PC est équipé.
  const steps = ALL_STEPS.filter((s) => s !== "windows-hello" || hello.supported === true);
  const [step, setStep] = useState<Step>("bienvenue");
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  return (
    <FullWindow>
      <section className="lock-card onb-card" aria-labelledby="titre-assistant">
        <StepDots step={step} steps={steps} />
        <h1 id="titre-assistant" className="onb-title">
          {TITLES[step]}
        </h1>
        {step === "bienvenue" && <Welcome onNext={() => setStep("mot-de-passe")} />}
        {step === "mot-de-passe" && (
          <CreatePassword
            onBack={() => setStep("bienvenue")}
            onCreated={(key) => {
              setRecoveryKey(key);
              setStep("cle");
            }}
          />
        )}
        {step === "cle" && recoveryKey && (
          <RecoveryKeyPanel
            recoveryKey={recoveryKey}
            onVerified={() => {
              setRecoveryKeyVerified(true);
              // La clé n'est plus gardée nulle part, même pas dans l'interface.
              setRecoveryKey(null);
              setStep(hello.supported ? "windows-hello" : "theme");
            }}
          />
        )}
        {step === "windows-hello" && <HelloStep onDone={() => setStep("theme")} />}
        {step === "theme" && (
          <>
            <p className="onb-text">{tr("Modifiable à tout moment dans Paramètres › Apparence.")}</p>
            <ThemeGallery only={["aqua", "minuit"]} />
            <div className="onb-actions">
              <button
                type="button"
                className="btn-gel"
                data-sans-son
                onClick={() => {
                  planWelcomeTour();
                  finishOnboarding();
                }}
              >
                {tr("Terminer")}
              </button>
            </div>
          </>
        )}
      </section>
    </FullWindow>
  );
}
