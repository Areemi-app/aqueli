/**
 * Date de la dernière sauvegarde, partagée entre le bouton de la barre de titre et
 * Paramètres › Sauvegardes ; Ctrl+S demande une sauvegarde au bouton.
 */
import { backupsApi } from "./backupsApi";
import { locale, tr } from "../i18n/i18n";

export interface BackupState {
  /** Dernière sauvegarde (secondes Unix), automatique ou manuelle ; nulle s'il n'y en a pas. */
  last: number | null;
  busy: boolean;
}

let state: BackupState = { last: null, busy: false };
const listeners = new Set<() => void>();
const requests = new Set<() => void>();

export function setBackupState(next: Partial<BackupState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const backupState = (): BackupState => state;
export function subscribeBackup(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Relit la date de la dernière sauvegarde. */
export async function refreshLastBackup(): Promise<void> {
  try {
    const [status, list] = await Promise.all([backupsApi.status(), backupsApi.list()]);
    const last = Math.max(status.lastAuto, ...list.map((b) => b.createdAt), 0);
    setBackupState({ last: last > 0 ? last : null });
  } catch {
    // Compte verrouillé ou dossier illisible : la date affichée reste la précédente.
  }
}

/** Ctrl+S : le bouton de la barre de titre lance la sauvegarde. */
export function requestBackup(): void {
  requests.forEach((r) => r());
}

export function onBackupRequest(run: () => void): () => void {
  requests.add(run);
  return () => requests.delete(run);
}

/** « À l'instant », « il y a 5 min », « il y a 2 h », « hier », « il y a 4 jours », « le 12 sept. ». */
export function backupAgo(last: number, now: number): string {
  const minutes = Math.floor((now - last) / 60);
  if (minutes < 1) return tr("à l'instant");
  if (minutes < 60) return tr("il y a {minutes} min", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr("il y a {hours} h", { hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return tr("hier");
  if (days < 7) return tr("il y a {days} jours", { days });
  return tr("le {date}", { date: new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" }).format(new Date(last * 1000)) });
}

/** Fraîcheur : récente (moins d'un jour), à refaire (plus de 3 jours), ou absente. */
export function backupFreshness(last: number | null, now: number): "recente" | "ancienne" | "aucune" | "correcte" {
  if (last === null) return "aucune";
  const days = (now - last) / 86_400;
  if (days < 1) return "recente";
  return days > 3 ? "ancienne" : "correcte";
}
