import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { APP_EVENTS, onAppEvent } from "../app/background";
import { onActivityElsewhere } from "../notes/noteWindows";
import { flushBeforeLock } from "../lib/beforeLock";
import { clearUndo } from "../app/undo";
import { readPref, writePref } from "../lib/storage";
import { useSound } from "../sound/SoundProvider";
import { inTauri } from "../lib/windowControls";
import { asVaultError, vaultApi, type VaultError } from "./api";
import { localizeDefaults } from "../i18n/defaults";

/**
 * - « chargement » : on interroge le coffre au démarrage ;
 * - « nouveau » : aucun coffre, l'assistant de premier lancement s'affiche ;
 * - « verrouille » : écran de verrouillage ;
 * - « ouvert » : l'application ;
 * - « erreur » : fichiers du coffre illisibles.
 */
export type VaultPhase = "chargement" | "nouveau" | "verrouille" | "ouvert" | "erreur";
/** « systeme » : verrouillage de Windows (Win+L) ou mise en veille. */
export type LockReason = "demarrage" | "manuel" | "auto" | "systeme";

export interface HelloState {
  /** Windows Hello est activé pour Aqueli. */
  enabled: boolean;
  /** Utilisable maintenant : le mot de passe a déjà été saisi dans cette session Windows. */
  ready: boolean;
  /** Windows Hello est configuré sur ce PC (null tant que ce n'est pas vérifié). */
  supported: boolean | null;
}

/** Événement envoyé par le cœur quand Windows se verrouille ou se met en veille. */
const SYSTEM_LOCK_EVENT = "verrouillage-systeme";

export const AUTO_LOCK_CHOICES = [1, 5, 10, 15, 30, 60] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_CHOICES)[number];
const DEFAULT_AUTO_LOCK: AutoLockMinutes = 10;

