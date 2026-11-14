//! Objectifs d'épargne du Budget : un montant à atteindre (vacances, apport, coussin de
//! sécurité…), une date facultative et des versements. Ils ne touchent pas aux opérations du mois :
//! mettre de côté n'est ni une dépense ni un revenu. Un objectif supprimé passe 30 jours à la
//! corbeille avec ses versements.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{self, clean_line, invalid, is_valid_date, space_exists, TRASH_SECONDS};
use super::DataError;

pub const MAX_GOALS: usize = 100;
pub const MAX_ENTRIES: usize = 20_000;
pub const MAX_NAME_CHARS: usize = 120;
pub const MAX_NOTE_CHARS: usize = 200;
/// Cent millions d'unités au plus (un apport immobilier, même en yens).
pub const MAX_TARGET_CENTS: i64 = 10_000_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavingsGoal {
    pub id: String,
    pub name: String,
    pub target_cents: i64,
    pub target_date: Option<String>,
    pub color: Option<String>,
    pub icon: String,
    pub space_id: Option<String>,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
    /// Somme des versements (retraits déduits), en centimes.
    pub saved_cents: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SavingsGoalInput {
    pub name: String,
    pub target_cents: i64,
    pub target_date: Option<String>,
    pub color: Option<String>,
    pub icon: String,
    pub space_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavingsEntry {
    pub id: String,
    pub goal_id: String,
    pub day: String,
    /// Versement (positif) ou retrait (négatif), en centimes.
    pub amount_cents: i64,
    pub note: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SavingsEntryInput {
    pub day: String,
    pub amount_cents: i64,
    pub note: String,
}

const GOAL_COLUMNS: &str = "g.id, g.name, g.target_cents, g.target_date, g.color, g.icon, g.space_id, g.position, g.created_at, g.updated_at,
     COALESCE((SELECT SUM(e.amount_cents) FROM savings_entries e WHERE e.goal_id = g.id), 0)";

fn goal_row(row: &Row) -> rusqlite::Result<SavingsGoal> {
    Ok(SavingsGoal {
        id: row.get(0)?,
        name: row.get(1)?,
        target_cents: row.get(2)?,
        target_date: row.get(3)?,
        color: row.get(4)?,
        icon: row.get(5)?,
        space_id: row.get(6)?,
        position: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        saved_cents: row.get(10)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<SavingsGoal, DataError> {
    conn.query_row(&format!("SELECT {GOAL_COLUMNS} FROM savings_goals g WHERE g.id = ?1 AND g.deleted_at IS NULL"), params![id], goal_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Objectifs, dans l'ordre choisi. Vide au passage la corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<SavingsGoal>, DataError> {
    let limit = now as i64 - TRASH_SECONDS;
    conn.execute("DELETE FROM savings_entries WHERE goal_id IN (SELECT id FROM savings_goals WHERE deleted_at IS NOT NULL AND deleted_at < ?1)", params![limit])?;
    conn.execute("DELETE FROM savings_goals WHERE deleted_at IS NOT NULL AND deleted_at < ?1", params![limit])?;
    let mut stmt = conn.prepare(&format!("SELECT {GOAL_COLUMNS} FROM savings_goals g WHERE g.deleted_at IS NULL ORDER BY g.position, g.created_at"))?;
    let rows = stmt.query_map([], goal_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn clean_goal(conn: &Connection, input: &SavingsGoalInput, current_space: Option<&str>) -> Result<SavingsGoalInput, DataError> {
    if !(1..=MAX_TARGET_CENTS).contains(&input.target_cents) {
        return Err(invalid("targetCents"));
    }
    if input.target_date.as_deref().is_some_and(|d| !is_valid_date(d)) {
        return Err(invalid("targetDate"));
    }
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    Ok(SavingsGoalInput {
        name: clean_line(&input.name, MAX_NAME_CHARS, "name")?,
        target_cents: input.target_cents,
        target_date: input.target_date.clone(),
        color: input.color.as_deref().map(clean_color).transpose()?,
        icon: check_symbol(&input.icon, "icon")?,
        space_id: input.space_id.clone(),
    })
}

pub fn create(conn: &Connection, input: &SavingsGoalInput, now: u64) -> Result<SavingsGoal, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM savings_goals WHERE deleted_at IS NULL", [], |r| r.get(0))?;
    if count as usize >= MAX_GOALS {
        return Err(DataError::TooMany { max: MAX_GOALS });
    }
    let g = clean_goal(conn, input, None)?;
    let id = tasks::random_id()?;
    let position: i64 = conn.query_row("SELECT COALESCE(MAX(position) + 1, 0) FROM savings_goals", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO savings_goals (id, name, target_cents, target_date, color, icon, space_id, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![id, g.name, g.target_cents, g.target_date, g.color, g.icon, g.space_id, position, now as i64],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: &SavingsGoalInput, now: u64) -> Result<SavingsGoal, DataError> {
    let current = get(conn, id)?;
    let g = clean_goal(conn, input, current.space_id.as_deref())?;
    conn.execute(
        "UPDATE savings_goals SET name = ?2, target_cents = ?3, target_date = ?4, color = ?5, icon = ?6, space_id = ?7, updated_at = ?8 WHERE id = ?1",
        params![id, g.name, g.target_cents, g.target_date, g.color, g.icon, g.space_id, now as i64],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("UPDATE savings_goals SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<SavingsGoal, DataError> {
    let changed = conn.execute(
        "UPDATE savings_goals SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
        params![id, now as i64],
    )?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    get(conn, id)
}

/// Suppression définitive (corbeille), versements compris.
pub fn purge(conn: &Connection, id: &str) -> Result<usize, DataError> {
    let n = conn.execute("DELETE FROM savings_goals WHERE id = ?1 AND deleted_at IS NOT NULL", params![id])?;
    if n > 0 {
        conn.execute("DELETE FROM savings_entries WHERE goal_id = ?1", params![id])?;
    }
    Ok(n)
}

// ——— Versements ———

fn entry_row(row: &Row) -> rusqlite::Result<SavingsEntry> {
    Ok(SavingsEntry { id: row.get(0)?, goal_id: row.get(1)?, day: row.get(2)?, amount_cents: row.get(3)?, note: row.get(4)?, created_at: row.get(5)? })
}

/// Versements des objectifs qui ne sont pas à la corbeille, du plus récent au plus ancien.
pub fn entries(conn: &Connection) -> Result<Vec<SavingsEntry>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.goal_id, e.day, e.amount_cents, e.note, e.created_at FROM savings_entries e
         JOIN savings_goals g ON g.id = e.goal_id AND g.deleted_at IS NULL
         ORDER BY e.day DESC, e.created_at DESC",
    )?;
    let rows = stmt.query_map([], entry_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn add_entry(conn: &Connection, goal_id: &str, input: &SavingsEntryInput, now: u64) -> Result<SavingsEntry, DataError> {
    get(conn, goal_id)?;
    if !is_valid_date(&input.day) {
        return Err(invalid("day"));
    }
    if input.amount_cents == 0 || input.amount_cents.abs() > MAX_TARGET_CENTS {
        return Err(invalid("amountCents"));
    }
    let note = if input.note.trim().is_empty() { String::new() } else { clean_line(&input.note, MAX_NOTE_CHARS, "note")? };
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM savings_entries", [], |r| r.get(0))?;
    if count as usize >= MAX_ENTRIES {
        return Err(DataError::TooMany { max: MAX_ENTRIES });
    }
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO savings_entries (id, goal_id, day, amount_cents, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, goal_id, input.day, input.amount_cents, note, now as i64],
    )?;
    conn.execute("UPDATE savings_goals SET updated_at = ?2 WHERE id = ?1", params![goal_id, now as i64])?;
    conn.query_row("SELECT id, goal_id, day, amount_cents, note, created_at FROM savings_entries WHERE id = ?1", params![id], entry_row)
        .map_err(Into::into)
}

pub fn delete_entry(conn: &Connection, id: &str) -> Result<(), DataError> {
    let changed = conn.execute("DELETE FROM savings_entries WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    fn goal(name: &str, target: i64) -> SavingsGoalInput {
        SavingsGoalInput { name: name.into(), target_cents: target, icon: "etoile".into(), ..Default::default() }
    }

    #[test]
    fn un_objectif_avance_avec_ses_versements_et_passe_par_la_corbeille() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();

        let trip = create(c, &SavingsGoalInput { target_date: Some("2027-07-01".into()), color: Some("#2D6FF0".into()), ..goal("  Vacances   au Japon ", 300_000) }, NOW).unwrap();
        assert_eq!((trip.name.as_str(), trip.saved_cents, trip.color.as_deref()), ("Vacances au Japon", 0, Some("#2d6ff0")));
        add_entry(c, &trip.id, &SavingsEntryInput { day: "2026-10-01".into(), amount_cents: 50_000, note: "Prime".into() }, NOW).unwrap();
        let back = add_entry(c, &trip.id, &SavingsEntryInput { day: "2026-10-15".into(), amount_cents: -10_000, note: String::new() }, NOW).unwrap();
        assert_eq!(get(c, &trip.id).unwrap().saved_cents, 40_000, "un retrait se déduit");
        assert_eq!(entries(c).unwrap().len(), 2);
        delete_entry(c, &back.id).unwrap();
        assert_eq!(get(c, &trip.id).unwrap().saved_cents, 50_000);

        // Valeurs refusées.
        assert_eq!(create(c, &goal("Rien", 0), NOW), Err(invalid("targetCents")));
        assert_eq!(create(c, &SavingsGoalInput { target_date: Some("2026-02-30".into()), ..goal("X", 10) }, NOW), Err(invalid("targetDate")));
        assert_eq!(add_entry(c, &trip.id, &SavingsEntryInput { day: "2026-10-01".into(), amount_cents: 0, note: String::new() }, NOW), Err(invalid("amountCents")));

        // Corbeille : l'objectif et ses versements disparaissent, puis reviennent.
        delete(c, &trip.id, NOW).unwrap();
        assert!(list(c, NOW).unwrap().is_empty());
        assert!(entries(c).unwrap().is_empty());
        restore(c, &trip.id, NOW).unwrap();
        assert_eq!(list(c, NOW).unwrap()[0].saved_cents, 50_000);
        // Plus de 30 jours à la corbeille : supprimé pour de bon, versements compris.
        delete(c, &trip.id, NOW).unwrap();
        list(c, NOW + 31 * 24 * 3600).unwrap();
        let left: i64 = c.query_row("SELECT COUNT(*) FROM savings_entries", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0);
    }
}
