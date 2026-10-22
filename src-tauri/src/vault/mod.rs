//! Coffre-fort d'Aqueli.
//!
//! - Une clé maîtresse aléatoire (256 bits) chiffre la base SQLCipher.
//! - Elle est enfermée dans l'en-tête par le mot de passe et par la clé de récupération
//!   (Argon2id puis AES-256-GCM), et en option par Windows Hello (clé RSA du TPM).
//! - Ni le mot de passe, ni la clé de récupération, ni la clé maîtresse ne sont jamais
//!   écrits en clair ; la clé maîtresse est effacée de la mémoire au verrouillage.

pub mod backup;
pub mod crypto;
mod db;
mod error;
mod header;
pub mod hello;
pub mod recovery;
mod throttle;

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;
use zeroize::Zeroizing;

use crypto::{KdfParams, SecretKey, KEY_LEN, SALT_LEN};
pub use error::VaultError;
use header::{Header, HelloSlot, Slot, FORMAT_VERSION};
use hello::{HelloProvider, CHALLENGE_LEN};

pub const MIN_PASSWORD_CHARS: usize = 8;

// Étiquettes liées au chiffrement des serrures, écrites sous l'ancien nom de l'application :
// les changer rendrait illisibles les coffres existants.
const PASSWORD_CONTEXT: &[u8] = b"aqualis/coffre/v1/mot-de-passe";
const RECOVERY_CONTEXT: &[u8] = b"aqualis/coffre/v1/cle-de-recuperation";
const HELLO_CONTEXT: &[u8] = b"aqualis/coffre/v1/windows-hello";

/// Ce que l'interface a besoin de savoir pour choisir l'écran à afficher.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub exists: bool,
    pub unlocked: bool,
    /// Attente restante avant le prochain essai (0 = aucun blocage).
    pub wait_seconds: u64,
    /// Windows Hello est activé pour Aqueli.
    pub hello_enabled: bool,
    /// Windows Hello est utilisable maintenant (mot de passe déjà saisi dans cette session Windows).
    pub hello_ready: bool,
}

struct Session {
    conn: Connection,
    /// Clé maîtresse, gardée tant que le coffre est ouvert (activation de Windows Hello).
    key: SecretKey,
}

pub struct Vault {
    dir: PathBuf,
    /// Nom du fichier de la base (l'ancien nom si la base n'a pas pu être renommée).
    db_file: &'static str,
    kdf: KdfParams,
    session: Option<Session>,
    /// Identifiant de la session Windows en cours (0 = inconnu : Windows Hello refusé).
    logon: u64,
}

fn corrupted(detail: &str) -> VaultError {
    VaultError::Corrupted { detail: detail.into() }
}

fn check_password(password: &str) -> Result<(), VaultError> {
    if password.chars().count() < MIN_PASSWORD_CHARS {
        return Err(VaultError::PasswordTooShort { min_length: MIN_PASSWORD_CHARS });
    }
    Ok(())
}

/// Enferme la clé maîtresse avec un secret (mot de passe ou clé de récupération).
fn seal_slot(master: &SecretKey, secret: &[u8], context: &[u8], kdf: KdfParams) -> Result<Slot, VaultError> {
    let salt = crypto::random_bytes::<SALT_LEN>()?;
    let wrapping_key = crypto::derive_key(secret, &salt, kdf)?;
    let (nonce, sealed) = crypto::seal(&wrapping_key, master.as_ref(), context)?;
    Ok(Slot { salt: hex::encode(salt), nonce: hex::encode(nonce), sealed_key: hex::encode(sealed) })
}

/// Tente de sortir la clé maîtresse d'une serrure. `Ok(None)` : mauvais secret.
fn open_slot(slot: &Slot, secret: &[u8], context: &[u8], kdf: KdfParams) -> Result<Option<SecretKey>, VaultError> {
    let salt = hex::decode(&slot.salt).map_err(|_| corrupted("sel illisible"))?;
    let nonce = hex::decode(&slot.nonce).map_err(|_| corrupted("nonce illisible"))?;
    let sealed = hex::decode(&slot.sealed_key).map_err(|_| corrupted("clé enfermée illisible"))?;
    let wrapping_key = crypto::derive_key(secret, &salt, kdf)?;
    match crypto::open(&wrapping_key, &nonce, &sealed, context) {
        Ok(bytes) => {
            let key: [u8; KEY_LEN] = bytes.as_slice().try_into().map_err(|_| corrupted("clé maîtresse de mauvaise taille"))?;
            Ok(Some(Zeroizing::new(key)))
        }
        Err(_) => Ok(None),
    }
}

