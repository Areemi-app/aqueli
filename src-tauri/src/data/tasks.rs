//! Tâches (cahier des charges § 4.2) : titre, description, échéance, priorité, étiquettes,
//! durée estimée, sous-tâches, répétition ; achèvement, corbeille de 30 jours.
//!
//! Les dates d'échéance sont des dates locales (« 2026-10-02 ») et les heures des heures
//! locales (« 14:00 ») : « aujourd'hui » vient de l'interface, à l'heure de ce PC.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::recurrence::{self, Day, Recurrence};
use super::spaces::clean_color;
use super::DataError;
use crate::vault::crypto;

pub const MAX_TITLE_CHARS: usize = 500;
pub const MAX_NOTES_CHARS: usize = 20_000;
pub const MAX_TAGS: usize = 20;
pub const MAX_TAG_CHARS: usize = 40;
pub const MAX_SUBTASKS: usize = 100;
pub const MAX_SUBTASK_CHARS: usize = 300;
/// Priorité : 0 aucune, 1 basse, 2 moyenne, 3 haute.
pub const MAX_PRIORITY: u8 = 3;
/// Durée estimée : 24 h au plus, en minutes.
pub const MAX_ESTIMATE_MINUTES: u32 = 24 * 60;
/// Rappel : au plus une semaine avant l'échéance, en minutes.
pub const MAX_REMINDER_MINUTES: u32 = 7 * 24 * 60;
/// Les tâches supprimées restent 30 jours dans la corbeille.
pub const TRASH_SECONDS: i64 = 30 * 24 * 3600;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subtask {
    pub id: String,
    pub title: String,
    pub done: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub notes: String,
    pub space_id: Option<String>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    /// Date de début : la tâche reste à l'écart des listes jusqu'à ce jour-là.
    pub start_date: Option<String>,
    pub priority: u8,
    pub estimate: Option<u32>,
    pub tags: Vec<String>,
    pub subtasks: Vec<Subtask>,
    pub recurrence: Option<Recurrence>,
    /// Couleur choisie pour la tâche (« #rrggbb »), sinon celle du thème.
    pub color: Option<String>,
    /// Rappel, en minutes avant l'échéance (0 = à l'échéance ; 9 h sans heure précisée).
    pub reminder: Option<u32>,
    /// Dans la boîte de réception : capturée, pas encore organisée.
    pub inbox: bool,
    /// Projet de la tâche.
    pub project_id: Option<String>,
    /// Commencée : colonne « En cours » du tableau d'un projet.
    pub doing: bool,
    pub done_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Champs modifiables d'une tâche, envoyés par l'interface.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub space_id: Option<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub due_time: Option<String>,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub priority: u8,
    #[serde(default)]
    pub estimate: Option<u32>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub subtasks: Vec<Subtask>,
    #[serde(default)]
    pub recurrence: Option<Recurrence>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub reminder: Option<u32>,
    #[serde(default)]
    pub inbox: bool,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub doing: bool,
}

/// Résultat de l'achèvement (ou de la réouverture) d'une tâche.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoneResult {
    pub task: Task,
    /// Occurrence suivante créée par l'achèvement d'une tâche répétée.
    pub created: Option<Task>,
    /// Occurrence suivante retirée parce que la tâche a été rouverte.
    pub removed: Option<String>,
}

pub(crate) fn invalid(field: &str) -> DataError {
    DataError::Invalid { field: field.into() }
}

pub(crate) fn random_id() -> Result<String, DataError> {
    let bytes = crypto::random_bytes::<8>().map_err(|_| DataError::Database { detail: "aléa indisponible".into() })?;
    Ok(hex::encode(bytes))
}

/// Date du jour envoyée par l'interface (« AAAA-MM-JJ »).
pub fn parse_today(today: &str) -> Result<Day, DataError> {
    Day::parse(today).ok_or_else(|| invalid("today"))
}

/// Texte sur une ligne : espaces superflus retirés, sans caractère de contrôle.
pub(crate) fn clean_line(text: &str, max_chars: usize, field: &str) -> Result<String, DataError> {
    let cleaned = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let length = cleaned.chars().count();
    if length == 0 || length > max_chars || cleaned.chars().any(char::is_control) {
        return Err(invalid(field));
    }
    Ok(cleaned)
}

/// Description sur plusieurs lignes : retours à la ligne et tabulations admis.
pub(crate) fn clean_notes(notes: &str) -> Result<String, DataError> {
    let trimmed = notes.trim_end();
    let bad_control = trimmed.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\t' | '\r'));
    if trimmed.chars().count() > MAX_NOTES_CHARS || bad_control {
        return Err(invalid("notes"));
    }
    Ok(trimmed.replace("\r\n", "\n"))
}

