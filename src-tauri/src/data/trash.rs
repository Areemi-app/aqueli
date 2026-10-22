//! Corbeille : tout ce qui a été supprimé depuis moins de 30 jours (tâches, événements,
//! obligations, notes, carnets, pages du journal, habitudes, projets, contacts, documents, listes,
//! objectifs, dépenses), à restaurer ou à supprimer
//! définitivement. Les notes et sous-carnets supprimés avec leur carnet reviennent avec lui.

use rusqlite::{params, Connection};
use serde::Serialize;

use super::tasks::invalid;
use super::{budget, contacts, documents, events, goals, habits, journal, links, lists, notes, obligations, projects, tasks, DataError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub kind: &'static str,
    pub id: String,
    /// Titre de l'élément (jour « AAAA-MM-JJ » pour une page du journal).
    pub title: String,
    /// Suppression, en secondes Unix.
    pub deleted_at: i64,
    /// Notes supprimées avec un carnet.
    pub count: u32,
}

fn rows(conn: &Connection, kind: &'static str, sql: &str) -> Result<Vec<TrashItem>, DataError> {
    let mut stmt = conn.prepare(sql)?;
    let found = stmt.query_map([], |r| {
        Ok(TrashItem { kind, id: r.get(0)?, title: r.get(1)?, deleted_at: r.get(2)?, count: r.get::<_, Option<u32>>(3)?.unwrap_or(0) })
    })?;
    Ok(found.collect::<Result<_, _>>()?)
}

/// Éléments de la corbeille, du plus récemment supprimé au plus ancien.
pub fn list(conn: &Connection) -> Result<Vec<TrashItem>, DataError> {
    let mut items = Vec::new();
    // Une tâche supprimée avec son projet revient avec lui : elle n'apparaît pas seule.
    items.extend(rows(
        conn,
        "task",
        "SELECT t.id, t.title, t.deleted_at, NULL FROM tasks t
         WHERE t.deleted_at IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.deleted_at = t.deleted_at)",
    )?);
    items.extend(rows(conn, "event", "SELECT id, title, deleted_at, NULL FROM events WHERE deleted_at IS NOT NULL")?);
    items.extend(rows(conn, "obligation", "SELECT id, title, deleted_at, NULL FROM obligations WHERE deleted_at IS NOT NULL")?);
    // Une note supprimée avec son carnet revient avec lui : elle n'apparaît pas seule.
    items.extend(rows(
        conn,
        "note",
        "SELECT n.id, n.title, n.deleted_at, NULL FROM notes n
         WHERE n.deleted_at IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM notebooks b WHERE b.id = n.notebook_id AND b.deleted_at = n.deleted_at)",
    )?);
    items.extend(rows(
        conn,
        "notebook",
        "SELECT b.id, b.name, b.deleted_at,
                (SELECT COUNT(*) FROM notes n WHERE n.notebook_id = b.id AND n.deleted_at = b.deleted_at)
         FROM notebooks b
         WHERE b.deleted_at IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM notebooks p WHERE p.id = b.parent_id AND p.deleted_at = b.deleted_at)",
    )?);
    items.extend(rows(conn, "journal", "SELECT day, day, deleted_at, NULL FROM journal WHERE deleted_at IS NOT NULL")?);
    items.extend(rows(conn, "habit", "SELECT id, name, deleted_at, NULL FROM habits WHERE deleted_at IS NOT NULL")?);
    items.extend(rows(
        conn,
        "project",
        "SELECT p.id, p.name, p.deleted_at, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at = p.deleted_at)
         FROM projects p WHERE p.deleted_at IS NOT NULL",
    )?);
    items.extend(rows(
        conn,
        "contact",
        "SELECT id, CASE WHEN trim(first_name || ' ' || last_name) = '' THEN company ELSE trim(first_name || ' ' || last_name) END,
                deleted_at, NULL
         FROM contacts WHERE deleted_at IS NOT NULL",
    )?);
    items.extend(rows(conn, "document", "SELECT id, name, deleted_at, NULL FROM documents WHERE deleted_at IS NOT NULL")?);
    items.extend(rows(
        conn,
        "list",
        "SELECT l.id, l.name, l.deleted_at, (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id) FROM lists l WHERE l.deleted_at IS NOT NULL",
    )?);
    items.extend(rows(conn, "goal", "SELECT id, title, deleted_at, NULL FROM goals WHERE deleted_at IS NOT NULL")?);
    items.extend(rows(conn, "transaction", "SELECT id, label, deleted_at, NULL FROM transactions WHERE deleted_at IS NOT NULL")?);
    items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at).then_with(|| a.title.cmp(&b.title)));
    Ok(items)
}

