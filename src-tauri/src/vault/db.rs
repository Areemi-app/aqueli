//! Base de données SQLite chiffrée par SQLCipher (AES-256). La clé maîtresse lui est
//! donnée telle quelle (« clé brute ») : la dérivation lente a déjà été faite par Argon2id.

use std::path::Path;

use rusqlite::{params, Connection, OpenFlags};
use zeroize::Zeroizing;

use super::crypto::KEY_LEN;
use super::error::VaultError;
use crate::legacy;

pub const DB_FILE: &str = "aqueli.db";

/// Renomme la base créée sous l'ancien nom, avec ses copies d'avant migration, son journal
/// (`-wal`) et son index (`-shm`), et renvoie le nom du fichier à utiliser. Le journal
/// suit toujours la base : il contient les dernières écritures. La base est renommée en
/// dernier : tant qu'elle garde l'ancien nom, l'opération reprend au lancement suivant.
pub fn adopt_old_files(dir: &Path) -> &'static str {
    if dir.join(DB_FILE).exists() || !dir.join(legacy::OLD_DB_FILE).exists() {
        return DB_FILE;
    }
    let mut pairs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(rest) = name.strip_prefix(legacy::OLD_DB_FILE).filter(|r| r.starts_with(".avant-migration-")) {
                pairs.push((entry.path(), dir.join(format!("{DB_FILE}{rest}"))));
            }
        }
    }
    for suffix in ["-wal", "-shm", ""] {
        pairs.push((dir.join(format!("{}{suffix}", legacy::OLD_DB_FILE)), dir.join(format!("{DB_FILE}{suffix}"))));
    }
    if legacy::rename_all(&pairs) {
        DB_FILE
    } else {
        legacy::OLD_DB_FILE
    }
}

/// Version du schéma ; chaque nouvelle version ajoute une étape dans `migrate`.
/// 1 : journal de sécurité · 2 : espaces · 3 : tâches · 4 : répétition des tâches ·
/// 5 : couleur des tâches · 6 : rappel des tâches.
pub const SCHEMA_VERSION: i64 = 21;

/// Espaces créés avec la base (couleurs validées dans docs/reference-projet.md).
const DEFAULT_SPACES: [(&str, &str, &str, &str); 4] = [
    ("perso", "Perso", "#0a9fd8", "maison"),
    ("travail", "Travail", "#7a5ce6", "valise"),
    ("sante", "Santé", "#e0508a", "coeur"),
    ("famille", "Famille", "#e89a1c", "famille"),
];

pub(super) fn apply_key(conn: &Connection, key: &[u8; KEY_LEN]) -> Result<(), VaultError> {
    let sql = Zeroizing::new(format!("PRAGMA key = \"x'{}'\";", hex::encode(key)));
    conn.execute_batch(&sql)?;
    Ok(())
}

fn configure(conn: &Connection) -> Result<(), VaultError> {
    // Journal WAL + écriture synchrone complète : une coupure de courant ne corrompt pas la base.
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;")?;
    Ok(())
}

/// Vérifie que la clé ouvre bien la base et que celle-ci n'est pas abîmée.
pub(super) fn check(conn: &Connection) -> Result<(), VaultError> {
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
        .map_err(|_| VaultError::Corrupted { detail: "la base ne s'ouvre pas avec cette clé".into() })?;
    let status: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    if status != "ok" {
        return Err(VaultError::Corrupted { detail: "contrôle d'intégrité de la base en échec".into() });
    }
    Ok(())
}

pub(super) fn schema_version(conn: &Connection) -> Result<i64, VaultError> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

/// Avant de transformer une base existante, on garde une copie du fichier chiffré
/// (cahier des charges § 9 : « sauvegardées avant migration »).
fn backup_before_migration(conn: &Connection, path: &Path, version: i64) -> Result<(), VaultError> {
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    let mut backup = path.as_os_str().to_owned();
    backup.push(format!(".avant-migration-v{version}"));
    std::fs::copy(path, backup)?;
    Ok(())
}

