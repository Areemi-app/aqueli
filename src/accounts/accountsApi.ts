/**
 * Comptes de ce PC (cœur : src-tauri/src/accounts.rs). Changer de compte, en ajouter un ou
 * abandonner un compte pas encore créé redémarre Aqueli : chaque compte se charge d'un bloc.
 */
import { invoke } from "@tauri-apps/api/core";
import { asVaultError } from "../vault/api";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";

export interface AccountInfo {
  id: string;
  /** Pseudo (vide pour un compte d'avant les pseudos). */
  name: string;
  /** Image de profil (banque d'images), ou vide. */
  avatar: string;
  /** Le compte a son mot de passe (sinon il attend sa création). */
  ready: boolean;
  /** Compte ouvert dans cette session. */
  current: boolean;
}

export interface AccountsApi {
  list(): Promise<AccountInfo[]>;
  switchTo(id: string): Promise<void>;
  add(): Promise<void>;
  cancelNew(): Promise<void>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asVaultError(e);
  }
}

const tauriApi: AccountsApi = {
  list: () => call("accounts_list"),
  switchTo: (id) => call("accounts_switch", { id }),
  add: () => call("accounts_add"),
  cancelNew: () => call("accounts_cancel_new"),
};

/**
 * Aperçu dans un navigateur pendant le développement : deux comptes fictifs, le changement ne
 * fait que recharger la page. Absent de l'application installée.
 */
function createPreviewApi(): AccountsApi {
  const KEY = "aqueli-apercu.comptes";
  const read = (): AccountInfo[] => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as AccountInfo[] | null;
      if (Array.isArray(saved)) return saved;
    } catch {
      // Aperçu sans stockage : comptes par défaut.
    }
    return [
      { id: "principal", name: "", avatar: "", ready: true, current: true },
      { id: "0a1b2c3d4e5f", name: demo("Léa", "Lea"), avatar: "papillon", ready: true, current: false },
    ];
  };
  const write = (list: AccountInfo[]) => {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      // Sans stockage, l'aperçu garde ses comptes par défaut.
    }
  };
  return {
    list: async () => read(),
    switchTo: async (id) => {
      write(read().map((a) => ({ ...a, current: a.id === id })));
    },
    add: async () => {
      write([...read().map((a) => ({ ...a, current: false })), { id: Math.random().toString(16).slice(2, 14), name: "", avatar: "", ready: false, current: true }]);
    },
    cancelNew: async () => {
      const kept = read().filter((a) => !a.current);
      write(kept.map((a, i) => ({ ...a, current: i === 0 })));
    },
  };
}

export const accountsApi: AccountsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
