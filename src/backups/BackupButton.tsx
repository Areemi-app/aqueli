/**
 * Bouton « Sauvegarder », à côté des espaces : un clic (ou Ctrl+S) sauvegarde maintenant, et il
 * montre de quand date la dernière sauvegarde.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useToast } from "../app/ToastProvider";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { useShortcut } from "../prefs/PreferencesProvider";
import type { VaultError } from "../vault/api";
import { vaultErrorMessage } from "../vault/messages";
import { backupsApi } from "./backupsApi";
import { backupAgo, backupFreshness, backupState, onBackupRequest, refreshLastBackup, setBackupState, subscribeBackup } from "./backupState";
import { locale, tr } from "../i18n/i18n";

const LONG_DATE = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function BackupButton() {
  const { last, busy } = useSyncExternalStore(subscribeBackup, backupState);
  const notify = useToast();
  const keys = useShortcut("backup");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // La date se relit au démarrage, puis toutes les 10 minutes (sauvegardes automatiques) ;
  // le libellé « il y a… » suit chaque minute.
  useEffect(() => {
    void refreshLastBackup();
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    const reread = window.setInterval(() => void refreshLastBackup(), 600_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(reread);
    };
  }, []);

  const backupNow = useCallback(async () => {
    if (backupState().busy) return;
    setBackupState({ busy: true });
    try {
      const { backup, external } = await backupsApi.create();
      setBackupState({ last: backup.createdAt });
      setNow(Math.floor(Date.now() / 1000));
      notify(external ? tr("Sauvegarde faite, sur ce PC et sur la destination externe.") : tr("Sauvegarde faite."));
    } catch (err) {
      notify(vaultErrorMessage(err as VaultError));
    } finally {
      setBackupState({ busy: false });
    }
  }, [notify]);

  useEffect(() => onBackupRequest(() => void backupNow()), [backupNow]);

  const freshness = backupFreshness(last, now);
  const when = last === null ? tr("Aucune sauvegarde") : tr("Sauvegardé {ago}", { ago: backupAgo(last, now) });
  const title =
    last === null
      ? tr("Aucune sauvegarde. Sauvegarder maintenant ({keys}).", { keys })
      : tr("Dernière sauvegarde : {date}. Sauvegarder maintenant ({keys}).", { date: LONG_DATE.format(new Date(last * 1000)), keys });

  return (
    <button type="button" className="backup-button" data-freshness={freshness} aria-busy={busy || undefined} disabled={busy} title={title} aria-label={title} onClick={() => void backupNow()}>
      <span className="backup-button-icon" aria-hidden="true">
        <Icon d={ICONS.save} size={15} stroke={2.2} />
        <span className="backup-button-dot" />
      </span>
      <span className="backup-button-text hide-below-wide">{busy ? tr("Sauvegarde…") : when}</span>
    </button>
  );
}
