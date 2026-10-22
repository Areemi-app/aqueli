//! Filtres de tâches enregistrés (cahier des charges § 4.2 : « filtres enregistrés
//! personnalisés ») : un nom, un symbole, une couleur et des critères (étiquettes, priorité,
//! espace, projet, échéance, texte). L'interface applique les critères aux tâches chargées.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{self, clean_line, clean_tags, invalid};
use super::DataError;

pub const MAX_FILTERS: usize = 40;
const MAX_ID_CHARS: usize = 64;
const MAX_TEXT_CHARS: usize = 100;

/// Échéances retenues par un filtre.
pub const DUE_WINDOWS: [&str; 6] = ["toutes", "retard", "aujourdhui", "semaine", "datees", "sans-date"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct FilterCriteria {
    /// Au moins une de ces étiquettes (les sous-étiquettes « maison/jardin » comprises).
    pub tags: Vec<String>,
    /// Priorité minimale (0 : toutes).
    pub min_priority: u8,
    /// Espace ; `None` : tous.
    pub space_id: Option<String>,
    /// Projet ; `None` : tous.
    pub project_id: Option<String>,
    pub due: String,
    /// Tâches terminées comprises.
    pub include_done: bool,
    /// Texte cherché dans le titre et la description.
    pub text: String,
}

impl Default for FilterCriteria {
    fn default() -> Self {
        Self { tags: Vec::new(), min_priority: 0, space_id: None, project_id: None, due: "toutes".into(), include_done: false, text: String::new() }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskFilter {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: Option<String>,
    pub criteria: FilterCriteria,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TaskFilterInput {
    pub name: String,
    pub icon: String,
    pub color: Option<String>,
    pub criteria: FilterCriteria,
}

fn clean_id(id: &Option<String>, field: &str) -> Result<Option<String>, DataError> {
    match id.as_deref().map(str::trim) {
        None | Some("") => Ok(None),
        Some(v) if v.chars().count() <= MAX_ID_CHARS && !v.chars().any(char::is_control) => Ok(Some(v.to_string())),
        Some(_) => Err(invalid(field)),
    }
}

fn clean_criteria(c: &FilterCriteria) -> Result<FilterCriteria, DataError> {
    if c.min_priority > 3 {
        return Err(invalid("minPriority"));
    }
    if !DUE_WINDOWS.contains(&c.due.as_str()) {
        return Err(invalid("due"));
    }
    let text = c.text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.chars().count() > MAX_TEXT_CHARS || text.chars().any(char::is_control) {
        return Err(invalid("text"));
    }
    Ok(FilterCriteria {
        tags: clean_tags(&c.tags)?,
        min_priority: c.min_priority,
        space_id: clean_id(&c.space_id, "spaceId")?,
        project_id: clean_id(&c.project_id, "projectId")?,
        due: c.due.clone(),
        include_done: c.include_done,
        text,
    })
}

fn clean_input(input: &TaskFilterInput) -> Result<TaskFilterInput, DataError> {
    Ok(TaskFilterInput {
        name: clean_line(&input.name, 60, "name")?,
        icon: check_symbol(&input.icon, "icon")?,
        color: input.color.as_deref().map(clean_color).transpose()?,
        criteria: clean_criteria(&input.criteria)?,
    })
}

const COLUMNS: &str = "id, name, icon, color, criteria, position, created_at, updated_at";

fn from_row(row: &Row) -> rusqlite::Result<TaskFilter> {
    let criteria: String = row.get(4)?;
    Ok(TaskFilter {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        color: row.get(3)?,
        criteria: serde_json::from_str(&criteria).unwrap_or_default(),
        position: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn to_json(c: &FilterCriteria) -> Result<String, DataError> {
    serde_json::to_string(c).map_err(|e| DataError::Database { detail: e.to_string() })
}

pub fn list(conn: &Connection) -> Result<Vec<TaskFilter>, DataError> {
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM task_filters ORDER BY position, created_at"))?;
    let rows = stmt.query_map([], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn get(conn: &Connection, id: &str) -> Result<TaskFilter, DataError> {
    conn.query_row(&format!("SELECT {COLUMNS} FROM task_filters WHERE id = ?1"), params![id], from_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

pub fn create(conn: &Connection, input: &TaskFilterInput, now: u64) -> Result<TaskFilter, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM task_filters", [], |r| r.get(0))?;
    if count as usize >= MAX_FILTERS {
        return Err(DataError::TooMany { max: MAX_FILTERS });
    }
    let f = clean_input(input)?;
    let id = tasks::random_id()?;
    let position: i64 = conn.query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM task_filters", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO task_filters (id, name, icon, color, criteria, position, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![id, f.name, f.icon, f.color, to_json(&f.criteria)?, position, now as i64],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: &TaskFilterInput, now: u64) -> Result<TaskFilter, DataError> {
    get(conn, id)?;
    let f = clean_input(input)?;
    conn.execute(
        "UPDATE task_filters SET name = ?2, icon = ?3, color = ?4, criteria = ?5, updated_at = ?6 WHERE id = ?1",
        params![id, f.name, f.icon, f.color, to_json(&f.criteria)?, now as i64],
    )?;
    get(conn, id)
}

/// Supprime un filtre (les tâches ne changent pas).
pub fn delete(conn: &Connection, id: &str) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("DELETE FROM task_filters WHERE id = ?1", params![id])?;
    Ok(())
}

/// Range les filtres dans l'ordre donné.
pub fn reorder(conn: &Connection, ids: &[String]) -> Result<Vec<TaskFilter>, DataError> {
    let tx = conn.unchecked_transaction()?;
    for (position, id) in ids.iter().enumerate() {
        tx.execute("UPDATE task_filters SET position = ?2 WHERE id = ?1", params![id, position as i64])?;
    }
    tx.commit()?;
    list(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    fn input(name: &str) -> TaskFilterInput {
        TaskFilterInput {
            name: name.into(),
            icon: "etoile".into(),
            color: Some("#E0508A".into()),
            criteria: FilterCriteria { tags: vec!["#Maison".into(), "maison".into()], min_priority: 2, due: "semaine".into(), text: "  appeler   le ".into(), ..Default::default() },
        }
    }

    #[test]
    fn un_filtre_se_cree_se_modifie_se_range_et_se_supprime() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let a = create(c, &input("Maison urgente"), NOW).unwrap();
        assert_eq!(a.color.as_deref(), Some("#e0508a"));
        assert_eq!(a.criteria.tags, vec!["Maison".to_string()], "étiquettes nettoyées, sans doublon");
        assert_eq!(a.criteria.text, "appeler le");
        let b = create(c, &TaskFilterInput { name: "Travail".into(), icon: "valise".into(), ..Default::default() }, NOW).unwrap();
        assert_eq!(b.criteria, FilterCriteria::default());
        assert_eq!(list(c).unwrap().iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), ["Maison urgente", "Travail"]);
        let renamed = update(c, &a.id, &TaskFilterInput { name: "Maison".into(), ..input("x") }, NOW + 5).unwrap();
        assert_eq!((renamed.name.as_str(), renamed.updated_at), ("Maison", (NOW + 5) as i64));
        let order = reorder(c, &[b.id.clone(), a.id.clone()]).unwrap();
        assert_eq!(order.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), ["Travail", "Maison"]);
        delete(c, &b.id).unwrap();
        assert_eq!(list(c).unwrap().len(), 1);
        assert!(matches!(delete(c, &b.id), Err(DataError::NotFound)));
    }

    #[test]
    fn un_filtre_aux_criteres_invalides_est_refuse() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let bad = |criteria: FilterCriteria| create(c, &TaskFilterInput { name: "A".into(), icon: "etoile".into(), color: None, criteria }, NOW);
        assert!(matches!(bad(FilterCriteria { min_priority: 4, ..Default::default() }), Err(DataError::Invalid { .. })));
        assert!(matches!(bad(FilterCriteria { due: "demain".into(), ..Default::default() }), Err(DataError::Invalid { .. })));
        assert!(matches!(bad(FilterCriteria { text: "x".repeat(101), ..Default::default() }), Err(DataError::Invalid { .. })));
        assert!(matches!(
            create(c, &TaskFilterInput { name: "A".into(), icon: "inconnu".into(), ..Default::default() }, NOW),
            Err(DataError::Invalid { .. })
        ));
        assert!(matches!(create(c, &TaskFilterInput { name: " ".into(), icon: "etoile".into(), ..Default::default() }, NOW), Err(DataError::Invalid { .. })));
    }
}
