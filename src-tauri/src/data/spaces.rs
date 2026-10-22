//! Espaces (Perso, Travail, Santé, Famille…) : chaque élément d'Aqueli appartiendra à un
//! espace, avec sa couleur et son icône (cahier des charges § 8).

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use super::symbols::check_symbol;
use super::DataError;
use crate::vault::crypto;

pub const MAX_SPACES: usize = 24;
pub const MAX_NAME_CHARS: usize = 40;


#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub position: i64,
}

/// Nom nettoyé : espaces superflus retirés, 1 à 40 caractères, sans caractère de contrôle.
fn clean_name(name: &str) -> Result<String, DataError> {
    let cleaned = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let length = cleaned.chars().count();
    if length == 0 || length > MAX_NAME_CHARS || cleaned.chars().any(char::is_control) {
        return Err(DataError::Invalid { field: "name".into() });
    }
    Ok(cleaned)
}

/// Couleur au format « #rrggbb ».
pub(crate) fn clean_color(color: &str) -> Result<String, DataError> {
    let lower = color.trim().to_ascii_lowercase();
    let valid = lower.len() == 7 && lower.starts_with('#') && lower[1..].chars().all(|c| c.is_ascii_hexdigit());
    if valid {
        Ok(lower)
    } else {
        Err(DataError::Invalid { field: "color".into() })
    }
}

/// Symbole de la liste commune (src/components/symbols.ts).
fn check_icon(icon: &str) -> Result<(), DataError> {
    check_symbol(icon, "icon").map(|_| ())
}

/// Deux espaces ne peuvent pas porter le même nom (sans tenir compte des majuscules).
fn check_unique(conn: &Connection, name: &str, except_id: Option<&str>) -> Result<(), DataError> {
    let wanted = name.to_lowercase();
    let taken = list(conn)?
        .into_iter()
        .any(|s| s.name.to_lowercase() == wanted && Some(s.id.as_str()) != except_id);
    if taken {
        return Err(DataError::Duplicate { field: "name".into() });
    }
    Ok(())
}

fn get(conn: &Connection, id: &str) -> Result<Space, DataError> {
    conn.query_row(
        "SELECT id, name, color, icon, position FROM spaces WHERE id = ?1",
        params![id],
        |r| Ok(Space { id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, icon: r.get(3)?, position: r.get(4)? }),
    )
    .optional()?
    .ok_or(DataError::NotFound)
}

