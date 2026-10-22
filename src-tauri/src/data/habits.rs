//! Habitudes (cahier des charges § 4.7) : à installer ou à arrêter, oui/non ou en quantité
//! (8 verres), chaque jour, certains jours ou X fois par semaine, rappel horaire facultatif ;
//! jours cochés ; archivage ; corbeille de 30 jours. Séries et taux de réussite sont calculés
//! par l'interface à partir des jours cochés.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::recurrence::Day;
use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{clean_line, invalid, is_valid_time, space_exists, TRASH_SECONDS};
use super::DataError;

pub const MAX_HABITS: usize = 100;
pub const MAX_NAME_CHARS: usize = 60;
pub const MAX_UNIT_CHARS: usize = 20;
/// Objectif d'une habitude en quantité (verres, pages, minutes…).
pub const MAX_TARGET: u32 = 1000;
pub const KINDS: [&str; 2] = ["oui-non", "quantite"];
/// Moment de la journée : la liste du jour se range par moments.
pub const MOMENTS: [&str; 3] = ["matin", "midi", "soir"];

/// Fréquence : chaque jour, certains jours de la semaine, ou un nombre de fois par semaine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Frequency {
    Quotidien,
    /// 0 = dimanche … 6 = samedi.
    Jours { days: Vec<u32> },
    Semaine { times: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Habit {
    pub id: String,
    pub name: String,
    /// Symbole (src/components/symbols.ts).
    pub icon: String,
    pub color: Option<String>,
    /// « oui-non » ou « quantite ».
    pub kind: String,
    /// Habitude à arrêter : chaque jour coché est un jour tenu.
    pub negative: bool,
    /// Quantité à atteindre (1 pour oui/non).
    pub target: u32,
    pub unit: String,
    pub frequency: Frequency,
    /// Heure du rappel (« HH:MM »).
    pub reminder: Option<String>,
    /// « matin », « midi » ou « soir » ; aucun : dans la journée.
    pub moment: Option<String>,
    pub space_id: Option<String>,
    pub position: i64,
    pub archived: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitInput {
    pub name: String,
    pub icon: String,
    #[serde(default)]
    pub color: Option<String>,
    pub kind: String,
    #[serde(default)]
    pub negative: bool,
    #[serde(default = "one")]
    pub target: u32,
    #[serde(default)]
    pub unit: String,
    pub frequency: Frequency,
    #[serde(default)]
    pub reminder: Option<String>,
    #[serde(default)]
    pub moment: Option<String>,
    #[serde(default)]
    pub space_id: Option<String>,
}

fn one() -> u32 {
    1
}

/// Jour coché : la valeur atteinte (1 pour oui/non).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitCheck {
    pub habit_id: String,
    pub day: String,
    pub value: u32,
    /// Jour de pause (vacances, maladie) : ni réussi ni manqué, la série continue.
    #[serde(default)]
    pub skipped: bool,
}

fn clean_frequency(f: &Frequency) -> Result<Frequency, DataError> {
    match f {
        Frequency::Quotidien => Ok(Frequency::Quotidien),
        Frequency::Jours { days } => {
            let mut days: Vec<u32> = days.clone();
            days.sort_unstable();
            days.dedup();
            if days.is_empty() || days.iter().any(|d| *d > 6) {
                return Err(invalid("frequency"));
            }
            Ok(Frequency::Jours { days })
        }
        Frequency::Semaine { times } if (1..=7).contains(times) => Ok(Frequency::Semaine { times: *times }),
        Frequency::Semaine { .. } => Err(invalid("frequency")),
    }
}

fn clean_input(conn: &Connection, input: &HabitInput, current_space: Option<&str>) -> Result<HabitInput, DataError> {
    let name = clean_line(&input.name, MAX_NAME_CHARS, "name")?;
    let icon = check_symbol(&input.icon, "icon")?;
    let color = input.color.as_deref().map(clean_color).transpose()?;
    if !KINDS.contains(&input.kind.as_str()) {
        return Err(invalid("kind"));
    }
    let quantity = input.kind == "quantite";
    if quantity && !(1..=MAX_TARGET).contains(&input.target) {
        return Err(invalid("target"));
    }
    let unit = if quantity && !input.unit.trim().is_empty() { clean_line(&input.unit, MAX_UNIT_CHARS, "unit")? } else { String::new() };
    if input.reminder.as_deref().is_some_and(|t| !is_valid_time(t)) {
        return Err(invalid("reminder"));
    }
    if input.moment.as_deref().is_some_and(|m| !MOMENTS.contains(&m)) {
        return Err(invalid("moment"));
    }
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    Ok(HabitInput {
        name,
        icon,
        color,
        kind: input.kind.clone(),
        negative: input.negative,
        target: if quantity { input.target } else { 1 },
        unit,
        frequency: clean_frequency(&input.frequency)?,
        reminder: input.reminder.clone(),
        moment: input.moment.clone(),
        space_id: input.space_id.clone(),
    })
}

const COLUMNS: &str =
    "id, name, icon, color, kind, negative, target, unit, frequency, reminder, space_id, position, archived_at, created_at, updated_at, moment";

fn from_row(row: &Row) -> rusqlite::Result<Habit> {
    let frequency: String = row.get(8)?;
    let archived: Option<i64> = row.get(12)?;
    Ok(Habit {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        color: row.get(3)?,
        kind: row.get(4)?,
        negative: row.get(5)?,
        target: row.get(6)?,
        unit: row.get(7)?,
        frequency: serde_json::from_str(&frequency).unwrap_or(Frequency::Quotidien),
        reminder: row.get(9)?,
        moment: row.get(15)?,
        space_id: row.get(10)?,
        position: row.get(11)?,
        archived: archived.is_some(),
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Habit, DataError> {
    conn.query_row(&format!("SELECT {COLUMNS} FROM habits WHERE id = ?1 AND deleted_at IS NULL"), params![id], from_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Habitudes (archivées comprises). Vide au passage la corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<Habit>, DataError> {
    let limit = now as i64 - TRASH_SECONDS;
    conn.execute(
        "DELETE FROM habit_checks WHERE habit_id IN (SELECT id FROM habits WHERE deleted_at IS NOT NULL AND deleted_at < ?1)",
        params![limit],
    )?;
    conn.execute("DELETE FROM habits WHERE deleted_at IS NOT NULL AND deleted_at < ?1", params![limit])?;
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM habits WHERE deleted_at IS NULL ORDER BY position, created_at"))?;
    let rows = stmt.query_map([], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Jours cochés depuis `since` (« AAAA-MM-JJ », compris).
pub fn checks(conn: &Connection, since: &str) -> Result<Vec<HabitCheck>, DataError> {
    Day::parse(since).ok_or_else(|| invalid("since"))?;
    let mut stmt = conn.prepare(
        "SELECT c.habit_id, c.day, c.value, c.skipped FROM habit_checks c JOIN habits h ON h.id = c.habit_id
         WHERE c.day >= ?1 AND h.deleted_at IS NULL ORDER BY c.day",
    )?;
    let rows = stmt.query_map(params![since], |r| Ok(HabitCheck { habit_id: r.get(0)?, day: r.get(1)?, value: r.get(2)?, skipped: r.get(3)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(conn: &Connection, input: &HabitInput, now: u64) -> Result<Habit, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM habits WHERE deleted_at IS NULL", [], |r| r.get(0))?;
    if count as usize >= MAX_HABITS {
        return Err(DataError::TooMany { max: MAX_HABITS });
    }
    let h = clean_input(conn, input, None)?;
    let id = super::tasks::random_id()?;
    let position: i64 = conn.query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM habits", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO habits (id, name, icon, color, kind, negative, target, unit, frequency, reminder, space_id, position,
                             created_at, updated_at, moment)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?14)",
        params![
            id,
            h.name,
            h.icon,
            h.color,
            h.kind,
            h.negative,
            h.target,
            h.unit,
            serde_json::to_string(&h.frequency).unwrap_or_default(),
            h.reminder,
            h.space_id,
            position,
            now as i64,
            h.moment
        ],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: &HabitInput, now: u64) -> Result<Habit, DataError> {
    let current = get(conn, id)?;
    let h = clean_input(conn, input, current.space_id.as_deref())?;
    conn.execute(
        "UPDATE habits SET name = ?2, icon = ?3, color = ?4, kind = ?5, negative = ?6, target = ?7, unit = ?8,
                           frequency = ?9, reminder = ?10, space_id = ?11, updated_at = ?12, moment = ?13
         WHERE id = ?1",
        params![
            id,
            h.name,
            h.icon,
            h.color,
            h.kind,
            h.negative,
            h.target,
            h.unit,
            serde_json::to_string(&h.frequency).unwrap_or_default(),
            h.reminder,
            h.space_id,
            now as i64,
            h.moment
        ],
    )?;
    get(conn, id)
}

/// Archive (ou ressort des archives) : l'habitude n'est plus proposée mais garde son historique.
pub fn set_archived(conn: &Connection, id: &str, archived: bool, now: u64) -> Result<Habit, DataError> {
    get(conn, id)?;
    conn.execute(
        "UPDATE habits SET archived_at = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, archived.then_some(now as i64), now as i64],
    )?;
    get(conn, id)
}

/// Nouvel ordre des habitudes (identifiants dans l'ordre voulu).
pub fn reorder(conn: &mut Connection, ids: &[String]) -> Result<(), DataError> {
    let tx = conn.transaction()?;
    for (position, id) in ids.iter().enumerate() {
        tx.execute("UPDATE habits SET position = ?2 WHERE id = ?1", params![id, position as i64])?;
    }
    tx.commit()?;
    Ok(())
}

/// Coche un jour (valeur atteinte) ; 0 décoche.
pub fn set_check(conn: &Connection, habit_id: &str, day: &str, value: u32) -> Result<Option<HabitCheck>, DataError> {
    let habit = get(conn, habit_id)?;
    let day = Day::parse(day).filter(|d| (1900..=2999).contains(&d.year)).ok_or_else(|| invalid("day"))?.format();
    if value > habit.target.max(1) * 10 {
        return Err(invalid("value"));
    }
    if value == 0 {
        conn.execute("DELETE FROM habit_checks WHERE habit_id = ?1 AND day = ?2", params![habit_id, day])?;
        return Ok(None);
    }
    conn.execute(
        "INSERT INTO habit_checks (habit_id, day, value, skipped) VALUES (?1, ?2, ?3, 0)
         ON CONFLICT (habit_id, day) DO UPDATE SET value = ?3, skipped = 0",
        params![habit_id, day, value],
    )?;
    Ok(Some(HabitCheck { habit_id: habit_id.to_string(), day, value, skipped: false }))
}

/// Jour de pause (vacances, maladie) : ni réussi ni manqué ; le retirer rend le jour à faire.
/// Un jour déjà coché n'est pas mis en pause.
pub fn set_skip(conn: &Connection, habit_id: &str, day: &str, skipped: bool) -> Result<Option<HabitCheck>, DataError> {
    get(conn, habit_id)?;
    let day = Day::parse(day).filter(|d| (1900..=2999).contains(&d.year)).ok_or_else(|| invalid("day"))?.format();
    if !skipped {
        conn.execute("DELETE FROM habit_checks WHERE habit_id = ?1 AND day = ?2 AND skipped = 1", params![habit_id, day])?;
        return Ok(None);
    }
    let changed = conn.execute(
        "INSERT INTO habit_checks (habit_id, day, value, skipped) VALUES (?1, ?2, 0, 1)
         ON CONFLICT (habit_id, day) DO NOTHING",
        params![habit_id, day],
    )?;
    Ok((changed > 0).then(|| HabitCheck { habit_id: habit_id.to_string(), day, value: 0, skipped: true }))
}

/// Met l'habitude à la corbeille, avec ses jours cochés (restaurables pendant 30 jours).
pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("UPDATE habits SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<Habit, DataError> {
    let changed = conn.execute(
        "UPDATE habits SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
        params![id, now as i64],
    )?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    get(conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    fn open_vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        (dir, vault)
    }

    fn water() -> HabitInput {
        HabitInput {
            name: "  Boire de l'eau ".into(),
            icon: "sante".into(),
            color: Some("#2D6FF0".into()),
            kind: "quantite".into(),
            negative: false,
            target: 8,
            unit: "verres".into(),
            frequency: Frequency::Quotidien,
            reminder: Some("10:00".into()),
            moment: Some("matin".into()),
            space_id: Some("sante".into()),
        }
    }

    #[test]
    fn creer_cocher_et_relire() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let h = create(c, &water(), NOW).unwrap();
        assert_eq!((h.name.as_str(), h.target, h.color.as_deref()), ("Boire de l'eau", 8, Some("#2d6ff0")));
        let sport = create(
            c,
            &HabitInput { name: "Sport".into(), kind: "oui-non".into(), target: 50, unit: "x".into(), frequency: Frequency::Jours { days: vec![5, 1, 3, 1] }, reminder: None, ..water() },
            NOW,
        )
        .unwrap();
        assert_eq!((sport.target, sport.unit.as_str()), (1, ""));
        assert_eq!(sport.frequency, Frequency::Jours { days: vec![1, 3, 5] });
        assert_eq!(sport.position, h.position + 1);

        set_check(c, &h.id, "2026-09-30", 8).unwrap();
        set_check(c, &h.id, "2026-10-01", 3).unwrap();
        set_check(c, &h.id, "2026-10-01", 5).unwrap();
        let all = checks(c, "2026-10-01").unwrap();
        assert_eq!(all, [HabitCheck { habit_id: h.id.clone(), day: "2026-10-01".into(), value: 5, skipped: false }]);
        assert_eq!(set_check(c, &h.id, "2026-10-01", 0).unwrap(), None);
        assert_eq!(checks(c, "2026-09-01").unwrap().len(), 1);
        assert_eq!(set_check(c, &h.id, "2026-10-01", 500), Err(invalid("value")));
    }

    #[test]
    fn jours_de_pause_et_moment_de_la_journee() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let h = create(c, &water(), NOW).unwrap();
        assert_eq!(h.moment.as_deref(), Some("matin"));
        assert_eq!(create(c, &HabitInput { moment: Some("nuit".into()), ..water() }, NOW), Err(invalid("moment")));
        // Une pause sur un jour libre ; un jour déjà coché reste coché.
        set_check(c, &h.id, "2026-10-02", 8).unwrap();
        assert!(set_skip(c, &h.id, "2026-10-03", true).unwrap().is_some_and(|k| k.skipped));
        assert_eq!(set_skip(c, &h.id, "2026-10-02", true).unwrap(), None);
        let all = checks(c, "2026-10-01").unwrap();
        assert_eq!(all.iter().map(|k| (k.day.as_str(), k.value, k.skipped)).collect::<Vec<_>>(), [("2026-10-02", 8, false), ("2026-10-03", 0, true)]);
        // Cocher un jour de pause le rend ordinaire ; retirer la pause ne touche pas un jour coché.
        set_check(c, &h.id, "2026-10-03", 2).unwrap();
        set_skip(c, &h.id, "2026-10-03", false).unwrap();
        assert_eq!(checks(c, "2026-10-03").unwrap()[0].value, 2);
    }

    #[test]
    fn frequences_et_valeurs_refusees() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        for (frequency, field) in [
            (Frequency::Jours { days: vec![] }, "frequency"),
            (Frequency::Jours { days: vec![7] }, "frequency"),
            (Frequency::Semaine { times: 8 }, "frequency"),
        ] {
            assert_eq!(create(c, &HabitInput { frequency, ..water() }, NOW), Err(invalid(field)));
        }
        assert_eq!(create(c, &HabitInput { target: 0, ..water() }, NOW), Err(invalid("target")));
        assert_eq!(create(c, &HabitInput { icon: "inconnu".into(), ..water() }, NOW), Err(invalid("icon")));
        assert_eq!(create(c, &HabitInput { reminder: Some("25:00".into()), ..water() }, NOW), Err(invalid("reminder")));
    }

    #[test]
    fn archiver_reordonner_supprimer_restaurer() {
        let (_dir, mut vault) = open_vault();
        let a = create(vault.connection_mut().unwrap(), &water(), NOW).unwrap();
        let b = create(vault.connection_mut().unwrap(), &HabitInput { name: "Lire".into(), ..water() }, NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        assert!(set_archived(c, &a.id, true, NOW).unwrap().archived);
        reorder(c, &[b.id.clone(), a.id.clone()]).unwrap();
        let c = vault.connection_mut().unwrap();
        assert_eq!(list(c, NOW).unwrap().iter().map(|h| h.name.as_str()).collect::<Vec<_>>(), ["Lire", "Boire de l'eau"]);
        set_check(c, &b.id, "2026-10-01", 1).unwrap();
        delete(c, &b.id, NOW).unwrap();
        assert!(checks(c, "2026-01-01").unwrap().is_empty(), "les jours d'une habitude supprimée ne comptent plus");
        restore(c, &b.id, NOW).unwrap();
        assert_eq!(checks(c, "2026-01-01").unwrap().len(), 1);
        delete(c, &b.id, NOW).unwrap();
        list(c, NOW + 31 * 24 * 3600).unwrap();
        assert_eq!(restore(c, &b.id, NOW), Err(DataError::NotFound));
    }
}
