//! Sauvegardes (cahier des charges § 9) : un fichier unique « .aqueli » qui contient la base
//! telle qu'elle est sur le disque (chiffrée par la clé maîtresse) et l'en-tête du coffre (la clé
//! maîtresse enfermée par le mot de passe et la clé de récupération du moment). Rien n'y est
//! lisible sans l'un de ces secrets : il peut aller sur une clé USB, et se restaure sur ce PC ou
//! sur un autre.
//!
//! Format : « AQUELISV », version (u32), puis le descriptif (JSON, sans donnée personnelle),
//! l'en-tête du coffre (JSON) et la base, chacun précédé de sa longueur.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::crypto::{SecretKey, KEY_LEN};
use super::header::{self, Header};
use super::{db, open_slot, remove_db_files, Session, Vault, VaultError, PASSWORD_CONTEXT};

const MAGIC: &[u8; 8] = b"AQUELISV";
const CONTAINER_VERSION: u32 = 1;
/// Descriptif et en-tête : quelques kilo-octets suffisent.
const MAX_META_BYTES: u32 = 64 * 1024;
/// Base : 2 Go au plus.
const MAX_DB_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Fichier de travail (aperçu, restauration), toujours chiffré comme la base.
const WORK_FILE: &str = "sauvegarde-en-cours.tmp";

/// Descriptif lisible sans mot de passe : date, versions, taille. Aucune donnée du compte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: u32,
    pub created_at: u64,
    /// Jour local de la sauvegarde (« 2026-09-29 »), pour la conservation.
    pub local_day: String,
    pub app_version: String,
    pub schema_version: i64,
    /// « automatique », « manuelle », « avant-restauration » ou « export ».
    pub origin: String,
    pub db_size: u64,
    pub db_sha256: String,
}

pub struct BackupFile {
    pub manifest: Manifest,
    pub header: Header,
    pub db: Vec<u8>,
}

/// Nombre d'éléments d'une sauvegarde, pour l'aperçu avant restauration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub tasks: i64,
    pub events: i64,
    pub obligations: i64,
    pub notes: i64,
}

fn corrupted(detail: &str) -> VaultError {
    VaultError::Corrupted { detail: detail.into() }
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn encode(backup: &BackupFile) -> Result<Vec<u8>, VaultError> {
    let manifest = serde_json::to_vec(&backup.manifest).map_err(|_| corrupted("descriptif"))?;
    let header = serde_json::to_vec(&backup.header).map_err(|_| corrupted("en-tête"))?;
    let mut out = Vec::with_capacity(backup.db.len() + manifest.len() + header.len() + 32);
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&CONTAINER_VERSION.to_le_bytes());
    for part in [&manifest, &header] {
        out.extend_from_slice(&(part.len() as u32).to_le_bytes());
        out.extend_from_slice(part);
    }
    out.extend_from_slice(&(backup.db.len() as u64).to_le_bytes());
    out.extend_from_slice(&backup.db);
    Ok(out)
}

fn take<'a>(bytes: &'a [u8], at: &mut usize, n: usize) -> Result<&'a [u8], VaultError> {
    let end = at.checked_add(n).filter(|&e| e <= bytes.len()).ok_or_else(|| corrupted("sauvegarde tronquée"))?;
    let part = &bytes[*at..end];
    *at = end;
    Ok(part)
}

fn read_u32(bytes: &[u8], at: &mut usize) -> Result<u32, VaultError> {
    Ok(u32::from_le_bytes(take(bytes, at, 4)?.try_into().map_err(|_| corrupted("longueur"))?))
}

fn read_meta<T: for<'de> Deserialize<'de>>(bytes: &[u8], at: &mut usize) -> Result<T, VaultError> {
    let len = read_u32(bytes, at)?;
    if len > MAX_META_BYTES {
        return Err(corrupted("sauvegarde illisible"));
    }
    serde_json::from_slice(take(bytes, at, len as usize)?).map_err(|_| corrupted("sauvegarde illisible"))
}

