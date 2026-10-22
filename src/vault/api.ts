/**
 * Accès au coffre-fort, qui vit dans le cœur Rust (src-tauri/src/vault).
 * L'interface ne voit jamais la clé maîtresse : elle transmet le mot de passe et reçoit
 * seulement « ouvert » ou « fermé ».
 */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../lib/windowControls";

export interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
  waitSeconds: number;
  /** Windows Hello est activé pour Aqueli. */
  helloEnabled: boolean;
  /** Windows Hello est utilisable maintenant (mot de passe déjà saisi dans cette session Windows). */
  helloReady: boolean;
}

/** Erreurs renvoyées par le cœur (voir src-tauri/src/vault/error.rs). */
export type VaultError =
  | { code: "passwordTooShort"; minLength: number }
  | { code: "alreadyExists" }
  | { code: "notFound" }
  | { code: "locked" }
  | { code: "wrongPassword"; attemptsLeft: number; waitSeconds: number }
  | { code: "invalidRecoveryKey" }
  | { code: "wrongRecoveryKey"; attemptsLeft: number; waitSeconds: number }
  | { code: "tooManyAttempts"; waitSeconds: number }
  | { code: "corrupted"; detail: string }
  | { code: "io"; detail: string }
  | { code: "helloUnsupported" }
  | { code: "helloCancelled" }
  | { code: "helloNotEnabled" }
  | { code: "helloPasswordRequired" }
  | { code: "helloFailed"; detail: string }
  | { code: "backupPasswordNeeded" }
  | { code: "wrongBackupPassword" }
  | { code: "folderMissing"; path: string }
  | { code: "moveRefused"; reason: MoveRefusal; detail: string }
  | { code: "accountUnknown" }
  | { code: "tooManyAccounts"; max: number }
  | { code: "capturesPending"; count: number };

/** Raisons d'un déplacement des données refusé (src-tauri/src/data_location.rs). */
export type MoveRefusal = "meme" | "imbrique" | "occupe" | "copie" | "verification" | "developpement";

/** Emplacement des données. */
export interface DataPlace {
  path: string;
  /** Hors du dossier d'origine (%APPDATA%\Aqueli). */
  moved: boolean;
  movable: boolean;
}

export function isVaultError(value: unknown): value is VaultError {
  return typeof value === "object" && value !== null && typeof (value as { code?: unknown }).code === "string";
}

/** Toute erreur inattendue devient une erreur « io » lisible. */
export function asVaultError(value: unknown): VaultError {
  if (isVaultError(value)) return value;
  return { code: "io", detail: typeof value === "string" ? value : "erreur inattendue" };
}

export interface VaultApi {
  status(): Promise<VaultStatus>;
  create(password: string): Promise<{ recoveryKey: string }>;
  unlock(password: string): Promise<void>;
  recover(recoveryKey: string, newPassword: string): Promise<void>;
  changePassword(current: string, newPassword: string): Promise<void>;
  newRecoveryKey(password: string): Promise<{ recoveryKey: string }>;
  helloSupported(): Promise<boolean>;
  enableHello(): Promise<void>;
  disableHello(): Promise<void>;
  unlockWithHello(): Promise<void>;
  lock(): Promise<void>;
  /**
   * Supprime définitivement le compte ouvert ; `includeBackups` : ses sauvegardes locales aussi.
   * Vrai si d'autres comptes restent sur ce PC : Aqueli redémarre alors sur l'un d'eux.
   */
  deleteAccount(password: string, includeBackups: boolean): Promise<boolean>;
  dataLocation(): Promise<DataPlace>;
  /** Déplace les données (dossier choisi dans Windows, ou dossier d'origine) ; nouvel emplacement, ou `null` si annulé. Aqueli redémarre ensuite. */
  moveData(password: string, toDefault: boolean): Promise<string | null>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asVaultError(e);
  }
}

