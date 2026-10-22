import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { flushBeforeLock } from "../lib/beforeLock";
import { flushPrefs, stopSavingPrefs } from "../lib/storage";
import { inTauri } from "../lib/windowControls";
import { tr } from "../i18n/i18n";
import type { VaultError } from "../vault/api";
import { vaultErrorMessage } from "../vault/messages";
import { accountsApi, type AccountInfo } from "./accountsApi";
import { AvatarImage } from "./AvatarImage";

/** Comptes de ce PC, lus une fois (ils ne changent qu'avec un redémarrage). */
export function useAccounts(): AccountInfo[] | null {
  const [accounts, setAccounts] = useState<AccountInfo[] | null>(null);
  useEffect(() => {
    accountsApi
      .list()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);
  return accounts;
}

/** Nom affiché d'un compte : son pseudo, sinon un nom neutre. */
export function accountLabel(account: AccountInfo): string {
  if (account.name) return account.name;
  return account.id === "principal" ? tr("Compte principal") : tr("Nouveau compte");
}

/**
 * Change de compte ou en ajoute un : les enregistrements en cours se terminent, puis le cœur
 * redémarre Aqueli sur le compte voulu. Renvoie un message d'erreur, ou `null`.
 */
export async function openAccount(run: () => Promise<void>): Promise<string | null> {
  try {
    await flushBeforeLock();
    await flushPrefs();
    await run();
    // Le cœur redémarre Aqueli : plus rien n'est enregistré d'ici là. (Aperçu dans un
    // navigateur : la page se recharge.)
    stopSavingPrefs();
    if (!inTauri) window.location.reload();
    return null;
  } catch (e) {
    return vaultErrorMessage(e as VaultError);
  }
}

/**
 * Bas de l'écran de verrouillage : les autres comptes de ce PC (image et pseudo) et « Ajouter un
 * compte ». Choisir un compte redémarre Aqueli sur son écran de verrouillage.
 */
export function AccountSwitcher() {
  const accounts = useAccounts();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!accounts) return null;
  const others = accounts.filter((a) => !a.current);

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
    <nav className="account-switcher" aria-label={tr("Comptes de ce PC")}>
      <div className="account-chips">
        {others.map((a) => (
          <button
            key={a.id}
            type="button"
            className="account-chip"
            title={tr("Ouvrir le compte {name}", { name: accountLabel(a) })}
            disabled={opening !== null}
            onClick={() => void go(a.id, () => accountsApi.switchTo(a.id))}
          >
            {opening === a.id ? <span className="spinner" aria-hidden="true" /> : <AvatarImage avatar={a.avatar} name={a.name} size={40} />}
            <span className="account-chip-name">{accountLabel(a)}</span>
          </button>
        ))}
        <button type="button" className="account-chip account-chip--add" disabled={opening !== null} onClick={() => void go("nouveau", accountsApi.add)}>
          {opening === "nouveau" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <span className="profile-pic profile-pic--add" aria-hidden="true">
              <Icon d={ICONS.plus} size={18} stroke={2.6} />
            </span>
          )}
          <span className="account-chip-name">{tr("Ajouter un compte")}</span>
        </button>
      </div>
      {opening && (
        <p className="account-switcher-note" role="status">
          {tr("Ouverture du compte…")}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </nav>
  );
}
