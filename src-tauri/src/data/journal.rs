//! Journal (cahier des charges § 4.6) : une page par jour avec l'humeur (1 à 5), l'énergie
//! (1 à 5), les activités du jour, trois gratitudes et un texte libre (document de l'éditeur,
//! images comprises) ; recherche plein texte sans accents ; corbeille de 30 jours.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::notes::{excerpt, MAX_CONTENT_BYTES, MAX_PLAIN_CHARS};
use super::recurrence::Day;
use super::tasks::{invalid, TRASH_SECONDS};
use super::DataError;

/// Trois gratitudes au plus, d'une ligne chacune.
pub const MAX_GRATITUDES: usize = 3;
pub const MAX_GRATITUDE_CHARS: usize = 300;
/// Activités du jour (sport, famille…) : identifiants de la liste de l'interface.
pub const MAX_ACTIVITIES: usize = 24;
const MAX_ACTIVITY_CHARS: usize = 24;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalSummary {
    /// « AAAA-MM-JJ ».
    pub day: String,
    pub mood: Option<u8>,
    pub energy: Option<u8>,
    pub gratitudes: Vec<String>,
    /// Début du texte, sans mise en forme.
    pub excerpt: String,
    pub updated_at: i64,
    /// Activités du jour, dans l'ordre de la liste.
    pub activities: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    #[serde(flatten)]
    pub summary: JournalSummary,
    /// Document de l'éditeur, en JSON (vide : page sans texte).
    pub content: String,
}

/// Page envoyée par l'interface.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct JournalInput {
    pub mood: Option<u8>,
    pub energy: Option<u8>,
    pub gratitudes: Vec<String>,
    pub content: String,
    pub plain: String,
    pub activities: Vec<String>,
}

fn day_of(text: &str) -> Result<Day, DataError> {
    Day::parse(text).filter(|d| (1900..=2999).contains(&d.year)).ok_or_else(|| invalid("day"))
}

fn level(value: Option<u8>, field: &str) -> Result<Option<u8>, DataError> {
    match value {
        Some(v) if !(1..=5).contains(&v) => Err(invalid(field)),
        other => Ok(other),
    }
}

/// Gratitudes nettoyées : une ligne chacune, les vides retirées.
fn clean_gratitudes(list: &[String]) -> Result<Vec<String>, DataError> {
    let cleaned: Vec<String> = list
        .iter()
        .map(|g| g.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|g| !g.is_empty())
        .collect();
    if cleaned.len() > MAX_GRATITUDES || cleaned.iter().any(|g| g.chars().count() > MAX_GRATITUDE_CHARS || g.chars().any(char::is_control)) {
        return Err(invalid("gratitudes"));
    }
    Ok(cleaned)
}

/// Activités : identifiants courts (lettres minuscules et tirets), sans doublon.
fn clean_activities(list: &[String]) -> Result<Vec<String>, DataError> {
    let mut cleaned: Vec<String> = Vec::new();
    for a in list {
        let ok = !a.is_empty() && a.chars().count() <= MAX_ACTIVITY_CHARS && a.chars().all(|c| c.is_ascii_lowercase() || c == '-');
        if !ok {
            return Err(invalid("activities"));
        }
        if !cleaned.contains(a) {
            cleaned.push(a.clone());
        }
    }
    if cleaned.len() > MAX_ACTIVITIES {
        return Err(invalid("activities"));
    }
    Ok(cleaned)
}

const COLUMNS: &str = "day, mood, energy, gratitudes, substr(plain, 1, 600), updated_at, activities";

fn summary_from_row(row: &Row) -> rusqlite::Result<JournalSummary> {
    let gratitudes: String = row.get(3)?;
    let plain: String = row.get(4)?;
    Ok(JournalSummary {
        day: row.get(0)?,
        mood: row.get(1)?,
        energy: row.get(2)?,
        gratitudes: serde_json::from_str(&gratitudes).unwrap_or_default(),
        excerpt: excerpt(&plain),
        updated_at: row.get(5)?,
        activities: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
    })
}

fn index(conn: &Connection, day: &str) -> Result<(), DataError> {
    conn.execute("DELETE FROM journal_fts WHERE day = ?1", params![day])?;
    conn.execute(
        "INSERT INTO journal_fts (day, text)
         SELECT day, replace(replace(gratitudes, '[', ''), ']', '') || ' ' || plain FROM journal WHERE day = ?1 AND deleted_at IS NULL",
        params![day],
    )?;
    Ok(())
}