fn check_start(bytes: &[u8], at: &mut usize) -> Result<(), VaultError> {
    if take(bytes, at, 8)? != MAGIC {
        return Err(corrupted("ce fichier n'est pas une sauvegarde d'Aqueli"));
    }
    if read_u32(bytes, at)? != CONTAINER_VERSION {
        return Err(corrupted("sauvegarde d'une version plus récente d'Aqueli"));
    }
    Ok(())
}

/// Lit une sauvegarde entière et vérifie l'empreinte de la base.
pub fn decode(bytes: &[u8]) -> Result<BackupFile, VaultError> {
    let mut at = 0;
    check_start(bytes, &mut at)?;
    let manifest: Manifest = read_meta(bytes, &mut at)?;
    let header: Header = read_meta(bytes, &mut at)?;
    let len = u64::from_le_bytes(take(bytes, &mut at, 8)?.try_into().map_err(|_| corrupted("longueur"))?);
    if len > MAX_DB_BYTES || len != manifest.db_size {
        return Err(corrupted("sauvegarde illisible"));
    }
    let db = take(bytes, &mut at, len as usize)?.to_vec();
    if sha256_hex(&db) != manifest.db_sha256 {
        return Err(corrupted("sauvegarde abîmée (empreinte différente)"));
    }
    Ok(BackupFile { manifest, header, db })
}

/// Descriptif seul, sans lire toute la base (liste des sauvegardes).
pub fn read_manifest(path: &Path) -> Result<Manifest, VaultError> {
    let mut file = fs::File::open(path)?;
    let mut start = vec![0u8; 16];
    file.read_exact(&mut start)?;
    let mut at = 0;
    check_start(&start, &mut at)?;
    let len = read_u32(&start, &mut at)?;
    if len > MAX_META_BYTES {
        return Err(corrupted("sauvegarde illisible"));
    }
    let mut meta = vec![0u8; len as usize];
    file.read_exact(&mut meta)?;
    serde_json::from_slice(&meta).map_err(|_| corrupted("sauvegarde illisible"))
}

/// Écrit la base de la sauvegarde dans un fichier de travail et vérifie que `key` l'ouvre.
/// `Ok(None)` : la clé ne l'ouvre pas (sauvegarde d'un autre compte).
fn open_work(dir: &Path, backup: &BackupFile, key: &[u8; KEY_LEN]) -> Result<Option<(PathBuf, Connection)>, VaultError> {
    let path = dir.join(WORK_FILE);
    remove_db_files(&path);
    crate::files::write_atomic(&path, &backup.db)?;
    let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
    db::apply_key(&conn, key)?;
    if db::check(&conn).is_err() {
        drop(conn);
        remove_db_files(&path);
        return Ok(None);
    }
    Ok(Some((path, conn)))
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT count(*) FROM {table} WHERE deleted_at IS NULL"), [], |r| r.get(0)).unwrap_or(0)
}

fn preview_of(conn: &Connection) -> Preview {
    Preview {
        tasks: count(conn, "tasks"),
        events: count(conn, "events"),
        obligations: count(conn, "obligations"),
        notes: count(conn, "notes"),
    }
}

/// Clé maîtresse d'une sauvegarde d'un autre compte, par son mot de passe.
fn key_from_password(backup: &BackupFile, password: &str) -> Result<SecretKey, VaultError> {
    open_slot(&backup.header.password, password.as_bytes(), PASSWORD_CONTEXT, backup.header.kdf)?
        .ok_or(VaultError::WrongBackupPassword)
}

/// Comment une sauvegarde a été restaurée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Restored {
    /// Même compte : mot de passe, clé de récupération et Windows Hello inchangés.
    SameAccount,
    /// Autre compte : son mot de passe et sa clé de récupération remplacent les actuels.
    OtherAccount,
}

