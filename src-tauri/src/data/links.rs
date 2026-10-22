//! Liens entre éléments (cahier des charges § 2 « Tout est relié ») : une tâche, un événement,
//! une obligation, une note, un projet, un contact ou un document peuvent être reliés à
//! n'importe quel autre, dans les deux sens. Un lien est rangé une seule fois, ses deux bouts
//! dans l'ordre (type puis identifiant) ; les liens vers un élément disparu sont retirés.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::tasks::invalid;
use super::DataError;

/// Types d'éléments qui se relient, avec leur table.
pub const KINDS: [(&str, &str); 8] = [
    ("task", "tasks"),
    ("event", "events"),
    ("obligation", "obligations"),
    ("note", "notes"),
    ("project", "projects"),
    ("contact", "contacts"),
    ("document", "documents"),
    ("goal", "goals"),
];

pub const MAX_LINKS: usize = 20_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub a_kind: String,
    pub a_id: String,
    pub b_kind: String,
    pub b_id: String,
}

fn table(kind: &str) -> Result<&'static str, DataError> {
    KINDS.iter().find(|(k, _)| *k == kind).map(|(_, t)| *t).ok_or_else(|| invalid("kind"))
}

fn exists(conn: &Connection, kind: &str, id: &str) -> Result<bool, DataError> {
    let table = table(kind)?;
    Ok(conn
        .query_row(&format!("SELECT 1 FROM {table} WHERE id = ?1 AND deleted_at IS NULL"), params![id], |_| Ok(()))
        .optional()?
        .is_some())
}

/// Les deux bouts dans l'ordre : un lien n'est rangé qu'une fois.
fn ordered(a_kind: &str, a_id: &str, b_kind: &str, b_id: &str) -> Link {
    let (first, second) = if (a_kind, a_id) <= (b_kind, b_id) { ((a_kind, a_id), (b_kind, b_id)) } else { ((b_kind, b_id), (a_kind, a_id)) };
    Link { a_kind: first.0.into(), a_id: first.1.into(), b_kind: second.0.into(), b_id: second.1.into() }
}

/// Retire les liens dont un bout n'existe plus du tout (supprimé définitivement).
pub fn prune(conn: &Connection) -> Result<(), DataError> {
    for (kind, table) in KINDS {
        conn.execute(
            &format!(
                "DELETE FROM links WHERE (a_kind = ?1 AND a_id NOT IN (SELECT id FROM {table}))
                                      OR (b_kind = ?1 AND b_id NOT IN (SELECT id FROM {table}))"
            ),
            params![kind],
        )?;
    }
    Ok(())
}

/// Tous les liens (les éléments à la corbeille compris : l'interface ne montre que ceux qu'elle connaît).
pub fn list(conn: &Connection) -> Result<Vec<Link>, DataError> {
    prune(conn)?;
    let mut stmt = conn.prepare("SELECT a_kind, a_id, b_kind, b_id FROM links ORDER BY created_at")?;
    let rows = stmt.query_map([], |r| Ok(Link { a_kind: r.get(0)?, a_id: r.get(1)?, b_kind: r.get(2)?, b_id: r.get(3)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Relie deux éléments (rien ne change s'ils l'étaient déjà).
pub fn add(conn: &Connection, a_kind: &str, a_id: &str, b_kind: &str, b_id: &str, now: u64) -> Result<Link, DataError> {
    if a_kind == b_kind && a_id == b_id {
        return Err(invalid("link"));
    }
    for (kind, id) in [(a_kind, a_id), (b_kind, b_id)] {
        if !exists(conn, kind, id)? {
            return Err(DataError::NotFound);
        }
    }
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM links", [], |r| r.get(0))?;
    if count as usize >= MAX_LINKS {
        return Err(DataError::TooMany { max: MAX_LINKS });
    }
    let link = ordered(a_kind, a_id, b_kind, b_id);
    conn.execute(
        "INSERT OR IGNORE INTO links (a_kind, a_id, b_kind, b_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![link.a_kind, link.a_id, link.b_kind, link.b_id, now as i64],
    )?;
    Ok(link)
}

/// Défait un lien.
pub fn remove(conn: &Connection, a_kind: &str, a_id: &str, b_kind: &str, b_id: &str) -> Result<(), DataError> {
    table(a_kind)?;
    table(b_kind)?;
    let link = ordered(a_kind, a_id, b_kind, b_id);
    conn.execute(
        "DELETE FROM links WHERE a_kind = ?1 AND a_id = ?2 AND b_kind = ?3 AND b_id = ?4",
        params![link.a_kind, link.a_id, link.b_kind, link.b_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::recurrence::Day;
    use crate::data::tasks::{self, TaskInput};
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    #[test]
    fn deux_elements_se_relient_une_fois_dans_les_deux_sens() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let today = Day::parse("2026-10-01").unwrap();
        let a = tasks::create(c, &TaskInput { title: "Appeler".into(), ..Default::default() }, NOW, today).unwrap();
        let b = tasks::create(c, &TaskInput { title: "Écrire".into(), ..Default::default() }, NOW, today).unwrap();

        add(c, "task", &b.id, "task", &a.id, NOW).unwrap();
        add(c, "task", &a.id, "task", &b.id, NOW).unwrap();
        assert_eq!(list(c).unwrap().len(), 1, "un seul lien, quel que soit le sens");
        assert_eq!(add(c, "task", &a.id, "task", &a.id, NOW), Err(invalid("link")));
        assert_eq!(add(c, "task", &a.id, "contact", "inconnu", NOW), Err(DataError::NotFound));
        assert_eq!(add(c, "task", &a.id, "fichier", "x", NOW), Err(invalid("kind")));

        // Un élément à la corbeille garde ses liens ; supprimé définitivement, il les perd.
        tasks::delete(c, &b.id, NOW).unwrap();
        assert_eq!(list(c).unwrap().len(), 1);
        c.execute("DELETE FROM tasks WHERE id = ?1", params![b.id]).unwrap();
        assert!(list(c).unwrap().is_empty());

        let d = tasks::create(c, &TaskInput { title: "Dernière".into(), ..Default::default() }, NOW, today).unwrap();
        add(c, "task", &a.id, "task", &d.id, NOW).unwrap();
        remove(c, "task", &d.id, "task", &a.id).unwrap();
        assert!(list(c).unwrap().is_empty());
    }
}