/// Pages écrites (sans le texte complet). Vide au passage la corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<JournalSummary>, DataError> {
    let limit = now as i64 - TRASH_SECONDS;
    conn.execute(
        "DELETE FROM journal_fts WHERE day IN (SELECT day FROM journal WHERE deleted_at IS NOT NULL AND deleted_at < ?1)",
        params![limit],
    )?;
    conn.execute("DELETE FROM journal WHERE deleted_at IS NOT NULL AND deleted_at < ?1", params![limit])?;
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM journal WHERE deleted_at IS NULL ORDER BY day"))?;
    let rows = stmt.query_map([], summary_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Page d'un jour, ou `None` s'il n'en a pas.
pub fn get(conn: &Connection, day: &str) -> Result<Option<JournalEntry>, DataError> {
    let day = day_of(day)?.format();
    let found = conn
        .query_row(
            &format!("SELECT {COLUMNS}, content FROM journal WHERE day = ?1 AND deleted_at IS NULL"),
            params![day],
            |row| Ok(JournalEntry { summary: summary_from_row(row)?, content: row.get(7)? }),
        )
        .optional()?;
    Ok(found)
}

/// Enregistre la page d'un jour (la crée au besoin). Une page entièrement vide est retirée ;
/// écrire un jour dont la page est à la corbeille la remplace.
pub fn save(conn: &Connection, day: &str, input: &JournalInput, now: u64) -> Result<Option<JournalSummary>, DataError> {
    let day = day_of(day)?.format();
    let mood = level(input.mood, "mood")?;
    let energy = level(input.energy, "energy")?;
    let gratitudes = clean_gratitudes(&input.gratitudes)?;
    let activities = clean_activities(&input.activities)?;
    if input.content.len() > MAX_CONTENT_BYTES || input.plain.chars().count() > MAX_PLAIN_CHARS {
        return Err(invalid("content"));
    }
    let plain = input.plain.trim_end().replace("\r\n", "\n");
    let empty = mood.is_none() && energy.is_none() && gratitudes.is_empty() && activities.is_empty() && plain.trim().is_empty();
    if empty {
        conn.execute("DELETE FROM journal WHERE day = ?1", params![day])?;
        conn.execute("DELETE FROM journal_fts WHERE day = ?1", params![day])?;
        return Ok(None);
    }
    let content = if plain.trim().is_empty() && !input.content.contains("\"image\"") { String::new() } else { input.content.clone() };
    conn.execute(
        "INSERT INTO journal (day, mood, energy, gratitudes, content, plain, created_at, updated_at, activities)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8)
         ON CONFLICT (day) DO UPDATE SET mood = ?2, energy = ?3, gratitudes = ?4, content = ?5, plain = ?6,
                                         updated_at = ?7, activities = ?8, deleted_at = NULL",
        params![
            day,
            mood,
            energy,
            serde_json::to_string(&gratitudes).unwrap_or_else(|_| "[]".into()),
            content,
            plain,
            now as i64,
            serde_json::to_string(&activities).unwrap_or_else(|_| "[]".into())
        ],
    )?;
    index(conn, &day)?;
    Ok(get(conn, &day)?.map(|e| e.summary))
}

/// Met la page à la corbeille (restaurable pendant 30 jours).
pub fn delete(conn: &Connection, day: &str, now: u64) -> Result<(), DataError> {
    let day = day_of(day)?.format();
    let changed = conn.execute("UPDATE journal SET deleted_at = ?2 WHERE day = ?1 AND deleted_at IS NULL", params![day, now as i64])?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    conn.execute("DELETE FROM journal_fts WHERE day = ?1", params![day])?;
    Ok(())
}

/// Sort la page de la corbeille.
pub fn restore(conn: &Connection, day: &str) -> Result<JournalSummary, DataError> {
    let day = day_of(day)?.format();
    let changed = conn.execute("UPDATE journal SET deleted_at = NULL WHERE day = ?1 AND deleted_at IS NOT NULL", params![day])?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    index(conn, &day)?;
    get(conn, &day)?.map(|e| e.summary).ok_or(DataError::NotFound)
}

/// Jours dont la page contient tous les mots cherchés (sans accents ni majuscules).
pub fn search(conn: &Connection, query: &str) -> Result<Vec<String>, DataError> {
    let words: Vec<String> = query
        .replace('œ', "oe")
        .replace('æ', "ae")
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .take(12)
        .map(|w| format!("\"{w}\"*"))
        .collect();
    if words.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare("SELECT day FROM journal_fts WHERE journal_fts MATCH ?1 ORDER BY day DESC LIMIT 200")?;
    let rows = stmt.query_map(params![words.join(" ")], |r| r.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
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

    fn page(mood: Option<u8>, text: &str) -> JournalInput {
        JournalInput {
            mood,
            energy: Some(3),
            gratitudes: vec!["  Le soleil  ".into(), "".into(), "Un bon café".into()],
            content: format!(r#"{{"type":"doc","text":"{text}"}}"#),
            plain: text.into(),
            activities: vec!["sport".into(), "famille".into(), "sport".into()],
        }
    }

    #[test]
    fn une_page_s_ecrit_se_relit_et_se_cherche_sans_accents() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let saved = save(c, "2026-10-01", &page(Some(4), "Promenade au bord de la rivière"), NOW).unwrap().unwrap();
        assert_eq!(saved.mood, Some(4));
        assert_eq!(saved.gratitudes, ["Le soleil", "Un bon café"]);
        assert_eq!(saved.excerpt, "Promenade au bord de la rivière");
        assert_eq!(saved.activities, ["sport", "famille"]);
        let entry = get(c, "2026-10-01").unwrap().unwrap();
        assert!(entry.content.contains("Promenade"));
        assert_eq!(search(c, "riviere").unwrap(), ["2026-10-01"]);
        assert_eq!(search(c, "cafe").unwrap(), ["2026-10-01"]);
        assert!(get(c, "2026-10-02").unwrap().is_none());
        // Réécrire la même journée la met à jour.
        save(c, "2026-10-01", &page(Some(2), "Pluie"), NOW + 10).unwrap();
        assert_eq!(list(c, NOW).unwrap().len(), 1);
        assert!(search(c, "riviere").unwrap().is_empty());
    }

    #[test]
    fn une_page_videe_disparait() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        save(c, "2026-10-01", &page(Some(4), "Texte"), NOW).unwrap();
        let empty = JournalInput { content: r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.into(), ..Default::default() };
        assert_eq!(save(c, "2026-10-01", &empty, NOW).unwrap(), None);
        assert!(list(c, NOW).unwrap().is_empty());
    }

    #[test]
    fn valeurs_refusees() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        assert_eq!(save(c, "2026-13-01", &page(Some(3), "x"), NOW), Err(invalid("day")));
        assert_eq!(save(c, "2026-10-01", &page(Some(6), "x"), NOW), Err(invalid("mood")));
        let too_many = JournalInput { gratitudes: vec!["a".into(), "b".into(), "c".into(), "d".into()], ..Default::default() };
        assert_eq!(save(c, "2026-10-01", &too_many, NOW), Err(invalid("gratitudes")));
        let odd = JournalInput { activities: vec!["../x".into()], ..Default::default() };
        assert_eq!(save(c, "2026-10-01", &odd, NOW), Err(invalid("activities")));
        // Une page avec seulement des activités est gardée.
        let only = JournalInput { activities: vec!["lecture".into()], ..Default::default() };
        assert_eq!(save(c, "2026-10-02", &only, NOW).unwrap().unwrap().activities, ["lecture"]);
    }

    #[test]
    fn corbeille_puis_restauration_puis_purge() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        save(c, "2026-10-01", &page(Some(4), "Souvenir"), NOW).unwrap();
        delete(c, "2026-10-01", NOW).unwrap();
        assert!(list(c, NOW).unwrap().is_empty());
        assert!(search(c, "souvenir").unwrap().is_empty());
        restore(c, "2026-10-01").unwrap();
        assert_eq!(search(c, "souvenir").unwrap(), ["2026-10-01"]);
        delete(c, "2026-10-01", NOW).unwrap();
        list(c, NOW + 31 * 24 * 3600).unwrap();
        assert_eq!(restore(c, "2026-10-01"), Err(DataError::NotFound));
    }
}
