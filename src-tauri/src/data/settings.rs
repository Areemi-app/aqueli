//! Réglages personnels gardés dans la base chiffrée (table `meta`) plutôt que dans les
//! préférences en clair : ceux qui peuvent en dire beaucoup sur la personne, comme le pays et
//! les fêtes religieuses affichées au calendrier.

use rusqlite::{params, Connection, OptionalExtension};

use super::DataError;

/// Clés admises : une par réglage, rien d'autre ne s'écrit dans `meta` depuis l'interface.
pub const KEYS: [&str; 1] = ["calendrier-jours"];
/// Un réglage est un petit objet JSON.
pub const MAX_CHARS: usize = 4_000;

fn check_key(key: &str) -> Result<(), DataError> {
    if KEYS.contains(&key) {
        Ok(())
    } else {
        Err(DataError::Invalid { field: "key".into() })
    }
}

pub fn get(conn: &Connection, key: &str) -> Result<Option<String>, DataError> {
    check_key(key)?;
    Ok(conn
        .query_row("SELECT value FROM meta WHERE key = ?1", params![format!("reglage:{key}")], |r| r.get(0))
        .optional()?)
}

/// Enregistre (ou remplace) un réglage : un objet JSON de taille raisonnable.
pub fn set(conn: &Connection, key: &str, value: &str) -> Result<(), DataError> {
    check_key(key)?;
    let is_object = value.len() <= MAX_CHARS && serde_json::from_str::<serde_json::Value>(value).is_ok_and(|v| v.is_object());
    if !is_object {
        return Err(DataError::Invalid { field: "value".into() });
    }
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![format!("reglage:{key}"), value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    #[test]
    fn un_reglage_s_enregistre_et_se_remplace() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        assert_eq!(get(c, "calendrier-jours").unwrap(), None);
        set(c, "calendrier-jours", r#"{"country":"fr","zones":["A"],"traditions":[]}"#).unwrap();
        set(c, "calendrier-jours", r#"{"country":"be","zones":[],"traditions":["juive"]}"#).unwrap();
        assert_eq!(get(c, "calendrier-jours").unwrap().as_deref(), Some(r#"{"country":"be","zones":[],"traditions":["juive"]}"#));
    }

    #[test]
    fn seuls_les_reglages_attendus_passent() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        assert!(get(c, "theme").is_err());
        assert!(set(c, "autre", "{}").is_err());
        assert!(set(c, "calendrier-jours", "[1, 2]").is_err());
        assert!(set(c, "calendrier-jours", "pas du JSON").is_err());
        assert!(set(c, "calendrier-jours", &format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_CHARS))).is_err());
    }
}