/// Date réelle au format « AAAA-MM-JJ », entre 1900 et 2999.
pub fn is_valid_date(date: &str) -> bool {
    Day::parse(date).is_some_and(|d| (1900..=2999).contains(&d.year))
}

/// Heure au format « HH:MM ».
pub fn is_valid_time(time: &str) -> bool {
    let bytes = time.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' || !time[..2].chars().chain(time[3..].chars()).all(|c| c.is_ascii_digit()) {
        return false;
    }
    let hours: u32 = time[..2].parse().unwrap_or(99);
    let minutes: u32 = time[3..].parse().unwrap_or(99);
    hours < 24 && minutes < 60
}

/// Étiquette : sans « # », lettres, chiffres, « - », « _ » et « / » (hiérarchie #maison/jardin).
fn clean_tag(tag: &str) -> Option<String> {
    let tag = tag.trim().trim_start_matches('#');
    let length = tag.chars().count();
    let allowed = tag.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '/'));
    (length > 0 && length <= MAX_TAG_CHARS && allowed).then(|| tag.to_string())
}

/// Étiquettes nettoyées, sans doublon (sans tenir compte des majuscules).
pub(crate) fn clean_tags(tags: &[String]) -> Result<Vec<String>, DataError> {
    let mut cleaned: Vec<String> = Vec::new();
    for tag in tags {
        let tag = clean_tag(tag).ok_or_else(|| invalid("tags"))?;
        if !cleaned.iter().any(|t| t.to_lowercase() == tag.to_lowercase()) {
            cleaned.push(tag);
        }
    }
    if cleaned.len() > MAX_TAGS {
        return Err(invalid("tags"));
    }
    Ok(cleaned)
}

fn clean_subtasks(subtasks: &[Subtask]) -> Result<Vec<Subtask>, DataError> {
    if subtasks.len() > MAX_SUBTASKS {
        return Err(invalid("subtasks"));
    }
    subtasks
        .iter()
        .map(|s| {
            let id_ok = !s.id.is_empty() && s.id.len() <= 32 && s.id.chars().all(|c| c.is_ascii_alphanumeric());
            Ok(Subtask {
                id: if id_ok { s.id.clone() } else { random_id()? },
                title: clean_line(&s.title, MAX_SUBTASK_CHARS, "subtasks")?,
                done: s.done,
            })
        })
        .collect()
}

pub(crate) fn space_exists(conn: &Connection, id: &str) -> Result<bool, DataError> {
    Ok(conn.query_row("SELECT 1 FROM spaces WHERE id = ?1", params![id], |_| Ok(())).optional()?.is_some())
}

pub(crate) fn project_exists(conn: &Connection, id: &str) -> Result<bool, DataError> {
    Ok(conn.query_row("SELECT 1 FROM projects WHERE id = ?1 AND deleted_at IS NULL", params![id], |_| Ok(())).optional()?.is_some())
}

/// Vérifie et nettoie tous les champs. Une tâche datée quitte la boîte de réception ; une
/// tâche répétée sans date reçoit sa première échéance.
/// `current_space` : espace actuel de la tâche, gardé même s'il a été supprimé depuis.
/// `current_project` : projet actuel, gardé même s'il a été mis à la corbeille depuis.
fn clean_input(conn: &Connection, input: &TaskInput, current_space: Option<&str>, current_project: Option<&str>, today: Day) -> Result<TaskInput, DataError> {
    let title = clean_line(&input.title, MAX_TITLE_CHARS, "title")?;
    let notes = clean_notes(&input.notes)?;
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    if let Some(project) = &input.project_id {
        if Some(project.as_str()) != current_project && !project_exists(conn, project)? {
            return Err(invalid("project"));
        }
    }
    let recurrence = match &input.recurrence {
        Some(rule) => Some(recurrence::clean(rule).ok_or_else(|| invalid("recurrence"))?),
        None => None,
    };
    let mut due_date = input.due_date.clone();
    if due_date.as_deref().is_some_and(|d| !is_valid_date(d)) {
        return Err(invalid("dueDate"));
    }
    if due_date.is_none() {
        if let Some(rule) = &recurrence {
            due_date = recurrence::first_due(rule, today).map(|d| d.format());
        }
    }
    if let Some(time) = &input.due_time {
        if !is_valid_time(time) || due_date.is_none() {
            return Err(invalid("dueTime"));
        }
    }
    if let Some(start) = &input.start_date {
        if !is_valid_date(start) || due_date.as_deref().is_some_and(|due| start.as_str() > due) {
            return Err(invalid("startDate"));
        }
    }
    if input.priority > MAX_PRIORITY {
        return Err(invalid("priority"));
    }
    if input.estimate.is_some_and(|m| m == 0 || m > MAX_ESTIMATE_MINUTES) {
        return Err(invalid("estimate"));
    }
    let color = input.color.as_deref().map(clean_color).transpose()?;
    if input.reminder.is_some_and(|m| m > MAX_REMINDER_MINUTES) {
        return Err(invalid("reminder"));
    }
    Ok(TaskInput {
        title,
        notes,
        space_id: input.space_id.clone(),
        color,
        reminder: input.reminder,
        inbox: input.inbox && due_date.is_none(),
        due_date,
        due_time: input.due_time.clone(),
        start_date: input.start_date.clone(),
        priority: input.priority,
        estimate: input.estimate,
        tags: clean_tags(&input.tags)?,
        subtasks: clean_subtasks(&input.subtasks)?,
        recurrence,
        project_id: input.project_id.clone(),
        doing: input.doing,
    })
}