fn ensure_not_blocked(header: &Header, now: u64) -> Result<(), VaultError> {
    if now < header.blocked_until {
        return Err(VaultError::TooManyAttempts { wait_seconds: header.blocked_until - now });
    }
    Ok(())
}

fn remove_db_files(db_path: &Path) {
    for suffix in ["", "-wal", "-shm"] {
        let mut name = db_path.as_os_str().to_owned();
        name.push(suffix);
        let _ = fs::remove_file(PathBuf::from(name));
    }
}

impl Vault {
    pub fn new(dir: PathBuf) -> Self {
        Self::with_kdf(dir, KdfParams::STANDARD)
    }

    pub fn with_kdf(dir: PathBuf, kdf: KdfParams) -> Self {
        let db_file = db::adopt_old_files(&dir);
        Self { dir, db_file, kdf, session: None, logon: 0 }
    }

    /// Indique la session Windows en cours (heure d'ouverture de session).
    pub fn set_logon(&mut self, logon: u64) {
        self.logon = logon;
    }

    fn db_path(&self) -> PathBuf {
        self.dir.join(self.db_file)
    }

    pub fn is_unlocked(&self) -> bool {
        self.session.is_some()
    }

    pub fn status(&self, now: u64) -> Result<VaultStatus, VaultError> {
        let header = header::load(&self.dir)?;
        Ok(VaultStatus {
            exists: header.is_some(),
            unlocked: self.session.is_some(),
            wait_seconds: header.as_ref().map_or(0, |h| h.blocked_until.saturating_sub(now)),
            hello_enabled: header.as_ref().is_some_and(|h| h.hello.is_some()),
            hello_ready: header.as_ref().is_some_and(|h| self.hello_ready(h)),
        })
    }

    /// Crée le coffre et le laisse ouvert. Renvoie la clé de récupération mise en forme,
    /// à montrer une seule fois : elle n'est enregistrée nulle part.
    pub fn create(&mut self, password: &str, now: u64) -> Result<Zeroizing<String>, VaultError> {
        check_password(password)?;
        if header::load(&self.dir)?.is_some() || self.db_path().exists() {
            return Err(VaultError::AlreadyExists);
        }
        fs::create_dir_all(&self.dir)?;

        let master = crypto::random_key()?;
        let recovery_key = recovery::generate()?;
        let header = Header {
            format: FORMAT_VERSION,
            created_at: now,
            kdf: self.kdf,
            password: seal_slot(&master, password.as_bytes(), PASSWORD_CONTEXT, self.kdf)?,
            recovery: seal_slot(&master, recovery_key.as_bytes(), RECOVERY_CONTEXT, self.kdf)?,
            failed_attempts: 0,
            blocked_until: 0,
            hello: None,
            password_logon: self.logon,
        };

        let db_path = self.db_path();
        let conn = match db::create(&db_path, &master, now).and_then(|conn| {
            db::log_event(&conn, now, "creation", None)?;
            Ok(conn)
        }) {
            Ok(conn) => conn,
            Err(e) => {
                remove_db_files(&db_path);
                return Err(e);
            }
        };
        if let Err(e) = header::save(&self.dir, &header, true) {
            drop(conn);
            remove_db_files(&db_path);
            return Err(e);
        }

        self.session = Some(Session { conn, key: master });
        Ok(recovery::format(&recovery_key))
    }

    pub fn unlock(&mut self, password: &str, now: u64) -> Result<(), VaultError> {
        if self.session.is_some() {
            return Ok(());
        }
        let mut header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        ensure_not_blocked(&header, now)?;
        match open_slot(&header.password, password.as_bytes(), PASSWORD_CONTEXT, header.kdf)? {
            Some(master) => self.start_session(&mut header, master, now, "deverrouillage", true),
            None => {
                let (attempts_left, wait_seconds) = self.record_failure(&mut header, now)?;
                Err(VaultError::WrongPassword { attempts_left, wait_seconds })
            }
        }
    }