fn migrate(conn: &mut Connection, now: u64) -> Result<(), VaultError> {
    let version = schema_version(conn)?;
    if version > SCHEMA_VERSION {
        return Err(VaultError::Corrupted {
            detail: "base créée par une version plus récente d'Aqueli".into(),
        });
    }
    if version == SCHEMA_VERSION {
        return Ok(());
    }
    let tx = conn.transaction()?;
    if version < 1 {
        tx.execute_batch(
            "CREATE TABLE meta (
                 key   TEXT PRIMARY KEY,
                 value TEXT NOT NULL
             );
             CREATE TABLE security_log (
                 id     INTEGER PRIMARY KEY,
                 at     INTEGER NOT NULL,
                 event  TEXT NOT NULL,
                 detail TEXT
             );",
        )?;
    }
    if version < 2 {
        tx.execute_batch(
            "CREATE TABLE spaces (
                 id         TEXT PRIMARY KEY,
                 name       TEXT NOT NULL,
                 color      TEXT NOT NULL,
                 icon       TEXT NOT NULL,
                 position   INTEGER NOT NULL,
                 created_at INTEGER NOT NULL
             );",
        )?;
        for (position, (id, name, color, icon)) in DEFAULT_SPACES.iter().enumerate() {
            tx.execute(
                "INSERT INTO spaces (id, name, color, icon, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, name, color, icon, position as i64, now as i64],
            )?;
        }
    }
    if version < 3 {
        // Étiquettes et sous-tâches en JSON : quelques dizaines par tâche au plus.
        tx.execute_batch(
            "CREATE TABLE tasks (
                 id         TEXT PRIMARY KEY,
                 title      TEXT NOT NULL,
                 notes      TEXT NOT NULL DEFAULT '',
                 space_id   TEXT,
                 due_date   TEXT,
                 due_time   TEXT,
                 priority   INTEGER NOT NULL DEFAULT 0,
                 estimate   INTEGER,
                 tags       TEXT NOT NULL DEFAULT '[]',
                 subtasks   TEXT NOT NULL DEFAULT '[]',
                 inbox      INTEGER NOT NULL DEFAULT 0,
                 done_at    INTEGER,
                 created_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL,
                 deleted_at INTEGER
             );
             CREATE INDEX tasks_state ON tasks (deleted_at, done_at);",
        )?;
    }
    if version < 4 {
        // Règle de répétition (JSON) et tâche créée à l'achèvement (pour l'annuler).
        tx.execute_batch(
            "ALTER TABLE tasks ADD COLUMN recurrence TEXT;
             ALTER TABLE tasks ADD COLUMN next_id TEXT;",
        )?;
    }
    if version < 5 {
        tx.execute_batch("ALTER TABLE tasks ADD COLUMN color TEXT;")?;
    }
    if version < 6 {
        // Rappel : nombre de minutes avant l'échéance (0 = à l'échéance).
        tx.execute_batch("ALTER TABLE tasks ADD COLUMN reminder INTEGER;")?;
    }
    if version < 7 {
        // Événements du calendrier ; sans heure de début ni de fin : journée entière.
        tx.execute_batch(
            "CREATE TABLE events (
                 id         TEXT PRIMARY KEY,
                 title      TEXT NOT NULL,
                 location   TEXT NOT NULL DEFAULT '',
                 notes      TEXT NOT NULL DEFAULT '',
                 space_id   TEXT,
                 start_date TEXT NOT NULL,
                 start_time TEXT,
                 end_date   TEXT NOT NULL,
                 end_time   TEXT,
                 color      TEXT,
                 reminder   INTEGER,
                 recurrence TEXT,
                 exceptions TEXT NOT NULL DEFAULT '[]',
                 created_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL,
                 deleted_at INTEGER
             );
             CREATE INDEX events_dates ON events (deleted_at, start_date);",
        )?;
    }
    if version < 8 {
        // Dernier jour d'une série d'événements répétés (sans fin s'il est absent).
        tx.execute_batch("ALTER TABLE events ADD COLUMN repeat_until TEXT;")?;
    }
    if version < 9 {
        // Obligations ; `anchor_day` : jour du mois des échéances d'une obligation périodique.
        tx.execute_batch(
            "CREATE TABLE obligations (
                 id            TEXT PRIMARY KEY,
                 title         TEXT NOT NULL,
                 category      TEXT NOT NULL,
                 organization  TEXT NOT NULL DEFAULT '',
                 reference     TEXT NOT NULL DEFAULT '',
                 amount_cents  INTEGER,
                 period_months INTEGER,
                 due_date      TEXT NOT NULL,
                 anchor_day    INTEGER NOT NULL,
                 cancel_by     TEXT,
                 status        TEXT NOT NULL,
                 space_id      TEXT,
                 color         TEXT,
                 notes         TEXT NOT NULL DEFAULT '',
                 last_paid_on  TEXT,
                 created_at    INTEGER NOT NULL,
                 updated_at    INTEGER NOT NULL,
                 deleted_at    INTEGER
             );
             CREATE INDEX obligations_due ON obligations (deleted_at, due_date);",
        )?;
    }
    if version < 10 {
        // Catégories d'obligations renommées ou recolorées.
        tx.execute_batch(
            "CREATE TABLE obligation_categories (
                 id    TEXT PRIMARY KEY,
                 label TEXT,
                 color TEXT
             );",
        )?;
    }
    if version < 11 {
        // Notes, carnets, historique des versions, modèles personnels ; index de recherche
        // plein texte sans accents ni majuscules.
        tx.execute_batch(
            "CREATE TABLE notebooks (
                 id         TEXT PRIMARY KEY,
                 name       TEXT NOT NULL,
                 parent_id  TEXT,
                 color      TEXT,
                 created_at INTEGER NOT NULL,
                 deleted_at INTEGER
             );
             CREATE TABLE notes (
                 id          TEXT PRIMARY KEY,
                 title       TEXT NOT NULL DEFAULT '',
                 content     TEXT NOT NULL,
                 plain       TEXT NOT NULL DEFAULT '',
                 links       TEXT NOT NULL DEFAULT '[]',
                 notebook_id TEXT,
                 space_id    TEXT,
                 tags        TEXT NOT NULL DEFAULT '[]',
                 pinned      INTEGER NOT NULL DEFAULT 0,
                 favorite    INTEGER NOT NULL DEFAULT 0,
                 color       TEXT,
                 created_at  INTEGER NOT NULL,
                 updated_at  INTEGER NOT NULL,
                 deleted_at  INTEGER
             );
             CREATE INDEX notes_notebook ON notes (notebook_id);
             CREATE TABLE note_versions (
                 id       INTEGER PRIMARY KEY AUTOINCREMENT,
                 note_id  TEXT NOT NULL,
                 title    TEXT NOT NULL,
                 content  TEXT NOT NULL,
                 plain    TEXT NOT NULL,
                 saved_at INTEGER NOT NULL
             );
             CREATE INDEX note_versions_note ON note_versions (note_id, saved_at);
             CREATE TABLE note_templates (
                 id         TEXT PRIMARY KEY,
                 name       TEXT NOT NULL,
                 content    TEXT NOT NULL,
                 created_at INTEGER NOT NULL
             );
             CREATE VIRTUAL TABLE notes_fts USING fts5(
                 note_id UNINDEXED, title, plain, tags,
                 tokenize = 'unicode61 remove_diacritics 2'
             );",
        )?;
    }
    if version < 12 {
        // Symbole des catégories d'obligations et des carnets ; second index de recherche,
        // qui garde les accents ; « œ » et « æ » indexés « oe » et « ae ».
        tx.execute_batch(
            "ALTER TABLE obligation_categories ADD COLUMN icon TEXT;
             ALTER TABLE notebooks ADD COLUMN icon TEXT;
             CREATE VIRTUAL TABLE notes_fts_exact USING fts5(
                 note_id UNINDEXED, title, plain, tags,
                 tokenize = 'unicode61 remove_diacritics 0'
             );",
        )?;
        crate::data::notes::reindex_all(&tx).map_err(|e| VaultError::Corrupted { detail: format!("{e:?}") })?;
    }
    if version < 13 {
        // Journal (une page par jour), habitudes et leurs jours cochés, séances de Focus.
        tx.execute_batch(
            "CREATE TABLE journal (
                 day        TEXT PRIMARY KEY,
                 mood       INTEGER,
                 energy     INTEGER,
                 gratitudes TEXT NOT NULL DEFAULT '[]',
                 content    TEXT NOT NULL DEFAULT '',
                 plain      TEXT NOT NULL DEFAULT '',
                 created_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL,
                 deleted_at INTEGER
             );
             CREATE VIRTUAL TABLE journal_fts USING fts5(
                 day UNINDEXED, text,
                 tokenize = 'unicode61 remove_diacritics 2'
             );
             CREATE TABLE habits (
                 id          TEXT PRIMARY KEY,
                 name        TEXT NOT NULL,
                 icon        TEXT NOT NULL,
                 color       TEXT,
                 kind        TEXT NOT NULL,
                 negative    INTEGER NOT NULL DEFAULT 0,
                 target      INTEGER NOT NULL DEFAULT 1,
                 unit        TEXT NOT NULL DEFAULT '',
                 frequency   TEXT NOT NULL,
                 reminder    TEXT,
                 space_id    TEXT,
                 position    INTEGER NOT NULL,
                 archived_at INTEGER,
                 created_at  INTEGER NOT NULL,
                 updated_at  INTEGER NOT NULL,
                 deleted_at  INTEGER
             );
             CREATE TABLE habit_checks (
                 habit_id TEXT NOT NULL,
                 day      TEXT NOT NULL,
                 value    INTEGER NOT NULL,
                 PRIMARY KEY (habit_id, day)
             );
             CREATE TABLE focus_sessions (
                 id         INTEGER PRIMARY KEY AUTOINCREMENT,
                 task_id    TEXT,
                 day        TEXT NOT NULL,
                 started_at INTEGER NOT NULL,
                 minutes    INTEGER NOT NULL
             );
             CREATE INDEX focus_sessions_day ON focus_sessions (day);",
        )?;
    }
    if version < 14 {
        // Projets et jalons (tâches rattachées, colonne « En cours »), liens entre éléments,
        // contacts, documents chiffrés (contenu à part, pour garder la liste légère) et dossiers.
        tx.execute_batch(
            "ALTER TABLE tasks ADD COLUMN project_id TEXT;
             ALTER TABLE tasks ADD COLUMN doing INTEGER NOT NULL DEFAULT 0;
             CREATE INDEX tasks_project ON tasks (project_id);
             CREATE TABLE projects (
                 id          TEXT PRIMARY KEY,
                 name        TEXT NOT NULL,
                 description TEXT NOT NULL DEFAULT '',
                 status      TEXT NOT NULL,
                 start_date  TEXT,
                 end_date    TEXT,
                 icon        TEXT NOT NULL,
                 color       TEXT,
                 space_id    TEXT,
                 position    INTEGER NOT NULL,
                 archived_at INTEGER,
                 created_at  INTEGER NOT NULL,
                 updated_at  INTEGER NOT NULL,
                 deleted_at  INTEGER
             );
             CREATE TABLE milestones (
                 id         TEXT PRIMARY KEY,
                 project_id TEXT NOT NULL,
                 title      TEXT NOT NULL,
                 due_date   TEXT,
                 done_at    INTEGER,
                 position   INTEGER NOT NULL,
                 created_at INTEGER NOT NULL
             );
             CREATE INDEX milestones_project ON milestones (project_id);
             CREATE TABLE links (
                 a_kind     TEXT NOT NULL,
                 a_id       TEXT NOT NULL,
                 b_kind     TEXT NOT NULL,
                 b_id       TEXT NOT NULL,
                 created_at INTEGER NOT NULL,
                 PRIMARY KEY (a_kind, a_id, b_kind, b_id)
             );
             CREATE INDEX links_b ON links (b_kind, b_id);
             CREATE TABLE contacts (
                 id         TEXT PRIMARY KEY,
                 first_name TEXT NOT NULL DEFAULT '',
                 last_name  TEXT NOT NULL DEFAULT '',
                 company    TEXT NOT NULL DEFAULT '',
                 phones     TEXT NOT NULL DEFAULT '[]',
                 emails     TEXT NOT NULL DEFAULT '[]',
                 address    TEXT NOT NULL DEFAULT '',
                 birthday   TEXT,
                 notes      TEXT NOT NULL DEFAULT '',
                 tags       TEXT NOT NULL DEFAULT '[]',
                 photo      TEXT,
                 color      TEXT,
                 favorite   INTEGER NOT NULL DEFAULT 0,
                 space_id   TEXT,
                 created_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL,
                 deleted_at INTEGER
             );
             CREATE TABLE document_folders (
                 id         TEXT PRIMARY KEY,
                 name       TEXT NOT NULL,
                 icon       TEXT,
                 color      TEXT,
                 position   INTEGER NOT NULL,
                 created_at INTEGER NOT NULL
             );
             CREATE TABLE documents (
                 id          TEXT PRIMARY KEY,
                 name        TEXT NOT NULL,
                 ext         TEXT NOT NULL DEFAULT '',
                 size        INTEGER NOT NULL,
                 folder_id   TEXT,
                 tags        TEXT NOT NULL DEFAULT '[]',
                 expires_on  TEXT,
                 remind_days INTEGER,
                 notes       TEXT NOT NULL DEFAULT '',
                 space_id    TEXT,
                 created_at  INTEGER NOT NULL,
                 updated_at  INTEGER NOT NULL,
                 deleted_at  INTEGER
             );
             CREATE TABLE document_data (
                 document_id TEXT PRIMARY KEY,
                 data        BLOB NOT NULL
             );",
        )?;
    }
    if version < 15 {
        // Dossiers où ranger les carnets de notes.
        tx.execute_batch(
            "CREATE TABLE note_folders (
                 id         TEXT PRIMARY KEY,
                 name       TEXT NOT NULL,
                 color      TEXT,
                 icon       TEXT,
                 position   INTEGER NOT NULL,
                 created_at INTEGER NOT NULL
             );
             ALTER TABLE notebooks ADD COLUMN folder_id TEXT;",
        )?;
    }
    if version < 16 {
        // Informations libres des contacts (« Code d'entrée », « Pointure »…), fonds d'écran des
        // thèmes personnels.
        tx.execute_batch(
            "ALTER TABLE contacts ADD COLUMN fields TEXT NOT NULL DEFAULT '[]';
             CREATE TABLE wallpapers (
                 id         TEXT PRIMARY KEY,
                 data       TEXT NOT NULL,
                 created_at INTEGER NOT NULL
             );",
        )?;
    }
    if version < 17 {
        // Catégories de contacts et style des fiches (palette, motifs).
        tx.execute_batch(
            "CREATE TABLE contact_groups (
                 id         TEXT PRIMARY KEY,
                 name       TEXT NOT NULL,
                 color      TEXT,
                 icon       TEXT,
                 position   INTEGER NOT NULL,
                 created_at INTEGER NOT NULL
             );
             ALTER TABLE contacts ADD COLUMN group_id TEXT;
             ALTER TABLE contacts ADD COLUMN style TEXT;",
        )?;
    }
    if version < 18 {
        // Version 3 : listes, budget, objectifs, revues hebdomadaires du Bilan.
        tx.execute_batch(
            "CREATE TABLE lists (
                 id          TEXT PRIMARY KEY,
                 name        TEXT NOT NULL,
                 template    TEXT NOT NULL,
                 columns     TEXT NOT NULL DEFAULT '[]',
                 sections    TEXT NOT NULL DEFAULT '[]',
                 view        TEXT NOT NULL DEFAULT 'liste',
                 color       TEXT,
                 icon        TEXT NOT NULL,
                 space_id    TEXT,
                 archived_at INTEGER,
                 position    INTEGER NOT NULL,
                 created_at  INTEGER NOT NULL,
                 updated_at  INTEGER NOT NULL,
                 deleted_at  INTEGER
             );
             CREATE TABLE list_items (
                 id         TEXT PRIMARY KEY,
                 list_id    TEXT NOT NULL,
                 title      TEXT NOT NULL,
                 section    TEXT,
                 cells      TEXT NOT NULL DEFAULT '{}',
                 done       INTEGER NOT NULL DEFAULT 0,
                 image      TEXT,
                 position   INTEGER NOT NULL,
                 created_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE INDEX list_items_list ON list_items(list_id, position);
             CREATE TABLE budget_categories (
                 id            TEXT PRIMARY KEY,
                 name          TEXT NOT NULL,
                 kind          TEXT NOT NULL,
                 color         TEXT,
                 icon          TEXT NOT NULL,
                 monthly_cents INTEGER,
                 position      INTEGER NOT NULL,
                 created_at    INTEGER NOT NULL
             );
             CREATE TABLE transactions (
                 id           TEXT PRIMARY KEY,
                 day          TEXT NOT NULL,
                 amount_cents INTEGER NOT NULL,
                 kind         TEXT NOT NULL,
                 category_id  TEXT,
                 label        TEXT NOT NULL,
                 notes        TEXT NOT NULL DEFAULT '',
                 space_id     TEXT,
                 created_at   INTEGER NOT NULL,
                 updated_at   INTEGER NOT NULL,
                 deleted_at   INTEGER
             );
             CREATE INDEX transactions_day ON transactions(day);
             CREATE TABLE goals (
                 id          TEXT PRIMARY KEY,
                 title       TEXT NOT NULL,
                 why         TEXT NOT NULL DEFAULT '',
                 horizon     TEXT NOT NULL,
                 start_date  TEXT NOT NULL,
                 target_date TEXT,
                 metric      TEXT NOT NULL,
                 target      REAL,
                 unit        TEXT NOT NULL DEFAULT '',
                 habit_id    TEXT,
                 status      TEXT NOT NULL,
                 color       TEXT,
                 icon        TEXT NOT NULL,
                 space_id    TEXT,
                 position    INTEGER NOT NULL,
                 created_at  INTEGER NOT NULL,
                 updated_at  INTEGER NOT NULL,
                 deleted_at  INTEGER
             );
             CREATE TABLE goal_steps (
                 id       TEXT PRIMARY KEY,
                 goal_id  TEXT NOT NULL,
                 title    TEXT NOT NULL,
                 due_date TEXT,
                 done_at  INTEGER,
                 position INTEGER NOT NULL
             );
             CREATE TABLE goal_entries (
                 id         TEXT PRIMARY KEY,
                 goal_id    TEXT NOT NULL,
                 day        TEXT NOT NULL,
                 value      REAL NOT NULL,
                 note       TEXT NOT NULL DEFAULT '',
                 created_at INTEGER NOT NULL
             );
             CREATE TABLE reviews (
                 week       TEXT PRIMARY KEY,
                 wins       TEXT NOT NULL DEFAULT '',
                 lessons    TEXT NOT NULL DEFAULT '',
                 priorities TEXT NOT NULL DEFAULT '',
                 done_at    INTEGER,
                 updated_at INTEGER NOT NULL
             );",
        )?;
        // Catégories du budget proposées au départ.
        for (position, (id, name, kind, color, icon)) in crate::data::budget::DEFAULT_CATEGORIES.iter().enumerate() {
            tx.execute(
                "INSERT INTO budget_categories (id, name, kind, color, icon, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![id, name, kind, color, icon, position as i64, now as i64],
            )?;
        }
    }
    if version < 19 {
        // Autres sortes de revenus que le salaire, à la suite des catégories du compte ; une
        // catégorie de la version 18 supprimée par la personne ne revient pas.
        for (id, name, kind, color, icon) in crate::data::budget::DEFAULT_CATEGORIES.iter().filter(|c| crate::data::budget::V19_CATEGORIES.contains(&c.0)) {
            tx.execute(
                "INSERT OR IGNORE INTO budget_categories (id, name, kind, color, icon, position, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(position), -1) + 1 FROM budget_categories), ?6)",
                rusqlite::params![id, name, kind, color, icon, now as i64],
            )?;
        }
    }
    if version < 20 {
        // Archive des notes ; filtres de tâches enregistrés. Rejouable sans erreur.
        let has_archived: bool = tx.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('notes') WHERE name = 'archived'",
            [],
            |r| r.get(0),
        )?;
        if !has_archived {
            tx.execute_batch("ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;")?;
        }
        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS task_filters (
                 id         TEXT PRIMARY KEY,
                 name       TEXT NOT NULL,
                 icon       TEXT NOT NULL,
                 color      TEXT,
                 criteria   TEXT NOT NULL,
                 position   INTEGER NOT NULL,
                 created_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL
             );",
        )?;
    }
    if version < 21 {
        // Date de début des tâches, moments et pauses des habitudes. Rejouable sans erreur.
        let has_start: bool = tx.query_row(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('tasks') WHERE name = 'start_date'",
            [],
            |r| r.get(0),
        )?;
        if !has_start {
            tx.execute_batch("ALTER TABLE tasks ADD COLUMN start_date TEXT;")?;
        }
        // Moment de la journée des habitudes ; jours de pause.
        let has_moment: bool = tx.query_row("SELECT COUNT(*) > 0 FROM pragma_table_info('habits') WHERE name = 'moment'", [], |r| r.get(0))?;
        if !has_moment {
            tx.execute_batch("ALTER TABLE habits ADD COLUMN moment TEXT;")?;
        }
        let has_skip: bool = tx.query_row("SELECT COUNT(*) > 0 FROM pragma_table_info('habit_checks') WHERE name = 'skipped'", [], |r| r.get(0))?;
        if !has_skip {
            tx.execute_batch("ALTER TABLE habit_checks ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0;")?;
        }
        // Intention des séances de Focus.
        let has_note: bool = tx.query_row("SELECT COUNT(*) > 0 FROM pragma_table_info('focus_sessions') WHERE name = 'note'", [], |r| r.get(0))?;
        if !has_note {
            tx.execute_batch("ALTER TABLE focus_sessions ADD COLUMN note TEXT;")?;
        }
        // Activités des pages du journal.
        let has_activities: bool = tx.query_row("SELECT COUNT(*) > 0 FROM pragma_table_info('journal') WHERE name = 'activities'", [], |r| r.get(0))?;
        if !has_activities {
            tx.execute_batch("ALTER TABLE journal ADD COLUMN activities TEXT NOT NULL DEFAULT '[]';")?;
        }
        // Opérations récurrentes du budget.
        let has_repeat: bool = tx.query_row("SELECT COUNT(*) > 0 FROM pragma_table_info('transactions') WHERE name = 'repeat_months'", [], |r| r.get(0))?;
        if !has_repeat {
            tx.execute_batch(
                "ALTER TABLE transactions ADD COLUMN repeat_months INTEGER;
                 ALTER TABLE transactions ADD COLUMN repeat_until TEXT;
                 ALTER TABLE transactions ADD COLUMN repeat_next TEXT;
                 ALTER TABLE transactions ADD COLUMN series_id TEXT;",
            )?;
        }
        // Prélèvement automatique et historique des paiements des obligations.
        let has_auto: bool = tx.query_row("SELECT COUNT(*) > 0 FROM pragma_table_info('obligations') WHERE name = 'auto_pay'", [], |r| r.get(0))?;
        if !has_auto {
            tx.execute_batch("ALTER TABLE obligations ADD COLUMN auto_pay INTEGER NOT NULL DEFAULT 0;")?;
        }
        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS obligation_payments (
                 id            INTEGER PRIMARY KEY,
                 obligation_id TEXT NOT NULL,
                 due_date      TEXT NOT NULL,
                 paid_on       TEXT NOT NULL,
                 amount_cents  INTEGER,
                 auto          INTEGER NOT NULL DEFAULT 0
             );
             CREATE INDEX IF NOT EXISTS obligation_payments_obligation ON obligation_payments(obligation_id);",
        )?;
        // « Rester en contact » et échanges avec les contacts.
        let has_keep: bool = tx.query_row("SELECT COUNT(*) > 0 FROM pragma_table_info('contacts') WHERE name = 'keep_in_touch'", [], |r| r.get(0))?;
        if !has_keep {
            tx.execute_batch("ALTER TABLE contacts ADD COLUMN keep_in_touch INTEGER;")?;
        }
        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS contact_interactions (
                 id         TEXT PRIMARY KEY,
                 contact_id TEXT NOT NULL,
                 day        TEXT NOT NULL,
                 kind       TEXT NOT NULL,
                 note       TEXT NOT NULL DEFAULT '',
                 created_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS contact_interactions_contact ON contact_interactions(contact_id, day);",
        )?;
        // Documents : date, émetteur et sorte.
        let has_doc_type: bool = tx.query_row("SELECT COUNT(*) > 0 FROM pragma_table_info('documents') WHERE name = 'doc_type'", [], |r| r.get(0))?;
        if !has_doc_type {
            tx.execute_batch(
                "ALTER TABLE documents ADD COLUMN doc_date TEXT;
                 ALTER TABLE documents ADD COLUMN issuer TEXT NOT NULL DEFAULT '';
                 ALTER TABLE documents ADD COLUMN doc_type TEXT;",
            )?;
        }
    }
    tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    tx.commit()?;
    Ok(())
}

