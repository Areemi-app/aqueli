import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import logo from "../assets/aqueli-logo-256.png";
import { APP_EVENTS, onAppEvent, startedHidden } from "../app/background";
import { Icon } from "../components/Icon";
import { LanguagePicker } from "../components/LanguagePicker";
import { ICONS } from "../components/icons";
import { PasswordField } from "../components/PasswordField";
import { StrengthMeter } from "../components/StrengthMeter";
import { greeting } from "../lib/dates";
import { useNow } from "../lib/useNow";
import { usePreferences } from "../prefs/PreferencesProvider";
import type { VaultError } from "../vault/api";
import { errorWaitSeconds, formatWait, vaultErrorMessage } from "../vault/messages";
import { passwordStrength } from "../vault/password";
import { formatRecoveryInput, isCompleteRecoveryKey } from "../vault/recoveryKey";
import { useVault } from "../vault/VaultProvider";
import { FullWindow } from "./FullWindow";
import { AccountSwitcher } from "../accounts/AccountSwitcher";
import { AvatarImage, initialOf } from "../accounts/AvatarImage";
import { avatarById } from "../accounts/avatars";
import { locale, tr } from "../i18n/i18n";

const CLOCK = new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });

/** Compte à rebours après trop d'essais ratés. */
function useWait(initialSeconds: number) {
  const [until, setUntil] = useState(() => (initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : 0));
  const [left, setLeft] = useState(initialSeconds);
  useEffect(() => {
    if (until === 0) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(seconds);
      if (seconds === 0) setUntil(0);
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [until]);
  return {
    left,
    start: (seconds: number) => {
      if (seconds > 0) setUntil(Date.now() + seconds * 1000);
    },
  };
}

function PasswordForm({ onForgot }: { onForgot: () => void }) {
  const { unlock, unlockWithHello, hello, lockReason, initialWaitSeconds } = useVault();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<VaultError | null>(null);
  const [busy, setBusy] = useState(false);
  const [helloBusy, setHelloBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const wait = useWait(initialWaitSeconds);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoPrompted = useRef(false);
  const errorId = useId();
  const blocked = wait.left > 0;
  const helloReady = hello.enabled && hello.ready;

  const tryHello = async () => {
    if (helloBusy || blocked) return;
    setHelloBusy(true);
    setError(null);
    try {
      await unlockWithHello();
    } catch (err) {
      const vaultError = err as VaultError;
      // Une vérification annulée n'est pas une erreur : le mot de passe reste disponible.
      if (vaultError.code !== "helloCancelled") setError(vaultError);
      wait.start(errorWaitSeconds(vaultError));
      setHelloBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  // À l'ouverture d'Aqueli, Windows Hello est proposé tout de suite s'il est utilisable
  // (pas au démarrage discret de Windows : aucune fenêtre n'est affichée).
  useEffect(() => {
    if (helloReady && lockReason === "demarrage" && !autoPrompted.current && !blocked) {
      autoPrompted.current = true;
      void startedHidden().then((hidden) => {
        if (!hidden) void tryHello();
      });
    }
  }, [helloReady, lockReason]);

  // Fenêtre ramenée (icône près de l'horloge, notification) : Windows Hello est proposé.
  const helloRef = useRef({ ready: helloReady, blocked, tryHello });
  helloRef.current = { ready: helloReady, blocked, tryHello };
  useEffect(
    () =>
      onAppEvent(APP_EVENTS.shown, () => {
        const h = helloRef.current;
        if (h.ready && !h.blocked) void h.tryHello();
      }),
    [],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy || blocked) return;
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
    } catch (err) {
      const vaultError = err as VaultError;
      setError(vaultError);
      wait.start(errorWaitSeconds(vaultError));
      setPassword("");
      setShake((n) => n + 1);
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <form className="lock-form" onSubmit={submit} noValidate>
      {helloReady && (
        <>
          <button
            type="button"
            className="btn-gel lock-hello"
            data-sans-son
            onClick={() => void tryHello()}
            disabled={helloBusy || blocked}
          >
            {helloBusy ? <span className="spinner" aria-hidden="true" /> : <Icon d={ICONS.faceId} size={22} />}
            {tr("Déverrouiller avec Windows Hello")}
          </button>
          <div className="lock-or" aria-hidden="true">
            <span />
            {tr("ou")}
            <span />
          </div>
        </>
      )}
      <div className="lock-field-row">
        <PasswordField
          id="mot-de-passe"
          label={tr("Mot de passe")}
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (error?.code === "wrongPassword" && !blocked) setError(null);
          }}
          autoComplete="current-password"
          autoFocus={!helloReady}
          disabled={busy}
          invalid={error !== null && error.code !== "helloFailed"}
          describedBy={error ? errorId : undefined}
          inputRef={inputRef}
        />
        <button
          type="submit"
          data-sans-son
          className={helloReady ? "lock-submit lock-submit--secondary" : "lock-submit btn-gel"}
          aria-label={tr("Déverrouiller")}
          title={tr("Déverrouiller (Entrée)")}
          disabled={!password || busy || blocked}
        >
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon d={ICONS.arrowRight} size={18} stroke={2.6} />}
        </button>
      </div>
      {error && (
        <p key={shake} id={errorId} className="form-error form-error--shake" role="alert">
          {blocked ? tr("Trop de tentatives. Réessayez dans {formatWait}.", { formatWait: formatWait(wait.left) }) : vaultErrorMessage(error)}
        </p>
      )}
      {!error && blocked && (
        <p className="form-error" role="alert">
          {tr("Trop de tentatives. Réessayez dans {wait}.", { wait: formatWait(wait.left) })}
        </p>
      )}
      {hello.enabled && !hello.ready && !error && (
        <p className="lock-hint">{tr("Mot de passe requis pour cette session Windows.")}</p>
      )}
      <button type="button" className="link-btn lock-link" onClick={onForgot}>
        {tr("Mot de passe oublié ?")}
      </button>
    </form>
  );
}

