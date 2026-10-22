//! Ordre choisi à la souris (glisser-déposer) pour les éléments rangés par position qui
//! n'avaient pas de commande à eux : objectifs, dossiers des documents et des notes, catégories
//! du budget et des contacts. Le nom de la liste vient d'une liste fermée : jamais de nom de
//! table reçu tel quel dans une requête.

use rusqlite::{params, Connection};

use super::tasks::invalid;
use super::DataError;

/// Nombre d'éléments au plus dans un ordre envoyé par l'interface.
const MAX_IDS: usize = 10_000;

/// Liste reçue de l'interface → table de la base.
fn table_of(kind: &str) -> Option<&'static str> {
    match kind {
        "objectifs" => Some("goals"),
        "dossiers-documents" => Some("document_folders"),
        "dossiers-notes" => Some("note_folders"),
        "categories-budget" => Some("budget_categories"),
        "categories-contacts" => Some("contact_groups"),
        _ => None,
    }
}

/// Nouvel ordre (identifiants dans l'ordre voulu) ; les identifiants inconnus sont sans effet.
pub fn reorder(conn: &Connection, kind: &str, ids: &[String]) -> Result<(), DataError> {
    let table = table_of(kind).ok_or_else(|| invalid("kind"))?;
    if ids.len() > MAX_IDS {
        return Err(invalid("ids"));
    }
    let sql = format!("UPDATE {table} SET position = ?2 WHERE id = ?1");
    let tx = conn.unchecked_transaction()?;
    for (position, id) in ids.iter().enumerate() {
        tx.execute(&sql, params![id, position as i64])?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::contacts::{self, ContactGroupInput};
    use crate::data::documents::{self, FolderInput};
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    fn open_vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        (dir, vault)
    }

    #[test]
    fn les_dossiers_et_les_categories_suivent_le_nouvel_ordre() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let folder = |name: &str| documents::create_folder(conn, &FolderInput { name: name.into(), icon: None, color: None }, NOW).unwrap().id;
        let (a, b, c) = (folder("Banque"), folder("Logement"), folder("Santé"));
        reorder(conn, "dossiers-documents", &[c.clone(), a.clone(), b.clone()]).unwrap();
        let names: Vec<String> = documents::folders(conn).unwrap().into_iter().map(|f| f.name).collect();
        assert_eq!(names, vec!["Santé", "Banque", "Logement"]);

        let group = |name: &str| contacts::create_group(conn, &ContactGroupInput { name: name.into(), color: None, icon: None }, NOW).unwrap().id;
        let (x, y) = (group("Famille"), group("Voisins"));
        reorder(conn, "categories-contacts", &[y, x]).unwrap();
        let names: Vec<String> = contacts::groups(conn).unwrap().into_iter().map(|g| g.name).collect();
        assert_eq!(names, vec!["Voisins", "Famille"]);
    }

    #[test]
    fn une_liste_inconnue_est_refusee() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        assert_eq!(reorder(conn, "tasks; DROP TABLE tasks", &[]), Err(DataError::Invalid { field: "kind".into() }));
        assert_eq!(reorder(conn, "goals", &[]), Err(DataError::Invalid { field: "kind".into() }));
    }
}
