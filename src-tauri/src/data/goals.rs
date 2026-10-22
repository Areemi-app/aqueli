//! Objectifs (cahier des charges § 4.8) : titre, pourquoi, horizon (année, trimestre, mois),
//! dates, indicateur chiffré, étapes. La progression vient des saisies manuelles, des tâches
//! liées, d'une habitude ou des étapes (calculée par l'interface). Corbeille de 30 jours.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{self, clean_line, invalid, is_valid_date, space_exists, TRASH_SECONDS};
use super::DataError;

pub const MAX_GOALS: usize = 300;
pub const MAX_STEPS: usize = 100;
pub const MAX_ENTRIES: usize = 5000;
pub const MAX_WHY_CHARS: usize = 2000;
pub const HORIZONS: [&str; 4] = ["annee", "trimestre", "mois", "libre"];
/// D'où vient la progression : saisies, tâches liées, habitude, étapes.
pub const METRICS: [&str; 4] = ["manuel", "taches", "habitude", "etapes"];
pub const STATUSES: [&str; 3] = ["en-cours", "atteint", "abandonne"];

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub why: String,
    pub horizon: String,
    pub start_date: String,
    pub target_date: Option<String>,
    pub metric: String,
    /// Valeur à atteindre (20 livres) ; nulle si l'objectif n'est pas chiffré.
    pub target: Option<f64>,
    pub unit: String,
    pub habit_id: Option<String>,
    pub status: String,
    pub color: Option<String>,
    pub icon: String,
    pub space_id: Option<String>,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GoalInput {
    pub title: String,
    pub why: String,
    pub horizon: String,
    pub start_date: String,
    pub target_date: Option<String>,
    pub metric: String,
    pub target: Option<f64>,
    pub unit: String,
    pub habit_id: Option<String>,
    pub status: String,
    pub color: Option<String>,
    pub icon: String,
    pub space_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalStep {
    pub id: String,
    pub goal_id: String,
    pub title: String,
    pub due_date: Option<String>,
    pub done_at: Option<i64>,
    pub position: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GoalStepInput {
    pub title: String,
    pub due_date: Option<String>,
}

/// Saisie manuelle de progression (« 3 livres lus »).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalEntry {
    pub id: String,
    pub goal_id: String,
    pub day: String,
    pub value: f64,
    pub note: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GoalEntryInput {
    pub day: String,
    pub value: f64,
    pub note: String,
}

fn clean_input(conn: &Connection, input: &GoalInput, current_space: Option<&str>) -> Result<GoalInput, DataError> {
    if !HORIZONS.contains(&input.horizon.as_str()) {
        return Err(invalid("horizon"));
    }
    if !METRICS.contains(&input.metric.as_str()) {
        return Err(invalid("metric"));
    }
    if !STATUSES.contains(&input.status.as_str()) {
        return Err(invalid("status"));
    }
    if !is_valid_date(&input.start_date) {
        return Err(invalid("startDate"));
    }
    if let Some(end) = &input.target_date {
        if !is_valid_date(end) || end < &input.start_date {
            return Err(invalid("targetDate"));
        }
    }
    if input.target.is_some_and(|t| !t.is_finite() || t <= 0.0 || t > 1e9) {
        return Err(invalid("target"));
    }
    if matches!(input.metric.as_str(), "manuel" | "habitude") && input.target.is_none() {
        return Err(invalid("target"));
    }
    let habit_id = if input.metric == "habitude" {
        let habit = input.habit_id.as_deref().ok_or_else(|| invalid("habitId"))?;
        let found: Option<i64> = conn.query_row("SELECT 1 FROM habits WHERE id = ?1 AND deleted_at IS NULL", params![habit], |r| r.get(0)).optional()?;
        if found.is_none() {
            return Err(invalid("habitId"));
        }
        Some(habit.to_string())
    } else {
        None
    };
    let why = input.why.replace("\r\n", "\n").trim().to_string();
    if why.chars().count() > MAX_WHY_CHARS || why.chars().any(|c| c.is_control() && c != '\n') {
        return Err(invalid("why"));
    }
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    let unit = input.unit.trim();
    Ok(GoalInput {
        title: clean_line(&input.title, 150, "title")?,
        why,
        horizon: input.horizon.clone(),
        start_date: input.start_date.clone(),
        target_date: input.target_date.clone(),
        metric: input.metric.clone(),
        target: input.target,
        unit: if unit.is_empty() { String::new() } else { clean_line(unit, 30, "unit")? },
        habit_id,
        status: input.status.clone(),
        color: input.color.as_deref().map(clean_color).transpose()?,
        icon: check_symbol(&input.icon, "icon")?,
        space_id: input.space_id.clone(),
    })
}

const COLUMNS: &str =
    "id, title, why, horizon, start_date, target_date, metric, target, unit, habit_id, status, color, icon, space_id, position, created_at, updated_at";

fn goal_row(row: &Row) -> rusqlite::Result<Goal> {
    Ok(Goal {
        id: row.get(0)?,
        title: row.get(1)?,
        why: row.get(2)?,
        horizon: row.get(3)?,
        start_date: row.get(4)?,
        target_date: row.get(5)?,
        metric: row.get(6)?,
        target: row.get(7)?,
        unit: row.get(8)?,
        habit_id: row.get(9)?,
        status: row.get(10)?,
        color: row.get(11)?,
        icon: row.get(12)?,
        space_id: row.get(13)?,
        position: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Goal, DataError> {
    conn.query_row(&format!("SELECT {COLUMNS} FROM goals WHERE id = ?1 AND deleted_at IS NULL"), params![id], goal_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Objectifs. Vide au passage la corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<Goal>, DataError> {
    let old: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM goals WHERE deleted_at IS NOT NULL AND deleted_at < ?1")?;
        let found = stmt.query_map(params![now as i64 - TRASH_SECONDS], |r| r.get(0))?;
        found.collect::<Result<_, _>>()?
    };
    for id in old {
        purge(conn, &id)?;
    }
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM goals WHERE deleted_at IS NULL ORDER BY position, created_at"))?;
    let rows = stmt.query_map([], goal_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(conn: &Connection, input: &GoalInput, now: u64) -> Result<Goal, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM goals WHERE deleted_at IS NULL", [], |r| r.get(0))?;
    if count as usize >= MAX_GOALS {
        return Err(DataError::TooMany { max: MAX_GOALS });
    }
    let g = clean_input(conn, input, None)?;
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO goals (id, title, why, horizon, start_date, target_date, metric, target, unit, habit_id, status, color, icon, space_id,
                            position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)",
        params![id, g.title, g.why, g.horizon, g.start_date, g.target_date, g.metric, g.target, g.unit, g.habit_id, g.status, g.color, g.icon, g.space_id, count, now as i64],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: &GoalInput, now: u64) -> Result<Goal, DataError> {
    let current = get(conn, id)?;
    let g = clean_input(conn, input, current.space_id.as_deref())?;
    conn.execute(
        "UPDATE goals SET title = ?2, why = ?3, horizon = ?4, start_date = ?5, target_date = ?6, metric = ?7, target = ?8, unit = ?9,
                          habit_id = ?10, status = ?11, color = ?12, icon = ?13, space_id = ?14, updated_at = ?15
         WHERE id = ?1",
        params![id, g.title, g.why, g.horizon, g.start_date, g.target_date, g.metric, g.target, g.unit, g.habit_id, g.status, g.color, g.icon, g.space_id, now as i64],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("UPDATE goals SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<Goal, DataError> {
    let changed = conn.execute("UPDATE goals SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL", params![id, now as i64])?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    get(conn, id)
}

/// Supprime définitivement un objectif de la corbeille, avec ses étapes et ses saisies.
pub fn purge(conn: &Connection, id: &str) -> Result<usize, DataError> {
    let n = conn.execute("DELETE FROM goals WHERE id = ?1 AND deleted_at IS NOT NULL", params![id])?;
    if n > 0 {
        conn.execute("DELETE FROM goal_steps WHERE goal_id = ?1", params![id])?;
        conn.execute("DELETE FROM goal_entries WHERE goal_id = ?1", params![id])?;
    }
    Ok(n)
}

// ——— Étapes ———

fn step_row(row: &Row) -> rusqlite::Result<GoalStep> {
    Ok(GoalStep { id: row.get(0)?, goal_id: row.get(1)?, title: row.get(2)?, due_date: row.get(3)?, done_at: row.get(4)?, position: row.get(5)? })
}

fn get_step(conn: &Connection, id: &str) -> Result<GoalStep, DataError> {
    conn.query_row("SELECT id, goal_id, title, due_date, done_at, position FROM goal_steps WHERE id = ?1", params![id], step_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Étapes des objectifs hors corbeille.
pub fn steps(conn: &Connection) -> Result<Vec<GoalStep>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, goal_id, title, due_date, done_at, position FROM goal_steps
         WHERE goal_id IN (SELECT id FROM goals WHERE deleted_at IS NULL) ORDER BY position",
    )?;
    let rows = stmt.query_map([], step_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn clean_step(input: &GoalStepInput) -> Result<GoalStepInput, DataError> {
    if input.due_date.as_deref().is_some_and(|d| !is_valid_date(d)) {
        return Err(invalid("dueDate"));
    }
    Ok(GoalStepInput { title: clean_line(&input.title, 200, "title")?, due_date: input.due_date.clone() })
}

pub fn create_step(conn: &Connection, goal_id: &str, input: &GoalStepInput) -> Result<GoalStep, DataError> {
    get(conn, goal_id)?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM goal_steps WHERE goal_id = ?1", params![goal_id], |r| r.get(0))?;
    if count as usize >= MAX_STEPS {
        return Err(DataError::TooMany { max: MAX_STEPS });
    }
    let s = clean_step(input)?;
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO goal_steps (id, goal_id, title, due_date, position) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, goal_id, s.title, s.due_date, count],
    )?;
    get_step(conn, &id)
}

pub fn update_step(conn: &Connection, id: &str, input: &GoalStepInput) -> Result<GoalStep, DataError> {
    get_step(conn, id)?;
    let s = clean_step(input)?;
    conn.execute("UPDATE goal_steps SET title = ?2, due_date = ?3 WHERE id = ?1", params![id, s.title, s.due_date])?;
    get_step(conn, id)
}

pub fn set_step_done(conn: &Connection, id: &str, done: bool, now: u64) -> Result<GoalStep, DataError> {
    get_step(conn, id)?;
    conn.execute("UPDATE goal_steps SET done_at = ?2 WHERE id = ?1", params![id, done.then_some(now as i64)])?;
    get_step(conn, id)
}

pub fn delete_step(conn: &Connection, id: &str) -> Result<(), DataError> {
    if conn.execute("DELETE FROM goal_steps WHERE id = ?1", params![id])? == 0 {
        return Err(DataError::NotFound);
    }
    Ok(())
}

// ——— Saisies de progression ———

fn entry_row(row: &Row) -> rusqlite::Result<GoalEntry> {
    Ok(GoalEntry { id: row.get(0)?, goal_id: row.get(1)?, day: row.get(2)?, value: row.get(3)?, note: row.get(4)?, created_at: row.get(5)? })
}

/// Saisies des objectifs hors corbeille, par jour.
pub fn entries(conn: &Connection) -> Result<Vec<GoalEntry>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, goal_id, day, value, note, created_at FROM goal_entries
         WHERE goal_id IN (SELECT id FROM goals WHERE deleted_at IS NULL) ORDER BY day, created_at",
    )?;
    let rows = stmt.query_map([], entry_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create_entry(conn: &Connection, goal_id: &str, input: &GoalEntryInput, now: u64) -> Result<GoalEntry, DataError> {
    get(conn, goal_id)?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM goal_entries WHERE goal_id = ?1", params![goal_id], |r| r.get(0))?;
    if count as usize >= MAX_ENTRIES {
        return Err(DataError::TooMany { max: MAX_ENTRIES });
    }
    if !is_valid_date(&input.day) {
        return Err(invalid("day"));
    }
    if !input.value.is_finite() || input.value.abs() > 1e9 || input.value == 0.0 {
        return Err(invalid("value"));
    }
    let note = input.note.trim();
    let note = if note.is_empty() { String::new() } else { clean_line(note, 200, "note")? };
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO goal_entries (id, goal_id, day, value, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, goal_id, input.day, input.value, note, now as i64],
    )?;
    Ok(conn.query_row("SELECT id, goal_id, day, value, note, created_at FROM goal_entries WHERE id = ?1", params![id], entry_row)?)
}

pub fn delete_entry(conn: &Connection, id: &str) -> Result<(), DataError> {
    if conn.execute("DELETE FROM goal_entries WHERE id = ?1", params![id])? == 0 {
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

    fn books() -> GoalInput {
        GoalInput {
            title: "Lire 20 livres".into(),
            why: "Retrouver le goût de la lecture.".into(),
            horizon: "annee".into(),
            start_date: "2026-01-01".into(),
            target_date: Some("2026-12-31".into()),
            metric: "manuel".into(),
            target: Some(20.0),
            unit: "livres".into(),
            status: "en-cours".into(),
            icon: "livre".into(),
            ..Default::default()
        }
    }

    #[test]
    fn un_objectif_est_verifie_et_garde_ses_etapes_et_saisies() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let goal = create(c, &books(), NOW).unwrap();
        assert_eq!(goal.target, Some(20.0));
        assert!(create(c, &GoalInput { target: None, ..books() }, NOW).is_err(), "un objectif chiffré a une cible");
        assert!(create(c, &GoalInput { target_date: Some("2025-12-31".into()), ..books() }, NOW).is_err(), "échéance avant le début");
        assert!(create(c, &GoalInput { metric: "habitude".into(), habit_id: Some("absente".into()), ..books() }, NOW).is_err());
        let step = create_step(c, &goal.id, &GoalStepInput { title: "Choisir 5 romans".into(), due_date: None }).unwrap();
        assert!(set_step_done(c, &step.id, true, NOW).unwrap().done_at.is_some());
        create_entry(c, &goal.id, &GoalEntryInput { day: "2026-03-01".into(), value: 3.0, note: "Trois romans".into() }, NOW).unwrap();
        assert!(create_entry(c, &goal.id, &GoalEntryInput { day: "2026-03-01".into(), value: 0.0, note: String::new() }, NOW).is_err());
        assert_eq!(entries(c).unwrap().len(), 1);
        delete(c, &goal.id, NOW).unwrap();
        assert!(steps(c).unwrap().is_empty() && entries(c).unwrap().is_empty(), "masqués avec l'objectif à la corbeille");
        restore(c, &goal.id, NOW).unwrap();
        assert_eq!(steps(c).unwrap().len(), 1);
        delete(c, &goal.id, NOW).unwrap();
        list(c, NOW + 31 * 86_400).unwrap();
        let left: i64 = c.query_row("SELECT COUNT(*) FROM goal_entries", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0);
    }
}