function RecoveryForm({ onBack }: { onBack: () => void }) {
  const { recover } = useVault();
  const [key, setKey] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<VaultError | null>(null);
  const [busy, setBusy] = useState(false);
  const wait = useWait(0);
  const keyId = useId();
  const errorId = useId();
  const strengthId = useId();
  const strength = passwordStrength(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = isCompleteRecoveryKey(key) && strength.acceptable && confirm === password && wait.left === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await recover(key, password);
    } catch (err) {
      const vaultError = err as VaultError;
      setError(vaultError);
      wait.start(errorWaitSeconds(vaultError));
      setBusy(false);
    }
  };

  return (
    <form className="lock-form" onSubmit={submit} noValidate>
      <p className="lock-hint">
        {tr("Saisissez votre clé de récupération et choisissez un nouveau mot de passe.")}
      </p>
      <div className="field">
        <label htmlFor={keyId} className="field-label">
          {tr("Clé de récupération")}
        </label>
        <div className="field-box" data-invalid={error?.code.includes("Recovery") || undefined}>
          <input
            id={keyId}
            className="field-input field-input--code"
            value={key}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            onChange={(e) => setKey(formatRecoveryInput(e.target.value))}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
      </div>
      <PasswordField
        id="nouveau-mot-de-passe"
        label={tr("Nouveau mot de passe")}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        disabled={busy}
        describedBy={strengthId}
      />
      <StrengthMeter strength={strength} id={strengthId} />
      <PasswordField
        id="confirmer-mot-de-passe"
        label={tr("Confirmer le mot de passe")}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={busy}
        invalid={mismatch}
      />
      {mismatch && <p className="field-note">{tr("Les mots de passe ne correspondent pas.")}</p>}
      {error && (
        <p id={errorId} className="form-error" role="alert">
          {wait.left > 0 ? tr("Réessayez dans {formatWait}.", { formatWait: formatWait(wait.left) }) : vaultErrorMessage(error)}
        </p>
      )}
      <div className="onb-actions">
        <button type="button" className="btn-glass" onClick={onBack} disabled={busy}>
          {tr("Retour")}
        </button>
        <button type="submit" className="btn-gel" disabled={!ready || busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {tr("Déverrouiller")}
        </button>
      </div>
    </form>
  );
}

/**
 * Écran de verrouillage (maquette Verrouillage.dc.html) : aucune donnée du compte visible. Avec un
 * pseudo (Paramètres › Sécurité), son image de profil (ou une bulle à son initiale) et un accueil
 * selon l'heure. En bas, les autres comptes de ce PC et « Ajouter un compte ».
 */
export function LockScreen() {
  const { lockReason, autoLockMinutes, hello } = useVault();
  const { prefs } = usePreferences();
  const [mode, setMode] = useState<"mot-de-passe" | "recuperation">("mot-de-passe");
  const now = useNow();
  const name = prefs.displayName;

  const footer = (
    <div className="lock-footer">
      <Icon d={ICONS.lock} size={14} stroke={2.2} />
      <span>
        {lockReason === "auto"
          ? tr("Verrouillé après {autoLockMinutes} min d'inactivité · données chiffrées", { autoLockMinutes })
          : lockReason === "systeme"
            ? tr("Verrouillé avec Windows · données chiffrées")
            : tr("Données chiffrées")}
      </span>
      <LanguagePicker className="lock-language" />
    </div>
  );

  return (
    <FullWindow footer={footer}>
      <div className="lock-stack">
        <section className="lock-card" aria-labelledby="titre-verrouillage">
          {avatarById(prefs.avatar) ? (
            <div className="lock-avatar lock-avatar--image" aria-hidden="true">
              <AvatarImage avatar={prefs.avatar} name={name} size={96} />
              <img className="lock-avatar-badge" src={logo} alt="" draggable={false} />
            </div>
          ) : name ? (
            <div className="lock-avatar" aria-hidden="true">
              <span className="lock-avatar-initial">{initialOf(name)}</span>
              <img className="lock-avatar-badge" src={logo} alt="" draggable={false} />
            </div>
          ) : (
            <img className="lock-logo" src={logo} alt={tr("Logo Aqueli")} draggable={false} />
          )}
          <div className="lock-title">
            <h1 id="titre-verrouillage">{name && mode === "mot-de-passe" ? greeting(now, name) : "Aqueli"}</h1>
            <p>
              {mode === "mot-de-passe"
                ? hello.enabled && hello.ready
                  ? tr("Verrouillé.")
                  : tr("Saisissez votre mot de passe.")
                : tr("Récupération du compte")}
            </p>
          </div>
          {mode === "mot-de-passe" ? (
            <PasswordForm onForgot={() => setMode("recuperation")} />
          ) : (
            <RecoveryForm onBack={() => setMode("mot-de-passe")} />
          )}
        </section>
        {mode === "mot-de-passe" && <AccountSwitcher />}
        {mode === "mot-de-passe" && (
          <div className="lock-clock" aria-hidden="true">
            <span className="lock-time">{CLOCK.format(now)}</span>
            <span className="lock-day">{DAY.format(now)}</span>
          </div>
        )}
      </div>
    </FullWindow>
  );
}