impl Vault {
    /// Sauvegarde de la base ouverte (le coffre doit être déverrouillé).
    pub fn backup(&mut self, origin: &str, local_day: &str, app_version: &str, now: u64) -> Result<Vec<u8>, VaultError> {
        let session = self.session.as_ref().ok_or(VaultError::Locked)?;
        // Tout le journal rejoint la base : le fichier seul est complet.
        session.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        let schema_version = db::schema_version(&session.conn)?;
        let db = fs::read(self.db_path())?;
        let mut header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        // Windows Hello est lié à ce PC ; les essais ratés ne voyagent pas.
        header.hello = None;
        header.failed_attempts = 0;
        header.blocked_until = 0;
        header.password_logon = 0;
        let manifest = Manifest {
            format: CONTAINER_VERSION,
            created_at: now,
            local_day: local_day.into(),
            app_version: app_version.into(),
            schema_version,
            origin: origin.into(),
            db_size: db.len() as u64,
            db_sha256: sha256_hex(&db),
        };
        encode(&BackupFile { manifest, header, db })
    }

    /// Contenu d'une sauvegarde : avec la clé du compte ouvert, sinon avec le mot de passe de
    /// la sauvegarde. `Ok(None)` : autre compte, mot de passe nécessaire.
    pub fn backup_preview(&self, backup: &BackupFile, password: Option<&str>) -> Result<Option<Preview>, VaultError> {
        let key = match (&self.session, password) {
            (_, Some(password)) => key_from_password(backup, password)?,
            (Some(session), None) => session.key.clone(),
            (None, None) => return Ok(None),
        };
        let Some((path, conn)) = open_work(&self.dir, backup, &key)? else {
            return if password.is_some() { Err(corrupted("la base de la sauvegarde ne s'ouvre pas")) } else { Ok(None) };
        };
        let preview = preview_of(&conn);
        drop(conn);
        remove_db_files(&path);
        Ok(Some(preview))
    }

