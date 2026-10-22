//! Revue hebdomadaire du Bilan (cahier des charges § 4.14) : pour chaque semaine (« 2026-W40 »),
//! les réussites, ce qui est à retenir, les priorités de la semaine suivante, et la date à laquelle
//! la revue a été faite.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::tasks::invalid;
use super::DataError;

pub const MAX_TEXT_CHARS: usize = 5000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub week: String,
    pub wins: String,
    pub lessons: String,
    pub priorities: String,
    pub done_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ReviewInput {
    pub wins: String,
    pub lessons: String,
    pub priorities: String,
    pub done: bool,
}

/// « 2026-W40 » : année ISO et numéro de semaine.
pub fn is_week(week: &str) -> bool {
    let Some((year, number)) = week.split_once("-W") else { return false };
    year.len() == 4 && year.chars().all(|c| c.is_ascii_digit()) && number.len() == 2 && number.parse::<u8>().is_ok_and(|n| (1..=53).contains(&n))
}

fn clean_text(text: &str, field: &str) -> Result<String, DataError> {
    let t = text.replace("\r\n", "\n").trim().to_string();
    if t.chars().count() > MAX_TEXT_CHARS || t.chars().any(|c| c.is_control() && c != '\n') {
        return Err(invalid(field));
    }
    Ok(t)
}

fn row(r: &Row) -> rusqlite::Result<Review> {
    Ok(Review { week: r.get(0)?, wins: r.get(1)?, lessons: r.get(2)?, priorities: r.get(3)?, done_at: r.get(4)?, updated_at: r.get(5)? })
}

/// Les revues, de la plus récente à la plus ancienne.
pub fn list(conn: &Connection) -> Result<Vec<Review>, DataError> {
    let mut stmt = conn.prepare("SELECT week, wins, lessons, priorities, done_at, updated_at FROM reviews ORDER BY week DESC")?;
    let rows = stmt.query_map([], row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Enregistre la revue d'une semaine (la crée au besoin).
pub fn save(conn: &Connection, week: &str, input: &ReviewInput, now: u64) -> Result<Review, DataError> {
    if !is_week(week) {
        return Err(invalid("week"));
    }
    let (wins, lessons, priorities) = (clean_text(&input.wins, "wins")?, clean_text(&input.lessons, "lessons")?, clean_text(&input.priorities, "priorities")?);
    let done_at: Option<i64> = if input.done {
        let before: Option<Option<i64>> = conn.query_row("SELECT done_at FROM reviews WHERE week = ?1", params![week], |r| r.get(0)).optional()?;
        Some(before.flatten().unwrap_or(now as i64))
    } else {
        None
    };
    conn.execute(
        "INSERT INTO reviews (week, wins, lessons, priorities, done_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(week) DO UPDATE SET wins = excluded.wins, lessons = excluded.lessons, priorities = excluded.priorities,
                                         done_at = excluded.done_at, updated_at = excluded.updated_at",
        params![week, wins, lessons, priorities, done_at, now as i64],
    )?;
    Ok(conn.query_row("SELECT week, wins, lessons, priorities, done_at, updated_at FROM reviews WHERE week = ?1", params![week], row)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    #[test]
    fn une_revue_par_semaine_se_complete_puis_se_termine() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        assert!(is_week("2026-W40") && !is_week("2026-40") && !is_week("2026-W54"));
        let draft = save(c, "2026-W40", &ReviewInput { wins: "Déménagement préparé".into(), ..Default::default() }, NOW).unwrap();
        assert_eq!(draft.done_at, None);
        let done = save(c, "2026-W40", &ReviewInput { wins: "Déménagement préparé".into(), priorities: "Cartons".into(), done: true, ..Default::default() }, NOW + 60).unwrap();
        assert_eq!(done.done_at, Some(NOW as i64 + 60));
        let again = save(c, "2026-W40", &ReviewInput { done: true, ..Default::default() }, NOW + 120).unwrap();
        assert_eq!(again.done_at, Some(NOW as i64 + 60), "la date de la revue faite est gardée");
        assert_eq!(list(c).unwrap().len(), 1);
        assert!(save(c, "semaine", &ReviewInput::default(), NOW).is_err());
    }
}
