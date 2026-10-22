//! Événements du calendrier (cahier des charges § 4.3) : titre, lieu, début et fin (ou
//! journée entière), calendrier (l'espace), couleur, notes ; corbeille de 30 jours.
//!
//! Dates et heures locales, comme les tâches (« 2026-10-02 », « 14:00 »). Un événement sur
//! la journée entière n'a pas d'heure, et sa date de fin est comprise.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::recurrence::{self, Day, Recurrence};
use super::spaces::clean_color;
use super::tasks::{
    clean_line, clean_notes, invalid, is_valid_date, is_valid_time, random_id, space_exists, MAX_REMINDER_MINUTES,
    MAX_TITLE_CHARS, TRASH_SECONDS,
};
use super::DataError;

pub const MAX_LOCATION_CHARS: usize = 300;
/// Un événement dure au plus un an.
pub const MAX_SPAN_DAYS: i64 = 366;
/// Occurrences retirées d'une série répétée, au plus.
pub const MAX_EXCEPTIONS: usize = 500;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub title: String,
    pub location: String,
    pub notes: String,
    /// Calendrier de l'événement : un espace (Perso, Travail…).
    pub space_id: Option<String>,
    pub start_date: String,
    /// Absente pour un événement sur la journée entière.
    pub start_time: Option<String>,
    pub end_date: String,
    pub end_time: Option<String>,
    /// Couleur choisie (« #rrggbb »), sinon celle du calendrier.
    pub color: Option<String>,
    /// Rappel, en minutes avant le début.
    pub reminder: Option<u32>,
    pub recurrence: Option<Recurrence>,
    /// Dates des occurrences retirées d'une série (« 2026-10-05 »).
    pub exceptions: Vec<String>,
    /// Dernier jour de la série (compris) ; sans fin s'il est absent.
    pub repeat_until: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Champs modifiables d'un événement, envoyés par l'interface.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub title: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub space_id: Option<String>,
    pub start_date: String,
    #[serde(default)]
    pub start_time: Option<String>,
    pub end_date: String,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub reminder: Option<u32>,
    #[serde(default)]
    pub recurrence: Option<Recurrence>,
    #[serde(default)]
    pub exceptions: Vec<String>,
    #[serde(default)]
    pub repeat_until: Option<String>,
}

fn date(text: &str, field: &str) -> Result<Day, DataError> {
    Day::parse(text).filter(|_| is_valid_date(text)).ok_or_else(|| invalid(field))
}

/// Vérifie et nettoie tous les champs. `current_space` : espace actuel de l'événement, gardé
/// même s'il a été supprimé depuis.
fn clean_input(conn: &Connection, input: &EventInput, current_space: Option<&str>) -> Result<EventInput, DataError> {
    let title = clean_line(&input.title, MAX_TITLE_CHARS, "title")?;
    let location = if input.location.trim().is_empty() {
        String::new()
    } else {
        clean_line(&input.location, MAX_LOCATION_CHARS, "location")?
    };
    let notes = clean_notes(&input.notes)?;
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    let start = date(&input.start_date, "startDate")?;
    let end = date(&input.end_date, "endDate")?;
    match (&input.start_time, &input.end_time) {
        (None, None) if end < start => return Err(invalid("endDate")),
        (None, None) => {}
        (Some(s), Some(e)) => {
            if !is_valid_time(s) {
                return Err(invalid("startTime"));
            }
            if !is_valid_time(e) || (end, e.as_str()) <= (start, s.as_str()) {
                return Err(invalid("endTime"));
            }
        }
        _ => return Err(invalid("endTime")),
    }
    if start.days_until(end) > MAX_SPAN_DAYS {
        return Err(invalid("endDate"));
    }
    let color = input.color.as_deref().map(clean_color).transpose()?;
    if input.reminder.is_some_and(|m| m > MAX_REMINDER_MINUTES) {
        return Err(invalid("reminder"));
    }
    let recurrence = match &input.recurrence {
        Some(Recurrence::AfterDone { .. }) => return Err(invalid("recurrence")),
        Some(rule) => Some(recurrence::clean(rule).ok_or_else(|| invalid("recurrence"))?),
        None => None,
    };
    let mut exceptions = Vec::new();
    for day in &input.exceptions {
        let day = date(day, "exceptions")?.format();
        if !exceptions.contains(&day) {
            exceptions.push(day);
        }
    }
    if exceptions.len() > MAX_EXCEPTIONS {
        return Err(invalid("exceptions"));
    }
    exceptions.sort();
    let repeat_until = match (&input.repeat_until, &recurrence) {
        (Some(day), Some(_)) => {
            let last = date(day, "repeatUntil")?;
            if last < start {
                return Err(invalid("repeatUntil"));
            }
            Some(last.format())
        }
        _ => None,
    };
    Ok(EventInput {
        title,
        location,
        notes,
        space_id: input.space_id.clone(),
        start_date: start.format(),
        start_time: input.start_time.clone(),
        end_date: end.format(),
        end_time: input.end_time.clone(),
        color,
        reminder: input.reminder,
        exceptions: if recurrence.is_some() { exceptions } else { Vec::new() },
        recurrence,
        repeat_until,
    })
}