pub fn list(conn: &Connection) -> Result<Vec<Space>, DataError> {
    let mut stmt = conn.prepare("SELECT id, name, color, icon, position FROM spaces ORDER BY position, created_at")?;
    let rows = stmt.query_map([], |r| {
        Ok(Space { id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, icon: r.get(3)?, position: r.get(4)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(conn: &Connection, name: &str, color: &str, icon: &str, now: u64) -> Result<Space, DataError> {
    let name = clean_name(name)?;
    let color = clean_color(color)?;
    check_icon(icon)?;
    let existing = list(conn)?;
    if existing.len() >= MAX_SPACES {
        return Err(DataError::TooMany { max: MAX_SPACES });
    }
    check_unique(conn, &name, None)?;
    let id = hex::encode(crypto::random_bytes::<8>().map_err(|_| DataError::Database { detail: "aléa indisponible".into() })?);
    let position = existing.iter().map(|s| s.position).max().map_or(0, |p| p + 1);
    conn.execute(
        "INSERT INTO spaces (id, name, color, icon, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, name, color, icon, position, now as i64],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, name: &str, color: &str, icon: &str) -> Result<Space, DataError> {
    get(conn, id)?;
    let name = clean_name(name)?;
    let color = clean_color(color)?;
    check_icon(icon)?;
    check_unique(conn, &name, Some(id))?;
    conn.execute(
        "UPDATE spaces SET name = ?2, color = ?3, icon = ?4 WHERE id = ?1",
        params![id, name, color, icon],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), DataError> {
    get(conn, id)?;
    if list(conn)?.len() <= 1 {
        return Err(DataError::LastSpace);
    }
    conn.execute("DELETE FROM spaces WHERE id = ?1", params![id])?;
    Ok(())
}

/// Remet un espace supprimé à sa place (bouton « Annuler »).
pub fn restore(conn: &Connection, space: &Space, now: u64) -> Result<Space, DataError> {
    if get(conn, &space.id).is_ok() {
        return Err(DataError::Duplicate { field: "id".into() });
    }
    let name = clean_name(&space.name)?;
    let color = clean_color(&space.color)?;
    check_icon(&space.icon)?;
    check_unique(conn, &name, None)?;
    conn.execute(
        "INSERT INTO spaces (id, name, color, icon, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![space.id, name, color, space.icon, space.position, now as i64],
    )?;
    get(conn, &space.id)
}

/// Nouvel ordre : `ids` doit contenir exactement les espaces existants.
pub fn reorder(conn: &mut Connection, ids: &[String]) -> Result<Vec<Space>, DataError> {
    let mut current: Vec<String> = list(conn)?.into_iter().map(|s| s.id).collect();
    let mut wanted = ids.to_vec();
    current.sort();
    wanted.sort();
    if current != wanted {
        return Err(DataError::Invalid { field: "order".into() });
    }
    let tx = conn.transaction()?;
    for (position, id) in ids.iter().enumerate() {
        tx.execute("UPDATE spaces SET position = ?2 WHERE id = ?1", params![id, position as i64])?;
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

    /// Coffre de test avec la base réelle (SQLCipher, migrations).
    fn open_vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        (dir, vault)
    }

    fn names(conn: &Connection) -> Vec<String> {
        list(conn).unwrap().into_iter().map(|s| s.name).collect()
    }

    #[test]
    fn les_quatre_espaces_par_defaut_sont_la() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let spaces = list(conn).unwrap();
        assert_eq!(names(conn), vec!["Perso", "Travail", "Santé", "Famille"]);
        assert_eq!(spaces[0].color, "#0a9fd8");
        assert_eq!(spaces[2].icon, "coeur");
    }

    #[test]
    fn creer_un_espace() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let space = create(conn, "  Associations   sportives ", "#2FAE4A", "sport", NOW).unwrap();
        assert_eq!(space.name, "Associations sportives");
        assert_eq!(space.color, "#2fae4a");
        assert_eq!(space.position, 4);
        assert_eq!(names(conn).last().unwrap(), "Associations sportives");
    }

    #[test]
    fn les_valeurs_invalides_sont_refusees() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        assert_eq!(create(conn, "   ", "#000000", "maison", NOW), Err(DataError::Invalid { field: "name".into() }));
        assert_eq!(
            create(conn, &"x".repeat(41), "#000000", "maison", NOW),
            Err(DataError::Invalid { field: "name".into() })
        );
        assert_eq!(create(conn, "Loisirs", "bleu", "maison", NOW), Err(DataError::Invalid { field: "color".into() }));
        assert_eq!(create(conn, "Loisirs", "#12345g", "maison", NOW), Err(DataError::Invalid { field: "color".into() }));
        assert_eq!(create(conn, "Loisirs", "#123456", "inconnu", NOW), Err(DataError::Invalid { field: "icon".into() }));
    }

    #[test]
    fn deux_espaces_ne_portent_pas_le_meme_nom() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        assert_eq!(create(conn, "travail", "#123456", "valise", NOW), Err(DataError::Duplicate { field: "name".into() }));
        // Renommer un espace sans changer son nom (ou seulement ses majuscules) est permis.
        update(conn, "travail", "TRAVAIL", "#7a5ce6", "valise").unwrap();
        assert_eq!(update(conn, "perso", "Travail", "#0a9fd8", "maison"), Err(DataError::Duplicate { field: "name".into() }));
    }

    #[test]
    fn modifier_un_espace() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let space = update(conn, "sante", "Santé et bien-être", "#16a3a3", "feuille").unwrap();
        assert_eq!((space.name.as_str(), space.color.as_str(), space.icon.as_str()), ("Santé et bien-être", "#16a3a3", "feuille"));
        assert_eq!(update(conn, "inconnu", "X", "#000000", "maison"), Err(DataError::NotFound));
    }

    #[test]
    fn supprimer_puis_annuler() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let removed = get(conn, "famille").unwrap();
        delete(conn, "famille").unwrap();
        assert_eq!(names(conn), vec!["Perso", "Travail", "Santé"]);
        restore(conn, &removed, NOW).unwrap();
        assert_eq!(names(conn), vec!["Perso", "Travail", "Santé", "Famille"]);
    }

    #[test]
    fn on_garde_toujours_au_moins_un_espace() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        for id in ["perso", "travail", "sante"] {
            delete(conn, id).unwrap();
        }
        assert_eq!(delete(conn, "famille"), Err(DataError::LastSpace));
    }

    #[test]
    fn reordonner_les_espaces() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let order: Vec<String> = ["famille", "perso", "sante", "travail"].map(String::from).to_vec();
        reorder(conn, &order).unwrap();
        assert_eq!(names(conn), vec!["Famille", "Perso", "Santé", "Travail"]);
        let incomplete: Vec<String> = vec!["perso".into()];
        assert_eq!(reorder(conn, &incomplete), Err(DataError::Invalid { field: "order".into() }));
    }

    #[test]
    fn le_nombre_d_espaces_est_limite() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        for i in 4..MAX_SPACES {
            create(conn, &format!("Espace {i}"), "#123456", "etoile", NOW).unwrap();
        }
        assert_eq!(create(conn, "Un de trop", "#123456", "etoile", NOW), Err(DataError::TooMany { max: MAX_SPACES }));
    }
}
