import type { VaultError } from "./api";
import { tr, trn } from "../i18n/i18n";

/** « 30 s », « 1 min », « 15 min », « 1 h ». */
export function formatWait(seconds: number): string {
  if (seconds < 60) return tr("{n} s", { n: Math.max(1, Math.ceil(seconds)) });
  if (seconds < 3600) return tr("{n} min", { n: Math.ceil(seconds / 60) });
  return tr("{n} h", { n: Math.ceil(seconds / 3600) });
}

function attemptsText(count: number): string {
  return trn(count, "{n} tentative restante.", "{n} tentatives restantes.");
}

function moveRefusalMessage(reason: string, detail: string): string {
  switch (reason) {
    case "meme":
      return tr("Les données sont déjà dans ce dossier.");
    case "imbrique":
      return tr("Choisissez un dossier situé hors du dossier actuel des données.");
    case "occupe":
      return tr("Ce dossier contient déjà des fichiers. Choisissez un dossier vide.");
    case "copie":
      return tr("Copie impossible ({detail}). Vérifiez la place disponible. Les données n'ont pas été déplacées.", { detail });
    case "verification":
      return tr("La copie ne correspond pas à l'original. Les données n'ont pas été déplacées.");
    default:
      return tr("Déplacement indisponible dans cette version.");
  }
}

/** Message d'erreur : constat bref, puis l'action à mener si elle est utile. */
export function vaultErrorMessage(error: VaultError): string {
  switch (error.code) {
    case "passwordTooShort":
      return tr("Le mot de passe doit contenir au moins {n} caractères.", { n: error.minLength });
    case "wrongPassword":
      if (error.waitSeconds > 0) return tr("Mot de passe incorrect. Réessayez dans {wait}.", { wait: formatWait(error.waitSeconds) });
      if (error.attemptsLeft <= 2) return `${tr("Mot de passe incorrect.")} ${attemptsText(error.attemptsLeft)}`;
      return tr("Mot de passe incorrect.");
    case "tooManyAttempts":
      return tr("Trop de tentatives. Réessayez dans {wait}.", { wait: formatWait(error.waitSeconds) });
    case "invalidRecoveryKey":
      return tr("Format de clé non valide. La clé comporte 24 caractères.");
    case "wrongRecoveryKey":
      if (error.waitSeconds > 0)
        return tr("Clé de récupération incorrecte. Réessayez dans {wait}.", { wait: formatWait(error.waitSeconds) });
      return tr("Clé de récupération incorrecte.");
    case "notFound":
      return tr("Aucun compte Aqueli sur ce PC.");
    case "alreadyExists":
      return tr("Un compte Aqueli existe déjà sur ce PC.");
    case "locked":
      return tr("Aqueli est verrouillé.");
    case "corrupted":
      return tr("Fichiers de données endommagés ({detail}). Ne les supprimez pas.", { detail: error.detail });
    case "io":
      return tr("Erreur de lecture ou d'écriture ({detail}). Vérifiez l'espace disque disponible.", { detail: error.detail });
    case "helloUnsupported":
      return tr("Windows Hello n'est pas disponible sur ce PC.");
    case "helloCancelled":
      return tr("Vérification Windows Hello annulée.");
    case "helloNotEnabled":
      return tr("Windows Hello n'est pas activé.");
    case "helloPasswordRequired":
      return tr("Mot de passe requis pour cette session Windows.");
    case "helloFailed":
      return tr("Échec de Windows Hello ({detail}). Utilisez votre mot de passe.", { detail: error.detail });
    case "backupPasswordNeeded":
      return tr("Sauvegarde d'un autre compte : saisissez son mot de passe.");
    case "wrongBackupPassword":
      return tr("Ce mot de passe n'ouvre pas la sauvegarde.");
    case "folderMissing":
      return tr("Dossier des données introuvable : {path}. Branchez le disque qui le contient, puis cliquez sur « Réessayer ».", { path: error.path });
    case "moveRefused":
      return moveRefusalMessage(error.reason, error.detail);
    case "accountUnknown":
      return tr("Ce compte n'existe plus sur ce PC.");
    case "tooManyAccounts":
      return tr("Ce PC compte déjà {max} comptes, le nombre maximal.", { max: error.max });
    case "capturesPending":
      return trn(
        error.count,
        "Une capture rapide attend le déverrouillage de ce compte. Déverrouillez-le d'abord.",
        "{n} captures rapides attendent le déverrouillage de ce compte. Déverrouillez-le d'abord.",
      );
  }
}

/** Attente imposée par une erreur, en secondes (0 si aucune). */
export function errorWaitSeconds(error: VaultError): number {
  if (error.code === "wrongPassword" || error.code === "wrongRecoveryKey" || error.code === "tooManyAttempts")
    return error.waitSeconds;
  return 0;
}
