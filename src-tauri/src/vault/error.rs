//! Erreurs du coffre, envoyées telles quelles à l'interface qui les traduit en
//! messages clairs. Aucune ne contient de mot de passe ni de clé.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum VaultError {
    /// Moins de 8 caractères.
    PasswordTooShort { min_length: usize },
    /// Un coffre existe déjà : on ne l'écrase jamais.
    AlreadyExists,
    /// Aucun coffre n'a encore été créé.
    NotFound,
    /// Le coffre est verrouillé : l'opération demande de le déverrouiller d'abord.
    Locked,
    WrongPassword { attempts_left: u32, wait_seconds: u64 },
    /// La saisie ne ressemble pas à une clé de récupération (longueur, caractères).
    InvalidRecoveryKey,
    WrongRecoveryKey { attempts_left: u32, wait_seconds: u64 },
    /// Trop d'essais ratés : il faut patienter avant de réessayer.
    TooManyAttempts { wait_seconds: u64 },
    /// Fichiers du coffre illisibles ou abîmés.
    Corrupted { detail: String },
    /// Problème de lecture ou d'écriture sur le disque.
    Io { detail: String },
    /// Windows Hello n'est pas configuré sur ce PC.
    HelloUnsupported,
    /// Vérification Windows Hello annulée par la personne.
    HelloCancelled,
    /// Windows Hello n'est pas activé pour Aqueli.
    HelloNotEnabled,
    /// Nouvelle session Windows : le mot de passe est demandé une première fois.
    HelloPasswordRequired,
    /// Échec de Windows Hello (clé supprimée, erreur du système…).
    HelloFailed { detail: String },
    /// Sauvegarde d'un autre compte : son mot de passe est nécessaire.
    BackupPasswordNeeded,
    /// Ce mot de passe n'ouvre pas la sauvegarde.
    WrongBackupPassword,
    /// Les données ont été déplacées dans un dossier introuvable (disque débranché).
    FolderMissing { path: String },
    /// Déplacement des données refusé ou impossible ; rien n'a changé.
    MoveRefused { reason: String, detail: String },
    /// Compte inconnu de ce PC.
    AccountUnknown,
    /// Nombre de comptes au plus atteint.
    TooManyAccounts { max: usize },
    /// Des captures rapides attendent le déverrouillage de ce compte.
    CapturesPending { count: usize },
}

impl From<super::hello::HelloError> for VaultError {
    fn from(e: super::hello::HelloError) -> Self {
        use super::hello::HelloError;
        match e {
            HelloError::Unsupported => VaultError::HelloUnsupported,
            HelloError::Cancelled => VaultError::HelloCancelled,
            HelloError::NotFound => VaultError::HelloFailed { detail: "clé Windows Hello introuvable".into() },
            HelloError::Failed(detail) => VaultError::HelloFailed { detail },
        }
    }
}

impl From<std::io::Error> for VaultError {
    fn from(e: std::io::Error) -> Self {
        VaultError::Io { detail: e.kind().to_string() }
    }
}

impl From<rusqlite::Error> for VaultError {
    fn from(e: rusqlite::Error) -> Self {
        VaultError::Corrupted { detail: format!("base de données : {e}") }
    }
}

impl From<super::crypto::CryptoError> for VaultError {
    fn from(_: super::crypto::CryptoError) -> Self {
        VaultError::Corrupted { detail: "opération cryptographique impossible".into() }
    }
}
