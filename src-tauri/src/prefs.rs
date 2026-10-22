//! Préférences d'affichage (thème, sons, taille du texte, dernier écran…) : un petit fichier
//! JSON à côté du compte, lisible avant le déverrouillage et partagé par la version
//! installée et la version de développement. Jamais de donnée personnelle ici.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::files::write_atomic;

pub const PREFS_FILE: &str = "preferences.json";
/// Quelques dizaines de réglages courts suffisent : au-delà, c'est une erreur.
const MAX_ENTRIES: usize = 100;
const MAX_KEY_LEN: usize = 64;
const MAX_BYTES: usize = 256 * 1024;

pub type Prefs = BTreeMap<String, Value>;

/// Erreurs envoyées à l'interface.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum PrefsError {
    /// Préférences refusées (trop nombreuses, trop grandes ou nom invalide).
    Invalid,
    Io { detail: String },
}

impl From<std::io::Error> for PrefsError {
    fn from(e: std::io::Error) -> Self {
        PrefsError::Io { detail: e.to_string() }
    }
}

fn valid_key(key: &str) -> bool {
    !key.is_empty() && key.len() <= MAX_KEY_LEN && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Préférences enregistrées. Un fichier absent ou illisible donne des préférences vides
/// (les réglages par défaut s'appliquent) ; les entrées au nom invalide sont ignorées.
pub fn load(dir: &Path) -> Prefs {
    let Ok(bytes) = fs::read(dir.join(PREFS_FILE)) else {
        return Prefs::new();
    };
    if bytes.len() > MAX_BYTES {
        return Prefs::new();
    }
    let Ok(prefs) = serde_json::from_slice::<Prefs>(&bytes) else {
        return Prefs::new();
    };
    prefs.into_iter().filter(|(key, _)| valid_key(key)).take(MAX_ENTRIES).collect()
}

/// Enregistre toutes les préférences d'un coup, sans jamais laisser un fichier à moitié écrit.
pub fn save(dir: &Path, prefs: &Prefs) -> Result<(), PrefsError> {
    if prefs.len() > MAX_ENTRIES || !prefs.keys().all(|key| valid_key(key)) {
        return Err(PrefsError::Invalid);
    }
    let bytes = serde_json::to_vec_pretty(prefs).map_err(|_| PrefsError::Invalid)?;
    if bytes.len() > MAX_BYTES {
        return Err(PrefsError::Invalid);
    }
    fs::create_dir_all(dir)?;
    write_atomic(&dir.join(PREFS_FILE), &bytes)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> Prefs {
        Prefs::from([
            ("theme".to_string(), json!("nuit-etoilee")),
            ("sons".to_string(), json!({ "enabled": true, "volume": 60 })),
        ])
    }

    #[test]
    fn sans_fichier_les_preferences_sont_vides() {
        let dir = tempfile::tempdir().unwrap();
        assert!(load(dir.path()).is_empty());
    }

    #[test]
    fn les_preferences_enregistrees_sont_relues() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &sample()).unwrap();
        assert_eq!(load(dir.path()), sample());
        assert!(!dir.path().join("preferences.tmp").exists(), "aucun fichier temporaire ne reste");
    }

    #[test]
    fn le_dossier_est_cree_au_besoin() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("Aqueli");
        save(&dir, &sample()).unwrap();
        assert_eq!(load(&dir), sample());
    }

    #[test]
    fn un_fichier_abime_donne_les_reglages_par_defaut() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(PREFS_FILE), b"{ pas du json").unwrap();
        assert!(load(dir.path()).is_empty());
    }

    #[test]
    fn les_noms_invalides_sont_ignores_a_la_lecture() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(PREFS_FILE), br#"{"theme":"aqua","../evasion":1,"":2}"#).unwrap();
        assert_eq!(load(dir.path()), Prefs::from([("theme".to_string(), json!("aqua"))]));
    }

    #[test]
    fn des_preferences_invalides_sont_refusees() {
        let dir = tempfile::tempdir().unwrap();
        let bad_key = Prefs::from([("a b".to_string(), json!(1))]);
        assert_eq!(save(dir.path(), &bad_key), Err(PrefsError::Invalid));

        let too_many: Prefs = (0..=MAX_ENTRIES).map(|i| (format!("cle{i}"), json!(i))).collect();
        assert_eq!(save(dir.path(), &too_many), Err(PrefsError::Invalid));

        let too_big = Prefs::from([("gros".to_string(), json!("x".repeat(MAX_BYTES)))]);
        assert_eq!(save(dir.path(), &too_big), Err(PrefsError::Invalid));
        assert!(!dir.path().join(PREFS_FILE).exists(), "rien n'est écrit");
    }
}
