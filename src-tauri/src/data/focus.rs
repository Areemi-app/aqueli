//! Focus (cahier des charges § 4.10) : séances de concentration terminées, rattachées ou non
//! à une tâche, pour les statistiques (minutes par jour et par semaine) et le temps passé sur
//! chaque tâche.

use rusqlite::{params, Connection};
use serde::Serialize;

use super::recurrence::Day;
use super::tasks::invalid;
use super::DataError;

/// Une séance dure 4 heures au plus.
pub const MAX_MINUTES: u32 = 240;
/// Intention de la séance (« Sur quoi travaillez-vous ? »), courte.
pub const MAX_NOTE_CHARS: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub id: i64,
    pub task_id: Option<String>,
    /// Jour de la séance (« AAAA-MM-JJ »).
    pub day: String,
    /// Début, en secondes Unix.
    pub started_at: i64,
    pub minutes: u32,
    /// Intention donnée avant la séance.
    pub note: Option<String>,
}

/// Enregistre une séance terminée.
pub fn add(conn: &Connection, task_id: Option<&str>, day: &str, started_at: i64, minutes: u32, note: Option<&str>) -> Result<FocusSession, DataError> {
    let day = Day::parse(day).filter(|d| (1900..=2999).contains(&d.year)).ok_or_else(|| invalid("day"))?.format();
    if !(1..=MAX_MINUTES).contains(&minutes) {
        return Err(invalid("minutes"));
    }
    let task_id = task_id.filter(|id| !id.is_empty() && id.len() <= 32 && id.chars().all(|c| c.is_ascii_alphanumeric()));
    let note = match note.map(str::trim).filter(|n| !n.is_empty()) {
        Some(n) => Some(super::tasks::clean_line(n, MAX_NOTE_CHARS, "note")?),
        None => None,
    };
    conn.execute(
        "INSERT INTO focus_sessions (task_id, day, started_at, minutes, note) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![task_id, day, started_at, minutes, note],
    )?;
    Ok(FocusSession { id: conn.last_insert_rowid(), task_id: task_id.map(str::to_string), day, started_at, minutes, note })
}

/// Séances depuis `since` (« AAAA-MM-JJ », compris), de la plus ancienne à la plus récente.
pub fn list(conn: &Connection, since: &str) -> Result<Vec<FocusSession>, DataError> {
    Day::parse(since).ok_or_else(|| invalid("since"))?;
    let mut stmt =
        conn.prepare("SELECT id, task_id, day, started_at, minutes, note FROM focus_sessions WHERE day >= ?1 ORDER BY started_at")?;
    let rows = stmt.query_map(params![since], |r| {
        Ok(FocusSession { id: r.get(0)?, task_id: r.get(1)?, day: r.get(2)?, started_at: r.get(3)?, minutes: r.get(4)?, note: r.get(5)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Retire une séance (Ctrl+Z juste après son enregistrement).
pub fn delete(conn: &Connection, id: i64) -> Result<(), DataError> {
    if conn.execute("DELETE FROM focus_sessions WHERE id = ?1", params![id])? == 0 {
        return Err(DataError::NotFound);
    }
    Ok(())
}

/// Minutes de concentration par tâche (temps passé), toutes séances confondues.
pub fn minutes_by_task(conn: &Connection) -> Result<Vec<(String, u32)>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT task_id, SUM(minutes) FROM focus_sessions WHERE task_id IS NOT NULL GROUP BY task_id ORDER BY task_id",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    #[test]
    fn seances_enregistrees_listees_et_cumulees() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        add(c, Some("abc123"), "2026-09-30", 100, 25, None).unwrap();
        let s = add(c, Some("abc123"), "2026-10-01", 200, 50, Some("  Rapport   annuel ")).unwrap();
        add(c, None, "2026-10-01", 300, 25, Some("   ")).unwrap();
        // Identifiant de tâche mal formé : la séance compte, sans tâche.
        assert_eq!(add(c, Some("../x"), "2026-10-01", 400, 10, None).unwrap().task_id, None);
        let today = list(c, "2026-10-01").unwrap();
        assert_eq!(today.len(), 3);
        // Intention nettoyée ; vide, elle n'est pas gardée.
        assert_eq!(today[0].note.as_deref(), Some("Rapport annuel"));
        assert_eq!(today[1].note, None);
        assert_eq!(add(c, None, "2026-10-01", 1, 5, Some(&"x".repeat(201))), Err(invalid("note")));
        assert_eq!(minutes_by_task(c).unwrap(), [("abc123".to_string(), 75)]);
        delete(c, s.id).unwrap();
        assert_eq!(minutes_by_task(c).unwrap(), [("abc123".to_string(), 25)]);
        assert_eq!(add(c, None, "2026-10-01", 1, 0, None), Err(invalid("minutes")));
        assert_eq!(add(c, None, "2026-10-01", 1, 241, None), Err(invalid("minutes")));
        assert_eq!(delete(c, s.id), Err(DataError::NotFound));
    }
}
