//! Journal de sécurité local (cahier des charges § 8) : déverrouillages, essais erronés, exports,
//! changements de mot de passe… Gardé dans la base chiffrée ; jamais de secret ni de donnée
//! personnelle (un export note son format, pas le nom du fichier).

use rusqlite::{params, Connection};
use serde::Serialize;

use super::DataError;

/// Événements montrés au plus (les plus récents).
pub const MAX_EVENTS: u32 = 500;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityEvent {
    pub id: i64,
    pub at: i64,
    pub event: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityLog {
    pub events: Vec<SecurityEvent>,
    /// Nombre total d'événements notés.
    pub total: u32,
}

/// Les événements les plus récents d'abord.
pub fn list(conn: &Connection, limit: u32) -> Result<SecurityLog, DataError> {
    let mut stmt = conn.prepare("SELECT id, at, event, detail FROM security_log ORDER BY at DESC, id DESC LIMIT ?1")?;
    let events = stmt
        .query_map(params![limit.min(MAX_EVENTS)], |r| {
            Ok(SecurityEvent { id: r.get(0)?, at: r.get(1)?, event: r.get(2)?, detail: r.get(3)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let total: u32 = conn.query_row("SELECT COUNT(*) FROM security_log", [], |r| r.get(0))?;
    Ok(SecurityLog { events, total })
}

/// Note un export : ce qui est sorti du compte en clair (format ou sorte), sans nom de fichier.
pub fn log_export(conn: &Connection, what: &str, now: u64) -> Result<(), DataError> {
    conn.execute(
        "INSERT INTO security_log (at, event, detail) VALUES (?1, 'export', ?2)",
        params![now as i64, what],
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
    fn le_journal_montre_la_creation_puis_les_exports_les_plus_recents_d_abord() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        log_export(c, "Fichier .vcf", NOW + 10).unwrap();
        log_export(c, "Document", NOW + 20).unwrap();
        let log = list(c, 50).unwrap();
        assert_eq!(log.total, 3);
        let seen: Vec<(&str, Option<&str>)> = log.events.iter().map(|e| (e.event.as_str(), e.detail.as_deref())).collect();
        assert_eq!(seen, vec![("export", Some("Document")), ("export", Some("Fichier .vcf")), ("creation", None)]);
        assert_eq!(list(c, 1).unwrap().events.len(), 1);
    }
}
