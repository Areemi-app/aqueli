/**
 * Paramètres › Sécurité : profil du compte (pseudo et image, visibles sur l'écran de verrouillage)
 * et comptes de ce PC (ouvrir un autre compte, en ajouter un). Chaque compte a son mot de passe,
 * sa clé de récupération et ses données chiffrées à part.
 */
import { useEffect, useId, useState } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Sentences } from "../components/Sentences";
import { tr } from "../i18n/i18n";
import { cleanDisplayName, MAX_DISPLAY_NAME, usePreferences } from "../prefs/PreferencesProvider";
import { accountsApi } from "./accountsApi";
import { accountLabel, openAccount, useAccounts } from "./AccountSwitcher";
import { AvatarImage } from "./AvatarImage";
import { AvatarPicker } from "./AvatarPicker";

/**
 * Pseudo et image de profil, enregistrés aussitôt (le pseudo en quittant le champ). La fenêtre
 * de choix s'ouvre hors du panneau de verre, qui la rognerait.
 */
function ProfileCard({ onPick }: { onPick: () => void }) {
  const { prefs, setPref } = usePreferences();
  const id = useId();
  const [value, setValue] = useState(prefs.displayName);
  useEffect(() => setValue(prefs.displayName), [prefs.displayName]);
  const save = () => {
    const clean = cleanDisplayName(value);
    // Un pseudo ne s'efface pas : le champ vide reprend l'ancien.
    if (!clean) {
      setValue(prefs.displayName);
      return;
    }
    setValue(clean);
    if (clean !== prefs.displayName) setPref("displayName", clean);
  };
  return (
    <div className="setting-row profile-row">
      <button type="button" className="profile-avatar" onClick={onPick} title={tr("Changer l'image")}>
        <AvatarImage avatar={prefs.avatar} name={prefs.displayName} size={64} />
        <span className="profile-avatar-edit" aria-hidden="true">
          <Icon d={ICONS.pencil} size={12} stroke={2.6} />
        </span>
        <span className="sr-only">{tr("Changer l'image")}</span>
      </button>
      <div className="setting-text">
        <label htmlFor={id} className="setting-label">
          {tr("Pseudo")}
        </label>
        <span className="setting-desc">{tr("Affiché sur l'écran de verrouillage et l'Accueil, sans mot de passe.")}</span>
      </div>
      <div className="field-box setting-name">
        <input
          id={id}
          className="field-input"
          value={value}
          maxLength={MAX_DISPLAY_NAME}
          autoComplete="nickname"
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
    </div>
  );
}

/** Comptes de ce PC : celui qui est ouvert, les autres (« Ouvrir »), et « Ajouter un compte ». */
function AccountsCard() {
  const accounts = useAccounts();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (key: string, run: () => Promise<void>) => {
    if (opening) return;
    setError(null);
    setOpening(key);
    const failed = await openAccount(run);
    if (failed) {
      setError(failed);
      setOpening(null);
    }
  };
  return (
    <>
      {(accounts ?? []).map((a) => (
        <div key={a.id} className="setting-row account-row">
          <AvatarImage avatar={a.avatar} name={a.name} size={36} />
          <div className="setting-text">
            <span className="setting-label">{accountLabel(a)}</span>
            {a.current && <span className="setting-desc">{tr("Compte ouvert")}</span>}
            {!a.current && !a.ready && <span className="setting-desc">{tr("Création non terminée")}</span>}
          </div>
          {!a.current && (
            <button type="button" className="btn-glass btn-glass--sm" disabled={opening !== null} onClick={() => void go(a.id, () => accountsApi.switchTo(a.id))}>
              {opening === a.id && <span className="spinner" aria-hidden="true" />}
              {tr("Ouvrir")}
            </button>
          )}
        </div>
      ))}
      <div className="setting-row">
        <div className="setting-text">
          <span className="setting-label">{tr("Ajouter un compte")}</span>
          <span className="setting-desc">{tr("Un compte par personne, avec son mot de passe et ses données à part.")}</span>
        </div>
        <button type="button" className="btn-glass btn-glass--sm" disabled={opening !== null} onClick={() => void go("nouveau", accountsApi.add)}>
          {opening === "nouveau" ? <span className="spinner" aria-hidden="true" /> : <Icon d={ICONS.plus} size={14} stroke={2.6} />}
          {tr("Ajouter un compte")}
        </button>
      </div>
      {opening && (
        <p className="setting-row setting-desc" role="status">
          {tr("Aqueli se verrouille, puis s'ouvre sur l'autre compte.")}
        </p>
      )}
      {error && (
        <p className="setting-row form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function ProfileSection() {
  const { prefs, setPref } = usePreferences();
  const [picking, setPicking] = useState(false);
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Profil")}</h2>
      <div className="settings-card glass">
        <ProfileCard onPick={() => setPicking(true)} />
      </div>
      {picking && (
        <AvatarPicker
          value={prefs.avatar}
          name={prefs.displayName}
          onClose={() => setPicking(false)}
          onChoose={(avatar) => {
            setPref("avatar", avatar);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

export function AccountsSection() {
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Comptes de ce PC")}</h2>
      <div className="settings-card glass">
        <AccountsCard />
      </div>
      <p className="settings-hint">
        <Sentences text={tr("Aqueli n'utilise ni adresse e-mail ni service en ligne. Si le mot de passe est oublié, seule la clé de récupération du compte permet de le rouvrir. Sans elle, ses données restent illisibles.")} />
      </p>
    </div>
  );
}