    /// Mot de passe oublié : la clé de récupération rouvre le coffre et un nouveau mot
    /// de passe remplace l'ancien. La clé de récupération, elle, reste la même.
    pub fn recover(&mut self, recovery_input: &str, new_password: &str, now: u64) -> Result<(), VaultError> {
        check_password(new_password)?;
        let recovery_key = recovery::normalize(recovery_input).ok_or(VaultError::InvalidRecoveryKey)?;
        let mut header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        ensure_not_blocked(&header, now)?;
        let Some(master) = open_slot(&header.recovery, recovery_key.as_bytes(), RECOVERY_CONTEXT, header.kdf)? else {
            let (attempts_left, wait_seconds) = self.record_failure(&mut header, now)?;
            return Err(VaultError::WrongRecoveryKey { attempts_left, wait_seconds });
        };
        let conn = db::open(&self.db_path(), &master, now)?;
        header.password = seal_slot(&master, new_password.as_bytes(), PASSWORD_CONTEXT, header.kdf)?;
        header.failed_attempts = 0;
        header.blocked_until = 0;
        header.password_logon = self.logon;
        header::save(&self.dir, &header, true)?;
        db::log_event(&conn, now, "recuperation", None)?;
        self.session = Some(Session { conn, key: master });
        Ok(())
    }

    /// Change le mot de passe (il faut connaître l'actuel). La base n'est pas rechiffrée :
    /// seule la serrure « mot de passe » est refaite.
    pub fn change_password(&mut self, current: &str, new_password: &str, now: u64) -> Result<(), VaultError> {
        check_password(new_password)?;
        let mut header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        ensure_not_blocked(&header, now)?;
        let Some(master) = open_slot(&header.password, current.as_bytes(), PASSWORD_CONTEXT, header.kdf)? else {
            let (attempts_left, wait_seconds) = self.record_failure(&mut header, now)?;
            return Err(VaultError::WrongPassword { attempts_left, wait_seconds });
        };
        header.password = seal_slot(&master, new_password.as_bytes(), PASSWORD_CONTEXT, header.kdf)?;
        header.failed_attempts = 0;
        header.blocked_until = 0;
        header::save(&self.dir, &header, true)?;
        if let Some(session) = &self.session {
            db::log_event(&session.conn, now, "changement-mot-de-passe", None)?;
        }
        Ok(())
    }

    /// Remplace la clé de récupération (perdue ou mal notée). Le mot de passe est demandé
    /// pour qu'une personne passant devant le PC déverrouillé ne puisse pas le faire.
    /// L'ancienne clé cesse de fonctionner.
    pub fn new_recovery_key(&mut self, password: &str, now: u64) -> Result<Zeroizing<String>, VaultError> {
        if self.session.is_none() {
            return Err(VaultError::Locked);
        }
        let mut header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        ensure_not_blocked(&header, now)?;
        let Some(master) = open_slot(&header.password, password.as_bytes(), PASSWORD_CONTEXT, header.kdf)? else {
            let (attempts_left, wait_seconds) = self.record_failure(&mut header, now)?;
            return Err(VaultError::WrongPassword { attempts_left, wait_seconds });
        };
        let recovery_key = recovery::generate()?;
        header.recovery = seal_slot(&master, recovery_key.as_bytes(), RECOVERY_CONTEXT, header.kdf)?;
        header.failed_attempts = 0;
        header.blocked_until = 0;
        header::save(&self.dir, &header, true)?;
        self.with_connection(|c| db::log_event(c, now, "nouvelle-cle-de-recuperation", None))?;
        Ok(recovery::format(&recovery_key))
    }

    /// Vérifie le mot de passe avant une action définitive (suppression du compte, déplacement
    /// des données) ; un mot de passe erroné compte comme un essai raté. Le compte doit être ouvert.
    pub fn confirm_password(&mut self, password: &str, now: u64) -> Result<(), VaultError> {
        if self.session.is_none() {
            return Err(VaultError::Locked);
        }
        let mut header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        ensure_not_blocked(&header, now)?;
        if open_slot(&header.password, password.as_bytes(), PASSWORD_CONTEXT, header.kdf)?.is_none() {
            let (attempts_left, wait_seconds) = self.record_failure(&mut header, now)?;
            return Err(VaultError::WrongPassword { attempts_left, wait_seconds });
        }
        Ok(())
    }

    /// Windows Hello est-il utilisable maintenant, sans mot de passe ? Seulement si le mot de
    /// passe a déjà été saisi dans la session Windows en cours (cahier des charges § 8).
    fn hello_ready(&self, header: &Header) -> bool {
        header.hello.is_some() && self.logon != 0 && header.password_logon == self.logon
    }

    /// Défi à faire signer par Windows Hello pour déverrouiller.
    pub fn hello_challenge(&self, now: u64) -> Result<Vec<u8>, VaultError> {
        let header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        ensure_not_blocked(&header, now)?;
        let slot = header.hello.as_ref().ok_or(VaultError::HelloNotEnabled)?;
        if !self.hello_ready(&header) {
            return Err(VaultError::HelloPasswordRequired);
        }
        hex::decode(&slot.challenge).map_err(|_| corrupted("défi Windows Hello illisible"))
    }