/// Sort un élément de la corbeille.
pub fn restore(conn: &Connection, kind: &str, id: &str, now: u64) -> Result<(), DataError> {
    match kind {
        "task" => tasks::restore(conn, id, now).map(|_| ()),
        "event" => events::restore(conn, id, now).map(|_| ()),
        "obligation" => obligations::restore(conn, id, now).map(|_| ()),
        "note" => notes::restore(conn, id).map(|_| ()),
        "notebook" => notes::restore_notebook(conn, id),
        "journal" => journal::restore(conn, id).map(|_| ()),
        "habit" => habits::restore(conn, id, now).map(|_| ()),
        "project" => projects::restore(conn, id, now).map(|_| ()),
        "contact" => contacts::restore(conn, id, now).map(|_| ()),
        "document" => documents::restore(conn, id, now).map(|_| ()),
        "list" => lists::restore_list(conn, id, now).map(|_| ()),
        "goal" => goals::restore(conn, id, now).map(|_| ()),
        "transaction" => budget::restore(conn, id, now).map(|_| ()),
        _ => Err(invalid("kind")),
    }
}

fn purge_notes(conn: &Connection, filter: &str, id: &str) -> Result<(), DataError> {
    conn.execute(&format!("DELETE FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE {filter})"), params![id])?;
    conn.execute(&format!("DELETE FROM notes WHERE {filter}"), params![id])?;
    Ok(())
}

/// Supprime définitivement un élément de la corbeille (et ce qui a été supprimé avec lui).
pub fn purge(conn: &Connection, kind: &str, id: &str) -> Result<(), DataError> {
    let tx = conn.unchecked_transaction()?;
    let changed = match kind {
        "task" | "event" | "obligation" => {
            let table = match kind {
                "task" => "tasks",
                "event" => "events",
                _ => "obligations",
            };
            tx.execute(&format!("DELETE FROM {table} WHERE id = ?1 AND deleted_at IS NOT NULL"), params![id])?
        }
        "note" => {
            let exists: i64 = tx.query_row("SELECT COUNT(*) FROM notes WHERE id = ?1 AND deleted_at IS NOT NULL", params![id], |r| r.get(0))?;
            purge_notes(&tx, "id = ?1 AND deleted_at IS NOT NULL", id)?;
            exists as usize
        }
        "notebook" => {
            let at: Option<i64> = tx
                .query_row("SELECT deleted_at FROM notebooks WHERE id = ?1 AND deleted_at IS NOT NULL", params![id], |r| r.get(0))
                .ok();
            match at {
                None => 0,
                Some(at) => {
                    let books: Vec<String> = {
                        let mut stmt = tx.prepare(
                            "WITH RECURSIVE sub(id) AS (
                                 SELECT ?1
                                 UNION SELECT n.id FROM notebooks n JOIN sub ON n.parent_id = sub.id WHERE n.deleted_at = ?2
                             )
                             SELECT id FROM sub",
                        )?;
                        let found = stmt.query_map(params![id, at], |r| r.get(0))?;
                        found.collect::<Result<_, _>>()?
                    };
                    for book in &books {
                        tx.execute(
                            "DELETE FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE notebook_id = ?1 AND deleted_at = ?2)",
                            params![book, at],
                        )?;
                        tx.execute("DELETE FROM notes WHERE notebook_id = ?1 AND deleted_at = ?2", params![book, at])?;
                        tx.execute("DELETE FROM notebooks WHERE id = ?1", params![book])?;
                    }
                    books.len()
                }
            }
        }
        "journal" => tx.execute("DELETE FROM journal WHERE day = ?1 AND deleted_at IS NOT NULL", params![id])?,
        "habit" => {
            let n = tx.execute("DELETE FROM habits WHERE id = ?1 AND deleted_at IS NOT NULL", params![id])?;
            if n > 0 {
                tx.execute("DELETE FROM habit_checks WHERE habit_id = ?1", params![id])?;
            }
            n
        }
        "project" => projects::purge(&tx, id)?,
        "contact" => tx.execute("DELETE FROM contacts WHERE id = ?1 AND deleted_at IS NOT NULL", params![id])?,
        "document" => documents::purge_where(&tx, "id = ?1 AND deleted_at IS NOT NULL", &id)?,
        "list" => lists::purge(&tx, id)?,
        "goal" => goals::purge(&tx, id)?,
        "transaction" => tx.execute("DELETE FROM transactions WHERE id = ?1 AND deleted_at IS NOT NULL", params![id])?,
        _ => return Err(invalid("kind")),
    };
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    links::prune(&tx)?;
    tx.commit()?;
    Ok(())
}