const tauriApi: VaultApi = {
  status: () => call("vault_status"),
  create: (password) => call("vault_create", { password }),
  unlock: (password) => call("vault_unlock", { password }),
  recover: (recoveryKey, newPassword) => call("vault_recover", { recoveryKey, newPassword }),
  changePassword: (current, newPassword) => call("vault_change_password", { current, newPassword }),
  newRecoveryKey: (password) => call("vault_new_recovery_key", { password }),
  helloSupported: () => call("hello_supported"),
  enableHello: () => call("vault_hello_enable"),
  disableHello: () => call("vault_hello_disable"),
  unlockWithHello: () => call("vault_unlock_hello"),
  lock: () => call("vault_lock"),
  deleteAccount: (password, includeBackups) => call("account_delete", { password, includeBackups }),
  dataLocation: () => call("data_location_get"),
  moveData: (password, toDefault) => call("data_move", { password, toDefault }),
};

/**
 * Faux coffre en mémoire, uniquement pour l'aperçu dans un navigateur pendant le
 * développement (aucune donnée réelle, rien n'est enregistré). Absent de l'application installée.
 */
function createPreviewApi(): VaultApi {
  const state = { password: "", recovery: "", unlocked: false, failures: 0, hello: false };
  const fakeKey = () => "K7PQ-2M9D-X4TB-8HWE-3NJR-6CFA";
  const delay = () => new Promise((r) => setTimeout(r, 250));
  const wrong = (): VaultError => {
    state.failures++;
    return { code: "wrongPassword", attemptsLeft: Math.max(0, 5 - state.failures), waitSeconds: state.failures >= 5 ? 30 : 0 };
  };
  return {
    status: async () => ({
      exists: state.password !== "",
      unlocked: state.unlocked,
      waitSeconds: 0,
      helloEnabled: state.hello,
      helloReady: state.hello,
    }),
    create: async (password) => {
      await delay();
      if ([...password].length < 8) throw { code: "passwordTooShort", minLength: 8 } satisfies VaultError;
      Object.assign(state, { password, recovery: fakeKey(), unlocked: true });
      return { recoveryKey: state.recovery };
    },
    unlock: async (password) => {
      await delay();
      if (password !== state.password) throw wrong();
      Object.assign(state, { unlocked: true, failures: 0 });
    },
    recover: async (key, newPassword) => {
      await delay();
      if (key.replace(/-/g, "") !== state.recovery.replace(/-/g, ""))
        throw { code: "wrongRecoveryKey", attemptsLeft: 4, waitSeconds: 0 } satisfies VaultError;
      Object.assign(state, { password: newPassword, unlocked: true });
    },
    changePassword: async (current, newPassword) => {
      await delay();
      if (current !== state.password) throw wrong();
      state.password = newPassword;
    },
    newRecoveryKey: async (password) => {
      await delay();
      if (password !== state.password) throw wrong();
      state.recovery = "M3XW-7QKD-2PBT-9FHN-4JRV-8ZCA";
      return { recoveryKey: state.recovery };
    },
    helloSupported: async () => true,
    enableHello: async () => {
      await delay();
      state.hello = true;
    },
    disableHello: async () => {
      state.hello = false;
    },
    deleteAccount: async (password) => {
      await delay();
      if (password !== state.password) throw wrong();
      Object.assign(state, { password: "", recovery: "", unlocked: false, failures: 0, hello: false });
      return false;
    },
    dataLocation: async () => ({ path: "C:\\Users\\…\\AppData\\Roaming\\Aqueli", moved: false, movable: true }),
    moveData: async (password) => {
      await delay();
      if (password !== state.password) throw wrong();
      return null;
    },
    unlockWithHello: async () => {
      await delay();
      if (!state.hello) throw { code: "helloNotEnabled" } satisfies VaultError;
      state.unlocked = true;
    },
    lock: async () => {
      state.unlocked = false;
    },
  };
}

export const vaultApi: VaultApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