    /// Déverrouille avec la signature Windows Hello du défi.
    pub fn unlock_with_hello_signature(&mut self, signature: &[u8], now: u64) -> Result<(), VaultError> {
        if self.session.is_some() {
            return Ok(());
        }
        let mut header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        ensure_not_blocked(&header, now)?;
        let slot = header.hello.clone().ok_or(VaultError::HelloNotEnabled)?;
        if !self.hello_ready(&header) {
            return Err(VaultError::HelloPasswordRequired);
        }
        let nonce = hex::decode(&slot.nonce).map_err(|_| corrupted("nonce illisible"))?;
        let sealed = hex::decode(&slot.sealed_key).map_err(|_| corrupted("clé enfermée illisible"))?;
        let wrapping_key = hello::key_from_signature(signature);
        let Ok(bytes) = crypto::open(&wrapping_key, &nonce, &sealed, HELLO_CONTEXT) else {
            return Err(VaultError::HelloFailed { detail: "la clé Windows Hello a changé".into() });
        };
        let master: [u8; KEY_LEN] =
            bytes.as_slice().try_into().map_err(|_| corrupted("clé maîtresse de mauvaise taille"))?;
        self.start_session(&mut header, Zeroizing::new(master), now, "deverrouillage-windows-hello", false)
    }

    /// Active Windows Hello : `signature` est la signature Windows Hello de `challenge`.
    pub fn enable_hello_with(&mut self, challenge: &[u8], signature: &[u8], now: u64) -> Result<(), VaultError> {
        let session = self.session.as_ref().ok_or(VaultError::Locked)?;
        let mut header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        let wrapping_key = hello::key_from_signature(signature);
        let (nonce, sealed) = crypto::seal(&wrapping_key, session.key.as_ref(), HELLO_CONTEXT)?;
        header.hello = Some(HelloSlot {
            challenge: hex::encode(challenge),
            nonce: hex::encode(nonce),
            sealed_key: hex::encode(sealed),
        });
        header.password_logon = self.logon;
        header::save(&self.dir, &header, true)?;
        self.with_connection(|c| db::log_event(c, now, "windows-hello-active", None))
    }

    /// Retire la serrure Windows Hello (la clé Windows est supprimée par l'appelant).
    pub fn disable_hello(&mut self, now: u64) -> Result<(), VaultError> {
        if self.session.is_none() {
            return Err(VaultError::Locked);
        }
        let mut header = header::load(&self.dir)?.ok_or(VaultError::NotFound)?;
        header.hello = None;
        header::save(&self.dir, &header, true)?;
        self.with_connection(|c| db::log_event(c, now, "windows-hello-desactive", None))
    }

    /// Activation complète avec un fournisseur Windows Hello. L'application enchaîne ces
    /// étapes elle-même pour ne pas bloquer le coffre pendant le geste Windows Hello.
    pub fn enable_hello(&mut self, provider: &dyn HelloProvider, now: u64) -> Result<(), VaultError> {
        if self.session.is_none() {
            return Err(VaultError::Locked);
        }
        if !provider.is_supported() {
            return Err(VaultError::HelloUnsupported);
        }
        provider.create()?;
        let challenge = crypto::random_bytes::<CHALLENGE_LEN>()?;
        let signature = provider.sign(&challenge)?;
        self.enable_hello_with(&challenge, &signature, now)
    }

    /// Déverrouillage complet avec un fournisseur Windows Hello.
    pub fn unlock_with_hello(&mut self, provider: &dyn HelloProvider, now: u64) -> Result<(), VaultError> {
        let challenge = self.hello_challenge(now)?;
        let signature = provider.sign(&challenge)?;
        self.unlock_with_hello_signature(&signature, now)
    }