const COLUMNS: &str =
    "id, title, notes, space_id, due_date, due_time, priority, estimate, tags, subtasks, inbox, done_at, created_at, updated_at, recurrence, color, reminder, project_id, doing, start_date";

fn from_row(row: &Row) -> rusqlite::Result<Task> {
    let tags: String = row.get(8)?;
    let subtasks: String = row.get(9)?;
    let recurrence: Option<String> = row.get(14)?;
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        notes: row.get(2)?,
        space_id: row.get(3)?,
        due_date: row.get(4)?,
        due_time: row.get(5)?,
        start_date: row.get(19)?,
        priority: row.get(6)?,
        estimate: row.get(7)?,
        // Contenu écrit par ce module : une valeur illisible est remplacée par une valeur vide.
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        subtasks: serde_json::from_str(&subtasks).unwrap_or_default(),
        recurrence: recurrence.and_then(|r| serde_json::from_str(&r).ok()),
        color: row.get(15)?,
        reminder: row.get(16)?,
        inbox: row.get(10)?,
        project_id: row.get(17)?,
        doing: row.get(18)?,
        done_at: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn to_json<T: Serialize>(value: &T) -> Result<String, DataError> {
    serde_json::to_string(value).map_err(|e| DataError::Database { detail: e.to_string() })
}

fn rule_json(rule: &Option<Recurrence>) -> Result<Option<String>, DataError> {
    rule.as_ref().map(to_json).transpose()
}

/// Tâche hors corbeille.
pub fn get(conn: &Connection, id: &str) -> Result<Task, DataError> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM tasks WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        from_row,
    )
    .optional()?
    .ok_or(DataError::NotFound)
}

/// Tâches à faire, et tâches terminées depuis `done_since` (secondes Unix). Vide au
/// passage la corbeille des tâches supprimées depuis plus de 30 jours.
pub fn list(conn: &Connection, done_since: i64, now: u64) -> Result<Vec<Task>, DataError> {
    conn.execute(
        "DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
        params![now as i64 - TRASH_SECONDS],
    )?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM tasks
         WHERE deleted_at IS NULL AND (done_at IS NULL OR done_at >= ?1)
         ORDER BY created_at, id"
    ))?;
    let rows = stmt.query_map(params![done_since], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Tâche terminée hors de la fenêtre chargée par l'interface : de quoi compter l'avancement des
/// projets et des objectifs, et les statistiques du Bilan, sans recharger les tâches elles-mêmes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoneTask {
    pub id: String,
    pub done_at: i64,
    pub space_id: Option<String>,
    pub project_id: Option<String>,
}

