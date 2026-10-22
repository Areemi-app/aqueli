//! Projets (cahier des charges § 4.9) : description, statut, dates, couleur et symbole, espace ;
//! tâches rattachées (tableau « À faire, En cours, Terminé »), jalons datés, archivage,
//! corbeille de 30 jours : un projet supprimé emporte ses tâches, et les ramène s'il est restauré. Un modèle crée le projet avec ses tâches et ses jalons d'un coup.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::recurrence::Day;
use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{self, clean_line, invalid, is_valid_date, space_exists, TaskInput, TRASH_SECONDS};
use super::DataError;

pub const MAX_PROJECTS: usize = 500;
pub const MAX_NAME_CHARS: usize = 120;
pub const MAX_DESCRIPTION_CHARS: usize = 5000;
pub const MAX_MILESTONES: usize = 100;
pub const MAX_MILESTONE_CHARS: usize = 200;
/// En cours, en pause, terminé.
pub const STATUSES: [&str; 3] = ["en-cours", "en-pause", "termine"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub icon: String,
    pub color: Option<String>,
    pub space_id: Option<String>,
    pub position: i64,
    pub archived: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "in_progress")]
    pub status: String,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    pub icon: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub space_id: Option<String>,
}

fn in_progress() -> String {
    "en-cours".into()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Milestone {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub due_date: Option<String>,
    pub done_at: Option<i64>,
    pub position: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneInput {
    pub title: String,
    #[serde(default)]
    pub due_date: Option<String>,
}

fn clean_date(date: &Option<String>, field: &str) -> Result<Option<String>, DataError> {
    match date {
        Some(d) if !is_valid_date(d) => Err(invalid(field)),
        other => Ok(other.clone()),
    }
}

fn clean_input(conn: &Connection, input: &ProjectInput, current_space: Option<&str>) -> Result<ProjectInput, DataError> {
    let name = clean_line(&input.name, MAX_NAME_CHARS, "name")?;
    let description = input.description.replace("\r\n", "\n").trim().to_string();
    if description.chars().count() > MAX_DESCRIPTION_CHARS || description.chars().any(|c| c.is_control() && c != '\n' && c != '\t') {
        return Err(invalid("description"));
    }
    if !STATUSES.contains(&input.status.as_str()) {
        return Err(invalid("status"));
    }
    let start_date = clean_date(&input.start_date, "startDate")?;
    let end_date = clean_date(&input.end_date, "endDate")?;
    if let (Some(start), Some(end)) = (&start_date, &end_date) {
        if end < start {
            return Err(invalid("endDate"));
        }
    }
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    Ok(ProjectInput {
        name,
        description,
        status: input.status.clone(),
        start_date,
        end_date,
        icon: check_symbol(&input.icon, "icon")?,
        color: input.color.as_deref().map(clean_color).transpose()?,
        space_id: input.space_id.clone(),
    })
}

const COLUMNS: &str = "id, name, description, status, start_date, end_date, icon, color, space_id, position, archived_at, created_at, updated_at";

fn from_row(row: &Row) -> rusqlite::Result<Project> {
    let archived: Option<i64> = row.get(10)?;
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        status: row.get(3)?,
        start_date: row.get(4)?,
        end_date: row.get(5)?,
        icon: row.get(6)?,
        color: row.get(7)?,
        space_id: row.get(8)?,
        position: row.get(9)?,
        archived: archived.is_some(),
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Project, DataError> {
    conn.query_row(&format!("SELECT {COLUMNS} FROM projects WHERE id = ?1 AND deleted_at IS NULL"), params![id], from_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Retire définitivement un projet de la corbeille, avec ses jalons et les tâches supprimées
/// en même temps que lui ; une autre tâche qui le citait reste, sans projet.
pub(crate) fn purge(conn: &Connection, id: &str) -> Result<usize, DataError> {
    let at: Option<i64> = conn
        .query_row("SELECT deleted_at FROM projects WHERE id = ?1 AND deleted_at IS NOT NULL", params![id], |r| r.get(0))
        .optional()?;
    let Some(at) = at else { return Ok(0) };
    conn.execute("DELETE FROM milestones WHERE project_id = ?1", params![id])?;
    conn.execute("DELETE FROM tasks WHERE project_id = ?1 AND deleted_at = ?2", params![id, at])?;
    conn.execute("UPDATE tasks SET project_id = NULL WHERE project_id = ?1", params![id])?;
    Ok(conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?)
}

/// Projets (archivés compris). Vide au passage la corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<Project>, DataError> {
    let old: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < ?1")?;
        let rows = stmt.query_map(params![now as i64 - TRASH_SECONDS], |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };
    for id in &old {
        purge(conn, id)?;
    }
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM projects WHERE deleted_at IS NULL ORDER BY position, created_at"))?;
    let rows = stmt.query_map([], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn insert(conn: &Connection, p: &ProjectInput, now: u64) -> Result<Project, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL", [], |r| r.get(0))?;
    if count as usize >= MAX_PROJECTS {
        return Err(DataError::TooMany { max: MAX_PROJECTS });
    }
    let id = tasks::random_id()?;
    let position: i64 = conn.query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM projects", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO projects (id, name, description, status, start_date, end_date, icon, color, space_id, position,
                               created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        params![id, p.name, p.description, p.status, p.start_date, p.end_date, p.icon, p.color, p.space_id, position, now as i64],
    )?;
    get(conn, &id)
}

pub fn create(conn: &Connection, input: &ProjectInput, now: u64) -> Result<Project, DataError> {
    let p = clean_input(conn, input, None)?;
    insert(conn, &p, now)
}

/// Projet créé d'après un modèle : ses tâches et ses jalons avec lui, tout ou rien.
pub fn create_with(
    conn: &mut Connection,
    input: &ProjectInput,
    task_inputs: &[TaskInput],
    milestones: &[MilestoneInput],
    now: u64,
    today: Day,
) -> Result<Project, DataError> {
    if task_inputs.len() > 200 || milestones.len() > MAX_MILESTONES {
        return Err(invalid("template"));
    }
    let tx = conn.transaction()?;
    let p = clean_input(&tx, input, None)?;
    let project = insert(&tx, &p, now)?;
    for t in task_inputs {
        tasks::create(&tx, &TaskInput { project_id: Some(project.id.clone()), space_id: t.space_id.clone().or(project.space_id.clone()), ..t.clone() }, now, today)?;
    }
    for m in milestones {
        create_milestone(&tx, &project.id, m, now)?;
    }
    tx.commit()?;
    Ok(project)
}

/// Modifie un projet. Un nouvel espace s'applique aussi à ses tâches qui étaient dans l'ancien.
pub fn update(conn: &Connection, id: &str, input: &ProjectInput, now: u64) -> Result<Project, DataError> {
    let current = get(conn, id)?;
    let p = clean_input(conn, input, current.space_id.as_deref())?;
    if p.space_id != current.space_id {
        conn.execute(
            "UPDATE tasks SET space_id = ?2, updated_at = ?4
             WHERE project_id = ?1 AND deleted_at IS NULL AND (space_id IS ?3 OR space_id IS NULL)",
            params![id, p.space_id, current.space_id, now as i64],
        )?;
    }
    conn.execute(
        "UPDATE projects SET name = ?2, description = ?3, status = ?4, start_date = ?5, end_date = ?6, icon = ?7,
                             color = ?8, space_id = ?9, updated_at = ?10
         WHERE id = ?1",
        params![id, p.name, p.description, p.status, p.start_date, p.end_date, p.icon, p.color, p.space_id, now as i64],
    )?;
    get(conn, id)
}

/// Archive (ou ressort des archives) : le projet quitte la liste mais reste cherchable.
pub fn set_archived(conn: &Connection, id: &str, archived: bool, now: u64) -> Result<Project, DataError> {
    get(conn, id)?;
    conn.execute(
        "UPDATE projects SET archived_at = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, archived.then_some(now as i64), now as i64],
    )?;
    get(conn, id)
}

/// Nouvel ordre des projets.
pub fn reorder(conn: &mut Connection, ids: &[String]) -> Result<(), DataError> {
    let tx = conn.transaction()?;
    for (position, id) in ids.iter().enumerate() {
        tx.execute("UPDATE projects SET position = ?2 WHERE id = ?1", params![id, position as i64])?;
    }
    tx.commit()?;
    Ok(())
}

/// Met le projet à la corbeille, avec ses tâches (restaurables ensemble pendant 30 jours).
pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE projects SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    tx.execute("UPDATE tasks SET deleted_at = ?2 WHERE project_id = ?1 AND deleted_at IS NULL", params![id, now as i64])?;
    tx.commit()?;
    Ok(())
}

/// Sort le projet de la corbeille, avec les tâches supprimées en même temps que lui.
pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<Project, DataError> {
    let at: Option<i64> = conn
        .query_row("SELECT deleted_at FROM projects WHERE id = ?1 AND deleted_at IS NOT NULL", params![id], |r| r.get(0))
        .optional()?;
    let Some(at) = at else { return Err(DataError::NotFound) };
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE projects SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    tx.execute("UPDATE tasks SET deleted_at = NULL, updated_at = ?3 WHERE project_id = ?1 AND deleted_at = ?2", params![id, at, now as i64])?;
    tx.commit()?;
    get(conn, id)
}

// ——— Jalons ———

const MILESTONE_COLUMNS: &str = "id, project_id, title, due_date, done_at, position";

fn milestone_row(r: &Row) -> rusqlite::Result<Milestone> {
    Ok(Milestone { id: r.get(0)?, project_id: r.get(1)?, title: r.get(2)?, due_date: r.get(3)?, done_at: r.get(4)?, position: r.get(5)? })
}

fn get_milestone(conn: &Connection, id: &str) -> Result<Milestone, DataError> {
    conn.query_row(&format!("SELECT {MILESTONE_COLUMNS} FROM milestones WHERE id = ?1"), params![id], milestone_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Jalons des projets hors corbeille.
pub fn milestones(conn: &Connection) -> Result<Vec<Milestone>, DataError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {MILESTONE_COLUMNS} FROM milestones
         WHERE project_id IN (SELECT id FROM projects WHERE deleted_at IS NULL)
         ORDER BY project_id, position"
    ))?;
    let rows = stmt.query_map([], milestone_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn clean_milestone(input: &MilestoneInput) -> Result<MilestoneInput, DataError> {
    Ok(MilestoneInput { title: clean_line(&input.title, MAX_MILESTONE_CHARS, "title")?, due_date: clean_date(&input.due_date, "dueDate")? })
}

pub fn create_milestone(conn: &Connection, project_id: &str, input: &MilestoneInput, now: u64) -> Result<Milestone, DataError> {
    get(conn, project_id)?;
    let m = clean_milestone(input)?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM milestones WHERE project_id = ?1", params![project_id], |r| r.get(0))?;
    if count as usize >= MAX_MILESTONES {
        return Err(DataError::TooMany { max: MAX_MILESTONES });
    }
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO milestones (id, project_id, title, due_date, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, project_id, m.title, m.due_date, count, now as i64],
    )?;
    get_milestone(conn, &id)
}

pub fn update_milestone(conn: &Connection, id: &str, input: &MilestoneInput) -> Result<Milestone, DataError> {
    get_milestone(conn, id)?;
    let m = clean_milestone(input)?;
    conn.execute("UPDATE milestones SET title = ?2, due_date = ?3 WHERE id = ?1", params![id, m.title, m.due_date])?;
    get_milestone(conn, id)
}

pub fn set_milestone_done(conn: &Connection, id: &str, done: bool, now: u64) -> Result<Milestone, DataError> {
    get_milestone(conn, id)?;
    conn.execute("UPDATE milestones SET done_at = ?2 WHERE id = ?1", params![id, done.then_some(now as i64)])?;
    get_milestone(conn, id)
}

pub fn delete_milestone(conn: &Connection, id: &str) -> Result<(), DataError> {
    get_milestone(conn, id)?;
    conn.execute("DELETE FROM milestones WHERE id = ?1", params![id])?;
    Ok(())
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

    fn input(name: &str) -> ProjectInput {
        ProjectInput { name: name.into(), status: "en-cours".into(), icon: "maison".into(), ..Default::default() }
    }

    fn today() -> Day {
        Day::parse("2026-10-01").unwrap()
    }

    #[test]
    fn un_projet_se_cree_se_modifie_s_archive_et_va_a_la_corbeille() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let p = create(
            c,
            &ProjectInput {
                description: " Cartons, adresse, box \r\n".into(),
                start_date: Some("2026-10-01".into()),
                end_date: Some("2026-11-15".into()),
                space_id: Some("perso".into()),
                color: Some("#2D6FF0".into()),
                ..input("  Déménagement  ")
            },
            NOW,
        )
        .unwrap();
        assert_eq!((p.name.as_str(), p.description.as_str(), p.color.as_deref()), ("Déménagement", "Cartons, adresse, box", Some("#2d6ff0")));

        assert_eq!(create(c, &ProjectInput { status: "fini".into(), ..input("X") }, NOW), Err(invalid("status")));
        assert_eq!(
            create(c, &ProjectInput { start_date: Some("2026-10-02".into()), end_date: Some("2026-10-01".into()), ..input("X") }, NOW),
            Err(invalid("endDate"))
        );
        assert_eq!(create(c, &ProjectInput { icon: "inconnu".into(), ..input("X") }, NOW), Err(invalid("icon")));

        let done = update(c, &p.id, &ProjectInput { status: "termine".into(), ..input("Déménagement") }, NOW + 1).unwrap();
        assert_eq!(done.status, "termine");
        assert!(set_archived(c, &p.id, true, NOW + 2).unwrap().archived);

        // Une tâche du projet le garde même s'il passe à la corbeille ; la purge l'en détache.
        let t = tasks::create(c, &TaskInput { title: "Cartons".into(), project_id: Some(p.id.clone()), ..Default::default() }, NOW, today()).unwrap();
        assert_eq!(t.project_id.as_deref(), Some(p.id.as_str()));
        let m = create_milestone(c, &p.id, &MilestoneInput { title: "Signature du bail".into(), due_date: Some("2026-10-20".into()) }, NOW).unwrap();
        // Une tâche déjà à la corbeille garde sa propre date de suppression.
        let alone = tasks::create(c, &TaskInput { title: "Étiquettes".into(), project_id: Some(p.id.clone()), ..Default::default() }, NOW, today()).unwrap();
        tasks::delete(c, &alone.id, NOW + 2).unwrap();
        delete(c, &p.id, NOW + 3).unwrap();
        assert!(list(c, NOW + 3).unwrap().is_empty());
        assert!(milestones(c).unwrap().is_empty(), "jalons d'un projet à la corbeille masqués");
        assert_eq!(tasks::get(c, &t.id), Err(DataError::NotFound), "la tâche part avec son projet");
        assert_eq!(
            tasks::create(c, &TaskInput { title: "Autre".into(), project_id: Some(p.id.clone()), ..Default::default() }, NOW, today()),
            Err(invalid("project"))
        );
        restore(c, &p.id, NOW + 4).unwrap();
        assert_eq!(milestones(c).unwrap(), vec![m]);
        assert!(tasks::get(c, &t.id).is_ok(), "la tâche revient avec son projet");
        assert_eq!(tasks::get(c, &alone.id), Err(DataError::NotFound), "celle supprimée avant reste à la corbeille");
        delete(c, &p.id, NOW + 5).unwrap();
        list(c, NOW + 5 + TRASH_SECONDS as u64 + 1).unwrap();
        let left: i64 = c.query_row("SELECT COUNT(*) FROM tasks WHERE id = ?1", params![t.id], |r| r.get(0)).unwrap();
        assert_eq!(left, 0, "purgée avec son projet");
        assert_eq!(c.query_row("SELECT COUNT(*) FROM milestones", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
    }

    #[test]
    fn le_nouvel_espace_d_un_projet_passe_a_ses_taches() {
        let (_dir, vault) = open_vault();
        let c = vault.connection().unwrap();
        let p = create(c, &ProjectInput { space_id: Some("perso".into()), ..input("Rentrée") }, NOW).unwrap();
        let same = tasks::create(c, &TaskInput { title: "Fournitures".into(), space_id: Some("perso".into()), project_id: Some(p.id.clone()), ..Default::default() }, NOW, today()).unwrap();
        let other = tasks::create(c, &TaskInput { title: "Réunion".into(), space_id: Some("travail".into()), project_id: Some(p.id.clone()), ..Default::default() }, NOW, today()).unwrap();
        update(c, &p.id, &ProjectInput { space_id: Some("famille".into()), ..input("Rentrée") }, NOW + 1).unwrap();
        assert_eq!(tasks::get(c, &same.id).unwrap().space_id.as_deref(), Some("famille"));
        assert_eq!(tasks::get(c, &other.id).unwrap().space_id.as_deref(), Some("travail"), "un espace choisi à part est gardé");
    }

    #[test]
    fn un_modele_cree_le_projet_ses_taches_et_ses_jalons_ensemble() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let p = create_with(
            c,
            &ProjectInput { space_id: Some("perso".into()), ..input("Voyage") },
            &[
                TaskInput { title: "Réserver le train".into(), due_date: Some("2026-10-10".into()), ..Default::default() },
                TaskInput { title: "Faire la valise".into(), ..Default::default() },
            ],
            &[MilestoneInput { title: "Départ".into(), due_date: Some("2026-10-20".into()) }],
            NOW,
            today(),
        )
        .unwrap();
        let all = tasks::list(c, 0, NOW).unwrap();
        assert_eq!(all.len(), 2);
        assert!(all.iter().all(|t| t.project_id.as_deref() == Some(p.id.as_str()) && t.space_id.as_deref() == Some("perso")));
        assert_eq!(milestones(c).unwrap().len(), 1);

        // Une tâche refusée annule tout.
        let refused = create_with(c, &input("Rentrée"), &[TaskInput { title: "  ".into(), ..Default::default() }], &[], NOW, today());
        assert!(refused.is_err());
        assert_eq!(list(c, NOW).unwrap().len(), 1);
    }

    #[test]
    fn les_jalons_se_cochent_se_renomment_et_s_effacent() {
        let (_dir, vault) = open_vault();
        let c = vault.connection().unwrap();
        let p = create(c, &input("Rentrée"), NOW).unwrap();
        let m = create_milestone(c, &p.id, &MilestoneInput { title: "Fournitures".into(), due_date: None }, NOW).unwrap();
        assert_eq!(create_milestone(c, &p.id, &MilestoneInput { title: "X".into(), due_date: Some("2026-13-01".into()) }, NOW), Err(invalid("dueDate")));
        assert!(set_milestone_done(c, &m.id, true, NOW).unwrap().done_at.is_some());
        let renamed = update_milestone(c, &m.id, &MilestoneInput { title: "Fournitures achetées".into(), due_date: Some("2026-09-01".into()) }).unwrap();
        assert_eq!(renamed.title, "Fournitures achetées");
        delete_milestone(c, &m.id).unwrap();
        assert!(milestones(c).unwrap().is_empty());
    }
}
