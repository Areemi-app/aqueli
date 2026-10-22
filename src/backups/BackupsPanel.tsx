import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { DataLocationSection } from "./DataLocationSection";
import { useToast } from "../app/ToastProvider";
import { useItemMenu } from "../components/ContextMenu";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { KEYS } from "../lib/itemKeys";
import { dayKey, relativeDay } from "../tasks/day";
import type { VaultError } from "../vault/api";
import { vaultErrorMessage } from "../vault/messages";
import { refreshLastBackup } from "./backupState";
import { backupsApi, formatSize, ORIGIN_LABELS, type BackupInfo, type BackupOrigin, type BackupStatus } from "./backupsApi";
import { backupDate, RestoreDialog } from "./RestoreDialog";
import { locale, tr, trn } from "../i18n/i18n";

/** Sauvegardes affichées ; les autres restent dans le dossier. */
export const SHOWN_BACKUPS = 5;

const shortDate = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString(locale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** « Aujourd'hui à 09:30 », « Hier à 20:02 », « Ven. 2 oct. à 09:30 ». */
export function whenLabel(seconds: number, now = new Date()): string {
  const date = new Date(seconds * 1000);
  const day = relativeDay(dayKey(date), dayKey(now));
  const time = date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  return tr("{day} à {time}", { day: day.charAt(0).toUpperCase() + day.slice(1), time });
}

/** Couleur (variable du thème) et symbole de chaque origine. */
const ORIGIN_STYLE: Record<BackupOrigin, { color: string; icon: string }> = {
  automatique: { color: "var(--aq-accent)", icon: ICONS.history },
  manuelle: { color: "var(--aq-priority-low)", icon: ICONS.shield },
  "avant-restauration": { color: "var(--aq-priority-medium)", icon: ICONS.undo },
  export: { color: "var(--aq-chip-neutral)", icon: ICONS.file },
};

const details = (b: BackupInfo) => `${ORIGIN_LABELS[b.origin]} · ${formatSize(b.size)}${b.external ? tr(" · destination externe") : ""}`;

/**
 * Paramètres › Sauvegardes : dernière sauvegarde et « Sauvegarder maintenant » en tête, les 5
 * dernières sauvegardes (les autres dans le dossier), puis les réglages, l'export et la
 * restauration depuis un fichier.
 */
export function BackupsPanel() {
  const notify = useToast();
  const itemMenu = useItemMenu();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [list, setList] = useState<BackupInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);
  const [deleting, setDeleting] = useState<BackupInfo | null>(null);

  const refresh = useCallback(() => {
    void backupsApi.status().then(setStatus).catch(() => undefined);
    void refreshLastBackup();
    void backupsApi
      .list()
      .then(setList)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  useEffect(refresh, [refresh]);

  const fail = (err: unknown) => notify(vaultErrorMessage(err as VaultError));

  const backupNow = async () => {
    setBusy(true);
    try {
      const { external } = await backupsApi.create();
      notify(external ? tr("Sauvegarde faite, sur ce PC et sur la destination externe.") : tr("Sauvegarde faite."));
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const openFolder = () => void backupsApi.openFolder().catch(fail);

  const chooseDestination = async () => {
    try {
      const folder = await backupsApi.chooseDestination();
      if (folder) notify(tr("Destination choisie. La dernière sauvegarde y est copiée."));
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const exportAccount = async () => {
    try {
      const file = await backupsApi.exportAccount();
      if (file) notify(tr("Compte exporté."));
    } catch (err) {
      fail(err);
    }
  };

  const restoreFromFile = async () => {
    try {
      const picked = await backupsApi.pickFile();
      if (picked) setRestoring(picked);
    } catch (err) {
      fail(err);
    }
  };

  const remove = async (b: BackupInfo) => {
    setDeleting(null);
    try {
      await backupsApi.remove(b.path);
      notify(tr("Sauvegarde supprimée."));
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const latest = list[0] ?? null;
  const shown = list.slice(0, SHOWN_BACKUPS);
  const hidden = list.length - shown.length;

  return (
    <div className="settings-section">
      {status?.externalReminder && (
        <p className="notice notice--warn" role="note">
          <Icon d={ICONS.warning} size={16} stroke={2.2} />
          {tr("Aucune sauvegarde sur un disque externe depuis 30 jours.")}
        </p>
      )}

      <section className="backup-hero" aria-label={tr("Dernière sauvegarde")}>
        <span className="backup-orb" aria-hidden="true">
          <Icon d={ICONS.shield} size={26} stroke={2.2} />
        </span>
        <div className="backup-hero-text">
          <span className="backup-hero-label">{tr("Dernière sauvegarde")}</span>
          <span className="backup-hero-date">{latest ? whenLabel(latest.createdAt) : loaded ? tr("Aucune sauvegarde") : "…"}</span>
          {latest && <span className="backup-hero-desc">{details(latest)}</span>}
        </div>
        <div className="backup-hero-actions">
          <button type="button" className="btn-gel" disabled={busy} onClick={() => void backupNow()}>
            {tr("Sauvegarder maintenant")}
          </button>
          <button type="button" className="btn-glass btn-glass--sm" onClick={openFolder}>
            <Icon d={ICONS.folder} size={15} stroke={2.2} />
            {tr("Ouvrir le dossier")}
          </button>
        </div>
      </section>

      <h2 className="settings-heading">{tr("Dernières sauvegardes")}</h2>
      {loaded && list.length === 0 && <p className="setting-desc backup-empty">{tr("Aucune sauvegarde.")}</p>}
      {shown.length > 0 && (
        <ul className="backup-cards" aria-label={tr("Dernières sauvegardes")}>
          {shown.map((b) => {
            const style = ORIGIN_STYLE[b.origin];
            return (
              <li
                key={b.path}
                className="backup-card"
                style={{ "--row-color": style.color } as CSSProperties}
                {...itemMenu(() => [
                  { label: tr("Restaurer…"), icon: ICONS.repeat, shortcut: KEYS.open, run: () => setRestoring(b) },
                  { label: tr("Ouvrir le dossier"), icon: ICONS.folder, run: openFolder },
                  "separator",
                  { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => setDeleting(b) },
                ])}
              >
                <span className="backup-chip" aria-hidden="true">
                  <Icon d={style.icon} size={16} stroke={2.3} />
                </span>
                <span className="backup-card-text">
                  <span className="backup-card-date">{backupDate(b)}</span>
                  <span className="backup-card-meta">{details(b)}</span>
                </span>
                <button type="button" className="btn-glass btn-glass--sm" onClick={() => setRestoring(b)}>
                  {tr("Restaurer")}
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label={tr("Supprimer la sauvegarde du {backupDate}", { backupDate: backupDate(b) })}
                  title={tr("Supprimer")}
                  onClick={() => setDeleting(b)}
                >
                  <Icon d={ICONS.trash} size={15} stroke={2.2} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 && (
        <p className="backup-more">
          {trn(hidden, "{n} autre sauvegarde dans le dossier des sauvegardes.", "{n} autres sauvegardes dans le dossier des sauvegardes.")}
          <button type="button" className="link-btn" onClick={openFolder}>
            {tr("Ouvrir le dossier")}
          </button>
        </p>
      )}

      <h2 className="settings-heading">{tr("Réglages")}</h2>
      <div className="settings-card glass">
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Sauvegarde automatique")}</span>
            <span className="setting-desc">
              {status?.lastAuto
                ? tr("Une par jour tant qu'Aqueli est ouvert. Dernière sauvegarde : {shortDate}.", { shortDate: shortDate(status.lastAuto) })
                : tr("Une par jour tant qu'Aqueli est ouvert.")}{" "}
              {tr("Chiffrée, illisible sans votre mot de passe. Conservation : 7 jours, 4 semaines, 12 mois.")}
            </span>
          </div>
        </div>
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Destination externe")}</span>
            <span className="setting-desc">
              {status?.destination ? (
                <>
                  {status.destination} · {status.destinationAvailable ? tr("branchée") : tr("non branchée")}
                  {status.lastExternal ? tr(" · dernière copie le {shortDate}", { shortDate: shortDate(status.lastExternal) }) : ""}
                </>
              ) : (
                tr("Aucune. Une clé USB ou un disque externe protège les sauvegardes d'une panne du PC.")
              )}
            </span>
          </div>
          <div className="row-actions">
            <button type="button" className="btn-glass btn-glass--sm" onClick={() => void chooseDestination()}>
              {status?.destination ? tr("Changer…") : tr("Choisir…")}
            </button>
            {status?.destination && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  void backupsApi.clearDestination().then(refresh).catch(fail);
                }}
              >
                {tr("Retirer")}
              </button>
            )}
          </div>
        </div>
      </div>

      <h2 className="settings-heading">{tr("Fichier de sauvegarde")}</h2>
      <div className="settings-card glass">
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Exporter le compte")}</span>
            <span className="setting-desc">{tr("Un seul fichier chiffré, à restaurer ici ou sur un autre PC avec le mot de passe actuel.")}</span>
          </div>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => void exportAccount()}>
            {tr("Exporter…")}
          </button>
        </div>
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Restaurer depuis un fichier")}</span>
            <span className="setting-desc">{tr("Sauvegarde plus ancienne, d'une clé USB, d'un disque ou d'un autre PC.")}</span>
          </div>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => void restoreFromFile()}>
            {tr("Choisir…")}
          </button>
        </div>
      </div>

      <DataLocationSection />

      {restoring && <RestoreDialog backup={restoring} onClose={() => setRestoring(null)} />}
      {deleting && (
        <Dialog title={tr("Supprimer la sauvegarde")} onClose={() => setDeleting(null)}>
          <p className="settings-intro">{tr("La sauvegarde du {date} est supprimée définitivement.", { date: backupDate(deleting) })}</p>
          <div className="onb-actions">
            <button type="button" className="btn-glass" onClick={() => setDeleting(null)}>
              {tr("Annuler")}
            </button>
            <button type="button" className="btn-glass btn-danger" onClick={() => void remove(deleting)}>
              {tr("Supprimer")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