    /// Ferme la base et efface la clé maîtresse de la mémoire.
    pub fn lock(&mut self) {
        if let Some(session) = self.session.take() {
            // Reporte le journal WAL dans la base avant de fermer : il ne reste qu'un seul fichier.
            let _ = session.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
    }

    /// Base ouverte, ou `None` si le coffre est verrouillé.
    pub fn connection(&self) -> Option<&Connection> {
        self.session.as_ref().map(|s| &s.conn)
    }

    pub fn connection_mut(&mut self) -> Option<&mut Connection> {
        self.session.as_mut().map(|s| &mut s.conn)
    }

    /// Accès à la base ouverte, pour les modules (Tâches, Notes…).
    pub fn with_connection<T>(&self, f: impl FnOnce(&Connection) -> Result<T, VaultError>) -> Result<T, VaultError> {
        let session = self.session.as_ref().ok_or(VaultError::Locked)?;
        f(&session.conn)
    }

    fn record_failure(&self, header: &mut Header, now: u64) -> Result<(u32, u64), VaultError> {
        header.failed_attempts = header.failed_attempts.saturating_add(1);
        let wait = throttle::wait_after(header.failed_attempts);
        header.blocked_until = if wait > 0 { now + wait } else { 0 };
        header::save(&self.dir, header, false)?;
        Ok((throttle::attempts_left(header.failed_attempts), wait))
    }

    fn start_session(
        &mut self,
        header: &mut Header,
        master: SecretKey,
        now: u64,
        event: &str,
        by_password: bool,
    ) -> Result<(), VaultError> {
        let conn = db::open(&self.db_path(), &master, now)?;
        let failures = header.failed_attempts;
        let new_logon = by_password && header.password_logon != self.logon;
        if failures > 0 || header.blocked_until > 0 || new_logon {
            header.failed_attempts = 0;
            header.blocked_until = 0;
            if by_password {
                header.password_logon = self.logon;
            }
            header::save(&self.dir, header, false)?;
        }
        let detail = (failures > 0).then(|| format!("{failures} essai(s) raté(s) avant ce déverrouillage"));
        db::log_event(&conn, now, event, detail.as_deref())?;
        self.session = Some(Session { conn, key: master });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_790_000_000;
    const PASSWORD: &str = "Vagues et bulles 2026";

    fn new_vault(dir: &Path) -> Vault {
        Vault::with_kdf(dir.to_path_buf(), KdfParams::FAST_FOR_TESTS)
    }

    fn created(dir: &Path) -> (Vault, String) {
        let mut vault = new_vault(dir);
        let key = vault.create(PASSWORD, NOW).unwrap();
        (vault, key.to_string())
    }

    #[test]
    fn un_dossier_vide_n_a_pas_de_coffre() {
        let dir = tempfile::tempdir().unwrap();
        let status = new_vault(dir.path()).status(NOW).unwrap();
        assert_eq!(status, VaultStatus { exists: false, unlocked: false, wait_seconds: 0, hello_enabled: false, hello_ready: false });
    }

    #[test]
    fn la_suppression_du_compte_demande_le_mot_de_passe_puis_ne_laisse_rien() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        assert!(matches!(vault.confirm_password("mauvais mot de passe", NOW), Err(VaultError::WrongPassword { attempts_left: 4, .. })));
        vault.confirm_password(PASSWORD, NOW).unwrap();
        vault.lock();
        assert!(matches!(vault.confirm_password(PASSWORD, NOW), Err(VaultError::Locked)), "compte fermé : refusé");
        crate::files::shred_dir(dir.path(), true).unwrap();
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0, "aucun fichier restant");
        assert!(!new_vault(dir.path()).status(NOW).unwrap().exists, "plus de compte sur ce PC");
    }

