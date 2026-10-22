//! Documents (cahier des charges § 4.13) : copie de fichiers importants dans la base chiffrée,
//! jamais en clair sur le disque ; dossiers, étiquettes, date d'expiration avec rappel, notes,
//! espace ; corbeille de 30 jours. Le contenu est rangé à part, pour garder la liste légère.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{self, clean_line, clean_notes, clean_tags, invalid, is_valid_date, space_exists, TRASH_SECONDS};
use super::DataError;

/// Taille maximale d'un document.
pub const MAX_BYTES: usize = 30 * 1024 * 1024;
pub const MAX_DOCUMENTS: usize = 5000;
pub const MAX_NAME_CHARS: usize = 200;
pub const MAX_FOLDERS: usize = 100;
pub const MAX_FOLDER_CHARS: usize = 60;
/// Rappel d'expiration : au plus un an avant.
pub const MAX_REMIND_DAYS: u32 = 365;
/// Sortes de documents (les mêmes que l'interface).
pub const DOC_TYPES: [&str; 11] =
    ["facture", "contrat", "attestation", "releve", "fiche-de-paie", "impots", "ordonnance", "garantie", "identite", "courrier", "autre"];
pub const MAX_ISSUER_CHARS: usize = 150;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub name: String,
    /// Extension en minuscules, sans le point (« pdf »).
    pub ext: String,
    pub size: i64,
    pub folder_id: Option<String>,
    pub tags: Vec<String>,
    pub expires_on: Option<String>,
    /// Rappel, en jours avant l'expiration (0 = le jour même).
    pub remind_days: Option<u32>,
    pub notes: String,
    pub space_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    /// Date du document (facture, relevé…), distincte de son ajout.
    pub doc_date: Option<String>,
    /// Émetteur : organisme, entreprise, administration.
    pub issuer: String,
    /// Sorte de document (`DOC_TYPES`).
    pub doc_type: Option<String>,
}

/// Ce qui se modifie d'un document (le contenu, jamais).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DocumentMeta {
    pub name: String,
    pub folder_id: Option<String>,
    pub tags: Vec<String>,
    pub expires_on: Option<String>,
    pub remind_days: Option<u32>,
    pub notes: String,
    pub space_id: Option<String>,
    pub doc_date: Option<String>,
    pub issuer: String,
    pub doc_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub position: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct FolderInput {
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
}

/// Extension d'un nom de fichier, en minuscules (vide s'il n'en a pas).
pub fn extension(name: &str) -> String {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() && ext.len() <= 10 && ext.chars().all(|c| c.is_ascii_alphanumeric()) => {
            ext.to_ascii_lowercase()
        }
        _ => String::new(),
    }
}

/// Nom du fichier exporté : le nom du document, sans caractère interdit par Windows, avec son
/// extension (rajoutée si le document a été renommé sans elle).
pub fn export_name(name: &str, ext: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    let clean = clean.trim().trim_end_matches('.').trim();
    let clean = if clean.is_empty() { "document" } else { clean };
    if ext.is_empty() || extension(clean) == ext {
        clean.to_string()
    } else {
        format!("{clean}.{ext}")
    }
}