const COLUMNS: &str = "id, title, location, notes, space_id, start_date, start_time, end_date, end_time, color, reminder, \
                       recurrence, exceptions, created_at, updated_at, repeat_until";

fn from_row(row: &Row) -> rusqlite::Result<Event> {
    let recurrence: Option<String> = row.get(11)?;
    let exceptions: String = row.get(12)?;
    Ok(Event {
        id: row.get(0)?,
        title: row.get(1)?,
        location: row.get(2)?,
        notes: row.get(3)?,
        space_id: row.get(4)?,
        start_date: row.get(5)?,
        start_time: row.get(6)?,
        end_date: row.get(7)?,
        end_time: row.get(8)?,
        color: row.get(9)?,
        reminder: row.get(10)?,
        // Contenu écrit par ce module : une valeur illisible est remplacée par une valeur vide.
        recurrence: recurrence.and_then(|r| serde_json::from_str(&r).ok()),
        exceptions: serde_json::from_str(&exceptions).unwrap_or_default(),
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        repeat_until: row.get(15)?,
    })
}

fn to_json<T: Serialize>(value: &T) -> Result<String, DataError> {
    serde_json::to_string(value).map_err(|e| DataError::Database { detail: e.to_string() })
}

/// Événement hors corbeille.
pub fn get(conn: &Connection, id: &str) -> Result<Event, DataError> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM events WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        from_row,
    )
    .optional()?
    .ok_or(DataError::NotFound)
}

/// Tous les événements. Vide au passage la corbeille des événements supprimés depuis plus
/// de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<Event>, DataError> {
    conn.execute(
        "DELETE FROM events WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
        params![now as i64 - TRASH_SECONDS],
    )?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM events WHERE deleted_at IS NULL ORDER BY start_date, start_time, id"
    ))?;
    let rows = stmt.query_map([], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(conn: &Connection, input: &EventInput, now: u64) -> Result<Event, DataError> {
    let e = clean_input(conn, input, None)?;
    let id = random_id()?;
    conn.execute(
        "INSERT INTO events (id, title, location, notes, space_id, start_date, start_time, end_date, end_time,
                             color, reminder, recurrence, exceptions, created_at, updated_at, repeat_until)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, ?15)",
        params![
            id,
            e.title,
            e.location,
            e.notes,
            e.space_id,
            e.start_date,
            e.start_time,
            e.end_date,
            e.end_time,
            e.color,
            e.reminder,
            e.recurrence.as_ref().map(to_json).transpose()?,
            to_json(&e.exceptions)?,
            now as i64,
            e.repeat_until
        ],
    )?;
    get(conn, &id)
}