    #[test]
    fn creer_puis_deverrouiller() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, key) = created(dir.path());
        assert_eq!(key.len(), 24 + 5, "6 groupes de 4 séparés par des tirets");
        assert!(vault.is_unlocked());

        vault.lock();
        assert!(!vault.is_unlocked());
        assert_eq!(vault.status(NOW).unwrap(), VaultStatus { exists: true, unlocked: false, wait_seconds: 0, hello_enabled: false, hello_ready: false });

        let mut reopened = new_vault(dir.path());
        reopened.unlock(PASSWORD, NOW).unwrap();
        assert!(reopened.is_unlocked());
    }

    #[test]
    fn la_base_est_illisible_sans_la_cle() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        vault.with_connection(|c| Ok(c.execute("INSERT INTO meta VALUES ('essai', 'Dentiste lundi')", [])?)).unwrap();
        vault.lock();

        let db_path = dir.path().join(db::DB_FILE);
        let bytes = fs::read(&db_path).unwrap();
        assert!(!bytes.starts_with(b"SQLite format 3"), "l'en-tête SQLite en clair ne doit pas apparaître");
        assert!(!bytes.windows(7).any(|w| w == b"Dentist"), "le contenu ne doit pas apparaître en clair");

        // Sans clé, SQLite ne reconnaît même pas le fichier.
        let plain = Connection::open(&db_path).unwrap();
        assert!(plain.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0)).is_err());

        // Avec une autre clé non plus.
        let other = crypto::random_key().unwrap();
        assert!(db::open(&db_path, &other, NOW).is_err());
    }

    #[test]
    fn les_donnees_survivent_au_verrouillage() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        vault.with_connection(|c| Ok(c.execute("INSERT INTO meta VALUES ('theme', 'aqua')", [])?)).unwrap();
        vault.lock();
        assert_eq!(vault.with_connection(|_| Ok(())), Err(VaultError::Locked));

        vault.unlock(PASSWORD, NOW).unwrap();
        let theme: String = vault
            .with_connection(|c| Ok(c.query_row("SELECT value FROM meta WHERE key = 'theme'", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(theme, "aqua");
    }

    const LOGON: u64 = 133_000_000_000_000_000;

    fn with_hello(dir: &Path) -> (Vault, hello::fake::FakeHello) {
        let mut vault = new_vault(dir);
        vault.set_logon(LOGON);
        vault.create(PASSWORD, NOW).unwrap();
        let provider = hello::fake::FakeHello::new();
        vault.enable_hello(&provider, NOW).unwrap();
        (vault, provider)
    }

    #[test]
    fn windows_hello_deverrouille_dans_la_meme_session_windows() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, provider) = with_hello(dir.path());
        let status = vault.status(NOW).unwrap();
        assert!(status.hello_enabled && status.hello_ready);

        vault.lock();
        vault.unlock_with_hello(&provider, NOW).unwrap();
        assert!(vault.is_unlocked());
    }

    #[test]
    fn windows_hello_demande_le_mot_de_passe_apres_une_nouvelle_session_windows() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, provider) = with_hello(dir.path());
        vault.lock();

        // Redémarrage du PC : nouvelle session Windows.
        let mut restarted = new_vault(dir.path());
        restarted.set_logon(LOGON + 1);
        let status = restarted.status(NOW).unwrap();
        assert!(status.hello_enabled && !status.hello_ready);
        assert_eq!(restarted.unlock_with_hello(&provider, NOW), Err(VaultError::HelloPasswordRequired));

        restarted.unlock(PASSWORD, NOW).unwrap();
        restarted.lock();
        assert!(restarted.status(NOW).unwrap().hello_ready);
        restarted.unlock_with_hello(&provider, NOW).unwrap();
    }

    #[test]
    fn une_session_windows_inconnue_refuse_windows_hello() {
        let dir = tempfile::tempdir().unwrap();
        let (vault, provider) = with_hello(dir.path());
        drop(vault);
        let mut unknown = new_vault(dir.path());
        assert_eq!(unknown.unlock_with_hello(&provider, NOW), Err(VaultError::HelloPasswordRequired));
    }

    #[test]
    fn annuler_windows_hello_ne_compte_pas_comme_une_erreur() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, provider) = with_hello(dir.path());
        vault.lock();
        *provider.cancel_next.borrow_mut() = true;
        assert_eq!(vault.unlock_with_hello(&provider, NOW), Err(VaultError::HelloCancelled));
        assert_eq!(
            vault.unlock("faux", NOW),
            Err(VaultError::WrongPassword { attempts_left: 4, wait_seconds: 0 })
        );
    }

    #[test]
    fn une_cle_windows_hello_recreee_ne_correspond_plus() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, provider) = with_hello(dir.path());
        vault.lock();
        provider.create().unwrap();
        assert!(matches!(vault.unlock_with_hello(&provider, NOW), Err(VaultError::HelloFailed { .. })));
        provider.delete();
        assert!(matches!(vault.unlock_with_hello(&provider, NOW), Err(VaultError::HelloFailed { .. })));
        vault.unlock(PASSWORD, NOW).unwrap();
    }

    #[test]
    fn desactiver_windows_hello() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, provider) = with_hello(dir.path());
        vault.disable_hello(NOW).unwrap();
        assert!(!vault.status(NOW).unwrap().hello_enabled);
        vault.lock();
        assert_eq!(vault.unlock_with_hello(&provider, NOW), Err(VaultError::HelloNotEnabled));
        assert_eq!(vault.disable_hello(NOW), Err(VaultError::Locked));
    }

    #[test]
    fn activer_windows_hello_demande_un_coffre_ouvert_et_un_pc_compatible() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        let mut unsupported = hello::fake::FakeHello::new();
        unsupported.supported = false;
        assert_eq!(vault.enable_hello(&unsupported, NOW), Err(VaultError::HelloUnsupported));
        vault.lock();
        assert_eq!(vault.enable_hello(&hello::fake::FakeHello::new(), NOW), Err(VaultError::Locked));
    }

    #[test]
    fn windows_hello_survit_a_un_changement_de_mot_de_passe() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, provider) = with_hello(dir.path());
        vault.change_password(PASSWORD, "Autre mot de passe", NOW).unwrap();
        vault.lock();
        vault.unlock_with_hello(&provider, NOW).unwrap();
    }

    #[test]
    fn verrouiller_ferme_proprement_la_base() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        vault.with_connection(|c| Ok(c.execute("INSERT INTO meta VALUES ('a', 'b')", [])?)).unwrap();
        vault.lock();
        assert!(!dir.path().join("aqueli.db-wal").exists(), "le journal temporaire doit disparaître");
        assert!(!dir.path().join("aqueli.db-shm").exists());
    }

    #[test]
    fn un_compte_cree_sous_l_ancien_nom_s_ouvre_intact() {
        let before = tempfile::tempdir().unwrap();
        let (vault, _) = created(before.path());
        vault.with_connection(|c| Ok(c.execute("INSERT INTO meta VALUES ('note', 'dans le journal')", [])?)).unwrap();
        // Copie prise base ouverte : la dernière écriture n'est encore que dans le journal
        // (-wal), comme après une fermeture brutale de l'ancienne version.
        let after = tempfile::tempdir().unwrap();
        for (from, to) in [
            ("aqueli.db", "aqualis.db"),
            ("aqueli.db-wal", "aqualis.db-wal"),
            ("coffre.json", "coffre.json"),
            ("coffre-secours.json", "coffre-secours.json"),
        ] {
            fs::write(after.path().join(to), fs::read(before.path().join(from)).unwrap()).unwrap();
        }

        let mut reopened = new_vault(after.path());
        assert!(after.path().join("aqueli.db").exists() && after.path().join("aqueli.db-wal").exists());
        assert!(!after.path().join("aqualis.db").exists() && !after.path().join("aqualis.db-wal").exists());
        reopened.unlock(PASSWORD, NOW).unwrap();
        let note: String = reopened
            .with_connection(|c| Ok(c.query_row("SELECT value FROM meta WHERE key = 'note'", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(note, "dans le journal");
    }

    #[test]
    fn un_mot_de_passe_trop_court_est_refuse() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = new_vault(dir.path());
        assert_eq!(vault.create("court", NOW), Err(VaultError::PasswordTooShort { min_length: 8 }));
        // Les caractères accentués comptent pour un.
        assert!(vault.create("éééééééé", NOW).is_ok());
    }

    #[test]
    fn on_ne_cree_jamais_par_dessus_un_coffre() {
        let dir = tempfile::tempdir().unwrap();
        let (_vault, _) = created(dir.path());
        let mut second = new_vault(dir.path());
        assert_eq!(second.create("un autre mot de passe", NOW), Err(VaultError::AlreadyExists));
    }

    #[test]
    fn apres_cinq_erreurs_il_faut_patienter() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        vault.lock();

        for expected_left in (1..=4).rev() {
            assert_eq!(
                vault.unlock("mauvais mot de passe", NOW),
                Err(VaultError::WrongPassword { attempts_left: expected_left, wait_seconds: 0 })
            );
        }
        assert_eq!(
            vault.unlock("mauvais mot de passe", NOW),
            Err(VaultError::WrongPassword { attempts_left: 0, wait_seconds: 30 })
        );
        // Même le bon mot de passe attend la fin du délai.
        assert_eq!(vault.unlock(PASSWORD, NOW + 10), Err(VaultError::TooManyAttempts { wait_seconds: 20 }));
        assert_eq!(vault.status(NOW + 10).unwrap().wait_seconds, 20);
        // Le blocage survit à un redémarrage d'Aqueli.
        let mut restarted = new_vault(dir.path());
        assert_eq!(restarted.unlock(PASSWORD, NOW + 10), Err(VaultError::TooManyAttempts { wait_seconds: 20 }));

        // Le délai suivant est plus long.
        assert_eq!(
            restarted.unlock("encore faux", NOW + 30),
            Err(VaultError::WrongPassword { attempts_left: 0, wait_seconds: 60 })
        );
        restarted.unlock(PASSWORD, NOW + 90).unwrap();

        // Un déverrouillage réussi remet le compteur à zéro.
        restarted.lock();
        assert_eq!(
            restarted.unlock("faux", NOW + 100),
            Err(VaultError::WrongPassword { attempts_left: 4, wait_seconds: 0 })
        );
    }

    #[test]
    fn la_cle_de_recuperation_remplace_le_mot_de_passe_oublie() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, key) = created(dir.path());
        vault.with_connection(|c| Ok(c.execute("INSERT INTO meta VALUES ('note', 'gardée')", [])?)).unwrap();
        vault.lock();

        // Saisie en minuscules, avec des espaces : acceptée.
        let typed = key.to_lowercase().replace('-', " ");
        vault.recover(&typed, "Nouveau mot de passe", NOW).unwrap();
        assert!(vault.is_unlocked());
        let note: String = vault
            .with_connection(|c| Ok(c.query_row("SELECT value FROM meta WHERE key = 'note'", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(note, "gardée");

        vault.lock();
        assert!(matches!(vault.unlock(PASSWORD, NOW), Err(VaultError::WrongPassword { .. })));
        vault.unlock("Nouveau mot de passe", NOW).unwrap();

        // La même clé de récupération fonctionne encore ensuite.
        vault.lock();
        vault.recover(&key, "Encore un autre", NOW).unwrap();
    }

    #[test]
    fn une_mauvaise_cle_de_recuperation_est_refusee() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        vault.lock();
        assert_eq!(vault.recover("pas une clé", "Nouveau mot de passe", NOW), Err(VaultError::InvalidRecoveryKey));
        assert_eq!(
            vault.recover("0000-0000-0000-0000-0000-0000", "Nouveau mot de passe", NOW),
            Err(VaultError::WrongRecoveryKey { attempts_left: 4, wait_seconds: 0 })
        );
        vault.unlock(PASSWORD, NOW).unwrap();
    }

    #[test]
    fn changer_le_mot_de_passe() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        assert!(matches!(
            vault.change_password("pas le bon", "Mot de passe neuf", NOW),
            Err(VaultError::WrongPassword { .. })
        ));
        vault.change_password(PASSWORD, "Mot de passe neuf", NOW).unwrap();
        vault.lock();
        assert!(vault.unlock(PASSWORD, NOW).is_err());
        vault.unlock("Mot de passe neuf", NOW).unwrap();
    }

    #[test]
    fn une_nouvelle_cle_de_recuperation_remplace_l_ancienne() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, old_key) = created(dir.path());
        assert!(matches!(vault.new_recovery_key("pas le bon", NOW), Err(VaultError::WrongPassword { .. })));
        let new_key = vault.new_recovery_key(PASSWORD, NOW).unwrap().to_string();
        assert_ne!(new_key, old_key);

        vault.lock();
        assert_eq!(vault.new_recovery_key(PASSWORD, NOW), Err(VaultError::Locked));
        assert!(matches!(
            vault.recover(&old_key, "Autre mot de passe", NOW),
            Err(VaultError::WrongRecoveryKey { .. })
        ));
        vault.recover(&new_key, "Autre mot de passe", NOW).unwrap();
    }

    #[test]
    fn la_copie_de_secours_de_l_en_tete_sauve_le_coffre() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        vault.lock();
        fs::remove_file(dir.path().join(header::HEADER_FILE)).unwrap();
        vault.unlock(PASSWORD, NOW).unwrap();
    }

    #[test]
    fn le_journal_de_securite_note_les_evenements_sans_secret() {
        let dir = tempfile::tempdir().unwrap();
        let (mut vault, _) = created(dir.path());
        vault.lock();
        let _ = vault.unlock("faux mot de passe", NOW);
        vault.unlock(PASSWORD, NOW + 5).unwrap();
        let events: Vec<(String, Option<String>)> = vault
            .with_connection(|c| {
                let mut stmt = c.prepare("SELECT event, detail FROM security_log ORDER BY id")?;
                let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
                Ok(rows.collect::<Result<_, _>>()?)
            })
            .unwrap();
        assert_eq!(events[0].0, "creation");
        assert_eq!(events[1].0, "deverrouillage");
        assert_eq!(events[1].1.as_deref(), Some("1 essai(s) raté(s) avant ce déverrouillage"));
        let all = format!("{events:?}");
        assert!(!all.contains(PASSWORD) && !all.contains("faux mot de passe"));
    }

    #[test]
    fn aucun_secret_n_est_ecrit_en_clair_sur_le_disque() {
        let dir = tempfile::tempdir().unwrap();
        let (vault, key) = created(dir.path());
        drop(vault);
        let raw_key = key.replace('-', "");
        for entry in fs::read_dir(dir.path()).unwrap() {
            let bytes = fs::read(entry.unwrap().path()).unwrap();
            let text = String::from_utf8_lossy(&bytes);
            assert!(!text.contains(PASSWORD));
            assert!(!text.contains(&raw_key));
        }
    }
}