function isAutoLock(value: unknown): value is AutoLockMinutes {
  return AUTO_LOCK_CHOICES.includes(value as AutoLockMinutes);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

interface VaultContextValue {
  phase: VaultPhase;
  loadError: VaultError | null;
  lockReason: LockReason;
  /** Attente imposée au démarrage (essais ratés avant la dernière fermeture). */
  initialWaitSeconds: number;
  autoLockMinutes: AutoLockMinutes;
  setAutoLockMinutes: (minutes: AutoLockMinutes) => void;
  /** Vrai une fois que la clé de récupération a été recopiée et vérifiée. */
  recoveryKeyVerified: boolean;
  setRecoveryKeyVerified: (verified: boolean) => void;
  create: (password: string) => Promise<string>;
  finishOnboarding: () => void;
  unlock: (password: string) => Promise<void>;
  recover: (recoveryKey: string, newPassword: string) => Promise<void>;
  changePassword: (current: string, newPassword: string) => Promise<void>;
  newRecoveryKey: (password: string) => Promise<string>;
  hello: HelloState;
  enableHello: () => Promise<void>;
  disableHello: () => Promise<void>;
  unlockWithHello: () => Promise<void>;
  lock: (reason: LockReason) => Promise<void>;
  retry: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

/** Les appels au coffre renvoient toujours une erreur lisible (VaultError). */
async function guarded<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    throw asVaultError(e);
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<VaultPhase>("chargement");
  const [loadError, setLoadError] = useState<VaultError | null>(null);
  const [lockReason, setLockReason] = useState<LockReason>("demarrage");
  const [initialWaitSeconds, setInitialWait] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [autoLockMinutes, setAutoLock] = useState<AutoLockMinutes>(() =>
    readPref("verrouillageAuto", DEFAULT_AUTO_LOCK, isAutoLock),
  );
  const [recoveryKeyVerified, setVerified] = useState(() => readPref("cleVerifiee", false, isBoolean));
  const { play } = useSound();
  const [hello, setHello] = useState<HelloState>({ enabled: false, ready: false, supported: null });
  // Vrai dès qu'un coffre existe (utile pendant l'assistant de premier lancement).
  const exists = useRef(false);
  // Dernière version de « lock », pour les événements du cœur.
  const lockRef = useRef<(reason: LockReason) => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    guarded(vaultApi.status())
      .then((status) => {
        if (cancelled) return;
        setInitialWait(status.waitSeconds);
        exists.current = status.exists;
        setHello((h) => ({ ...h, enabled: status.helloEnabled, ready: status.helloReady }));
        setPhase(!status.exists ? "nouveau" : status.unlocked ? "ouvert" : "verrouille");
      })
      .catch((e: VaultError) => {
        if (cancelled) return;
        setLoadError(e);
        setPhase("erreur");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Windows Hello est-il configuré sur ce PC ? Vérifié une fois au démarrage.
  useEffect(() => {
    vaultApi
      .helloSupported()
      .then((supported) => setHello((h) => ({ ...h, supported })))
      .catch(() => setHello((h) => ({ ...h, supported: false })));
  }, []);

  // Fenêtre fermée (Aqueli reste en arrière-plan) : le cœur a déjà fermé le coffre.
  // « Verrouiller » depuis l'icône près de l'horloge : verrouillage demandé.
  useEffect(() => {
    const stopBackground = onAppEvent(APP_EVENTS.backgroundLock, () => {
      if (!exists.current) return;
      setLockReason("manuel");
      setInitialWait(0);
      setPhase((p) => (p === "ouvert" || p === "nouveau" ? "verrouille" : p));
    });
    const stopRequest = onAppEvent(APP_EVENTS.lockRequest, () => {
      if (exists.current) void lockRef.current("manuel");
    });
    return () => {
      stopBackground();
      stopRequest();
    };
  }, []);

  // Verrouillage de Windows (Win+L) ou mise en veille : le cœur a déjà fermé le coffre.
  useEffect(() => {
    if (!inTauri) return;
    let stopped = false;
    let unlisten: (() => void) | undefined;
    listen(SYSTEM_LOCK_EVENT, () => {
      if (!exists.current) return;
      setLockReason("systeme");
      setInitialWait(0);
      setPhase((p) => (p === "ouvert" || p === "nouveau" ? "verrouille" : p));
    })
      .then((fn) => {
        if (stopped) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, []);

  const setAutoLockMinutes = useCallback((minutes: AutoLockMinutes) => {
    setAutoLock(minutes);
    writePref("verrouillageAuto", minutes);
  }, []);

  const setRecoveryKeyVerified = useCallback((verified: boolean) => {
    setVerified(verified);
    writePref("cleVerifiee", verified);
  }, []);

  const create = useCallback(async (password: string) => {
    const { recoveryKey } = await guarded(vaultApi.create(password));
    exists.current = true;
    // Compte créé en anglais : espaces et catégories de départ en anglais (sans bloquer la création).
    await localizeDefaults().catch(() => undefined);
    // Le coffre est ouvert, mais l'assistant continue (clé de récupération, thème).
    setVerified(false);
    writePref("cleVerifiee", false);
    return recoveryKey;
  }, []);

  const finishOnboarding = useCallback(() => {
    play("ouverture");
    setPhase("ouvert");
  }, [play]);

  const unlock = useCallback(async (password: string) => {
    await guarded(vaultApi.unlock(password));
    play("deverrouillage");
    setHello((h) => ({ ...h, ready: h.enabled }));
    setPhase("ouvert");
  }, [play]);

  const recover = useCallback(async (recoveryKey: string, newPassword: string) => {
    await guarded(vaultApi.recover(recoveryKey, newPassword));
    play("deverrouillage");
    setHello((h) => ({ ...h, ready: h.enabled }));
    setPhase("ouvert");
  }, [play]);

  const changePassword = useCallback(
    (current: string, newPassword: string) => guarded(vaultApi.changePassword(current, newPassword)),
    [],
  );

  const newRecoveryKey = useCallback(async (password: string) => {
    const { recoveryKey } = await guarded(vaultApi.newRecoveryKey(password));
    return recoveryKey;
  }, []);

  const enableHello = useCallback(async () => {
    await guarded(vaultApi.enableHello());
    setHello((h) => ({ ...h, enabled: true, ready: true }));
  }, []);

  const disableHello = useCallback(async () => {
    await guarded(vaultApi.disableHello());
    setHello((h) => ({ ...h, enabled: false, ready: false }));
  }, []);

  const unlockWithHello = useCallback(async () => {
    await guarded(vaultApi.unlockWithHello());
    play("deverrouillage");
    setPhase("ouvert");
  }, [play]);

  const lock = useCallback(async (reason: LockReason) => {
    // Seul un verrouillage demandé s'entend : personne n'est là pour un verrouillage automatique.
    if (reason === "manuel") play("verrouillage");
    // Texte en cours de saisie : envoyé avant que la base ne se ferme.
    const flushing = flushBeforeLock();
    // Rien de ce qui précède le verrouillage ne s'annule ensuite.
    clearUndo();
    // L'écran se ferme tout de suite, même si le cœur met un instant à répondre.
    setLockReason(reason);
    setInitialWait(0);
    setPhase("verrouille");
    await flushing;
    await guarded(vaultApi.lock());
  }, [play]);

  lockRef.current = lock;

  const retry = useCallback(() => {
    setLoadError(null);
    setPhase("chargement");
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<VaultContextValue>(
    () => ({
      phase,
      loadError,
      lockReason,
      initialWaitSeconds,
      autoLockMinutes,
      setAutoLockMinutes,
      recoveryKeyVerified,
      setRecoveryKeyVerified,
      create,
      finishOnboarding,
      unlock,
      recover,
      changePassword,
      newRecoveryKey,
      hello,
      enableHello,
      disableHello,
      unlockWithHello,
      lock,
      retry,
    }),
    [
      phase,
      loadError,
      lockReason,
      initialWaitSeconds,
      autoLockMinutes,
      setAutoLockMinutes,
      recoveryKeyVerified,
      setRecoveryKeyVerified,
      create,
      finishOnboarding,
      unlock,
      recover,
      changePassword,
      newRecoveryKey,
      hello,
      enableHello,
      disableHello,
      unlockWithHello,
      lock,
      retry,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault doit être utilisé dans VaultProvider");
  return ctx;
}

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/**
 * Verrouille après `minutes` sans activité. On compare des heures réelles : après une
 * mise en veille du PC, le délai écoulé est bien pris en compte au réveil.
 */
export function useAutoLock(minutes: number, onIdle: () => void): void {
  useEffect(() => {
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, bump, { passive: true });
    // Activité dans une note ouverte à part (src/notes/noteWindows.ts).
    const stopElsewhere = onActivityElsewhere(bump);
    const timer = window.setInterval(() => {
      if (Date.now() - last >= minutes * 60_000) onIdle();
    }, 5_000);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, bump);
      stopElsewhere();
      window.clearInterval(timer);
    };
  }, [minutes, onIdle]);
}