/// Crée une base neuve, chiffrée avec `key`.
pub fn create(path: &Path, key: &[u8; KEY_LEN], now: u64) -> Result<Connection, VaultError> {
    let mut conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    apply_key(&conn, key)?;
    configure(&conn)?;
    migrate(&mut conn, now)?;
    check(&conn)?;
    Ok(conn)
}

/// Ouvre la base existante avec `key` et la met à jour si besoin (après une copie de sécurité).
pub fn open(path: &Path, key: &[u8; KEY_LEN], now: u64) -> Result<Connection, VaultError> {
    let mut conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| VaultError::Corrupted { detail: "fichier de la base introuvable".into() })?;
    apply_key(&conn, key)?;
    check(&conn)?;
    configure(&conn)?;
    let version = schema_version(&conn)?;
    if (1..SCHEMA_VERSION).contains(&version) {
        backup_before_migration(&conn, path, version)?;
    }
    migrate(&mut conn, now)?;
    Ok(conn)
}

/// Note un événement dans le journal de sécurité local (jamais de secret ici).
pub fn log_event(conn: &Connection, at: u64, event: &str, detail: Option<&str>) -> Result<(), VaultError> {
    conn.execute(
        "INSERT INTO security_log (at, event, detail) VALUES (?1, ?2, ?3)",
        params![at as i64, event, detail],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_790_000_000;
    const KEY: [u8; KEY_LEN] = [42u8; KEY_LEN];

    fn space_names(conn: &Connection) -> Vec<String> {
        let mut stmt = conn.prepare("SELECT name FROM spaces ORDER BY position").unwrap();
        let rows = stmt.query_map([], |r| r.get(0)).unwrap();
        rows.collect::<Result<_, _>>().unwrap()
    }

    fn put(dir: &Path, name: &str) {
        std::fs::write(dir.join(name), name).unwrap();
    }

    fn content(dir: &Path, name: &str) -> String {
        std::fs::read_to_string(dir.join(name)).unwrap()
    }

    #[test]
    fn la_base_sous_l_ancien_nom_est_renommee_avec_son_journal() {
        let dir = tempfile::tempdir().unwrap();
        let old = ["aqualis.db", "aqualis.db-wal", "aqualis.db-shm", "aqualis.db.avant-migration-v1"];
        for name in old {
            put(dir.path(), name);
        }
        put(dir.path(), "coffre.json");

        assert_eq!(adopt_old_files(dir.path()), DB_FILE);
        for name in old {
            assert!(!dir.path().join(name).exists(), "{name} doit avoir disparu");
            let new = name.replace("aqualis", "aqueli");
            assert_eq!(content(dir.path(), &new), name, "{new} doit reprendre le contenu de {name}");
        }
        assert_eq!(content(dir.path(), "coffre.json"), "coffre.json");
        assert_eq!(adopt_old_files(dir.path()), DB_FILE, "une seconde fois, rien ne change");
    }

    #[test]
    fn une_base_deja_au_nouveau_nom_garde_son_journal() {
        let dir = tempfile::tempdir().unwrap();
        put(dir.path(), "aqueli.db");
        put(dir.path(), "aqualis.db");
        put(dir.path(), "aqualis.db-wal");

        assert_eq!(adopt_old_files(dir.path()), DB_FILE);
        assert!(!dir.path().join("aqueli.db-wal").exists(), "un ancien journal ne s'applique jamais à la nouvelle base");
        assert!(dir.path().join("aqualis.db-wal").exists());
    }

    #[test]
    fn un_renommage_interrompu_reprend_au_lancement_suivant() {
        let dir = tempfile::tempdir().unwrap();
        put(dir.path(), "aqueli.db-wal");
        put(dir.path(), "aqualis.db");

        assert_eq!(adopt_old_files(dir.path()), DB_FILE);
        assert_eq!(content(dir.path(), "aqueli.db"), "aqualis.db");
        assert_eq!(content(dir.path(), "aqueli.db-wal"), "aqueli.db-wal");
    }

    #[cfg(windows)]
    #[test]
    fn une_base_ouverte_ailleurs_garde_l_ancien_nom() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        put(dir.path(), "aqualis.db");
        put(dir.path(), "aqualis.db-wal");
        // Comme l'ancienne version encore ouverte : le fichier ne peut pas être renommé.
        let _held = std::fs::OpenOptions::new().read(true).share_mode(0).open(dir.path().join("aqualis.db")).unwrap();

        assert_eq!(adopt_old_files(dir.path()), legacy::OLD_DB_FILE);
        assert!(dir.path().join("aqualis.db-wal").exists(), "le journal reste avec sa base");
        assert!(!dir.path().join("aqueli.db-wal").exists());
    }

    #[test]
    fn une_base_neuve_contient_les_espaces_par_defaut() {
        let dir = tempfile::tempdir().unwrap();
        let conn = create(&dir.path().join(DB_FILE), &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        assert_eq!(space_names(&conn), vec!["Perso", "Travail", "Santé", "Famille"]);
    }

    #[test]
    fn une_base_de_version_1_est_copiee_puis_mise_a_jour() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            // Base telle qu'elle existait à l'étape 0.2.
            let conn = Connection::open(&path).unwrap();
            apply_key(&conn, &KEY).unwrap();
            conn.execute_batch(
                "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE security_log (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL, detail TEXT);
                 INSERT INTO meta VALUES ('note', 'conservée');
                 PRAGMA user_version = 1;",
            )
            .unwrap();
        }

        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        assert_eq!(space_names(&conn).len(), 4);
        let note: String = conn.query_row("SELECT value FROM meta WHERE key = 'note'", [], |r| r.get(0)).unwrap();
        assert_eq!(note, "conservée");

        let backup = dir.path().join("aqueli.db.avant-migration-v1");
        assert!(backup.exists(), "une copie doit être faite avant la migration");
        assert!(!std::fs::read(&backup).unwrap().starts_with(b"SQLite format 3"), "la copie reste chiffrée");
        let copy = open(&backup, &KEY, NOW).unwrap();
        assert!(schema_version(&copy).is_ok());
    }

    #[test]
    fn une_base_de_version_2_recoit_les_taches() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            // Base telle qu'elle existait à l'étape 0.4.
            let conn = Connection::open(&path).unwrap();
            apply_key(&conn, &KEY).unwrap();
            conn.execute_batch(
                "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE security_log (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, event TEXT NOT NULL, detail TEXT);
                 CREATE TABLE spaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
                                      icon TEXT NOT NULL, position INTEGER NOT NULL, created_at INTEGER NOT NULL);
                 INSERT INTO spaces VALUES ('jardin', 'Jardin', '#2fae4a', 'feuille', 0, 1);
                 PRAGMA user_version = 2;",
            )
            .unwrap();
        }

        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        assert_eq!(space_names(&conn), vec!["Jardin"], "les espaces existants sont gardés tels quels");
        let tasks: i64 = conn.query_row("SELECT count(*) FROM tasks", [], |r| r.get(0)).unwrap();
        assert_eq!(tasks, 0);
        assert!(dir.path().join("aqueli.db.avant-migration-v2").exists());
    }

    #[test]
    fn une_base_de_version_11_recoit_les_symboles_et_le_second_index() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            // Retour à l'étape 1.7 : pas de symbole, un seul index, « œ » gardé tel quel.
            conn.execute_batch(
                "DROP TABLE lists;
                 DROP TABLE list_items;
                 DROP TABLE budget_categories;
                 DROP TABLE transactions;
                 DROP TABLE goals;
                 DROP TABLE goal_steps;
                 DROP TABLE goal_entries;
                 DROP TABLE reviews;
                 DROP TABLE contact_groups;
                 DROP TABLE wallpapers;
                 DROP TABLE note_folders;
                 ALTER TABLE notebooks DROP COLUMN folder_id;
                 DROP TABLE projects;
                 DROP TABLE milestones;
                 DROP TABLE links;
                 DROP TABLE contacts;
                 DROP TABLE document_folders;
                 DROP TABLE documents;
                 DROP TABLE document_data;
                 DROP INDEX tasks_project;
                 ALTER TABLE tasks DROP COLUMN project_id;
                 ALTER TABLE tasks DROP COLUMN doing;
                 DROP TABLE journal;
                 DROP TABLE journal_fts;
                 DROP TABLE habits;
                 DROP TABLE habit_checks;
                 DROP TABLE focus_sessions;
                 DROP TABLE notes_fts_exact;
                 ALTER TABLE notebooks DROP COLUMN icon;
                 ALTER TABLE obligation_categories DROP COLUMN icon;
                 INSERT INTO notes (id, title, content, plain, created_at, updated_at)
                     VALUES ('n1', 'Pêche', '{}', 'Six œufs', 1, 1);
                 INSERT INTO notes_fts (note_id, title, plain, tags) VALUES ('n1', 'Pêche', 'Six œufs', '');
                 PRAGMA user_version = 11;",
            )
            .unwrap();
        }
        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        assert_eq!(crate::data::notes::search(&conn, "oeufs").unwrap(), vec!["n1".to_string()]);
        assert_eq!(crate::data::notes::search(&conn, "pêche").unwrap(), vec!["n1".to_string()]);
        let icons: i64 = conn.query_row("SELECT count(*) FROM notebooks WHERE icon IS NOT NULL", [], |r| r.get(0)).unwrap();
        assert_eq!(icons, 0);
    }

    #[test]
    fn une_base_de_version_3_recoit_la_repetition_des_taches() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            // Retour à l'état de l'étape 1.1 : table des tâches sans répétition, pas d'événements.
            conn.execute_batch(
                "DROP TABLE lists;
                 DROP TABLE list_items;
                 DROP TABLE budget_categories;
                 DROP TABLE transactions;
                 DROP TABLE goals;
                 DROP TABLE goal_steps;
                 DROP TABLE goal_entries;
                 DROP TABLE reviews;
                 DROP TABLE contact_groups;
                 DROP TABLE wallpapers;
                 DROP TABLE note_folders;
                 DROP TABLE projects;
                 DROP TABLE milestones;
                 DROP TABLE links;
                 DROP TABLE contacts;
                 DROP TABLE document_folders;
                 DROP TABLE documents;
                 DROP TABLE document_data;
                 DROP TABLE journal;
                 DROP TABLE journal_fts;
                 DROP TABLE habits;
                 DROP TABLE habit_checks;
                 DROP TABLE focus_sessions;
                 DROP TABLE notes_fts_exact;
                 DROP TABLE notes_fts;
                 DROP TABLE note_templates;
                 DROP TABLE note_versions;
                 DROP TABLE notes;
                 DROP TABLE notebooks;
                 DROP TABLE obligation_categories;
                 DROP TABLE obligations;
                 DROP TABLE events;
                 DROP TABLE tasks;
                 CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
                     space_id TEXT, due_date TEXT, due_time TEXT, priority INTEGER NOT NULL DEFAULT 0,
                     estimate INTEGER, tags TEXT NOT NULL DEFAULT '[]', subtasks TEXT NOT NULL DEFAULT '[]',
                     inbox INTEGER NOT NULL DEFAULT 0, done_at INTEGER, created_at INTEGER NOT NULL,
                     updated_at INTEGER NOT NULL, deleted_at INTEGER);
                 INSERT INTO tasks (id, title, created_at, updated_at) VALUES ('t1', 'Arroser', 1, 1);
                 PRAGMA user_version = 3;",
            )
            .unwrap();
        }

        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let events: i64 = conn.query_row("SELECT count(*) FROM events", [], |r| r.get(0)).unwrap();
        assert_eq!(events, 0, "la table des événements est créée");
        let (title, rule, color, reminder): (String, Option<String>, Option<String>, Option<i64>) = conn
            .query_row("SELECT title, recurrence, color, reminder FROM tasks WHERE id = 't1'", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .unwrap();
        assert_eq!((title.as_str(), rule, color, reminder), ("Arroser", None, None, None));
        assert!(dir.path().join("aqueli.db.avant-migration-v3").exists());
    }

    #[test]
    fn une_base_de_version_12_recoit_le_journal_les_habitudes_et_le_focus() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            conn.execute_batch(
                "DROP TABLE lists;
                 DROP TABLE list_items;
                 DROP TABLE budget_categories;
                 DROP TABLE transactions;
                 DROP TABLE goals;
                 DROP TABLE goal_steps;
                 DROP TABLE goal_entries;
                 DROP TABLE reviews;
                 DROP TABLE contact_groups;
                 DROP TABLE wallpapers;
                 DROP TABLE note_folders;
                 ALTER TABLE notebooks DROP COLUMN folder_id;
                 DROP TABLE projects;
                 DROP TABLE milestones;
                 DROP TABLE links;
                 DROP TABLE contacts;
                 DROP TABLE document_folders;
                 DROP TABLE documents;
                 DROP TABLE document_data;
                 DROP INDEX tasks_project;
                 ALTER TABLE tasks DROP COLUMN project_id;
                 ALTER TABLE tasks DROP COLUMN doing;
                 DROP TABLE journal;
                 DROP TABLE journal_fts;
                 DROP TABLE habits;
                 DROP TABLE habit_checks;
                 DROP TABLE focus_sessions;
                 PRAGMA user_version = 12;",
            )
            .unwrap();
        }
        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        for table in ["journal", "habits", "habit_checks", "focus_sessions"] {
            let n: i64 = conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0)).unwrap();
            assert_eq!(n, 0, "{table}");
        }
        assert!(dir.path().join("aqueli.db.avant-migration-v12").exists());
    }

    #[test]
    fn une_base_de_version_13_recoit_les_projets_les_contacts_et_les_documents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            conn.execute_batch(
                "DROP TABLE lists;
                 DROP TABLE list_items;
                 DROP TABLE budget_categories;
                 DROP TABLE transactions;
                 DROP TABLE goals;
                 DROP TABLE goal_steps;
                 DROP TABLE goal_entries;
                 DROP TABLE reviews;
                 DROP TABLE contact_groups;
                 DROP TABLE wallpapers;
                 DROP TABLE note_folders;
                 ALTER TABLE notebooks DROP COLUMN folder_id;
                 DROP TABLE projects;
                 DROP TABLE milestones;
                 DROP TABLE links;
                 DROP TABLE contacts;
                 DROP TABLE document_folders;
                 DROP TABLE documents;
                 DROP TABLE document_data;
                 DROP INDEX tasks_project;
                 ALTER TABLE tasks DROP COLUMN project_id;
                 ALTER TABLE tasks DROP COLUMN doing;
                 INSERT INTO tasks (id, title, created_at, updated_at) VALUES ('t1', 'Arroser', 1, 1);
                 PRAGMA user_version = 13;",
            )
            .unwrap();
        }
        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        for table in ["projects", "milestones", "links", "contacts", "document_folders", "documents", "document_data"] {
            let n: i64 = conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0)).unwrap();
            assert_eq!(n, 0, "{table}");
        }
        let (project, doing): (Option<String>, bool) =
            conn.query_row("SELECT project_id, doing FROM tasks WHERE id = 't1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((project, doing), (None, false), "les tâches existantes restent hors projet");
        assert!(dir.path().join("aqueli.db.avant-migration-v13").exists());
    }

    #[test]
    fn une_base_de_version_14_recoit_les_dossiers_de_carnets() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            conn.execute_batch(
                "DROP TABLE lists;
                 DROP TABLE list_items;
                 DROP TABLE budget_categories;
                 DROP TABLE transactions;
                 DROP TABLE goals;
                 DROP TABLE goal_steps;
                 DROP TABLE goal_entries;
                 DROP TABLE reviews;
                 DROP TABLE contact_groups;
                 DROP TABLE wallpapers;
                 DROP TABLE note_folders;
                 ALTER TABLE notebooks DROP COLUMN folder_id;
                 ALTER TABLE contacts DROP COLUMN fields;
                 ALTER TABLE contacts DROP COLUMN group_id;
                 ALTER TABLE contacts DROP COLUMN style;
                 INSERT INTO notebooks (id, name, created_at) VALUES ('c1', 'Maison', 1);
                 PRAGMA user_version = 14;",
            )
            .unwrap();
        }
        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let folder: Option<String> = conn.query_row("SELECT folder_id FROM notebooks WHERE id = 'c1'", [], |r| r.get(0)).unwrap();
        assert_eq!(folder, None, "les carnets existants restent hors dossier");
        assert!(dir.path().join("aqueli.db.avant-migration-v14").exists());
    }

    #[test]
    fn une_base_de_version_15_recoit_les_informations_libres_des_contacts() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            conn.execute_batch(
                "DROP TABLE lists;
                 DROP TABLE list_items;
                 DROP TABLE budget_categories;
                 DROP TABLE transactions;
                 DROP TABLE goals;
                 DROP TABLE goal_steps;
                 DROP TABLE goal_entries;
                 DROP TABLE reviews;
                 DROP TABLE contact_groups;
                 ALTER TABLE contacts DROP COLUMN group_id;
                 ALTER TABLE contacts DROP COLUMN style;
                 ALTER TABLE contacts DROP COLUMN fields;
                 DROP TABLE wallpapers;
                 INSERT INTO contacts (id, first_name, last_name, company, phones, emails, address, notes, tags, favorite, created_at, updated_at)
                 VALUES ('p1', 'Léa', '', '', '[]', '[]', '', '', '[]', 0, 1, 1);
                 PRAGMA user_version = 15;",
            )
            .unwrap();
        }
        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let fields: String = conn.query_row("SELECT fields FROM contacts WHERE id = 'p1'", [], |r| r.get(0)).unwrap();
        assert_eq!(fields, "[]", "les fiches existantes n'ont aucune information libre");
        let wallpapers: i64 = conn.query_row("SELECT COUNT(*) FROM wallpapers", [], |r| r.get(0)).unwrap();
        assert_eq!(wallpapers, 0);
        assert!(dir.path().join("aqueli.db.avant-migration-v15").exists());
    }

    #[test]
    fn une_base_de_version_16_recoit_les_categories_de_contacts() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            conn.execute_batch(
                "DROP TABLE lists;
                 DROP TABLE list_items;
                 DROP TABLE budget_categories;
                 DROP TABLE transactions;
                 DROP TABLE goals;
                 DROP TABLE goal_steps;
                 DROP TABLE goal_entries;
                 DROP TABLE reviews;
                 DROP TABLE contact_groups;
                 ALTER TABLE contacts DROP COLUMN group_id;
                 ALTER TABLE contacts DROP COLUMN style;
                 INSERT INTO contacts (id, first_name, last_name, company, phones, emails, address, notes, tags, favorite, created_at, updated_at)
                 VALUES ('p1', 'Léa', '', '', '[]', '[]', '', '', '[]', 0, 1, 1);
                 PRAGMA user_version = 16;",
            )
            .unwrap();
        }
        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let (group, style): (Option<String>, Option<String>) = conn.query_row("SELECT group_id, style FROM contacts WHERE id = 'p1'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!((group, style), (None, None), "les fiches existantes gardent leur apparence");
        assert!(dir.path().join("aqueli.db.avant-migration-v16").exists());
    }

    #[test]
    fn une_base_de_version_19_recoit_l_archive_des_notes_et_les_filtres() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            conn.execute_batch(
                "DROP TABLE task_filters;
                 ALTER TABLE notes DROP COLUMN archived;
                 INSERT INTO notes (id, title, content, plain, links, tags, created_at, updated_at) VALUES ('n1', 'Ancienne', '{}', '', '[]', '[]', 1, 1);
                 PRAGMA user_version = 19;",
            )
            .unwrap();
        }
        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let archived: bool = conn.query_row("SELECT archived FROM notes WHERE id = 'n1'", [], |r| r.get(0)).unwrap();
        assert!(!archived, "une note existante n'est pas archivée");
        let filters: i64 = conn.query_row("SELECT COUNT(*) FROM task_filters", [], |r| r.get(0)).unwrap();
        assert_eq!(filters, 0);
    }

    #[test]
    fn une_base_de_version_18_recoit_d_autres_sortes_de_revenus() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            // Base de la version 18 : sans les nouvelles catégories ; « Vêtements » supprimée par la personne.
            conn.execute_batch(
                "DELETE FROM budget_categories WHERE id IN ('cat-activite', 'cat-aides', 'cat-remboursements', 'cat-ventes', 'cat-cadeaux-recus', 'cat-placements', 'cat-vetements');
                 PRAGMA user_version = 18;",
            )
            .unwrap();
        }
        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let ids: Vec<String> = conn
            .prepare("SELECT id FROM budget_categories ORDER BY position")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert!(!ids.contains(&"cat-vetements".to_string()), "une catégorie supprimée ne revient pas");
        assert_eq!(&ids[ids.len() - 6..], crate::data::budget::V19_CATEGORIES.map(String::from), "ajoutées à la suite");
    }

    #[test]
    fn une_base_de_version_17_recoit_les_modules_de_la_version_3() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        {
            let conn = create(&path, &KEY, NOW).unwrap();
            conn.execute_batch(
                "DROP TABLE lists;
                 DROP TABLE list_items;
                 DROP TABLE budget_categories;
                 DROP TABLE transactions;
                 DROP TABLE goals;
                 DROP TABLE goal_steps;
                 DROP TABLE goal_entries;
                 DROP TABLE reviews;
                 PRAGMA user_version = 17;",
            )
            .unwrap();
        }
        let conn = open(&path, &KEY, NOW).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let categories: i64 = conn.query_row("SELECT COUNT(*) FROM budget_categories", [], |r| r.get(0)).unwrap();
        assert_eq!(categories as usize, crate::data::budget::DEFAULT_CATEGORIES.len(), "catégories du budget proposées");
        for table in ["lists", "list_items", "transactions", "goals", "goal_steps", "goal_entries", "reviews"] {
            let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0)).unwrap();
            assert_eq!(n, 0, "{table}");
        }
        assert!(dir.path().join("aqueli.db.avant-migration-v17").exists());
    }

    #[test]
    fn une_base_a_jour_n_est_pas_copiee() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DB_FILE);
        drop(create(&path, &KEY, NOW).unwrap());
        drop(open(&path, &KEY, NOW).unwrap());
        let copies = std::fs::read_dir(dir.path())
            .unwrap()
            .filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().contains("avant-migration"))
            .count();
        assert_eq!(copies, 0);
    }
}