/// Remplace tous les champs modifiables.
pub fn update(conn: &Connection, id: &str, input: &EventInput, now: u64) -> Result<Event, DataError> {
    let current = get(conn, id)?;
    let e = clean_input(conn, input, current.space_id.as_deref())?;
    conn.execute(
        "UPDATE events SET title = ?2, location = ?3, notes = ?4, space_id = ?5, start_date = ?6, start_time = ?7,
                           end_date = ?8, end_time = ?9, color = ?10, reminder = ?11, recurrence = ?12,
                           exceptions = ?13, updated_at = ?14, repeat_until = ?15
         WHERE id = ?1",
        params![
            id,
            e.title,
            e.location,
            e.notes,
            e.space_id,
            e.start_date,
            e.start_time,
            e.end_date,
            e.end_time,
            e.color,
            e.reminder,
            e.recurrence.as_ref().map(to_json).transpose()?,
            to_json(&e.exceptions)?,
            now as i64,
            e.repeat_until
        ],
    )?;
    get(conn, id)
}

/// Met l'événement à la corbeille (restaurable pendant 30 jours).
pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("UPDATE events SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

/// Sort l'événement de la corbeille (bouton « Annuler »).
pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<Event, DataError> {
    let changed = conn.execute(
        "UPDATE events SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
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

    fn timed(title: &str, day: &str, from: &str, to: &str) -> EventInput {
        EventInput {
            title: title.into(),
            start_date: day.into(),
            start_time: Some(from.into()),
            end_date: day.into(),
            end_time: Some(to.into()),
            ..Default::default()
        }
    }

    fn all_day(title: &str, from: &str, to: &str) -> EventInput {
        EventInput { title: title.into(), start_date: from.into(), end_date: to.into(), ..Default::default() }
    }

    fn field(result: Result<Event, DataError>) -> String {
        match result {
            Err(DataError::Invalid { field }) => field,
            other => panic!("refus attendu, obtenu {other:?}"),
        }
    }

    #[test]
    fn un_evenement_est_nettoye_et_relu() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let input = EventInput {
            location: "  Cabinet   du Dr Martin ".into(),
            notes: "Apporter la carte Vitale\r\n".into(),
            space_id: Some("sante".into()),
            color: Some("#C2386F".into()),
            reminder: Some(60),
            ..timed("  Dentiste ", "2026-09-28", "09:30", "10:00")
        };
        let event = create(conn, &input, NOW).unwrap();
        assert_eq!(event.title, "Dentiste");
        assert_eq!(event.location, "Cabinet du Dr Martin");
        assert_eq!(event.notes, "Apporter la carte Vitale");
        assert_eq!(event.color.as_deref(), Some("#c2386f"));
        assert_eq!((event.start_time.as_deref(), event.end_time.as_deref()), (Some("09:30"), Some("10:00")));
        assert_eq!(list(conn, NOW).unwrap(), vec![event]);
    }

    #[test]
    fn journee_entiere_sur_plusieurs_jours() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let event = create(conn, &all_day("Vacances", "2026-10-17", "2026-11-01"), NOW).unwrap();
        assert_eq!((event.start_time, event.end_time), (None, None));
        assert_eq!(event.end_date, "2026-11-01");
    }

    #[test]
    fn les_dates_incoherentes_sont_refusees() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        assert_eq!(field(create(conn, &timed("A", "2026-09-28", "10:00", "10:00"), NOW)), "endTime");
        assert_eq!(field(create(conn, &timed("A", "2026-09-28", "10:00", "09:00"), NOW)), "endTime");
        assert_eq!(field(create(conn, &timed("A", "2026-09-28", "25:00", "26:00"), NOW)), "startTime");
        assert_eq!(field(create(conn, &all_day("A", "2026-09-28", "2026-09-27"), NOW)), "endDate");
        assert_eq!(field(create(conn, &all_day("A", "2026-02-30", "2026-03-01"), NOW)), "startDate");
        assert_eq!(field(create(conn, &all_day("A", "2026-01-01", "2027-06-01"), NOW)), "endDate");
        let half = EventInput { end_time: None, ..timed("A", "2026-09-28", "10:00", "11:00") };
        assert_eq!(field(create(conn, &half, NOW)), "endTime");
        let unknown_space = EventInput { space_id: Some("absent".into()), ..all_day("A", "2026-09-28", "2026-09-28") };
        assert_eq!(field(create(conn, &unknown_space, NOW)), "space");
    }

    #[test]
    fn une_soiree_peut_finir_le_lendemain() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let input = EventInput { end_date: "2026-09-29".into(), ..timed("Soirée", "2026-09-28", "22:00", "01:00") };
        assert_eq!(create(conn, &input, NOW).unwrap().end_date, "2026-09-29");
    }

    #[test]
    fn repetition_et_occurrences_retirees() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let weekly = EventInput {
            recurrence: Some(Recurrence::Weekly { interval: 1, days: vec![1] }),
            exceptions: vec!["2026-10-12".into(), "2026-10-05".into(), "2026-10-05".into()],
            ..timed("Yoga", "2026-09-28", "18:00", "19:00")
        };
        let event = create(conn, &weekly, NOW).unwrap();
        assert_eq!(event.exceptions, vec!["2026-10-05", "2026-10-12"]);
        let after_done = EventInput { recurrence: Some(Recurrence::AfterDone { days: 3 }), ..weekly.clone() };
        assert_eq!(field(create(conn, &after_done, NOW)), "recurrence");
        let once = EventInput { recurrence: None, repeat_until: Some("2027-06-30".into()), ..weekly.clone() };
        let single = create(conn, &once, NOW).unwrap();
        assert!(single.exceptions.is_empty(), "sans répétition, rien à retirer");
        assert_eq!(single.repeat_until, None, "ni date de fin de série");
    }

    #[test]
    fn une_serie_peut_s_arreter_a_une_date() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let weekly = EventInput {
            recurrence: Some(Recurrence::Weekly { interval: 1, days: vec![1] }),
            repeat_until: Some("2027-06-28".into()),
            ..timed("Cours de piano", "2026-09-28", "17:00", "18:00")
        };
        assert_eq!(create(conn, &weekly, NOW).unwrap().repeat_until.as_deref(), Some("2027-06-28"));
        let before = EventInput { repeat_until: Some("2026-09-01".into()), ..weekly };
        assert_eq!(field(create(conn, &before, NOW)), "repeatUntil");
    }

    #[test]
    fn modifier_garde_un_espace_supprime_depuis() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let input = EventInput { space_id: Some("famille".into()), ..all_day("Anniversaire", "2026-10-04", "2026-10-04") };
        let event = create(conn, &input, NOW).unwrap();
        conn.execute("DELETE FROM spaces WHERE id = 'famille'", []).unwrap();
        let renamed = update(conn, &event.id, &EventInput { title: "Anniversaire de Léa".into(), ..input }, NOW + 5).unwrap();
        assert_eq!(renamed.title, "Anniversaire de Léa");
        assert_eq!(renamed.updated_at, NOW as i64 + 5);
    }

    #[test]
    fn corbeille_annuler_puis_vider_apres_30_jours() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let event = create(conn, &all_day("Salon", "2026-10-10", "2026-10-11"), NOW).unwrap();
        delete(conn, &event.id, NOW).unwrap();
        assert!(list(conn, NOW).unwrap().is_empty());
        assert_eq!(restore(conn, &event.id, NOW).unwrap().id, event.id);
        delete(conn, &event.id, NOW).unwrap();
        list(conn, NOW + TRASH_SECONDS as u64 + 1).unwrap();
        assert_eq!(restore(conn, &event.id, NOW), Err(DataError::NotFound));
    }
}
