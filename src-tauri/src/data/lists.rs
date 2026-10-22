//! Listes (cahier des charges § 4.11) : collections simples pour tout ce qui n'est pas une tâche
//! (courses par rayon, livres, films, idées cadeaux, voyages, envies). Chaque liste a ses colonnes
//! (texte, note sur 5, date, case, lien, prix), une vue (liste ou galerie avec images), des rayons
//! (sections) ; archivage, corbeille de 30 jours.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{self, clean_line, invalid, is_valid_date, space_exists, TRASH_SECONDS};
use super::DataError;

pub const MAX_LISTS: usize = 500;
pub const MAX_ITEMS: usize = 2000;
pub const MAX_COLUMNS: usize = 12;
pub const MAX_SECTIONS: usize = 30;
pub const MAX_NAME_CHARS: usize = 100;
pub const MAX_ITEM_CHARS: usize = 300;
pub const MAX_CELL_CHARS: usize = 1000;
/// Image d'un élément (vue galerie), réduite par l'interface.
pub const MAX_IMAGE_CHARS: usize = 400_000;
/// Modèles de listes (src/lists/lists.ts).
pub const TEMPLATES: [&str; 7] = ["libre", "courses", "livres", "films", "cadeaux", "voyages", "envies"];
pub const COLUMN_KINDS: [&str; 6] = ["texte", "note", "date", "case", "lien", "prix"];
pub const VIEWS: [&str; 2] = ["liste", "galerie"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListColumn {
    pub id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct List {
    pub id: String,
    pub name: String,
    pub template: String,
    pub columns: Vec<ListColumn>,
    /// Rayons (courses) ou sections, dans l'ordre.
    pub sections: Vec<String>,
    pub view: String,
    pub color: Option<String>,
    pub icon: String,
    pub space_id: Option<String>,
    pub archived: bool,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ListInput {
    pub name: String,
    pub template: String,
    pub columns: Vec<ListColumn>,
    pub sections: Vec<String>,
    pub view: String,
    pub color: Option<String>,
    pub icon: String,
    pub space_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListItem {
    pub id: String,
    pub list_id: String,
    pub title: String,
    pub section: Option<String>,
    /// Valeurs des colonnes, par identifiant de colonne.
    pub cells: Map<String, Value>,
    pub done: bool,
    pub image: Option<String>,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ListItemInput {
    pub title: String,
    pub section: Option<String>,
    pub cells: Map<String, Value>,
    pub done: bool,
    pub image: Option<String>,
}

fn is_image(value: &str) -> bool {
    let Some(data) = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"].iter().find_map(|p| value.strip_prefix(p)) else {
        return false;
    };
    value.len() <= MAX_IMAGE_CHARS && !data.is_empty() && data.chars().all(|c| c.is_ascii_alphanumeric() || "+/=".contains(c))
}

fn clean_columns(columns: &[ListColumn]) -> Result<Vec<ListColumn>, DataError> {
    if columns.len() > MAX_COLUMNS {
        return Err(invalid("columns"));
    }
    let mut out: Vec<ListColumn> = Vec::new();
    for c in columns {
        let id = c.id.trim();
        if id.is_empty() || id.len() > 40 || !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') || out.iter().any(|o| o.id == id) {
            return Err(invalid("columns"));
        }
        if !COLUMN_KINDS.contains(&c.kind.as_str()) {
            return Err(invalid("columns"));
        }
        out.push(ListColumn { id: id.to_string(), name: clean_line(&c.name, 40, "columns")?, kind: c.kind.clone() });
    }
    Ok(out)
}

fn clean_sections(sections: &[String]) -> Result<Vec<String>, DataError> {
    if sections.len() > MAX_SECTIONS {
        return Err(invalid("sections"));
    }
    let mut out: Vec<String> = Vec::new();
    for s in sections {
        let s = clean_line(s, 60, "sections")?;
        if !out.iter().any(|o| o.to_lowercase() == s.to_lowercase()) {
            out.push(s);
        }
    }
    Ok(out)
}

fn clean_list(conn: &Connection, input: &ListInput, current_space: Option<&str>) -> Result<ListInput, DataError> {
    if !TEMPLATES.contains(&input.template.as_str()) {
        return Err(invalid("template"));
    }
    if !VIEWS.contains(&input.view.as_str()) {
        return Err(invalid("view"));
    }
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    Ok(ListInput {
        name: clean_line(&input.name, MAX_NAME_CHARS, "name")?,
        template: input.template.clone(),
        columns: clean_columns(&input.columns)?,
        sections: clean_sections(&input.sections)?,
        view: input.view.clone(),
        color: input.color.as_deref().map(clean_color).transpose()?,
        icon: check_symbol(&input.icon, "icon")?,
        space_id: input.space_id.clone(),
    })
}

fn json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "[]".into())
}

const LIST_COLUMNS: &str = "id, name, template, columns, sections, view, color, icon, space_id, archived_at, position, created_at, updated_at";

fn list_row(row: &Row) -> rusqlite::Result<List> {
    let columns: String = row.get(3)?;
    let sections: String = row.get(4)?;
    let archived: Option<i64> = row.get(9)?;
    Ok(List {
        id: row.get(0)?,
        name: row.get(1)?,
        template: row.get(2)?,
        columns: serde_json::from_str(&columns).unwrap_or_default(),
        sections: serde_json::from_str(&sections).unwrap_or_default(),
        view: row.get(5)?,
        color: row.get(6)?,
        icon: row.get(7)?,
        space_id: row.get(8)?,
        archived: archived.is_some(),
        position: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

pub fn get_list(conn: &Connection, id: &str) -> Result<List, DataError> {
    conn.query_row(&format!("SELECT {LIST_COLUMNS} FROM lists WHERE id = ?1 AND deleted_at IS NULL"), params![id], list_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Listes (archivées comprises). Vide au passage la corbeille de plus de 30 jours.
pub fn lists(conn: &Connection, now: u64) -> Result<Vec<List>, DataError> {
    let old: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM lists WHERE deleted_at IS NOT NULL AND deleted_at < ?1")?;
        let found = stmt.query_map(params![now as i64 - TRASH_SECONDS], |r| r.get(0))?;
        found.collect::<Result<_, _>>()?
    };
    for id in old {
        purge(conn, &id)?;
    }
    let mut stmt = conn.prepare(&format!("SELECT {LIST_COLUMNS} FROM lists WHERE deleted_at IS NULL ORDER BY position, created_at"))?;
    let rows = stmt.query_map([], list_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create_list(conn: &Connection, input: &ListInput, now: u64) -> Result<List, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM lists WHERE deleted_at IS NULL", [], |r| r.get(0))?;
    if count as usize >= MAX_LISTS {
        return Err(DataError::TooMany { max: MAX_LISTS });
    }
    let l = clean_list(conn, input, None)?;
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO lists (id, name, template, columns, sections, view, color, icon, space_id, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        params![id, l.name, l.template, json(&l.columns), json(&l.sections), l.view, l.color, l.icon, l.space_id, count, now as i64],
    )?;
    get_list(conn, &id)
}

/// Modifie la liste ; une colonne retirée efface ses valeurs, une section retirée laisse ses éléments sans section.
pub fn update_list(conn: &Connection, id: &str, input: &ListInput, now: u64) -> Result<List, DataError> {
    let current = get_list(conn, id)?;
    let l = clean_list(conn, input, current.space_id.as_deref())?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE lists SET name = ?2, template = ?3, columns = ?4, sections = ?5, view = ?6, color = ?7, icon = ?8, space_id = ?9, updated_at = ?10
         WHERE id = ?1",
        params![id, l.name, l.template, json(&l.columns), json(&l.sections), l.view, l.color, l.icon, l.space_id, now as i64],
    )?;
    let kept: Vec<&str> = l.columns.iter().map(|c| c.id.as_str()).collect();
    let items: Vec<(String, String, Option<String>)> = {
        let mut stmt = tx.prepare("SELECT id, cells, section FROM list_items WHERE list_id = ?1")?;
        let found = stmt.query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        found.collect::<Result<_, _>>()?
    };
    for (item, cells, section) in items {
        let mut map: Map<String, Value> = serde_json::from_str(&cells).unwrap_or_default();
        let before = map.len();
        map.retain(|k, _| kept.contains(&k.as_str()));
        let gone = section.as_deref().is_some_and(|s| !l.sections.iter().any(|x| x == s));
        if map.len() != before || gone {
            tx.execute(
                "UPDATE list_items SET cells = ?2, section = CASE WHEN ?3 THEN NULL ELSE section END WHERE id = ?1",
                params![item, json(&map), gone],
            )?;
        }
    }
    tx.commit()?;
    get_list(conn, id)
}

pub fn set_archived(conn: &Connection, id: &str, archived: bool, now: u64) -> Result<List, DataError> {
    get_list(conn, id)?;
    conn.execute(
        "UPDATE lists SET archived_at = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, archived.then_some(now as i64), now as i64],
    )?;
    get_list(conn, id)
}

pub fn delete_list(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get_list(conn, id)?;
    conn.execute("UPDATE lists SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

pub fn restore_list(conn: &Connection, id: &str, now: u64) -> Result<List, DataError> {
    let changed = conn.execute("UPDATE lists SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL", params![id, now as i64])?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    get_list(conn, id)
}

/// Supprime définitivement une liste de la corbeille, avec ses éléments.
pub fn purge(conn: &Connection, id: &str) -> Result<usize, DataError> {
    let n = conn.execute("DELETE FROM lists WHERE id = ?1 AND deleted_at IS NOT NULL", params![id])?;
    if n > 0 {
        conn.execute("DELETE FROM list_items WHERE list_id = ?1", params![id])?;
    }
    Ok(n)
}

// ——— Éléments ———

/// Valeur d'une colonne, vérifiée selon sa sorte ; `None` : valeur vide, retirée.
fn clean_cell(kind: &str, value: &Value) -> Result<Option<Value>, DataError> {
    let bad = || invalid("cells");
    Ok(match (kind, value) {
        (_, Value::Null) => None,
        ("texte" | "lien", Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else if t.chars().count() > MAX_CELL_CHARS || t.chars().any(|c| c.is_control() && c != '\n') {
                return Err(bad());
            } else {
                Some(Value::String(t.to_string()))
            }
        }
        ("note", Value::Number(n)) => match n.as_u64() {
            Some(0) => None,
            Some(v) if v <= 5 => Some(Value::from(v)),
            _ => return Err(bad()),
        },
        ("prix", Value::Number(n)) => match n.as_i64() {
            Some(v) if (0..=1_000_000_000).contains(&v) => Some(Value::from(v)),
            _ => return Err(bad()),
        },
        ("date", Value::String(s)) if s.is_empty() => None,
        ("date", Value::String(s)) if is_valid_date(s) => Some(Value::String(s.clone())),
        ("case", Value::Bool(b)) => b.then_some(Value::Bool(true)),
        _ => return Err(bad()),
    })
}

fn clean_item(list: &List, input: &ListItemInput) -> Result<ListItemInput, DataError> {
    let mut cells = Map::new();
    for (key, value) in &input.cells {
        let column = list.columns.iter().find(|c| &c.id == key).ok_or_else(|| invalid("cells"))?;
        if let Some(v) = clean_cell(&column.kind, value)? {
            cells.insert(key.clone(), v);
        }
    }
    let section = match &input.section {
        Some(s) if list.sections.iter().any(|x| x == s) => Some(s.clone()),
        Some(_) => return Err(invalid("section")),
        None => None,
    };
    if input.image.as_deref().is_some_and(|i| !is_image(i)) {
        return Err(invalid("image"));
    }
    Ok(ListItemInput { title: clean_line(&input.title, MAX_ITEM_CHARS, "title")?, section, cells, done: input.done, image: input.image.clone() })
}

const ITEM_COLUMNS: &str = "id, list_id, title, section, cells, done, image, position, created_at, updated_at";

fn item_row(row: &Row) -> rusqlite::Result<ListItem> {
    let cells: String = row.get(4)?;
    Ok(ListItem {
        id: row.get(0)?,
        list_id: row.get(1)?,
        title: row.get(2)?,
        section: row.get(3)?,
        cells: serde_json::from_str(&cells).unwrap_or_default(),
        done: row.get(5)?,
        image: row.get(6)?,
        position: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn get_item(conn: &Connection, id: &str) -> Result<ListItem, DataError> {
    conn.query_row(&format!("SELECT {ITEM_COLUMNS} FROM list_items WHERE id = ?1"), params![id], item_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Éléments des listes hors corbeille.
pub fn items(conn: &Connection) -> Result<Vec<ListItem>, DataError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {ITEM_COLUMNS} FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE deleted_at IS NULL) ORDER BY position, created_at"
    ))?;
    let rows = stmt.query_map([], item_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create_item(conn: &Connection, list_id: &str, input: &ListItemInput, now: u64) -> Result<ListItem, DataError> {
    let list = get_list(conn, list_id)?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM list_items WHERE list_id = ?1", params![list_id], |r| r.get(0))?;
    if count as usize >= MAX_ITEMS {
        return Err(DataError::TooMany { max: MAX_ITEMS });
    }
    let i = clean_item(&list, input)?;
    let id = tasks::random_id()?;
    let position: i64 = conn.query_row("SELECT COALESCE(MAX(position) + 1, 0) FROM list_items WHERE list_id = ?1", params![list_id], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO list_items (id, list_id, title, section, cells, done, image, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![id, list_id, i.title, i.section, json(&i.cells), i.done, i.image, position, now as i64],
    )?;
    get_item(conn, &id)
}

pub fn update_item(conn: &Connection, id: &str, input: &ListItemInput, now: u64) -> Result<ListItem, DataError> {
    let current = get_item(conn, id)?;
    let list = get_list(conn, &current.list_id)?;
    let i = clean_item(&list, input)?;
    conn.execute(
        "UPDATE list_items SET title = ?2, section = ?3, cells = ?4, done = ?5, image = ?6, updated_at = ?7 WHERE id = ?1",
        params![id, i.title, i.section, json(&i.cells), i.done, i.image, now as i64],
    )?;
    get_item(conn, id)
}

pub fn delete_item(conn: &Connection, id: &str) -> Result<(), DataError> {
    if conn.execute("DELETE FROM list_items WHERE id = ?1", params![id])? == 0 {
        return Err(DataError::NotFound);
    }
    Ok(())
}

/// Range les éléments d'une liste dans l'ordre donné (glisser-déposer).
pub fn reorder_items(conn: &Connection, list_id: &str, ids: &[String]) -> Result<(), DataError> {
    get_list(conn, list_id)?;
    let tx = conn.unchecked_transaction()?;
    for (position, id) in ids.iter().enumerate() {
        tx.execute("UPDATE list_items SET position = ?3 WHERE id = ?1 AND list_id = ?2", params![id, list_id, position as i64])?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;
    use serde_json::json;

    const NOW: u64 = 1_790_000_000;

    fn column(id: &str, kind: &str) -> ListColumn {
        ListColumn { id: id.into(), name: id.into(), kind: kind.into() }
    }

    fn books() -> ListInput {
        ListInput {
            name: "Livres à lire".into(),
            template: "livres".into(),
            columns: vec![column("auteur", "texte"), column("note", "note"), column("lu", "date"), column("prix", "prix"), column("fini", "case")],
            sections: vec!["Romans".into(), "Essais".into()],
            view: "liste".into(),
            icon: "livre".into(),
            ..Default::default()
        }
    }

    fn cells(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }

    #[test]
    fn une_liste_garde_ses_colonnes_et_verifie_ses_valeurs() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let list = create_list(c, &books(), NOW).unwrap();
        let item = create_item(
            c,
            &list.id,
            &ListItemInput {
                title: " Le Petit Prince ".into(),
                section: Some("Romans".into()),
                cells: cells(json!({ "auteur": " Saint-Exupéry ", "note": 5, "lu": "2026-09-30", "prix": 790, "fini": true })),
                ..Default::default()
            },
            NOW,
        )
        .unwrap();
        assert_eq!(item.title, "Le Petit Prince");
        assert_eq!(item.cells["auteur"], json!("Saint-Exupéry"));
        let bad = |value: Value| create_item(c, &list.id, &ListItemInput { title: "X".into(), cells: cells(value), ..Default::default() }, NOW).is_err();
        assert!(bad(json!({ "note": 6 })), "note sur 5");
        assert!(bad(json!({ "lu": "30/09/2026" })), "date au format AAAA-MM-JJ");
        assert!(bad(json!({ "prix": -1 })));
        assert!(bad(json!({ "inconnue": "x" })), "colonne inconnue");
        assert!(create_item(c, &list.id, &ListItemInput { title: "X".into(), section: Some("Bandes dessinées".into()), ..Default::default() }, NOW).is_err());
        // Une colonne et une section retirées : leurs valeurs disparaissent des éléments.
        let mut changed = books();
        changed.columns.retain(|col| col.id != "auteur");
        changed.sections = vec!["Essais".into()];
        update_list(c, &list.id, &changed, NOW).unwrap();
        let again = &items(c).unwrap()[0];
        assert!(!again.cells.contains_key("auteur"));
        assert_eq!(again.section, None);
    }

    #[test]
    fn une_liste_s_archive_part_a_la_corbeille_et_revient() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let list = create_list(c, &books(), NOW).unwrap();
        let a = create_item(c, &list.id, &ListItemInput { title: "A".into(), ..Default::default() }, NOW).unwrap();
        let b = create_item(c, &list.id, &ListItemInput { title: "B".into(), ..Default::default() }, NOW).unwrap();
        reorder_items(c, &list.id, &[b.id.clone(), a.id.clone()]).unwrap();
        assert_eq!(items(c).unwrap().iter().map(|i| i.title.as_str()).collect::<Vec<_>>(), ["B", "A"]);
        assert!(set_archived(c, &list.id, true, NOW).unwrap().archived);
        delete_list(c, &list.id, NOW).unwrap();
        assert!(lists(c, NOW).unwrap().is_empty());
        assert!(items(c).unwrap().is_empty(), "éléments d'une liste à la corbeille masqués");
        restore_list(c, &list.id, NOW).unwrap();
        assert_eq!(items(c).unwrap().len(), 2);
        delete_list(c, &list.id, NOW).unwrap();
        lists(c, NOW + 31 * 86_400).unwrap();
        let left: i64 = c.query_row("SELECT COUNT(*) FROM list_items", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0, "corbeille vidée après 30 jours, éléments compris");
        assert!(create_list(c, &ListInput { template: "inconnu".into(), ..books() }, NOW).is_err());
    }
}
