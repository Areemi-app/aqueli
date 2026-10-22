//! En-tête du coffre (`coffre.json`) : il contient la clé maîtresse enfermée deux fois,
//! une fois par le mot de passe et une fois par la clé de récupération, jamais en clair.
//! Une copie de secours (`coffre-secours.json`) protège contre un fichier abîmé :
//! sans en-tête, la base chiffrée serait perdue pour toujours.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::crypto::KdfParams;
use super::error::VaultError;
use crate::files::write_atomic;

pub const HEADER_FILE: &str = "coffre.json";
pub const HEADER_BACKUP_FILE: &str = "coffre-secours.json";
pub const FORMAT_VERSION: u32 = 1;

/// Une « serrure » : la clé maîtresse chiffrée avec une clé dérivée d'un secret.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Slot {
    pub salt: String,
    pub nonce: String,
    pub sealed_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Header {
    pub format: u32,
    pub created_at: u64,
    pub kdf: KdfParams,
    pub password: Slot,
    pub recovery: Slot,
    /// Essais ratés d'affilée (mot de passe ou clé de récupération).
    #[serde(default)]
    pub failed_attempts: u32,
    /// Moment (secondes depuis 1970) avant lequel aucun essai n'est accepté.
    #[serde(default)]
    pub blocked_until: u64,
    /// Serrure Windows Hello, si elle est activée.
    #[serde(default)]
    pub hello: Option<HelloSlot>,
    /// Session Windows du dernier déverrouillage par mot de passe : Windows Hello n'est
    /// accepté que dans cette même session.
    #[serde(default)]
    pub password_logon: u64,
}

/// Serrure Windows Hello : le défi à faire signer et la clé maîtresse enfermée.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HelloSlot {
    pub challenge: String,
    pub nonce: String,
    pub sealed_key: String,
}

fn parse(bytes: &[u8]) -> Option<Header> {
    let header: Header = serde_json::from_slice(bytes).ok()?;
    (header.format == FORMAT_VERSION).then_some(header)
}

/// Lit l'en-tête, ou sa copie de secours si l'original manque ou est abîmé.
/// `Ok(None)` : aucun coffre dans ce dossier.
pub fn load(dir: &Path) -> Result<Option<Header>, VaultError> {
    let main = fs::read(dir.join(HEADER_FILE));
    if let Ok(bytes) = &main {
        if let Some(header) = parse(bytes) {
            return Ok(Some(header));
        }
    }
    match fs::read(dir.join(HEADER_BACKUP_FILE)) {
        Ok(bytes) => parse(&bytes).map(Some).ok_or(VaultError::Corrupted {
            detail: "en-tête du coffre illisible".into(),
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => match main {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            _ => Err(VaultError::Corrupted { detail: "en-tête du coffre illisible".into() }),
        },
        Err(e) => Err(e.into()),
    }
}

/// Enregistre l'en-tête. `with_backup` met aussi à jour la copie de secours
/// (à la création et à chaque changement de mot de passe).
pub fn save(dir: &Path, header: &Header, with_backup: bool) -> Result<(), VaultError> {
    let bytes = serde_json::to_vec_pretty(header)
        .map_err(|_| VaultError::Corrupted { detail: "en-tête impossible à écrire".into() })?;
    write_atomic(&dir.join(HEADER_FILE), &bytes)?;
    if with_backup {
        write_atomic(&dir.join(HEADER_BACKUP_FILE), &bytes)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Header {
        let slot = Slot { salt: "00".into(), nonce: "11".into(), sealed_key: "22".into() };
        Header {
            format: FORMAT_VERSION,
            created_at: 1_790_000_000,
            kdf: KdfParams::FAST_FOR_TESTS,
            password: slot.clone(),
            recovery: slot,
            failed_attempts: 0,
            blocked_until: 0,
            hello: None,
            password_logon: 0,
        }
    }

    #[test]
    fn aucun_fichier_veut_dire_aucun_coffre() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()).unwrap(), None);
    }

    #[test]
    fn enregistrer_puis_relire() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &sample(), true).unwrap();
        assert_eq!(load(dir.path()).unwrap(), Some(sample()));
        assert!(dir.path().join(HEADER_BACKUP_FILE).exists());
        assert!(!dir.path().join("coffre.tmp").exists());
    }

    #[test]
    fn la_copie_de_secours_prend_le_relais() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &sample(), true).unwrap();
        fs::write(dir.path().join(HEADER_FILE), b"{ abime").unwrap();
        assert_eq!(load(dir.path()).unwrap(), Some(sample()));
        fs::remove_file(dir.path().join(HEADER_FILE)).unwrap();
        assert_eq!(load(dir.path()).unwrap(), Some(sample()));
    }

    #[test]
    fn un_en_tete_sans_windows_hello_reste_lisible() {
        let dir = tempfile::tempdir().unwrap();
        let mut json = serde_json::to_value(sample()).unwrap();
        let obj = json.as_object_mut().unwrap();
        obj.remove("hello");
        obj.remove("password_logon");
        fs::write(dir.path().join(HEADER_FILE), serde_json::to_vec(&json).unwrap()).unwrap();
        assert_eq!(load(dir.path()).unwrap(), Some(sample()));
    }

    #[test]
    fn un_en_tete_abime_sans_secours_est_signale() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(HEADER_FILE), b"n'importe quoi").unwrap();
        assert!(matches!(load(dir.path()), Err(VaultError::Corrupted { .. })));
    }
}