/// Tâches terminées avant `before` (secondes Unix), hors corbeille, de la plus ancienne à la plus récente.
pub fn done_before(conn: &Connection, before: i64) -> Result<Vec<DoneTask>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, done_at, space_id, project_id FROM tasks
         WHERE deleted_at IS NULL AND done_at IS NOT NULL AND done_at < ?1
         ORDER BY done_at, id",
    )?;
    let rows = stmt.query_map(params![before], |r| Ok(DoneTask { id: r.get(0)?, done_at: r.get(1)?, space_id: r.get(2)?, project_id: r.get(3)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Enregistre une tâche déjà vérifiée.
fn insert(conn: &Connection, t: &TaskInput, now: u64) -> Result<Task, DataError> {
    let id = random_id()?;
    conn.execute(
        "INSERT INTO tasks (id, title, notes, space_id, due_date, due_time, priority, estimate, tags, subtasks,
                            inbox, recurrence, color, reminder, created_at, updated_at, project_id, doing, start_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, ?16, ?17, ?18)",
        params![
            id,
            t.title,
            t.notes,
            t.space_id,
            t.due_date,
            t.due_time,
            t.priority,
            t.estimate,
            to_json(&t.tags)?,
            to_json(&t.subtasks)?,
            t.inbox,
            rule_json(&t.recurrence)?,
            t.color,
            t.reminder,
            now as i64,
            t.project_id,
            t.doing,
            t.start_date
        ],
    )?;
    get(conn, &id)
}

pub fn create(conn: &Connection, input: &TaskInput, now: u64, today: Day) -> Result<Task, DataError> {
    let t = clean_input(conn, input, None, None, today)?;
    insert(conn, &t, now)
}

/// Remplace tous les champs modifiables (l'état « terminée » se change avec `set_done`).
pub fn update(conn: &Connection, id: &str, input: &TaskInput, now: u64, today: Day) -> Result<Task, DataError> {
    let current = get(conn, id)?;
    let t = clean_input(conn, input, current.space_id.as_deref(), current.project_id.as_deref(), today)?;
    conn.execute(
        "UPDATE tasks SET title = ?2, notes = ?3, space_id = ?4, due_date = ?5, due_time = ?6, priority = ?7,
                          estimate = ?8, tags = ?9, subtasks = ?10, inbox = ?11, recurrence = ?12, color = ?13,
                          reminder = ?14, updated_at = ?15, project_id = ?16, doing = ?17, start_date = ?18
         WHERE id = ?1",
        params![
            id,
            t.title,
            t.notes,
            t.space_id,
            t.due_date,
            t.due_time,
            t.priority,
            t.estimate,
            to_json(&t.tags)?,
            to_json(&t.subtasks)?,
            t.inbox,
            rule_json(&t.recurrence)?,
            t.color,
            t.reminder,
            now as i64,
            t.project_id,
            t.doing,
            t.start_date
        ],
    )?;
    get(conn, id)
}

/// Occurrence suivante d'une tâche répétée : mêmes champs, sous-tâches décochées.
fn next_occurrence(task: &Task, rule: &Recurrence, today: Day) -> Option<TaskInput> {
    let due = task.due_date.as_deref().and_then(Day::parse);
    let next = recurrence::next_due(rule, due, today, today)?;
    let lead = due.zip(task.start_date.as_deref().and_then(Day::parse)).map(|(due, start)| start.days_until(due));
    Some(TaskInput {
        title: task.title.clone(),
        notes: task.notes.clone(),
        space_id: task.space_id.clone(),
        due_date: Some(next.format()),
        due_time: task.due_time.clone(),
        start_date: lead.map(|days| next.add_days(-days).format()),
        priority: task.priority,
        estimate: task.estimate,
        tags: task.tags.clone(),
        subtasks: task.subtasks.iter().map(|s| Subtask { done: false, ..s.clone() }).collect(),
        recurrence: Some(rule.clone()),
        color: task.color.clone(),
        reminder: task.reminder,
        inbox: false,
        project_id: task.project_id.clone(),
        doing: false,
    })
}

/// Termine ou rouvre une tâche. Terminer une tâche répétée crée l'occurrence suivante ;
/// la rouvrir retire cette occurrence tant qu'elle n'a pas été modifiée.
pub fn set_done(conn: &Connection, id: &str, done: bool, now: u64, today: Day) -> Result<DoneResult, DataError> {
    let task = get(conn, id)?;
    let tx = conn.unchecked_transaction()?;
    let mut created = None;
    let mut removed = None;
    if done && task.done_at.is_none() {
        let next = match &task.recurrence {
            Some(rule) => next_occurrence(&task, rule, today).map(|t| insert(&tx, &t, now)).transpose()?,
            None => None,
        };
        tx.execute(
            "UPDATE tasks SET done_at = ?2, inbox = 0, doing = 0, next_id = ?3, updated_at = ?2 WHERE id = ?1",
            params![id, now as i64, next.as_ref().map(|t| t.id.clone())],
        )?;
        created = next;
    } else if !done && task.done_at.is_some() {
        let next_id: Option<String> = tx.query_row("SELECT next_id FROM tasks WHERE id = ?1", params![id], |r| r.get(0))?;
        let mut keep_rule = true;
        if let Some(next_id) = next_id {
            let next: Option<(Option<i64>, i64, i64, Option<i64>)> = tx
                .query_row(
                    "SELECT done_at, created_at, updated_at, deleted_at FROM tasks WHERE id = ?1",
                    params![next_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()?;
            match next {
                // Intacte : elle disparaît, la tâche rouverte reprend la série.
                Some((None, created_at, updated_at, None)) if created_at == updated_at => {
                    tx.execute("DELETE FROM tasks WHERE id = ?1", params![next_id])?;
                    removed = Some(next_id);
                }
                // Supprimée : la tâche rouverte reprend la série.
                Some((_, _, _, Some(_))) | None => {}
                // Modifiée ou terminée : la série continue avec elle, pas de doublon.
                Some(_) => keep_rule = false,
            }
        }
        tx.execute(
            "UPDATE tasks SET done_at = NULL, next_id = NULL, updated_at = ?2,
                              recurrence = CASE WHEN ?3 THEN recurrence ELSE NULL END
             WHERE id = ?1",
            params![id, now as i64, keep_rule],
        )?;
    }
    tx.commit()?;
    Ok(DoneResult { task: get(conn, id)?, created, removed })
}

/// Met la tâche à la corbeille (restaurable pendant 30 jours).
pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("UPDATE tasks SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

/// Sort la tâche de la corbeille (bouton « Annuler »).
pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<Task, DataError> {
    let changed = conn.execute(
        "UPDATE tasks SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
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
    const PASSWORD: &str = "mot de passe de test";

    /// Dimanche 27 septembre 2026.
    fn today() -> Day {
        Day::parse("2026-09-27").unwrap()
    }

    fn open_vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create(PASSWORD, NOW).unwrap();
        (dir, vault)
    }

    fn input(title: &str) -> TaskInput {
        TaskInput { title: title.into(), ..Default::default() }
    }

    fn new(conn: &Connection, input: &TaskInput) -> Task {
        create(conn, input, NOW, today()).unwrap()
    }

    fn full_input() -> TaskInput {
        TaskInput {
            title: "  Préparer   la réunion de lundi ".into(),
            notes: "Ordre du jour\r\n- chiffres\n".into(),
            space_id: Some("travail".into()),
            due_date: Some("2026-09-28".into()),
            due_time: Some("14:00".into()),
            priority: 2,
            estimate: Some(90),
            tags: vec!["#réunion".into(), "Réunion".into(), "maison/jardin".into()],
            subtasks: vec![
                Subtask { id: "a1".into(), title: "Relire le compte rendu".into(), done: true },
                Subtask { id: String::new(), title: "Envoyer l'ordre du jour".into(), done: false },
            ],
            recurrence: None,
            color: Some("#2FAE4A".into()),
            reminder: Some(60),
            inbox: true,
            ..Default::default()
        }
    }

    #[test]
    fn creer_puis_relire_une_tache_complete() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(conn, &full_input());

        assert_eq!(task.title, "Préparer la réunion de lundi");
        assert_eq!(task.notes, "Ordre du jour\n- chiffres");
        assert_eq!(task.space_id.as_deref(), Some("travail"));
        assert_eq!((task.due_date.as_deref(), task.due_time.as_deref()), (Some("2026-09-28"), Some("14:00")));
        assert_eq!((task.priority, task.estimate), (2, Some(90)));
        assert_eq!(task.tags, vec!["réunion", "maison/jardin"], "« # » retiré, doublon ignoré");
        assert_eq!(task.subtasks[0], Subtask { id: "a1".into(), title: "Relire le compte rendu".into(), done: true });
        assert_eq!(task.subtasks[1].id.len(), 16, "une sous-tâche sans identifiant en reçoit un");
        assert!(!task.inbox, "une tâche datée n'est pas dans la boîte de réception");
        assert_eq!(task.recurrence, None);
        assert_eq!(task.color.as_deref(), Some("#2fae4a"), "couleur mise en minuscules");
        assert_eq!(task.reminder, Some(60));
        assert_eq!((task.done_at, task.created_at, task.updated_at), (None, NOW as i64, NOW as i64));
        assert_eq!(list(conn, 0, NOW).unwrap(), vec![task]);
    }

    #[test]
    fn les_anciennes_taches_terminees_restent_comptables() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let old = new(conn, &TaskInput { project_id: None, space_id: Some("perso".into()), ..input("Ancienne") });
        let recent = new(conn, &input("Récente"));
        let open = new(conn, &input("À faire"));
        set_done(conn, &old.id, true, NOW - 90 * 86_400, today()).unwrap();
        set_done(conn, &recent.id, true, NOW - 3600, today()).unwrap();
        let since = NOW as i64 - 30 * 86_400;
        let listed: Vec<String> = list(conn, since, NOW).unwrap().into_iter().map(|t| t.id).collect();
        assert!(!listed.contains(&old.id) && listed.contains(&recent.id) && listed.contains(&open.id));
        let done = done_before(conn, since).unwrap();
        assert_eq!(done, vec![DoneTask { id: old.id.clone(), done_at: NOW as i64 - 90 * 86_400, space_id: Some("perso".into()), project_id: None }]);
        delete(conn, &old.id, NOW).unwrap();
        assert!(done_before(conn, since).unwrap().is_empty(), "une tâche à la corbeille ne compte plus");
    }

    #[test]
    fn une_tache_sans_date_peut_aller_dans_la_boite_de_reception() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(conn, &TaskInput { inbox: true, ..input("Idée") });
        assert!(task.inbox);
        assert!(task.space_id.is_none());
    }

    #[test]
    fn les_valeurs_invalides_sont_refusees() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let cases: Vec<(TaskInput, &str)> = vec![
            (input("   "), "title"),
            (input(&"x".repeat(MAX_TITLE_CHARS + 1)), "title"),
            (TaskInput { notes: "a\u{0}b".into(), ..input("T") }, "notes"),
            (TaskInput { space_id: Some("inconnu".into()), ..input("T") }, "space"),
            (TaskInput { due_date: Some("2026-02-29".into()), ..input("T") }, "dueDate"),
            (TaskInput { due_date: Some("2026-9-1".into()), ..input("T") }, "dueDate"),
            (TaskInput { due_time: Some("14:00".into()), ..input("T") }, "dueTime"),
            (TaskInput { due_date: Some("2026-10-02".into()), due_time: Some("24:00".into()), ..input("T") }, "dueTime"),
            (TaskInput { priority: 4, ..input("T") }, "priority"),
            (TaskInput { estimate: Some(0), ..input("T") }, "estimate"),
            (TaskInput { tags: vec!["deux mots".into()], ..input("T") }, "tags"),
            (TaskInput { tags: (0..=MAX_TAGS).map(|i| format!("t{i}")).collect(), ..input("T") }, "tags"),
            (TaskInput { subtasks: vec![Subtask { id: "a".into(), title: " ".into(), done: false }], ..input("T") }, "subtasks"),
            (TaskInput { recurrence: Some(Recurrence::Daily { interval: 0 }), ..input("T") }, "recurrence"),
            (TaskInput { color: Some("vert".into()), ..input("T") }, "color"),
            (TaskInput { reminder: Some(MAX_REMINDER_MINUTES + 1), ..input("T") }, "reminder"),
        ];
        for (bad, field) in cases {
            assert_eq!(create(conn, &bad, NOW, today()), Err(DataError::Invalid { field: field.into() }), "champ {field}");
        }
        assert!(list(conn, 0, NOW).unwrap().is_empty());
        assert_eq!(parse_today("27/09/2026"), Err(DataError::Invalid { field: "today".into() }));
    }

    #[test]
    fn les_dates_sont_verifiees() {
        assert!(is_valid_date("2028-02-29"));
        assert!(!is_valid_date("2027-02-29"));
        assert!(!is_valid_date("2026-04-31"));
        assert!(!is_valid_date("2026-13-01"));
        assert!(!is_valid_date("26-10-02"));
        assert!(!is_valid_date("1850-01-01"));
        assert!(is_valid_time("00:00") && is_valid_time("23:59"));
        assert!(!is_valid_time("9:30") && !is_valid_time("12:60"));
    }

    #[test]
    fn modifier_une_tache() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(conn, &TaskInput { inbox: true, ..input("Idée") });
        let changed = update(
            conn,
            &task.id,
            &TaskInput { due_date: Some("2026-10-02".into()), inbox: true, priority: 3, ..input("Appeler le garage") },
            NOW + 60,
            today(),
        )
        .unwrap();
        assert_eq!(changed.title, "Appeler le garage");
        assert_eq!(changed.priority, 3);
        assert!(!changed.inbox, "datée, elle quitte la boîte de réception");
        assert_eq!((changed.created_at, changed.updated_at), (NOW as i64, NOW as i64 + 60));
        assert_eq!(update(conn, "inconnue", &input("T"), NOW, today()), Err(DataError::NotFound));
    }

    #[test]
    fn une_tache_dont_l_espace_a_ete_supprime_reste_modifiable() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(conn, &TaskInput { space_id: Some("famille".into()), ..input("Poster le colis") });
        crate::data::spaces::delete(conn, "famille").unwrap();

        let same_space = TaskInput { space_id: Some("famille".into()), priority: 2, ..input("Poster le colis") };
        let changed = update(conn, &task.id, &same_space, NOW, today()).unwrap();
        assert_eq!((changed.priority, changed.space_id.as_deref()), (2, Some("famille")));
        let moved = TaskInput { space_id: Some("inconnu".into()), ..input("Poster le colis") };
        assert_eq!(update(conn, &task.id, &moved, NOW, today()), Err(DataError::Invalid { field: "space".into() }));
    }

    #[test]
    fn terminer_puis_rouvrir_une_tache() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(conn, &TaskInput { inbox: true, ..input("Arroser les plantes") });

        let done = set_done(conn, &task.id, true, NOW + 10, today()).unwrap();
        assert_eq!(done.task.done_at, Some(NOW as i64 + 10));
        assert!(!done.task.inbox, "terminée, elle quitte la boîte de réception");
        assert_eq!((done.created, done.removed), (None, None), "une tâche simple ne crée rien");
        let again = set_done(conn, &task.id, true, NOW + 20, today()).unwrap();
        assert_eq!(again.task.done_at, Some(NOW as i64 + 10), "l'heure d'achèvement ne change pas");

        let reopened = set_done(conn, &task.id, false, NOW + 30, today()).unwrap();
        assert_eq!(reopened.task.done_at, None);
    }

    #[test]
    fn une_tache_repetee_sans_date_recoit_sa_premiere_echeance() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let rule = Recurrence::Weekly { interval: 1, days: vec![1] };
        let task = new(conn, &TaskInput { recurrence: Some(rule.clone()), inbox: true, ..input("Sortir les poubelles") });
        assert_eq!(task.due_date.as_deref(), Some("2026-09-28"), "le premier lundi");
        assert!(!task.inbox);
        assert_eq!(task.recurrence, Some(rule));
    }

    #[test]
    fn terminer_une_tache_repetee_cree_la_suivante() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(
            conn,
            &TaskInput {
                due_date: Some("2026-09-29".into()),
                due_time: Some("08:00".into()),
                priority: 2,
                tags: vec!["maison".into()],
                subtasks: vec![Subtask { id: "s1".into(), title: "Tri".into(), done: true }],
                recurrence: Some(Recurrence::Weekly { interval: 2, days: vec![2] }),
                color: Some("#e89a1c".into()),
                reminder: Some(15),
                ..input("Sortir les poubelles")
            },
        );

        let result = set_done(conn, &task.id, true, NOW + 5, today()).unwrap();
        let next = result.created.expect("occurrence suivante");
        assert_eq!(result.task.done_at, Some(NOW as i64 + 5));
        assert_eq!(next.title, "Sortir les poubelles");
        assert_eq!((next.due_date.as_deref(), next.due_time.as_deref()), (Some("2026-10-13"), Some("08:00")));
        assert_eq!((next.priority, next.tags.clone()), (2, vec!["maison".to_string()]));
        assert!(!next.subtasks[0].done, "les sous-tâches repartent décochées");
        assert_eq!(next.color.as_deref(), Some("#e89a1c"), "la couleur suit la série");
        assert_eq!(next.reminder, Some(15), "le rappel aussi");
        assert_eq!(next.recurrence, task.recurrence);
        assert_eq!(list(conn, 0, NOW).unwrap().len(), 2, "la tâche terminée reste dans l'historique");

        // Terminer à nouveau ne crée pas de doublon.
        assert_eq!(set_done(conn, &task.id, true, NOW + 6, today()).unwrap().created, None);
    }

    #[test]
    fn rouvrir_retire_l_occurrence_suivante_intacte() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let rule = Recurrence::Daily { interval: 1 };
        let task = new(conn, &TaskInput { due_date: Some("2026-09-27".into()), recurrence: Some(rule.clone()), ..input("Méditer") });
        let next = set_done(conn, &task.id, true, NOW, today()).unwrap().created.unwrap();
        assert_eq!(next.due_date.as_deref(), Some("2026-09-28"));

        let reopened = set_done(conn, &task.id, false, NOW + 1, today()).unwrap();
        assert_eq!(reopened.removed.as_deref(), Some(next.id.as_str()));
        assert_eq!(reopened.task.recurrence, Some(rule), "la tâche rouverte reprend la série");
        assert_eq!(get(conn, &next.id), Err(DataError::NotFound));
        assert_eq!(list(conn, 0, NOW).unwrap().len(), 1);
    }

    #[test]
    fn rouvrir_garde_l_occurrence_suivante_modifiee_sans_doublon() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(conn, &TaskInput { due_date: Some("2026-09-27".into()), recurrence: Some(Recurrence::Daily { interval: 1 }), ..input("Méditer") });
        let next = set_done(conn, &task.id, true, NOW, today()).unwrap().created.unwrap();
        let edited = TaskInput { notes: "Dix minutes".into(), due_date: next.due_date.clone(), recurrence: next.recurrence.clone(), ..input("Méditer") };
        update(conn, &next.id, &edited, NOW + 60, today()).unwrap();

        let reopened = set_done(conn, &task.id, false, NOW + 120, today()).unwrap();
        assert_eq!(reopened.removed, None);
        assert_eq!(reopened.task.recurrence, None, "la série continue avec la tâche suivante");
        assert!(get(conn, &next.id).is_ok());
    }

    #[test]
    fn apres_achevement_la_suivante_part_du_jour_d_achevement() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(conn, &TaskInput { due_date: Some("2026-09-20".into()), recurrence: Some(Recurrence::AfterDone { days: 3 }), ..input("Arroser") });
        let next = set_done(conn, &task.id, true, NOW, today()).unwrap().created.unwrap();
        assert_eq!(next.due_date.as_deref(), Some("2026-09-30"));
    }

    #[test]
    fn la_date_de_debut_precede_l_echeance_et_suit_les_repetitions() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let late = TaskInput { due_date: Some("2026-10-05".into()), start_date: Some("2026-10-06".into()), ..input("Déclaration") };
        assert_eq!(create(conn, &late, NOW, today()), Err(DataError::Invalid { field: "startDate".into() }));
        let odd = TaskInput { start_date: Some("2026-13-01".into()), ..input("Déclaration") };
        assert_eq!(create(conn, &odd, NOW, today()), Err(DataError::Invalid { field: "startDate".into() }));
        // Sans échéance, la date de début seule suffit.
        let alone = new(conn, &TaskInput { start_date: Some("2026-10-12".into()), ..input("Ranger la cave") });
        assert_eq!(alone.start_date.as_deref(), Some("2026-10-12"));
        // Répétée : la suivante commence le même nombre de jours avant son échéance.
        let monthly = new(
            conn,
            &TaskInput {
                due_date: Some("2026-09-30".into()),
                start_date: Some("2026-09-25".into()),
                recurrence: Some(Recurrence::Daily { interval: 7 }),
                ..input("Relevé")
            },
        );
        let next = set_done(conn, &monthly.id, true, NOW, today()).unwrap().created.unwrap();
        assert_eq!((next.start_date.as_deref(), next.due_date.as_deref()), (Some("2026-10-02"), Some("2026-10-07")));
    }

    #[test]
    fn les_taches_terminees_depuis_longtemps_ne_sont_plus_listees() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let old = new(conn, &input("Ancienne"));
        let recent = new(conn, &input("Récente"));
        let open = new(conn, &input("À faire"));
        set_done(conn, &old.id, true, NOW, today()).unwrap();
        set_done(conn, &recent.id, true, NOW + 1000, today()).unwrap();

        let titles: Vec<String> = list(conn, NOW as i64 + 500, NOW + 2000).unwrap().into_iter().map(|t| t.title).collect();
        assert_eq!(titles.len(), 2);
        assert!(titles.contains(&"Récente".to_string()) && titles.contains(&"À faire".to_string()));
        assert!(get(conn, &open.id).is_ok());
    }

    #[test]
    fn supprimer_puis_annuler() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(conn, &input("Répondre au syndic"));

        delete(conn, &task.id, NOW + 5).unwrap();
        assert!(list(conn, 0, NOW + 5).unwrap().is_empty());
        assert_eq!(get(conn, &task.id), Err(DataError::NotFound));
        assert_eq!(delete(conn, &task.id, NOW + 6), Err(DataError::NotFound));

        let back = restore(conn, &task.id, NOW + 7).unwrap();
        assert_eq!(back.title, "Répondre au syndic");
        assert_eq!(restore(conn, &task.id, NOW + 8), Err(DataError::NotFound), "déjà restaurée");
    }

    #[test]
    fn la_corbeille_est_videe_apres_30_jours() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let task = new(conn, &input("Vieux brouillon"));
        delete(conn, &task.id, NOW).unwrap();

        list(conn, 0, NOW + TRASH_SECONDS as u64 - 1).unwrap();
        assert!(restore(conn, &task.id, NOW).is_ok(), "encore dans la corbeille la veille");
        delete(conn, &task.id, NOW).unwrap();

        list(conn, 0, NOW + TRASH_SECONDS as u64 + 1).unwrap();
        assert_eq!(restore(conn, &task.id, NOW), Err(DataError::NotFound), "définitivement effacée");
    }

    #[test]
    fn les_taches_sont_chiffrees_et_survivent_au_verrouillage() {
        let (dir, mut vault) = open_vault();
        new(vault.connection().unwrap(), &input("Poster le colis de Léa"));
        vault.lock();

        let bytes = std::fs::read(dir.path().join("aqueli.db")).unwrap();
        let needle = "Poster le colis".as_bytes();
        assert!(!bytes.windows(needle.len()).any(|w| w == needle), "aucun titre en clair sur le disque");

        vault.unlock(PASSWORD, NOW).unwrap();
        let titles: Vec<String> = list(vault.connection().unwrap(), 0, NOW).unwrap().into_iter().map(|t| t.title).collect();
        assert_eq!(titles, vec!["Poster le colis de Léa"]);
    }
}