    /// Remplace les données par celles d'une sauvegarde, puis ouvre le coffre.
    /// - Même compte (la clé ouverte lit la sauvegarde) : l'en-tête actuel est gardé.
    /// - Sinon, `password` (celui de la sauvegarde) ouvre sa clé ; son en-tête remplace l'actuel.
    pub fn restore(&mut self, backup: &BackupFile, password: Option<&str>, now: u64) -> Result<Restored, VaultError> {
        fs::create_dir_all(&self.dir)?;
        let same = match &self.session {
            Some(session) => open_work(&self.dir, backup, &session.key)?.map(|work| (work, session.key.clone())),
            None => None,
        };
        let (work, key, outcome) = match same {
            Some((work, key)) => (work, key, Restored::SameAccount),
            None => {
                let password = password.ok_or(VaultError::BackupPasswordNeeded)?;
                let key = key_from_password(backup, password)?;
                let work = open_work(&self.dir, backup, &key)?.ok_or_else(|| corrupted("la base de la sauvegarde ne s'ouvre pas"))?;
                (work, key, Restored::OtherAccount)
            }
        };
        let (work_path, work_conn) = work;
        drop(work_conn);

        // La base actuelle se ferme ; celle de la sauvegarde prend sa place.
        self.lock();
        let db_path = self.db_path();
        remove_db_files(&db_path);
        fs::rename(&work_path, &db_path)?;
        remove_db_files(&work_path);
        if outcome == Restored::OtherAccount {
            let mut header = backup.header.clone();
            header.hello = None;
            header.failed_attempts = 0;
            header.blocked_until = 0;
            header.password_logon = self.logon;
            header::save(&self.dir, &header, true)?;
        }
        let conn = db::open(&db_path, &key, now)?;
        db::log_event(&conn, now, "restauration", Some(&backup.manifest.local_day))?;
        self.session = Some(Session { conn, key });
        Ok(outcome)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;

    const NOW: u64 = 1_790_000_000;

    fn vault(dir: &Path, password: &str) -> Vault {
        let mut v = Vault::with_kdf(dir.to_path_buf(), KdfParams::FAST_FOR_TESTS);
        v.create(password, NOW).unwrap();
        v
    }

    fn add_task(v: &mut Vault, title: &str) {
        let input = crate::data::tasks::TaskInput { title: title.into(), ..Default::default() };
        let today = crate::data::recurrence::Day::parse("2026-09-29").unwrap();
        crate::data::tasks::create(v.connection_mut().unwrap(), &input, NOW, today).unwrap();
    }

    #[test]
    fn une_sauvegarde_se_relit_et_refuse_un_fichier_abime() {
        let dir = tempfile::tempdir().unwrap();
        let mut v = vault(dir.path(), "mot de passe de test");
        add_task(&mut v, "Arroser");
        let bytes = v.backup("manuelle", "2026-09-29", "0.14.0", NOW).unwrap();
        let backup = decode(&bytes).unwrap();
        assert_eq!(backup.manifest.origin, "manuelle");
        assert_eq!(backup.header.hello, None);
        assert!(backup.db.len() > 1000);
        // Le fichier ne contient pas le texte en clair.
        assert!(!bytes.windows(7).any(|w| w == b"Arroser"));

        let path = dir.path().join("s.aqueli");
        fs::write(&path, &bytes).unwrap();
        assert_eq!(read_manifest(&path).unwrap(), backup.manifest);

        let mut broken = bytes.clone();
        let last = broken.len() - 10;
        broken[last] ^= 0xff;
        assert!(matches!(decode(&broken), Err(VaultError::Corrupted { .. })));
        assert!(matches!(decode(b"pas une sauvegarde"), Err(VaultError::Corrupted { .. })));
    }

    #[test]
    fn restaurer_une_sauvegarde_du_meme_compte_garde_le_mot_de_passe() {
        let dir = tempfile::tempdir().unwrap();
        let mut v = vault(dir.path(), "mot de passe de test");
        add_task(&mut v, "Avant");
        let backup = decode(&v.backup("automatique", "2026-09-29", "0.14.0", NOW).unwrap()).unwrap();
        add_task(&mut v, "Après");
        assert_eq!(v.backup_preview(&backup, None).unwrap(), Some(Preview { tasks: 1, ..Default::default() }));

        assert_eq!(v.restore(&backup, None, NOW + 10).unwrap(), Restored::SameAccount);
        let tasks = crate::data::tasks::list(v.connection().unwrap(), 0, NOW).unwrap();
        assert_eq!(tasks.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), vec!["Avant"]);
        v.lock();
        v.unlock("mot de passe de test", NOW + 20).unwrap();
    }

    #[test]
    fn une_sauvegarde_d_un_autre_compte_demande_son_mot_de_passe() {
        let source_dir = tempfile::tempdir().unwrap();
        let mut source = vault(source_dir.path(), "ancien mot de passe");
        add_task(&mut source, "Du premier PC");
        let backup = decode(&source.backup("export", "2026-09-29", "0.14.0", NOW).unwrap()).unwrap();

        // Nouveau PC, sans compte.
        let dir = tempfile::tempdir().unwrap();
        let mut fresh = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        assert_eq!(fresh.restore(&backup, None, NOW), Err(VaultError::BackupPasswordNeeded));
        assert_eq!(fresh.restore(&backup, Some("autre chose"), NOW), Err(VaultError::WrongBackupPassword));
        assert_eq!(
            fresh.backup_preview(&backup, Some("ancien mot de passe")).unwrap(),
            Some(Preview { tasks: 1, ..Default::default() })
        );
        assert_eq!(fresh.restore(&backup, Some("ancien mot de passe"), NOW).unwrap(), Restored::OtherAccount);
        fresh.lock();
        fresh.unlock("ancien mot de passe", NOW).unwrap();
        let tasks = crate::data::tasks::list(fresh.connection().unwrap(), 0, NOW).unwrap();
        assert_eq!(tasks[0].title, "Du premier PC");

        // Compte existant, autre clé : l'aperçu demande le mot de passe de la sauvegarde.
        let other_dir = tempfile::tempdir().unwrap();
        let other = vault(other_dir.path(), "mot de passe du second");
        assert_eq!(other.backup_preview(&backup, None).unwrap(), None);
    }
}
