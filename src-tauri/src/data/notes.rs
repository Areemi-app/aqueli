//! Notes (cahier des charges § 4.5) : carnets et sous-carnets, étiquettes, épinglage,
//! favoris, liens entre notes, historique des versions, modèles personnels et recherche
//! plein texte ; corbeille de 30 jours.
//!
//! Le contenu est le document de l'éditeur (JSON), gardé tel quel. L'interface envoie aussi
//! son texte brut (recherche, aperçu) et les notes qu'il cite (rétroliens).

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{clean_line, clean_tags, invalid, random_id, space_exists, TRASH_SECONDS};
use super::DataError;

pub const MAX_NOTE_TITLE_CHARS: usize = 300;
/// Document de l'éditeur, images collées comprises.
pub const MAX_CONTENT_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_PLAIN_CHARS: usize = 1_000_000;
pub const MAX_LINKS: usize = 500;
pub const MAX_NOTEBOOK_NAME_CHARS: usize = 40;
pub const MAX_NOTEBOOKS: usize = 300;
/// Carnet, sous-carnet, et un niveau de plus.
pub const MAX_NOTEBOOK_DEPTH: usize = 3;
pub const MAX_TEMPLATES: usize = 100;
/// Versions gardées par note.
pub const MAX_VERSIONS: usize = 50;
/// Pendant la saisie, une version est gardée toutes les 10 minutes au plus.
pub const VERSION_INTERVAL_SECONDS: i64 = 10 * 60;
/// Aperçu d'une note dans la liste.
pub const EXCERPT_CHARS: usize = 180;