/// Chemin libre dans `dir` : « nom.pdf », sinon « nom (2).pdf », « nom (3).pdf »… (jamais d'écrasement).
pub fn free_path(dir: &std::path::Path, file_name: &str) -> std::path::PathBuf {
    let first = dir.join(file_name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem, format!(".{ext}")),
        _ => (file_name, String::new()),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

fn folder_exists(conn: &Connection, id: &str) -> Result<bool, DataError> {
    Ok(conn.query_row("SELECT 1 FROM document_folders WHERE id = ?1", params![id], |_| Ok(())).optional()?.is_some())
}

/// Nom de fichier : une ligne, sans caractère interdit par Windows.
fn clean_name(name: &str) -> Result<String, DataError> {
    let name = clean_line(name, MAX_NAME_CHARS, "name")?;
    if name.chars().any(|c| "\\/:*?\"<>|".contains(c)) || name.trim_matches('.').is_empty() {
        return Err(invalid("name"));
    }
    Ok(name)
}

fn clean_meta(conn: &Connection, meta: &DocumentMeta, current_space: Option<&str>) -> Result<DocumentMeta, DataError> {
    if let Some(folder) = &meta.folder_id {
        if !folder_exists(conn, folder)? {
            return Err(invalid("folder"));
        }
    }
    if meta.expires_on.as_deref().is_some_and(|d| !is_valid_date(d)) {
        return Err(invalid("expiresOn"));
    }
    if meta.remind_days.is_some_and(|d| d > MAX_REMIND_DAYS) {
        return Err(invalid("remindDays"));
    }
    if meta.doc_date.as_deref().is_some_and(|d| !is_valid_date(d)) {
        return Err(invalid("docDate"));
    }
    if meta.doc_type.as_deref().is_some_and(|t| !DOC_TYPES.contains(&t)) {
        return Err(invalid("docType"));
    }
    let issuer = meta.issuer.split_whitespace().collect::<Vec<_>>().join(" ");
    if issuer.chars().count() > MAX_ISSUER_CHARS || issuer.chars().any(char::is_control) {
        return Err(invalid("issuer"));
    }
    if let Some(space) = &meta.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    Ok(DocumentMeta {
        name: clean_name(&meta.name)?,
        folder_id: meta.folder_id.clone(),
        tags: clean_tags(&meta.tags)?,
        expires_on: meta.expires_on.clone(),
        remind_days: if meta.expires_on.is_some() { meta.remind_days } else { None },
        notes: clean_notes(&meta.notes)?,
        space_id: meta.space_id.clone(),
        doc_date: meta.doc_date.clone(),
        issuer,
        doc_type: meta.doc_type.clone(),
    })
}

const COLUMNS: &str = "id, name, ext, size, folder_id, tags, expires_on, remind_days, notes, space_id, created_at, updated_at, doc_date, issuer, doc_type";

fn from_row(row: &Row) -> rusqlite::Result<Document> {
    let tags: String = row.get(5)?;
    Ok(Document {
        id: row.get(0)?,
        name: row.get(1)?,
        ext: row.get(2)?,
        size: row.get(3)?,
        folder_id: row.get(4)?,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        expires_on: row.get(6)?,
        remind_days: row.get(7)?,
        notes: row.get(8)?,
        space_id: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        doc_date: row.get(12)?,
        issuer: row.get(13)?,
        doc_type: row.get(14)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Document, DataError> {
    conn.query_row(&format!("SELECT {COLUMNS} FROM documents WHERE id = ?1 AND deleted_at IS NULL"), params![id], from_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Retire définitivement les documents choisis par `filter` (paramètre ?1), contenu compris.
pub(crate) fn purge_where(conn: &Connection, filter: &str, value: &dyn rusqlite::ToSql) -> Result<usize, DataError> {
    conn.execute(&format!("DELETE FROM document_data WHERE document_id IN (SELECT id FROM documents WHERE {filter})"), params![value])?;
    Ok(conn.execute(&format!("DELETE FROM documents WHERE {filter}"), params![value])?)
}

/// Documents. Vide au passage la corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<Document>, DataError> {
    purge_where(conn, "deleted_at IS NOT NULL AND deleted_at < ?1", &(now as i64 - TRASH_SECONDS))?;
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM documents WHERE deleted_at IS NULL ORDER BY created_at, id"))?;
    let rows = stmt.query_map([], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Copie un fichier dans la base : `meta.name` est le nom du fichier d'origine.
pub fn add(conn: &Connection, bytes: &[u8], meta: &DocumentMeta, now: u64) -> Result<Document, DataError> {
    if bytes.len() > MAX_BYTES {
        return Err(DataError::TooMany { max: MAX_BYTES });
    }
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL", [], |r| r.get(0))?;
    if count as usize >= MAX_DOCUMENTS {
        return Err(DataError::TooMany { max: MAX_DOCUMENTS });
    }
    let m = clean_meta(conn, meta, None)?;
    let id = tasks::random_id()?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO documents (id, name, ext, size, folder_id, tags, expires_on, remind_days, notes, space_id, created_at, updated_at,
                                doc_date, issuer, doc_type)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, ?12, ?13, ?14)",
        params![
            id,
            m.name,
            extension(&m.name),
            bytes.len() as i64,
            m.folder_id,
            serde_json::to_string(&m.tags).unwrap_or_else(|_| "[]".into()),
            m.expires_on,
            m.remind_days,
            m.notes,
            m.space_id,
            now as i64,
            m.doc_date,
            m.issuer,
            m.doc_type
        ],
    )?;
    tx.execute("INSERT INTO document_data (document_id, data) VALUES (?1, ?2)", params![id, bytes])?;
    tx.commit()?;
    get(conn, &id)
}

/// Contenu d'un document (aperçu, export).
pub fn data(conn: &Connection, id: &str) -> Result<Vec<u8>, DataError> {
    get(conn, id)?;
    conn.query_row("SELECT data FROM document_data WHERE document_id = ?1", params![id], |r| r.get(0))
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Renomme ou range un document ; l'extension d'origine est gardée.
pub fn update(conn: &Connection, id: &str, meta: &DocumentMeta, now: u64) -> Result<Document, DataError> {
    let current = get(conn, id)?;
    let mut m = clean_meta(conn, meta, current.space_id.as_deref())?;
    if !current.ext.is_empty() && extension(&m.name) != current.ext {
        m.name = format!("{}.{}", m.name, current.ext);
        m.name = clean_name(&m.name)?;
    }
    conn.execute(
        "UPDATE documents SET name = ?2, folder_id = ?3, tags = ?4, expires_on = ?5, remind_days = ?6, notes = ?7,
                              space_id = ?8, updated_at = ?9, doc_date = ?10, issuer = ?11, doc_type = ?12
         WHERE id = ?1",
        params![
            id,
            m.name,
            m.folder_id,
            serde_json::to_string(&m.tags).unwrap_or_else(|_| "[]".into()),
            m.expires_on,
            m.remind_days,
            m.notes,
            m.space_id,
            now as i64,
            m.doc_date,
            m.issuer,
            m.doc_type
        ],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("UPDATE documents SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<Document, DataError> {
    let changed = conn.execute(
        "UPDATE documents SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
        params![id, now as i64],
    )?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    get(conn, id)
}

// ——— Dossiers ———

fn folder_row(r: &Row) -> rusqlite::Result<Folder> {
    Ok(Folder { id: r.get(0)?, name: r.get(1)?, icon: r.get(2)?, color: r.get(3)?, position: r.get(4)? })
}

fn get_folder(conn: &Connection, id: &str) -> Result<Folder, DataError> {
    conn.query_row("SELECT id, name, icon, color, position FROM document_folders WHERE id = ?1", params![id], folder_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

pub fn folders(conn: &Connection) -> Result<Vec<Folder>, DataError> {
    let mut stmt = conn.prepare("SELECT id, name, icon, color, position FROM document_folders ORDER BY position, created_at")?;
    let rows = stmt.query_map([], folder_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn clean_folder(conn: &Connection, input: &FolderInput, current: Option<&str>) -> Result<FolderInput, DataError> {
    let name = clean_line(&input.name, MAX_FOLDER_CHARS, "name")?;
    let taken: Option<String> = conn
        .query_row("SELECT id FROM document_folders WHERE lower(name) = lower(?1)", params![name], |r| r.get(0))
        .optional()?;
    if taken.is_some_and(|id| Some(id.as_str()) != current) {
        return Err(DataError::Duplicate { field: "name".into() });
    }
    Ok(FolderInput {
        name,
        icon: input.icon.as_deref().map(|i| check_symbol(i, "icon")).transpose()?,
        color: input.color.as_deref().map(clean_color).transpose()?,
    })
}

pub fn create_folder(conn: &Connection, input: &FolderInput, now: u64) -> Result<Folder, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM document_folders", [], |r| r.get(0))?;
    if count as usize >= MAX_FOLDERS {
        return Err(DataError::TooMany { max: MAX_FOLDERS });
    }
    let f = clean_folder(conn, input, None)?;
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO document_folders (id, name, icon, color, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, f.name, f.icon, f.color, count, now as i64],
    )?;
    get_folder(conn, &id)
}

pub fn update_folder(conn: &Connection, id: &str, input: &FolderInput) -> Result<Folder, DataError> {
    get_folder(conn, id)?;
    let f = clean_folder(conn, input, Some(id))?;
    conn.execute("UPDATE document_folders SET name = ?2, icon = ?3, color = ?4 WHERE id = ?1", params![id, f.name, f.icon, f.color])?;
    get_folder(conn, id)
}

/// Retire un dossier : ses documents restent, hors dossier.
pub fn delete_folder(conn: &Connection, id: &str) -> Result<(), DataError> {
    get_folder(conn, id)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE documents SET folder_id = NULL WHERE folder_id = ?1", params![id])?;
    tx.execute("DELETE FROM document_folders WHERE id = ?1", params![id])?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    fn meta(name: &str) -> DocumentMeta {
        DocumentMeta { name: name.into(), ..Default::default() }
    }

    #[test]
    fn un_export_garde_un_nom_valide_et_n_ecrase_rien() {
        assert_eq!(export_name("Bail 2026.pdf", "pdf"), "Bail 2026.pdf");
        assert_eq!(export_name("Bail : copie", "pdf"), "Bail _ copie.pdf");
        assert_eq!(export_name("a/b\\c?.txt", "txt"), "a_b_c_.txt");
        assert_eq!(export_name("  ..  ", ""), "document");
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(free_path(dir.path(), "Bail.pdf"), dir.path().join("Bail.pdf"));
        std::fs::write(dir.path().join("Bail.pdf"), b"1").unwrap();
        std::fs::write(dir.path().join("Bail (2).pdf"), b"2").unwrap();
        assert_eq!(free_path(dir.path(), "Bail.pdf"), dir.path().join("Bail (3).pdf"));
        std::fs::write(dir.path().join("Notes"), b"1").unwrap();
        assert_eq!(free_path(dir.path(), "Notes"), dir.path().join("Notes (2)"));
    }

    #[test]
    fn un_document_se_copie_se_relit_se_range_et_part_a_la_corbeille() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let folder = create_folder(c, &FolderInput { name: "Papiers".into(), icon: None, color: None }, NOW).unwrap();
        assert_eq!(create_folder(c, &FolderInput { name: "papiers".into(), ..Default::default() }, NOW), Err(DataError::Duplicate { field: "name".into() }));

        let doc = add(
            c,
            b"%PDF-1.7 contenu",
            &DocumentMeta { folder_id: Some(folder.id.clone()), expires_on: Some("2031-03-01".into()), remind_days: Some(60), ..meta("Carte d'identité.PDF") },
            NOW,
        )
        .unwrap();
        assert_eq!((doc.ext.as_str(), doc.size), ("pdf", 16));
        assert_eq!(data(c, &doc.id).unwrap(), b"%PDF-1.7 contenu");

        // Renommer garde l'extension ; sans date d'expiration, pas de rappel.
        let renamed = update(c, &doc.id, &DocumentMeta { remind_days: Some(30), folder_id: Some(folder.id.clone()), ..meta("Carte d'identité de Camille") }, NOW).unwrap();
        assert_eq!(renamed.name, "Carte d'identité de Camille.pdf");
        assert_eq!(renamed.remind_days, None);
        assert_eq!(update(c, &doc.id, &meta("a/b"), NOW), Err(invalid("name")));
        assert_eq!(add(c, b"x", &meta(".."), NOW), Err(invalid("name")));
        assert_eq!(add(c, &vec![0u8; MAX_BYTES + 1], &meta("gros.bin"), NOW), Err(DataError::TooMany { max: MAX_BYTES }));

        // Le dossier retiré, le document reste.
        delete_folder(c, &folder.id).unwrap();
        assert_eq!(get(c, &doc.id).unwrap().folder_id, None);

        delete(c, &doc.id, NOW).unwrap();
        assert_eq!(data(c, &doc.id), Err(DataError::NotFound));
        restore(c, &doc.id, NOW + 1).unwrap();
        delete(c, &doc.id, NOW + 2).unwrap();
        assert!(list(c, NOW + 3 + TRASH_SECONDS as u64).unwrap().is_empty());
        let left: i64 = c.query_row("SELECT COUNT(*) FROM document_data", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0, "le contenu part avec le document");
    }

    #[test]
    fn l_extension_vient_du_nom() {
        assert_eq!(extension("photo.JPG"), "jpg");
        assert_eq!(extension("archive.tar.gz"), "gz");
        assert_eq!(extension("LISEZMOI"), "");
        assert_eq!(extension(".profil"), "");
    }

    #[test]
    fn sorte_emetteur_et_date_du_document() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let doc = add(c, b"%PDF", &meta("Facture.pdf"), NOW).unwrap();
        assert_eq!((doc.doc_date.clone(), doc.issuer.clone(), doc.doc_type.clone()), (None, String::new(), None));
        let typed = DocumentMeta { doc_date: Some("2026-09-30".into()), issuer: "  EDF   Entreprises ".into(), doc_type: Some("facture".into()), ..meta("Facture.pdf") };
        let doc = update(c, &doc.id, &typed, NOW).unwrap();
        assert_eq!(doc.doc_date.as_deref(), Some("2026-09-30"));
        assert_eq!(doc.issuer, "EDF Entreprises");
        assert_eq!(doc.doc_type.as_deref(), Some("facture"));
        assert_eq!(update(c, &doc.id, &DocumentMeta { doc_type: Some("menu".into()), ..meta("Facture.pdf") }, NOW), Err(invalid("docType")));
        assert_eq!(update(c, &doc.id, &DocumentMeta { doc_date: Some("2026-02-30".into()), ..meta("Facture.pdf") }, NOW), Err(invalid("docDate")));
    }

}