/// Vide la corbeille : tout ce qui y est est supprimé définitivement.
pub fn empty(conn: &Connection) -> Result<usize, DataError> {
    let count = list(conn)?.len();
    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(
        "DELETE FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL);
         DELETE FROM notes WHERE deleted_at IS NOT NULL;
         DELETE FROM notebooks WHERE deleted_at IS NOT NULL;
         DELETE FROM tasks WHERE deleted_at IS NOT NULL;
         DELETE FROM events WHERE deleted_at IS NOT NULL;
         DELETE FROM obligations WHERE deleted_at IS NOT NULL;
         DELETE FROM journal WHERE deleted_at IS NOT NULL;
         DELETE FROM habit_checks WHERE habit_id IN (SELECT id FROM habits WHERE deleted_at IS NOT NULL);
         DELETE FROM habits WHERE deleted_at IS NOT NULL;
         DELETE FROM milestones WHERE project_id IN (SELECT id FROM projects WHERE deleted_at IS NOT NULL);
         UPDATE tasks SET project_id = NULL WHERE project_id IN (SELECT id FROM projects WHERE deleted_at IS NOT NULL);
         DELETE FROM projects WHERE deleted_at IS NOT NULL;
         DELETE FROM contacts WHERE deleted_at IS NOT NULL;
         DELETE FROM document_data WHERE document_id IN (SELECT id FROM documents WHERE deleted_at IS NOT NULL);
         DELETE FROM documents WHERE deleted_at IS NOT NULL;
         DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE deleted_at IS NOT NULL);
         DELETE FROM lists WHERE deleted_at IS NOT NULL;
         DELETE FROM goal_steps WHERE goal_id IN (SELECT id FROM goals WHERE deleted_at IS NOT NULL);
         DELETE FROM goal_entries WHERE goal_id IN (SELECT id FROM goals WHERE deleted_at IS NOT NULL);
         DELETE FROM goals WHERE deleted_at IS NOT NULL;
         DELETE FROM transactions WHERE deleted_at IS NOT NULL;",
    )?;
    links::prune(&tx)?;
    tx.commit()?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::notes::{NoteBody, NoteMeta, NotebookInput};
    use crate::data::recurrence::Day;
    use crate::data::tasks::TaskInput;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    fn body(title: &str) -> NoteBody {
        NoteBody { title: title.into(), content: r#"{"type":"doc"}"#.into(), plain: "texte".into(), links: vec![] }
    }

    #[test]
    fn la_corbeille_liste_restaure_purge_et_se_vide() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let today = Day::parse("2026-10-01").unwrap();
        let task = tasks::create(c, &TaskInput { title: "Appeler".into(), ..Default::default() }, NOW, today).unwrap();
        tasks::delete(c, &task.id, NOW + 1).unwrap();
        let book = notes::create_notebook(c, &NotebookInput { name: "Maison".into(), ..Default::default() }, NOW).unwrap();
        let inside = notes::create(c, &body("Dans le carnet"), &NoteMeta { notebook_id: Some(book.id.clone()), ..Default::default() }, NOW).unwrap();
        let alone = notes::create(c, &body("Seule"), &NoteMeta::default(), NOW).unwrap();
        notes::delete_notebook(c, &book.id, NOW + 2).unwrap();
        notes::delete(c, &alone.id, NOW + 3).unwrap();
        journal::save(c, "2026-10-01", &journal::JournalInput { mood: Some(3), ..Default::default() }, NOW).unwrap();
        journal::delete(c, "2026-10-01", NOW + 4).unwrap();

        let items = list(c).unwrap();
        let summary: Vec<(&str, &str, u32)> = items.iter().map(|i| (i.kind, i.title.as_str(), i.count)).collect();
        assert_eq!(summary, [("journal", "2026-10-01", 0), ("note", "Seule", 0), ("notebook", "Maison", 1), ("task", "Appeler", 0)]);

        // Le carnet revient avec sa note.
        restore(c, "notebook", &book.id, NOW).unwrap();
        assert!(notes::get(c, &inside.id).is_ok());
        restore(c, "journal", "2026-10-01", NOW).unwrap();
        assert!(journal::get(c, "2026-10-01").unwrap().is_some());

        purge(c, "note", &alone.id).unwrap();
        assert_eq!(purge(c, "note", &alone.id), Err(DataError::NotFound));
        assert_eq!(restore(c, "note", &alone.id, NOW), Err(DataError::NotFound));
        assert_eq!(restore(c, "inconnu", "x", NOW), Err(invalid("kind")));

        assert_eq!(empty(c).unwrap(), 1);
        assert!(list(c).unwrap().is_empty());
        assert_eq!(restore(c, "task", &task.id, NOW), Err(DataError::NotFound));
    }

    #[test]
    fn projets_contacts_et_documents_passent_par_la_corbeille() {
        use crate::data::contacts::ContactInput;
        use crate::data::documents::DocumentMeta;
        use crate::data::projects::{MilestoneInput, ProjectInput};
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let today = Day::parse("2026-10-01").unwrap();
        let project = projects::create(c, &ProjectInput { name: "Voyage".into(), status: "en-cours".into(), icon: "maison".into(), ..Default::default() }, NOW).unwrap();
        projects::create_milestone(c, &project.id, &MilestoneInput { title: "Départ".into(), due_date: None }, NOW).unwrap();
        let task = tasks::create(c, &TaskInput { title: "Valise".into(), project_id: Some(project.id.clone()), ..Default::default() }, NOW, today).unwrap();
        let contact = contacts::create(c, &ContactInput { company: "Garage Dupont".into(), ..Default::default() }, NOW).unwrap();
        let doc = documents::add(c, b"contenu", &DocumentMeta { name: "billet.pdf".into(), ..Default::default() }, NOW).unwrap();
        links::add(c, "document", &doc.id, "project", &project.id, NOW).unwrap();
        projects::delete(c, &project.id, NOW + 1).unwrap();
        contacts::delete(c, &contact.id, NOW + 2).unwrap();
        documents::delete(c, &doc.id, NOW + 3).unwrap();

        let titles: Vec<(&str, String)> = list(c).unwrap().into_iter().map(|i| (i.kind, i.title)).collect();
        assert_eq!(titles, [("document", "billet.pdf".to_string()), ("contact", "Garage Dupont".to_string()), ("project", "Voyage".to_string())], "la tâche du projet n'apparaît pas seule");
        assert_eq!(list(c).unwrap().iter().find(|i| i.kind == "project").unwrap().count, 1);

        restore(c, "contact", &contact.id, NOW).unwrap();
        purge(c, "document", &doc.id).unwrap();
        let data: i64 = c.query_row("SELECT COUNT(*) FROM document_data", [], |r| r.get(0)).unwrap();
        assert_eq!(data, 0);
        assert!(links::list(c).unwrap().is_empty(), "le lien vers le document disparu est retiré");

        assert_eq!(empty(c).unwrap(), 1);
        let left: i64 = c.query_row("SELECT COUNT(*) FROM tasks WHERE id = ?1", params![task.id], |r| r.get(0)).unwrap();
        assert_eq!(left, 0, "la tâche part avec son projet");
        let milestones: i64 = c.query_row("SELECT COUNT(*) FROM milestones", [], |r| r.get(0)).unwrap();
        assert_eq!(milestones, 0);
    }
}