// ——— Carnets ———

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notebook {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    /// Symbole choisi (src/components/symbols.ts), sinon celui des carnets.
    pub icon: Option<String>,
    /// Dossier où le carnet est rangé (carnets de premier niveau seulement).
    pub folder_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookInput {
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub folder_id: Option<String>,
}

const NOTEBOOK_COLUMNS: &str = "id, name, parent_id, color, created_at, icon, folder_id";

fn notebook_from_row(row: &Row) -> rusqlite::Result<Notebook> {
    Ok(Notebook {
        id: row.get(0)?,
        name: row.get(1)?,
        parent_id: row.get(2)?,
        color: row.get(3)?,
        created_at: row.get(4)?,
        icon: row.get(5)?,
        folder_id: row.get(6)?,
    })
}

pub fn notebooks(conn: &Connection) -> Result<Vec<Notebook>, DataError> {
    let mut stmt =
        conn.prepare(&format!("SELECT {NOTEBOOK_COLUMNS} FROM notebooks WHERE deleted_at IS NULL ORDER BY name, id"))?;
    let rows = stmt.query_map([], notebook_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn notebook(conn: &Connection, id: &str) -> Result<Notebook, DataError> {
    conn.query_row(
        &format!("SELECT {NOTEBOOK_COLUMNS} FROM notebooks WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        notebook_from_row,
    )
    .optional()?
    .ok_or(DataError::NotFound)
}

/// Niveau d'un carnet : 1 pour un carnet, 2 pour un sous-carnet…
fn depth(conn: &Connection, id: &str) -> Result<usize, DataError> {
    let mut level = 1;
    let mut current = notebook(conn, id)?.parent_id;
    while let Some(parent) = current {
        level += 1;
        if level > MAX_NOTEBOOK_DEPTH + 1 {
            break;
        }
        current = notebook(conn, &parent)?.parent_id;
    }
    Ok(level)
}

/// Le carnet et tous ses sous-carnets.
fn subtree(conn: &Connection, id: &str) -> Result<Vec<String>, DataError> {
    let mut stmt = conn.prepare(
        "WITH RECURSIVE sub(id) AS (
             SELECT ?1
             UNION SELECT n.id FROM notebooks n JOIN sub ON n.parent_id = sub.id WHERE n.deleted_at IS NULL
         )
         SELECT id FROM sub",
    )?;
    let rows = stmt.query_map(params![id], |r| r.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Hauteur du carnet : 1 sans sous-carnet, 2 avec des sous-carnets…
fn height(conn: &Connection, id: &str) -> Result<usize, DataError> {
    let mut stmt = conn.prepare("SELECT id FROM notebooks WHERE parent_id = ?1 AND deleted_at IS NULL")?;
    let children: Vec<String> = stmt.query_map(params![id], |r| r.get(0))?.collect::<Result<_, _>>()?;
    let mut tallest = 0;
    for child in children {
        tallest = tallest.max(height(conn, &child)?);
    }
    Ok(tallest + 1)
}

fn clean_notebook(conn: &Connection, input: &NotebookInput, id: Option<&str>) -> Result<NotebookInput, DataError> {
    let name = clean_line(&input.name, MAX_NOTEBOOK_NAME_CHARS, "name")?;
    let own_height = match id {
        Some(id) => height(conn, id)?,
        None => 1,
    };
    if let Some(parent) = &input.parent_id {
        if let Some(id) = id {
            if subtree(conn, id)?.contains(parent) {
                return Err(invalid("parent"));
            }
        }
        let parent_depth = depth(conn, parent).map_err(|_| invalid("parent"))?;
        if parent_depth + own_height > MAX_NOTEBOOK_DEPTH {
            return Err(invalid("parent"));
        }
    }
    let duplicate: bool = conn
        .query_row(
            "SELECT 1 FROM notebooks
             WHERE deleted_at IS NULL AND parent_id IS ?1 AND lower(name) = lower(?2) AND id IS NOT ?3",
            params![input.parent_id, name, id],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if duplicate {
        return Err(DataError::Duplicate { field: "name".into() });
    }
    // Seul un carnet de premier niveau se range dans un dossier ; ses sous-carnets le suivent.
    let folder_id = match (&input.parent_id, &input.folder_id) {
        (None, Some(folder)) => {
            let exists = conn.query_row("SELECT 1 FROM note_folders WHERE id = ?1", params![folder], |_| Ok(())).optional()?.is_some();
            if !exists {
                return Err(invalid("folder"));
            }
            Some(folder.clone())
        }
        _ => None,
    };
    Ok(NotebookInput {
        name,
        parent_id: input.parent_id.clone(),
        color: input.color.as_deref().map(clean_color).transpose()?,
        icon: input.icon.as_deref().map(|i| check_symbol(i, "icon")).transpose()?,
        folder_id,
    })
}

pub fn create_notebook(conn: &Connection, input: &NotebookInput, now: u64) -> Result<Notebook, DataError> {
    let count: i64 = conn.query_row("SELECT count(*) FROM notebooks WHERE deleted_at IS NULL", [], |r| r.get(0))?;
    if count as usize >= MAX_NOTEBOOKS {
        return Err(DataError::TooMany { max: MAX_NOTEBOOKS });
    }
    let n = clean_notebook(conn, input, None)?;
    let id = random_id()?;
    conn.execute(
        "INSERT INTO notebooks (id, name, parent_id, color, icon, created_at, folder_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, n.name, n.parent_id, n.color, n.icon, now as i64, n.folder_id],
    )?;
    notebook(conn, &id)
}

/// Renomme, recolore ou déplace un carnet (avec ses sous-carnets).
pub fn update_notebook(conn: &Connection, id: &str, input: &NotebookInput) -> Result<Notebook, DataError> {
    notebook(conn, id)?;
    let n = clean_notebook(conn, input, Some(id))?;
    conn.execute(
        "UPDATE notebooks SET name = ?2, parent_id = ?3, color = ?4, icon = ?5, folder_id = ?6 WHERE id = ?1",
        params![id, n.name, n.parent_id, n.color, n.icon, n.folder_id],
    )?;
    notebook(conn, id)
}

// ——— Dossiers de carnets ———

pub const MAX_FOLDERS: usize = 50;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFolder {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub position: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NoteFolderInput {
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
}

fn folder_row(r: &Row) -> rusqlite::Result<NoteFolder> {
    Ok(NoteFolder { id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, icon: r.get(3)?, position: r.get(4)? })
}

fn get_folder(conn: &Connection, id: &str) -> Result<NoteFolder, DataError> {
    conn.query_row("SELECT id, name, color, icon, position FROM note_folders WHERE id = ?1", params![id], folder_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

pub fn folders(conn: &Connection) -> Result<Vec<NoteFolder>, DataError> {
    let mut stmt = conn.prepare("SELECT id, name, color, icon, position FROM note_folders ORDER BY position, created_at")?;
    let rows = stmt.query_map([], folder_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn clean_folder(conn: &Connection, input: &NoteFolderInput, id: Option<&str>) -> Result<NoteFolderInput, DataError> {
    let name = clean_line(&input.name, MAX_NOTEBOOK_NAME_CHARS, "name")?;
    let taken: Option<String> = conn.query_row("SELECT id FROM note_folders WHERE lower(name) = lower(?1)", params![name], |r| r.get(0)).optional()?;
    if taken.is_some_and(|other| Some(other.as_str()) != id) {
        return Err(DataError::Duplicate { field: "name".into() });
    }
    Ok(NoteFolderInput {
        name,
        color: input.color.as_deref().map(clean_color).transpose()?,
        icon: input.icon.as_deref().map(|i| check_symbol(i, "icon")).transpose()?,
    })
}

pub fn create_folder(conn: &Connection, input: &NoteFolderInput, now: u64) -> Result<NoteFolder, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM note_folders", [], |r| r.get(0))?;
    if count as usize >= MAX_FOLDERS {
        return Err(DataError::TooMany { max: MAX_FOLDERS });
    }
    let f = clean_folder(conn, input, None)?;
    let id = random_id()?;
    conn.execute(
        "INSERT INTO note_folders (id, name, color, icon, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, f.name, f.color, f.icon, count, now as i64],
    )?;
    get_folder(conn, &id)
}

pub fn update_folder(conn: &Connection, id: &str, input: &NoteFolderInput) -> Result<NoteFolder, DataError> {
    get_folder(conn, id)?;
    let f = clean_folder(conn, input, Some(id))?;
    conn.execute("UPDATE note_folders SET name = ?2, color = ?3, icon = ?4 WHERE id = ?1", params![id, f.name, f.color, f.icon])?;
    get_folder(conn, id)
}

/// Retire un dossier : ses carnets restent, hors dossier.
pub fn delete_folder(conn: &Connection, id: &str) -> Result<(), DataError> {
    get_folder(conn, id)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE notebooks SET folder_id = NULL WHERE folder_id = ?1", params![id])?;
    tx.execute("DELETE FROM note_folders WHERE id = ?1", params![id])?;
    tx.commit()?;
    Ok(())
}

/// Met le carnet à la corbeille avec ses sous-carnets et leurs notes.
pub fn delete_notebook(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    notebook(conn, id)?;
    let ids = subtree(conn, id)?;
    let tx = conn.unchecked_transaction()?;
    for nb in &ids {
        tx.execute("UPDATE notebooks SET deleted_at = ?2 WHERE id = ?1", params![nb, now as i64])?;
        for table in INDEXES {
            tx.execute(
                &format!("DELETE FROM {table} WHERE note_id IN (SELECT id FROM notes WHERE notebook_id = ?1 AND deleted_at IS NULL)"),
                params![nb],
            )?;
        }
        tx.execute("UPDATE notes SET deleted_at = ?2 WHERE notebook_id = ?1 AND deleted_at IS NULL", params![nb, now as i64])?;
    }
    tx.commit()?;
    Ok(())
}

/// Sort de la corbeille le carnet et ce qui a été supprimé avec lui (bouton « Annuler »).
pub fn restore_notebook(conn: &Connection, id: &str) -> Result<(), DataError> {
    let deleted_at: Option<i64> = conn
        .query_row("SELECT deleted_at FROM notebooks WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?
        .flatten();
    let Some(at) = deleted_at else {
        return Err(DataError::NotFound);
    };
    let books: Vec<String> = {
        let mut stmt = conn.prepare(
            "WITH RECURSIVE sub(id) AS (
                 SELECT ?1
                 UNION SELECT n.id FROM notebooks n JOIN sub ON n.parent_id = sub.id WHERE n.deleted_at = ?2
             )
             SELECT id FROM sub",
        )?;
        let rows = stmt.query_map(params![id, at], |r| r.get(0))?;
        rows.collect::<Result<_, _>>()?
    };
    let tx = conn.unchecked_transaction()?;
    for nb in &books {
        tx.execute("UPDATE notebooks SET deleted_at = NULL WHERE id = ?1", params![nb])?;
        let notes: Vec<String> = {
            let mut stmt = tx.prepare("SELECT id FROM notes WHERE notebook_id = ?1 AND deleted_at = ?2")?;
            let rows = stmt.query_map(params![nb, at], |r| r.get(0))?;
            rows.collect::<Result<_, _>>()?
        };
        for note in &notes {
            tx.execute("UPDATE notes SET deleted_at = NULL WHERE id = ?1", params![note])?;
            index(&tx, note)?;
        }
    }
    tx.commit()?;
    Ok(())
}

// ——— Notes ———

/// Note sans son contenu (liste, recherche, rétroliens).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub notebook_id: Option<String>,
    pub space_id: Option<String>,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub favorite: bool,
    pub color: Option<String>,
    /// Rangée hors de vue (archive), toujours cherchable.
    pub archived: bool,
    /// Notes citées par celle-ci.
    pub links: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    #[serde(flatten)]
    pub summary: NoteSummary,
    pub content: String,
}

/// Texte d'une note, envoyé par l'éditeur.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteBody {
    #[serde(default)]
    pub title: String,
    pub content: String,
    #[serde(default)]
    pub plain: String,
    #[serde(default)]
    pub links: Vec<String>,
}

/// Rangement d'une note : carnet, espace, étiquettes, épinglage, favori, couleur.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    #[serde(default)]
    pub notebook_id: Option<String>,
    #[serde(default)]
    pub space_id: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub archived: bool,
}

fn is_id(text: &str) -> bool {
    !text.is_empty() && text.len() <= 32 && text.chars().all(|c| c.is_ascii_alphanumeric())
}

/// Titre facultatif : une ligne, sans caractère de contrôle.
fn clean_title(title: &str) -> Result<String, DataError> {
    if title.trim().is_empty() {
        Ok(String::new())
    } else {
        clean_line(title, MAX_NOTE_TITLE_CHARS, "title")
    }
}

fn clean_content(content: &str) -> Result<String, DataError> {
    if content.len() > MAX_CONTENT_BYTES {
        return Err(invalid("content"));
    }
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(serde_json::Value::Object(_)) => Ok(content.to_string()),
        _ => Err(invalid("content")),
    }
}

fn clean_body(body: &NoteBody, id: Option<&str>) -> Result<NoteBody, DataError> {
    let plain = body.plain.replace("\r\n", "\n");
    if plain.chars().count() > MAX_PLAIN_CHARS || plain.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\t')) {
        return Err(invalid("plain"));
    }
    let mut links: Vec<String> = Vec::new();
    for link in &body.links {
        if !is_id(link) {
            return Err(invalid("links"));
        }
        if Some(link.as_str()) != id && !links.contains(link) {
            links.push(link.clone());
        }
    }
    if links.len() > MAX_LINKS {
        return Err(invalid("links"));
    }
    Ok(NoteBody { title: clean_title(&body.title)?, content: clean_content(&body.content)?, plain, links })
}

/// `current` : carnet et espace actuels, gardés même s'ils ont été supprimés depuis.
fn clean_meta(conn: &Connection, meta: &NoteMeta, current: Option<(&Option<String>, &Option<String>)>) -> Result<NoteMeta, DataError> {
    if let Some(nb) = &meta.notebook_id {
        let unchanged = current.is_some_and(|(n, _)| n.as_deref() == Some(nb.as_str()));
        if !unchanged && notebook(conn, nb).is_err() {
            return Err(invalid("notebook"));
        }
    }
    if let Some(space) = &meta.space_id {
        let unchanged = current.is_some_and(|(_, s)| s.as_deref() == Some(space.as_str()));
        if !unchanged && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    Ok(NoteMeta {
        notebook_id: meta.notebook_id.clone(),
        space_id: meta.space_id.clone(),
        tags: clean_tags(&meta.tags)?,
        pinned: meta.pinned,
        favorite: meta.favorite,
        color: meta.color.as_deref().map(clean_color).transpose()?,
        archived: meta.archived,
    })
}

/// Début du texte, sur une ligne : les lignes de la note (titres, éléments de liste…) séparées
/// par « · ».
pub fn excerpt(plain: &str) -> String {
    let flat = plain
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
    if flat.chars().count() <= EXCERPT_CHARS {
        flat
    } else {
        let cut: String = flat.chars().take(EXCERPT_CHARS).collect();
        format!("{}…", cut.trim_end())
    }
}

const SUMMARY_COLUMNS: &str =
    "id, title, substr(plain, 1, 600), notebook_id, space_id, tags, pinned, favorite, color, links, created_at, updated_at, archived";

fn summary_from_row(row: &Row) -> rusqlite::Result<NoteSummary> {
    let plain: String = row.get(2)?;
    let tags: String = row.get(5)?;
    let links: String = row.get(9)?;
    Ok(NoteSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        excerpt: excerpt(&plain),
        notebook_id: row.get(3)?,
        space_id: row.get(4)?,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        pinned: row.get(6)?,
        favorite: row.get(7)?,
        color: row.get(8)?,
        links: serde_json::from_str(&links).unwrap_or_default(),
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        archived: row.get(12)?,
    })
}

fn to_json<T: Serialize>(value: &T) -> Result<String, DataError> {
    serde_json::to_string(value).map_err(|e| DataError::Database { detail: e.to_string() })
}

fn summary(conn: &Connection, id: &str) -> Result<NoteSummary, DataError> {
    conn.query_row(
        &format!("SELECT {SUMMARY_COLUMNS} FROM notes WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        summary_from_row,
    )
    .optional()?
    .ok_or(DataError::NotFound)
}

/// Note hors corbeille, avec son contenu.
pub fn get(conn: &Connection, id: &str) -> Result<Note, DataError> {
    let summary = summary(conn, id)?;
    let content: String = conn.query_row("SELECT content FROM notes WHERE id = ?1", params![id], |r| r.get(0))?;
    Ok(Note { summary, content })
}

/// Toutes les notes, épinglées d'abord, puis les plus récentes. Vide au passage la
/// corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<NoteSummary>, DataError> {
    let limit = now as i64 - TRASH_SECONDS;
    conn.execute(
        "DELETE FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?1)",
        params![limit],
    )?;
    conn.execute("DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?1", params![limit])?;
    conn.execute("DELETE FROM notebooks WHERE deleted_at IS NOT NULL AND deleted_at < ?1", params![limit])?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {SUMMARY_COLUMNS} FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC, id"
    ))?;
    let rows = stmt.query_map([], summary_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// « œ » et « æ » s'écrivent souvent « oe » et « ae » au clavier : l'index les confond.
fn ligatures(column: &str) -> String {
    format!("replace(replace(replace(replace({column}, 'œ', 'oe'), 'Œ', 'OE'), 'æ', 'ae'), 'Æ', 'AE')")
}

/// Les deux index de recherche : l'un sans les accents (tout est trouvé), l'autre avec (ce
/// qui est écrit exactement comme la saisie passe en tête).
const INDEXES: [&str; 2] = ["notes_fts", "notes_fts_exact"];

/// Met à jour l'index de recherche d'une note (`None` : toutes les notes).
fn index_notes(conn: &Connection, id: Option<&str>) -> Result<(), DataError> {
    let tags = ligatures("replace(replace(replace(tags, '[', ''), ']', ''), '\"', '')");
    for table in INDEXES {
        conn.execute(&format!("DELETE FROM {table} WHERE ?1 IS NULL OR note_id = ?1"), params![id])?;
        conn.execute(
            &format!(
                "INSERT INTO {table} (note_id, title, plain, tags)
                 SELECT id, {}, {}, {tags} FROM notes WHERE (?1 IS NULL OR id = ?1) AND deleted_at IS NULL",
                ligatures("title"),
                ligatures("plain"),
            ),
            params![id],
        )?;
    }
    Ok(())
}

fn index(conn: &Connection, id: &str) -> Result<(), DataError> {
    index_notes(conn, Some(id))
}

/// Refait les index de recherche de toutes les notes (mise à jour de la base).
pub(crate) fn reindex_all(conn: &Connection) -> Result<(), DataError> {
    index_notes(conn, None)
}

pub fn create(conn: &Connection, body: &NoteBody, meta: &NoteMeta, now: u64) -> Result<NoteSummary, DataError> {
    let tx = conn.unchecked_transaction()?;
    let id = insert(&tx, body, meta, now)?;
    tx.commit()?;
    summary(conn, &id)
}

/// Enregistre une nouvelle note sans ouvrir de transaction (l'import en ouvre une pour tout
/// le fichier) ; renvoie son identifiant.
pub(crate) fn insert(conn: &Connection, body: &NoteBody, meta: &NoteMeta, now: u64) -> Result<String, DataError> {
    let b = clean_body(body, None)?;
    let m = clean_meta(conn, meta, None)?;
    let id = random_id()?;
    conn.execute(
        "INSERT INTO notes (id, title, content, plain, links, notebook_id, space_id, tags, pinned, favorite, color,
                            created_at, updated_at, archived)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?13)",
        params![
            id,
            b.title,
            b.content,
            b.plain,
            to_json(&b.links)?,
            m.notebook_id,
            m.space_id,
            to_json(&m.tags)?,
            m.pinned,
            m.favorite,
            m.color,
            now as i64,
            m.archived
        ],
    )?;
    index(conn, &id)?;
    Ok(id)
}

/// Garde l'état actuel de la note dans l'historique ; `always` : même si la dernière version
/// est récente (avant une restauration).
fn snapshot(conn: &Connection, id: &str, now: u64, always: bool) -> Result<(), DataError> {
    let (title, content, plain, updated_at): (String, String, String, i64) = conn.query_row(
        "SELECT title, content, plain, updated_at FROM notes WHERE id = ?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )?;
    if plain.trim().is_empty() && title.is_empty() {
        return Ok(());
    }
    let latest: Option<(i64, String)> = conn
        .query_row(
            "SELECT saved_at, content FROM note_versions WHERE note_id = ?1 ORDER BY saved_at DESC, id DESC LIMIT 1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let due = match &latest {
        None => true,
        Some((_, last)) if *last == content => false,
        Some((saved_at, _)) => always || now as i64 - saved_at >= VERSION_INTERVAL_SECONDS,
    };
    if due {
        conn.execute(
            "INSERT INTO note_versions (note_id, title, content, plain, saved_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, title, content, plain, if always { now as i64 } else { updated_at.max(0) }],
        )?;
        conn.execute(
            "DELETE FROM note_versions WHERE note_id = ?1 AND id NOT IN (
                 SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY saved_at DESC, id DESC LIMIT ?2
             )",
            params![id, MAX_VERSIONS as i64],
        )?;
    }
    Ok(())
}

/// Nouveau texte de la note (saisie dans l'éditeur).
pub fn update_body(conn: &Connection, id: &str, body: &NoteBody, now: u64) -> Result<NoteSummary, DataError> {
    summary(conn, id)?;
    let b = clean_body(body, Some(id))?;
    let tx = conn.unchecked_transaction()?;
    let (title, content): (String, String) =
        tx.query_row("SELECT title, content FROM notes WHERE id = ?1", params![id], |r| Ok((r.get(0)?, r.get(1)?)))?;
    if title != b.title || content != b.content {
        snapshot(&tx, id, now, false)?;
    }
    tx.execute(
        "UPDATE notes SET title = ?2, content = ?3, plain = ?4, links = ?5, updated_at = ?6 WHERE id = ?1",
        params![id, b.title, b.content, b.plain, to_json(&b.links)?, now as i64],
    )?;
    index(&tx, id)?;
    tx.commit()?;
    summary(conn, id)
}

/// Nouveau rangement de la note ; la date de modification ne change pas.
pub fn update_meta(conn: &Connection, id: &str, meta: &NoteMeta) -> Result<NoteSummary, DataError> {
    let current = summary(conn, id)?;
    let m = clean_meta(conn, meta, Some((&current.notebook_id, &current.space_id)))?;
    conn.execute(
        "UPDATE notes SET notebook_id = ?2, space_id = ?3, tags = ?4, pinned = ?5, favorite = ?6, color = ?7, archived = ?8 WHERE id = ?1",
        params![id, m.notebook_id, m.space_id, to_json(&m.tags)?, m.pinned, m.favorite, m.color, m.archived],
    )?;
    index(conn, id)?;
    summary(conn, id)
}

/// Met la note à la corbeille (restaurable pendant 30 jours).
pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    summary(conn, id)?;
    conn.execute("UPDATE notes SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    for table in INDEXES {
        conn.execute(&format!("DELETE FROM {table} WHERE note_id = ?1"), params![id])?;
    }
    Ok(())
}

/// Sort la note de la corbeille (bouton « Annuler ») ; hors de son carnet s'il a disparu.
pub fn restore(conn: &Connection, id: &str) -> Result<NoteSummary, DataError> {
    let changed = conn.execute("UPDATE notes SET deleted_at = NULL WHERE id = ?1 AND deleted_at IS NOT NULL", params![id])?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    conn.execute(
        "UPDATE notes SET notebook_id = NULL
         WHERE id = ?1 AND notebook_id NOT IN (SELECT id FROM notebooks WHERE deleted_at IS NULL)",
        params![id],
    )?;
    index(conn, id)?;
    summary(conn, id)
}

/// Recherche plein texte (titre, texte, étiquettes), sans tenir compte des majuscules ni des
/// accents : « peche » trouve « pêche » et « péché », « oeuf » trouve « œuf ». Chaque mot peut
/// n'être que le début d'un mot. Si la saisie porte des accents, les notes écrites exactement
/// ainsi passent en tête (« pêche » avant « péché ») ; puis les plus pertinentes.
pub fn search(conn: &Connection, query: &str) -> Result<Vec<String>, DataError> {
    let words: Vec<String> = query
        .replace('œ', "oe")
        .replace('Œ', "OE")
        .replace('æ', "ae")
        .replace('Æ', "AE")
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .take(12)
        .map(|w| format!("\"{w}\"*"))
        .collect();
    if words.is_empty() {
        return Ok(Vec::new());
    }
    let pattern = words.join(" ");
    let found = |table: &str| -> Result<Vec<String>, DataError> {
        let mut stmt = conn.prepare(&format!(
            "SELECT note_id FROM {table} WHERE {table} MATCH ?1 ORDER BY bm25({table}, 0.0, 10.0, 1.0, 5.0) LIMIT 200"
        ))?;
        let rows = stmt.query_map(params![pattern], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    };
    let all = found("notes_fts")?;
    if pattern.is_ascii() {
        return Ok(all);
    }
    let exact = found("notes_fts_exact")?;
    let (mut first, rest): (Vec<String>, Vec<String>) = all.into_iter().partition(|id| exact.contains(id));
    first.extend(rest);
    Ok(first)
}

// ——— Historique des versions ———

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVersion {
    pub id: i64,
    pub title: String,
    pub excerpt: String,
    pub saved_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVersionContent {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub saved_at: i64,
}

/// Versions d'une note, les plus récentes d'abord.
pub fn versions(conn: &Connection, note_id: &str) -> Result<Vec<NoteVersion>, DataError> {
    summary(conn, note_id)?;
    let mut stmt = conn.prepare(
        "SELECT id, title, substr(plain, 1, 600), saved_at FROM note_versions WHERE note_id = ?1 ORDER BY saved_at DESC, id DESC",
    )?;
    let rows = stmt.query_map(params![note_id], |r| {
        let plain: String = r.get(2)?;
        Ok(NoteVersion { id: r.get(0)?, title: r.get(1)?, excerpt: excerpt(&plain), saved_at: r.get(3)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn version(conn: &Connection, note_id: &str, version_id: i64) -> Result<NoteVersionContent, DataError> {
    conn.query_row(
        "SELECT id, title, content, saved_at FROM note_versions WHERE id = ?1 AND note_id = ?2",
        params![version_id, note_id],
        |r| Ok(NoteVersionContent { id: r.get(0)?, title: r.get(1)?, content: r.get(2)?, saved_at: r.get(3)? }),
    )
    .optional()?
    .ok_or(DataError::NotFound)
}

/// Rétablit une version ; l'état actuel rejoint l'historique.
pub fn restore_version(conn: &Connection, note_id: &str, version_id: i64, now: u64) -> Result<Note, DataError> {
    summary(conn, note_id)?;
    let (title, content, plain): (String, String, String) = conn
        .query_row(
            "SELECT title, content, plain FROM note_versions WHERE id = ?1 AND note_id = ?2",
            params![version_id, note_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?
        .ok_or(DataError::NotFound)?;
    let tx = conn.unchecked_transaction()?;
    snapshot(&tx, note_id, now, true)?;
    tx.execute(
        "UPDATE notes SET title = ?2, content = ?3, plain = ?4, updated_at = ?5 WHERE id = ?1",
        params![note_id, title, content, plain, now as i64],
    )?;
    index(&tx, note_id)?;
    tx.commit()?;
    get(conn, note_id)
}

// ——— Modèles personnels ———

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTemplate {
    pub id: String,
    pub name: String,
    pub content: String,
    pub created_at: i64,
}

pub fn templates(conn: &Connection) -> Result<Vec<NoteTemplate>, DataError> {
    let mut stmt = conn.prepare("SELECT id, name, content, created_at FROM note_templates ORDER BY name, id")?;
    let rows = stmt.query_map([], |r| Ok(NoteTemplate { id: r.get(0)?, name: r.get(1)?, content: r.get(2)?, created_at: r.get(3)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create_template(conn: &Connection, name: &str, content: &str, now: u64) -> Result<NoteTemplate, DataError> {
    let count: i64 = conn.query_row("SELECT count(*) FROM note_templates", [], |r| r.get(0))?;
    if count as usize >= MAX_TEMPLATES {
        return Err(DataError::TooMany { max: MAX_TEMPLATES });
    }
    let name = clean_line(name, MAX_NOTEBOOK_NAME_CHARS, "name")?;
    let exists =
        conn.query_row("SELECT 1 FROM note_templates WHERE lower(name) = lower(?1)", params![name], |_| Ok(())).optional()?.is_some();
    if exists {
        return Err(DataError::Duplicate { field: "name".into() });
    }
    let content = clean_content(content)?;
    let id = random_id()?;
    conn.execute(
        "INSERT INTO note_templates (id, name, content, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, content, now as i64],
    )?;
    Ok(NoteTemplate { id, name, content, created_at: now as i64 })
}

pub fn delete_template(conn: &Connection, id: &str) -> Result<(), DataError> {
    if conn.execute("DELETE FROM note_templates WHERE id = ?1", params![id])? == 0 {
        return Err(DataError::NotFound);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;
    const DOC: &str = r#"{"type":"doc","content":[]}"#;

    fn open_vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        (dir, vault)
    }

    fn body(title: &str, plain: &str) -> NoteBody {
        NoteBody { title: title.into(), content: serde_json::json!({ "type": "doc", "text": plain }).to_string(), plain: plain.into(), links: vec![] }
    }

    fn book(name: &str, parent: Option<&str>) -> NotebookInput {
        NotebookInput { name: name.into(), parent_id: parent.map(Into::into), color: None, icon: None, folder_id: None }
    }

    fn field<T: std::fmt::Debug>(result: Result<T, DataError>) -> String {
        match result {
            Err(DataError::Invalid { field }) => field,
            other => panic!("refus attendu, reçu {other:?}"),
        }
    }

    #[test]
    fn une_note_s_archive_et_reste_cherchable() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let note = create(conn, &body("Bail", "Préavis de trois mois."), &NoteMeta::default(), NOW).unwrap();
        assert!(!note.archived);
        let archived = update_meta(conn, &note.id, &NoteMeta { archived: true, ..Default::default() }).unwrap();
        assert!(archived.archived);
        assert!(list(conn, NOW).unwrap().iter().any(|n| n.id == note.id && n.archived), "listée, marquée archivée");
        assert_eq!(search(conn, "preavis").unwrap(), vec![note.id.clone()]);
        assert!(!update_meta(conn, &note.id, &NoteMeta::default()).unwrap().archived, "ressortie des archives");
    }

    #[test]
    fn une_note_se_cree_se_modifie_et_passe_par_la_corbeille() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let meta = NoteMeta { tags: vec!["#Cuisine".into()], pinned: true, ..Default::default() };
        let note = create(conn, &body("  Recette  des crêpes ", "Farine, œufs, lait.\n\nMélanger."), &meta, NOW).unwrap();
        assert_eq!(note.title, "Recette des crêpes");
        assert_eq!(note.excerpt, "Farine, œufs, lait. · Mélanger.");
        assert_eq!(excerpt("Ordre du jour\n  Budget   du trimestre \n\nActions"), "Ordre du jour · Budget du trimestre · Actions");
        assert_eq!((note.tags.clone(), note.pinned, note.favorite), (vec!["Cuisine".to_string()], true, false));

        let other = create(conn, &body("", ""), &NoteMeta::default(), NOW + 1).unwrap();
        assert_eq!(other.title, "", "le titre est facultatif");
        let listed: Vec<String> = list(conn, NOW + 2).unwrap().into_iter().map(|n| n.id).collect();
        assert_eq!(listed, vec![note.id.clone(), other.id.clone()], "épinglées d'abord");

        let linked = NoteBody { links: vec![note.id.clone(), note.id.clone(), other.id.clone()], ..body("Liens", "") };
        let updated = update_body(conn, &other.id, &linked, NOW + 3).unwrap();
        assert_eq!(updated.links, vec![note.id.clone()], "sans doublon ni lien vers elle-même");
        assert_eq!(get(conn, &other.id).unwrap().content, linked.content);

        let moved = update_meta(conn, &note.id, &NoteMeta { favorite: true, ..Default::default() }).unwrap();
        assert_eq!((moved.pinned, moved.favorite, moved.updated_at), (false, true, NOW as i64), "rangement sans modification");

        delete(conn, &note.id, NOW + 4).unwrap();
        assert!(matches!(get(conn, &note.id), Err(DataError::NotFound)));
        assert!(search(conn, "crepes").unwrap().is_empty(), "une note supprimée n'est plus trouvée");
        restore(conn, &note.id).unwrap();
        assert_eq!(search(conn, "crepes").unwrap(), vec![note.id.clone()]);

        delete(conn, &note.id, NOW).unwrap();
        list(conn, NOW + TRASH_SECONDS as u64 + 1).unwrap();
        assert!(matches!(restore(conn, &note.id), Err(DataError::NotFound)), "corbeille vidée après 30 jours");
    }

    #[test]
    fn les_valeurs_hors_limites_sont_refusees() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let none = NoteMeta::default();
        let cases = [
            (NoteBody { content: "pas du JSON".into(), ..body("T", "") }, "content"),
            (NoteBody { content: "[1, 2]".into(), ..body("T", "") }, "content"),
            (NoteBody { title: "x".repeat(MAX_NOTE_TITLE_CHARS + 1), ..body("", "") }, "title"),
            (NoteBody { links: vec!["../autre".into()], ..body("T", "") }, "links"),
            (NoteBody { plain: "a\u{0}b".into(), ..body("T", "") }, "plain"),
        ];
        for (b, expected) in cases {
            assert_eq!(field(create(conn, &b, &none, NOW)), expected);
        }
        let bad_meta = [
            (NoteMeta { notebook_id: Some("inconnu".into()), ..Default::default() }, "notebook"),
            (NoteMeta { space_id: Some("inconnu".into()), ..Default::default() }, "space"),
            (NoteMeta { tags: vec!["deux mots".into()], ..Default::default() }, "tags"),
            (NoteMeta { color: Some("rouge".into()), ..Default::default() }, "color"),
        ];
        for (m, expected) in bad_meta {
            assert_eq!(field(create(conn, &body("T", ""), &m, NOW)), expected);
        }
    }

    #[test]
    fn la_recherche_ignore_accents_et_majuscules_et_accepte_les_debuts_de_mots() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let none = NoteMeta::default();
        let a = create(conn, &body("Réunion d'équipe", "Ordre du jour : budget"), &none, NOW).unwrap();
        let b = create(conn, &body("Courses", "Pain, fromage"), &NoteMeta { tags: vec!["maison".into()], ..none.clone() }, NOW).unwrap();
        assert_eq!(search(conn, "reunion").unwrap(), vec![a.id.clone()]);
        assert_eq!(search(conn, "EQUIPE budg").unwrap(), vec![a.id.clone()], "tous les mots, début de mot");
        assert_eq!(search(conn, "cour").unwrap(), vec![b.id.clone()]);
        assert_eq!(search(conn, "maison").unwrap(), vec![b.id.clone()], "étiquettes comprises");
        assert!(search(conn, "  \" * ( ").unwrap().is_empty(), "ponctuation seule : rien");
        update_body(conn, &b.id, &body("Courses", "Pommes"), NOW + 1).unwrap();
        assert!(search(conn, "fromage").unwrap().is_empty(), "l'index suit les modifications");
    }

    #[test]
    fn la_recherche_met_en_tete_l_orthographe_exacte_et_confond_oe_et_la_ligature() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let none = NoteMeta::default();
        let peche = create(conn, &body("Pêche", "Canne et hameçon"), &none, NOW).unwrap();
        let peche2 = create(conn, &body("Péché mignon", "Chocolat"), &none, NOW).unwrap();
        let oeufs = create(conn, &body("Courses", "Six œufs frais"), &none, NOW).unwrap();
        let mut both = search(conn, "peche").unwrap();
        both.sort();
        let mut expected = vec![peche.id.clone(), peche2.id.clone()];
        expected.sort();
        assert_eq!(both, expected, "sans accent : les deux");
        assert_eq!(search(conn, "pêche").unwrap(), vec![peche.id.clone(), peche2.id.clone()], "« pêche » d'abord");
        assert_eq!(search(conn, "PÉCHÉ").unwrap(), vec![peche2.id.clone(), peche.id.clone()], "« péché » d'abord");
        assert_eq!(search(conn, "oeufs").unwrap(), vec![oeufs.id.clone()], "« oe » trouve « œ »");
        assert_eq!(search(conn, "œuf").unwrap(), vec![oeufs.id.clone()]);
        delete(conn, &peche.id, NOW + 1).unwrap();
        assert_eq!(search(conn, "pêche").unwrap(), vec![peche2.id], "les deux index suivent la corbeille");
    }

    #[test]
    fn un_carnet_garde_son_symbole() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let voyages = create_notebook(conn, &NotebookInput { icon: Some("avion".into()), ..book("Voyages", None) }, NOW).unwrap();
        assert_eq!(voyages.icon.as_deref(), Some("avion"));
        let moved = update_notebook(conn, &voyages.id, &NotebookInput { icon: None, ..book("Voyages", None) }).unwrap();
        assert_eq!(moved.icon, None, "sans symbole : celui des carnets");
        assert_eq!(field(create_notebook(conn, &NotebookInput { icon: Some("inconnu".into()), ..book("X", None) }, NOW)), "icon");

        // Dossiers : un carnet de premier niveau s'y range, un sous-carnet suit son parent.
        let folder = create_folder(conn, &NoteFolderInput { name: "Vie perso".into(), color: Some("#E0508A".into()), icon: Some("coeur".into()) }, NOW).unwrap();
        assert_eq!(folder.color.as_deref(), Some("#e0508a"));
        assert_eq!(create_folder(conn, &NoteFolderInput { name: "vie PERSO".into(), ..Default::default() }, NOW), Err(DataError::Duplicate { field: "name".into() }));
        let filed = update_notebook(conn, &voyages.id, &NotebookInput { folder_id: Some(folder.id.clone()), ..book("Voyages", None) }).unwrap();
        assert_eq!(filed.folder_id.as_deref(), Some(folder.id.as_str()));
        let sub = create_notebook(conn, &NotebookInput { folder_id: Some(folder.id.clone()), ..book("Italie", Some(&voyages.id)) }, NOW).unwrap();
        assert_eq!(sub.folder_id, None, "le sous-carnet suit son parent");
        assert_eq!(field(create_notebook(conn, &NotebookInput { folder_id: Some("inconnu".into()), ..book("Y", None) }, NOW)), "folder");
        let renamed = update_folder(conn, &folder.id, &NoteFolderInput { name: "Personnel".into(), ..Default::default() }).unwrap();
        assert_eq!(renamed.name, "Personnel");
        delete_folder(conn, &folder.id).unwrap();
        assert!(folders(conn).unwrap().is_empty());
        assert_eq!(notebook(conn, &voyages.id).unwrap().folder_id, None, "le carnet reste, hors dossier");
    }

    #[test]
    fn les_carnets_s_imbriquent_sur_trois_niveaux_sans_doublon_ni_boucle() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let travail = create_notebook(conn, &book("Travail", None), NOW).unwrap();
        let projets = create_notebook(conn, &book("Projets", Some(&travail.id)), NOW).unwrap();
        let aqueli = create_notebook(conn, &book("Aqueli", Some(&projets.id)), NOW).unwrap();
        assert_eq!(field(create_notebook(conn, &book("Trop loin", Some(&aqueli.id)), NOW)), "parent");
        assert!(matches!(
            create_notebook(conn, &book("projets", Some(&travail.id)), NOW),
            Err(DataError::Duplicate { .. })
        ));
        assert!(create_notebook(conn, &book("Projets", None), NOW).is_ok(), "même nom ailleurs : accepté");
        assert_eq!(field(update_notebook(conn, &travail.id, &book("Travail", Some(&aqueli.id)))), "parent", "pas de boucle");
        let perso = create_notebook(conn, &book("Perso", None), NOW).unwrap();
        assert_eq!(field(update_notebook(conn, &travail.id, &book("Travail", Some(&perso.id)))), "parent", "4 niveaux une fois déplacé");
        let moved = update_notebook(conn, &projets.id, &book("Projets", Some(&perso.id))).unwrap();
        assert_eq!(moved.parent_id.as_deref(), Some(perso.id.as_str()), "avec ses sous-carnets : 3 niveaux");
    }

    #[test]
    fn supprimer_un_carnet_met_ses_notes_a_la_corbeille_et_annuler_les_rend() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let travail = create_notebook(conn, &book("Travail", None), NOW).unwrap();
        let projets = create_notebook(conn, &book("Projets", Some(&travail.id)), NOW).unwrap();
        let in_sub = NoteMeta { notebook_id: Some(projets.id.clone()), ..Default::default() };
        let a = create(conn, &body("Plan", "Étapes"), &in_sub, NOW).unwrap();
        let b = create(conn, &body("Déjà supprimée", ""), &in_sub, NOW).unwrap();
        delete(conn, &b.id, NOW + 1).unwrap();

        delete_notebook(conn, &travail.id, NOW + 2).unwrap();
        assert!(notebooks(conn).unwrap().is_empty());
        assert!(list(conn, NOW + 3).unwrap().is_empty());
        assert!(search(conn, "plan").unwrap().is_empty());

        restore_notebook(conn, &travail.id).unwrap();
        assert_eq!(notebooks(conn).unwrap().len(), 2);
        let ids: Vec<String> = list(conn, NOW + 3).unwrap().into_iter().map(|n| n.id).collect();
        assert_eq!(ids, vec![a.id.clone()], "la note supprimée avant reste dans la corbeille");
        assert_eq!(search(conn, "etapes").unwrap(), vec![a.id]);
    }

    #[test]
    fn l_historique_garde_une_version_toutes_les_dix_minutes_et_se_restaure() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let note = create(conn, &body("Idées", "v1"), &NoteMeta::default(), NOW).unwrap();
        update_body(conn, &note.id, &body("Idées", "v2"), NOW + 60).unwrap();
        update_body(conn, &note.id, &body("Idées", "v3"), NOW + 120).unwrap();
        assert_eq!(versions(conn, &note.id).unwrap().iter().map(|v| v.excerpt.as_str()).collect::<Vec<_>>(), vec!["v1"]);
        update_body(conn, &note.id, &body("Idées", "v4"), NOW + 60 + VERSION_INTERVAL_SECONDS as u64).unwrap();
        let list = versions(conn, &note.id).unwrap();
        assert_eq!(list.iter().map(|v| v.excerpt.as_str()).collect::<Vec<_>>(), vec!["v3", "v1"]);
        assert_eq!(list[0].saved_at, (NOW + 120) as i64, "date de la version : sa dernière modification");

        let restored = restore_version(conn, &note.id, list[1].id, NOW + 2000).unwrap();
        assert!(restored.content.contains("v1"));
        let after: Vec<String> = versions(conn, &note.id).unwrap().into_iter().map(|v| v.excerpt).collect();
        assert_eq!(after, vec!["v4", "v3", "v1"], "l'état remplacé rejoint l'historique");
        assert!(matches!(version(conn, "autre", list[1].id), Err(DataError::NotFound)));

        for i in 0..(MAX_VERSIONS as u64 + 5) {
            let t = NOW + 3000 + i * VERSION_INTERVAL_SECONDS as u64;
            update_body(conn, &note.id, &body("Idées", &format!("w{i}")), t).unwrap();
        }
        assert_eq!(versions(conn, &note.id).unwrap().len(), MAX_VERSIONS);
    }

    #[test]
    fn les_modeles_personnels_ont_un_nom_unique() {
        let (_dir, mut vault) = open_vault();
        let conn = vault.connection_mut().unwrap();
        let t = create_template(conn, "Réunion hebdo", DOC, NOW).unwrap();
        assert!(matches!(create_template(conn, "réunion HEBDO", DOC, NOW), Err(DataError::Duplicate { .. })));
        assert_eq!(field(create_template(conn, "Vide", "texte", NOW)), "content");
        assert_eq!(templates(conn).unwrap(), vec![t.clone()]);
        delete_template(conn, &t.id).unwrap();
        assert!(matches!(delete_template(conn, &t.id), Err(DataError::NotFound)));
    }
}
