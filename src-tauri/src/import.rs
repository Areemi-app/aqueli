//! Import de fichiers (cahier des charges § « Dossier d'import ») : dossier
//! Documents\Aqueli\Import surveillé par l'interface, guide d'import voisin, lecture des fichiers
//! déposés, choisis ou glissés sur la fenêtre, puis création de tous les éléments en une seule
//! transaction, annulable d'un coup. L'interface lit le contenu (Excel, CSV, texte, agenda, contacts) et montre
//! l'aperçu ; le cœur ne donne accès qu'aux fichiers de ce dossier et à ceux que la personne
//! vient de choisir ou de glisser.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::data::budget::{self, TransactionInput};
use crate::data::contacts::{self, ContactInput};
use crate::data::lists::{self, ListInput, ListItemInput};
use crate::data::events::{self, EventInput};
use crate::data::habits::{self, HabitInput};
use crate::data::notes::{self, NoteBody, NoteMeta};
use crate::data::obligations::{self, ObligationInput};
use crate::data::recurrence::Day;
use crate::data::tasks::{self, TaskInput};
use crate::data::DataError;
use crate::lang::Lang;

/// Taille maximale d'un fichier à importer.
pub const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
/// Éléments créés au plus par import.
pub const MAX_ITEMS: usize = 5000;
/// Formats lus par l'interface.
pub const EXTENSIONS: [&str; 6] = ["xlsx", "csv", "txt", "md", "ics", "vcf"];
/// Fichiers choisis ou glissés retenus (les derniers).
const MAX_CHOSEN: usize = 100;

const ROOT: &str = "Aqueli";
const IMPORT: &str = "Import";
const DONE: &str = "Traités";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ImportError {
    Locked,
    NotFound,
    TooLarge { max: u64 },
    /// Dossier Documents introuvable.
    Unavailable,
    Io,
}

impl From<io::Error> for ImportError {
    fn from(e: io::Error) -> Self {
        if e.kind() == io::ErrorKind::NotFound {
            ImportError::NotFound
        } else {
            ImportError::Io
        }
    }
}

/// Fichiers choisis dans la fenêtre « Ouvrir » ou glissés sur la fenêtre : seuls fichiers
/// lisibles hors du dossier d'import (à importer, ou à ajouter aux documents).
#[derive(Default)]
pub struct ChosenFiles(pub Mutex<Vec<PathBuf>>);

/// Retient des fichiers choisis ou glissés par la personne.
pub fn remember(app: &AppHandle, paths: &[PathBuf]) {
    if let Ok(mut list) = app.state::<ChosenFiles>().0.lock() {
        for path in paths {
            list.retain(|p| p != path);
            list.push(path.clone());
        }
        let excess = list.len().saturating_sub(MAX_CHOSEN);
        list.drain(..excess);
    }
}

pub fn is_chosen(app: &AppHandle, path: &Path) -> bool {
    app.state::<ChosenFiles>().0.lock().is_ok_and(|list| list.iter().any(|p| p == path))
}

/// Documents\Aqueli pour le compte principal, Documents\Aqueli\<pseudo> pour un compte ajouté :
/// les fichiers déposés par une personne n'apparaissent jamais dans l'import d'une autre.
pub fn root(app: &AppHandle) -> Result<PathBuf, ImportError> {
    let base = app.path().document_dir().map(|d| d.join(ROOT)).map_err(|_| ImportError::Unavailable)?;
    let active = &app.state::<crate::accounts::ActiveAccount>().0;
    let dir = crate::accounts::dir_of(&active.root, &active.id);
    let (pseudo, _) = crate::accounts::profile(&crate::prefs::load(&dir));
    Ok(match crate::accounts::documents_folder(&active.root, &active.id, &pseudo) {
        Some(folder) => base.join(folder),
        None => base,
    })
}

pub fn folder(root: &Path) -> PathBuf {
    root.join(IMPORT)
}

/// Fichier que l'interface sait lire : bonne extension, ni fichier caché ni fichier de
/// verrouillage d'Excel (« ~$classeur.xlsx »).
pub fn is_importable(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    let extension = path.extension().and_then(|e| e.to_str()).map(str::to_lowercase).unwrap_or_default();
    !name.starts_with("~$") && !name.starts_with('.') && EXTENSIONS.contains(&extension.as_str())
}

/// Fichier directement dans le dossier d'import (pas dans un sous-dossier, pas de « .. »).
pub fn in_folder(folder: &Path, path: &Path) -> bool {
    path.parent() == Some(folder) && path.file_name().is_some()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    /// Dernière modification, en secondes Unix.
    pub modified: u64,
    /// Dans le dossier d'import : supprimé ou rangé après l'import.
    pub in_folder: bool,
}

pub fn describe(path: &Path, in_folder: bool) -> Result<ImportFile, ImportError> {
    let meta = fs::metadata(path)?;
    if !meta.is_file() {
        return Err(ImportError::NotFound);
    }
    let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
    Ok(ImportFile {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        size: meta.len(),
        modified,
        in_folder,
    })
}

/// Fichiers à importer du dossier, du plus ancien au plus récent.
pub fn list(folder: &Path) -> Vec<ImportFile> {
    let Ok(entries) = fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut files: Vec<ImportFile> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| is_importable(p))
        .filter_map(|p| describe(&p, true).ok())
        .collect();
    files.sort_by(|a, b| a.modified.cmp(&b.modified).then_with(|| a.name.cmp(&b.name)));
    files
}

/// Chemin qu'on peut lire : dans le dossier d'import, ou choisi par la personne.
pub fn allowed(app: &AppHandle, path: &Path) -> Result<bool, ImportError> {
    if !is_importable(path) {
        return Err(ImportError::NotFound);
    }
    let inside = in_folder(&folder(&root(app)?), path);
    if inside || is_chosen(app, path) {
        Ok(inside)
    } else {
        Err(ImportError::NotFound)
    }
}

/// Contenu d'un fichier autorisé, 10 Mo au plus.
pub fn read(path: &Path) -> Result<Vec<u8>, ImportError> {
    let meta = fs::metadata(path)?;
    if !meta.is_file() {
        return Err(ImportError::NotFound);
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(ImportError::TooLarge { max: MAX_FILE_BYTES });
    }
    Ok(fs::read(path)?)
}

/// « nom.ext », sinon « nom (2).ext », « nom (3).ext »…
fn free_name(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(name);
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let extension = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){extension}")))
        .find(|p| !p.exists())
        .unwrap_or(candidate)
}

/// Après l'import : le fichier du dossier d'import (non chiffré) est supprimé, ou rangé dans
/// Import\Traités. Un fichier choisi ailleurs reste où il est.
pub fn finish(folder: &Path, path: &Path, keep: bool) -> Result<(), ImportError> {
    if !in_folder(folder, path) {
        return Ok(());
    }
    if keep {
        let done = folder.join(DONE);
        fs::create_dir_all(&done)?;
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        fs::rename(path, free_name(&done, &name))?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

// ——— Guide d'import ———

/// Guide d'import dans une langue : page ouverte dans le navigateur par « Ouvrir le guide »,
/// fichier texte d'exemple, modèles CSV (leurs en-têtes font aussi les onglets des classeurs),
/// lignes du classeur d'exemple (colonnes séparées par des tabulations, dans l'ordre des onglets).
struct Guide {
    folder: &'static str,
    readme: (&'static str, &'static str),
    example: (&'static str, &'static str),
    templates: [(&'static str, &'static str, &'static str); 8],
    examples: [&'static str; 8],
    workbook: &'static str,
    example_workbook: &'static str,
}

const FRENCH: Guide = Guide {
    folder: "Guide d'import",
    readme: ("LISEZ-MOI.html", include_str!("../guide/LISEZ-MOI.html")),
    example: ("Exemple.txt", include_str!("../guide/Exemple.txt")),
    templates: [
        ("Tâches", "Modèle tâches.csv", include_str!("../guide/Modèle tâches.csv")),
        ("Événements", "Modèle événements.csv", include_str!("../guide/Modèle événements.csv")),
        ("Obligations", "Modèle obligations.csv", include_str!("../guide/Modèle obligations.csv")),
        ("Notes", "Modèle notes.csv", include_str!("../guide/Modèle notes.csv")),
        ("Habitudes", "Modèle habitudes.csv", include_str!("../guide/Modèle habitudes.csv")),
        ("Contacts", "Modèle contacts.csv", include_str!("../guide/Modèle contacts.csv")),
        ("Dépenses", "Modèle dépenses.csv", include_str!("../guide/Modèle dépenses.csv")),
        ("Listes", "Modèle listes.csv", include_str!("../guide/Modèle listes.csv")),
    ],
    examples: [
        include_str!("../guide/exemples/Tâches.tsv"),
        include_str!("../guide/exemples/Événements.tsv"),
        include_str!("../guide/exemples/Obligations.tsv"),
        include_str!("../guide/exemples/Notes.tsv"),
        include_str!("../guide/exemples/Habitudes.tsv"),
        include_str!("../guide/exemples/Contacts.tsv"),
        include_str!("../guide/exemples/Dépenses.tsv"),
        include_str!("../guide/exemples/Listes.tsv"),
    ],
    workbook: "Modèle Aqueli.xlsx",
    example_workbook: "Exemple Aqueli.xlsx",
};

/// Guide anglais, donné dans toutes les langues autres que le français (l'import lit le
/// français et l'anglais).
const ENGLISH: Guide = Guide {
    folder: "Import guide",
    readme: ("README.html", include_str!("../guide/en/README.html")),
    example: ("Example.txt", include_str!("../guide/en/Example.txt")),
    templates: [
        ("Tasks", "Template tasks.csv", include_str!("../guide/en/Template tasks.csv")),
        ("Events", "Template events.csv", include_str!("../guide/en/Template events.csv")),
        ("Obligations", "Template obligations.csv", include_str!("../guide/en/Template obligations.csv")),
        ("Notes", "Template notes.csv", include_str!("../guide/en/Template notes.csv")),
        ("Habits", "Template habits.csv", include_str!("../guide/en/Template habits.csv")),
        ("Contacts", "Template contacts.csv", include_str!("../guide/en/Template contacts.csv")),
        ("Expenses", "Template expenses.csv", include_str!("../guide/en/Template expenses.csv")),
        ("Lists", "Template lists.csv", include_str!("../guide/en/Template lists.csv")),
    ],
    examples: [
        include_str!("../guide/en/examples/Tasks.tsv"),
        include_str!("../guide/en/examples/Events.tsv"),
        include_str!("../guide/en/examples/Obligations.tsv"),
        include_str!("../guide/en/examples/Notes.tsv"),
        include_str!("../guide/en/examples/Habits.tsv"),
        include_str!("../guide/en/examples/Contacts.tsv"),
        include_str!("../guide/en/examples/Expenses.tsv"),
        include_str!("../guide/en/examples/Lists.tsv"),
    ],
    workbook: "Aqueli template.xlsx",
    example_workbook: "Aqueli example.xlsx",
};

/// Guide traduit : la page dans la langue, les modèles et les exemples en anglais (l'import lit
/// les noms de colonnes et les valeurs en français ou en anglais).
const fn translated(folder: &'static str, readme: &'static str) -> Guide {
    Guide { folder, readme: ("README.html", readme), ..ENGLISH }
}

/// Guides des langues autres que le français et l'anglais.
static TRANSLATED: [(Lang, Guide); 15] = [
    (Lang::Es, translated("Guía de importación", include_str!("../guide/es/README.html"))),
    (Lang::Pt, translated("Guia de importação", include_str!("../guide/pt/README.html"))),
    (Lang::De, translated("Importanleitung", include_str!("../guide/de/README.html"))),
    (Lang::It, translated("Guida all'importazione", include_str!("../guide/it/README.html"))),
    (Lang::Nl, translated("Importgids", include_str!("../guide/nl/README.html"))),
    (Lang::Pl, translated("Przewodnik importu", include_str!("../guide/pl/README.html"))),
    (Lang::Ru, translated("Руководство по импорту", include_str!("../guide/ru/README.html"))),
    (Lang::Uk, translated("Посібник з імпорту", include_str!("../guide/uk/README.html"))),
    (Lang::Tr, translated("İçe aktarma kılavuzu", include_str!("../guide/tr/README.html"))),
    (Lang::Hi, translated("आयात मार्गदर्शिका", include_str!("../guide/hi/README.html"))),
    (Lang::Id, translated("Panduan impor", include_str!("../guide/id/README.html"))),
    (Lang::Vi, translated("Hướng dẫn nhập", include_str!("../guide/vi/README.html"))),
    (Lang::Zh, translated("导入指南", include_str!("../guide/zh/README.html"))),
    (Lang::Ja, translated("取り込みガイド", include_str!("../guide/ja/README.html"))),
    (Lang::Ko, translated("가져오기 안내서", include_str!("../guide/ko/README.html"))),
];

/// Fichiers des versions précédentes du guide français, retirés.
const OBSOLETE: [&str; 1] = ["LISEZ-MOI.md"];

fn guide(lang: Lang) -> &'static Guide {
    match lang {
        Lang::Fr => &FRENCH,
        Lang::En => &ENGLISH,
        _ => TRANSLATED.iter().find(|(l, _)| *l == lang).map_or(&ENGLISH, |(_, g)| g),
    }
}

/// Guides de toutes les langues.
fn all_guides() -> impl Iterator<Item = &'static Guide> {
    [&FRENCH, &ENGLISH].into_iter().chain(TRANSLATED.iter().map(|(_, g)| g))
}

/// Dossier du guide d'import dans la langue choisie.
pub fn guide_folder(root: &Path, lang: Lang) -> PathBuf {
    root.join(guide(lang).folder)
}

/// Page du guide, ouverte dans le navigateur.
pub fn readme(root: &Path, lang: Lang) -> PathBuf {
    guide_folder(root, lang).join(guide(lang).readme.0)
}

/// Fichiers du guide : nom et contenu.
fn guide_files(guide: &Guide) -> Vec<(&'static str, Vec<u8>)> {
    let mut files = vec![
        (guide.readme.0, guide.readme.1.as_bytes().to_vec()),
        (guide.example.0, guide.example.1.as_bytes().to_vec()),
    ];
    for (_, name, content) in guide.templates {
        files.push((name, content.as_bytes().to_vec()));
    }
    files.push((guide.workbook, xlsx::workbook(&sheets(guide, false))));
    files.push((guide.example_workbook, xlsx::workbook(&sheets(guide, true))));
    files
}

/// Onglets des classeurs : nom, en-têtes et, pour l'exemple, lignes remplies.
fn sheets(guide: &Guide, examples: bool) -> Vec<xlsx::Sheet<'static>> {
    guide
        .templates
        .iter()
        .zip(guide.examples)
        .map(|((name, _, csv), example)| {
            let header = csv.trim_start_matches('\u{feff}').lines().next().unwrap_or_default();
            let rows = if examples {
                example.lines().skip(1).filter(|l| !l.trim().is_empty()).map(|l| l.split('\t').map(str::trim).collect()).collect()
            } else {
                Vec::new()
            };
            xlsx::Sheet { name, headers: header.split(';').map(str::trim).collect(), rows }
        })
        .collect()
}

/// Crée le dossier d'import et (re)met le guide de la langue choisie à jour. Un fichier ouvert
/// dans un autre logiciel (Excel) est laissé tel quel. Les guides des autres langues sont
/// retirés, sauf les fichiers modifiés par la personne.
pub fn prepare(root: &Path, lang: Lang) -> Result<(), ImportError> {
    fs::create_dir_all(folder(root))?;
    let wanted = guide(lang);
    let dir = root.join(wanted.folder);
    fs::create_dir_all(&dir)?;
    for (name, content) in guide_files(wanted) {
        let path = dir.join(name);
        if fs::read(&path).ok().as_deref() != Some(content.as_slice()) {
            let _ = fs::write(&path, &content);
        }
    }
    for name in OBSOLETE {
        let _ = fs::remove_file(root.join(FRENCH.folder).join(name));
    }
    for other in all_guides().filter(|g| g.folder != wanted.folder) {
        let old = root.join(other.folder);
        if !old.is_dir() {
            continue;
        }
        for (name, content) in guide_files(other) {
            let path = old.join(name);
            if fs::read(&path).ok().as_deref() == Some(content.as_slice()) {
                let _ = fs::remove_file(&path);
            }
        }
        // Seulement s'il ne reste rien dedans.
        let _ = fs::remove_dir(&old);
    }
    Ok(())
}

// ——— Création des éléments ———

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNote {
    pub body: NoteBody,
    pub meta: NoteMeta,
}

/// Éléments d'une liste : liste existante (`list_id`), ou créée d'après `list`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ImportList {
    pub list_id: Option<String>,
    pub list: Option<ListInput>,
    pub items: Vec<ListItemInput>,
}

/// Élément existant remplacé par une ligne du fichier (colonne « Identifiant »).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Replace<T> {
    pub id: String,
    pub input: T,
}

/// Mises à jour d'éléments existants ; aussi les valeurs d'avant, pour annuler l'import.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Updates {
    pub tasks: Vec<Replace<TaskInput>>,
    pub events: Vec<Replace<EventInput>>,
    pub contacts: Vec<Replace<ContactInput>>,
    pub transactions: Vec<Replace<TransactionInput>>,
}

impl Updates {
    fn len(&self) -> usize {
        self.tasks.len() + self.events.len() + self.contacts.len() + self.transactions.len()
    }
}

/// Remplace les éléments existants, dans la transaction ouverte ; `offset` : nombre d'éléments
/// créés avant, de chaque type (place d'une ligne refusée).
fn replace_all(tx: &Connection, updates: &Updates, offsets: [usize; 4], now: u64, today: Day) -> Result<(), ImportFailure> {
    for (i, r) in updates.tasks.iter().enumerate() {
        tasks::update(tx, &r.id, &r.input, now, today).map_err(failed("task", offsets[0] + i))?;
    }
    for (i, r) in updates.events.iter().enumerate() {
        events::update(tx, &r.id, &r.input, now).map_err(failed("event", offsets[1] + i))?;
    }
    for (i, r) in updates.contacts.iter().enumerate() {
        contacts::update(tx, &r.id, &r.input, now).map_err(failed("contact", offsets[2] + i))?;
    }
    for (i, r) in updates.transactions.iter().enumerate() {
        budget::update(tx, &r.id, &r.input, now).map_err(failed("transaction", offsets[3] + i))?;
    }
    Ok(())
}

/// Éléments à créer, préparés et vérifiés par l'aperçu.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Batch {
    pub tasks: Vec<TaskInput>,
    pub events: Vec<EventInput>,
    pub obligations: Vec<ObligationInput>,
    pub notes: Vec<ImportNote>,
    pub habits: Vec<HabitInput>,
    pub contacts: Vec<ContactInput>,
    pub transactions: Vec<TransactionInput>,
    pub lists: Vec<ImportList>,
    /// Éléments existants à remplacer (colonne « Identifiant »).
    pub updates: Updates,
}

/// Identifiants des éléments créés, pour annuler l'import.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Created {
    pub tasks: Vec<String>,
    pub events: Vec<String>,
    pub obligations: Vec<String>,
    pub notes: Vec<String>,
    pub habits: Vec<String>,
    pub contacts: Vec<String>,
    pub transactions: Vec<String>,
    /// Listes créées par l'import (avec leurs éléments).
    pub lists: Vec<String>,
    /// Éléments ajoutés à des listes existantes.
    pub list_items: Vec<String>,
}

/// Élément refusé par la base : son type et sa place dans la liste envoyée.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub kind: Option<&'static str>,
    pub index: Option<usize>,
    pub error: DataError,
}

impl From<DataError> for ImportFailure {
    fn from(error: DataError) -> Self {
        ImportFailure { kind: None, index: None, error }
    }
}

impl From<rusqlite::Error> for ImportFailure {
    fn from(e: rusqlite::Error) -> Self {
        DataError::from(e).into()
    }
}

fn failed(kind: &'static str, index: usize) -> impl Fn(DataError) -> ImportFailure {
    move |error| ImportFailure { kind: Some(kind), index: Some(index), error }
}

/// Crée tous les éléments, ou aucun si l'un d'eux est refusé.
pub fn apply(conn: &mut Connection, batch: &Batch, now: u64, today: Day) -> Result<Created, ImportFailure> {
    let list_items: usize = batch.lists.iter().map(|l| l.items.len()).sum();
    let total = batch.tasks.len()
        + batch.events.len()
        + batch.obligations.len()
        + batch.notes.len()
        + batch.habits.len()
        + batch.contacts.len()
        + batch.transactions.len()
        + list_items
        + batch.updates.len();
    if total > MAX_ITEMS {
        return Err(DataError::TooMany { max: MAX_ITEMS }.into());
    }
    let tx = conn.transaction()?;
    let mut created = Created::default();
    for (i, input) in batch.tasks.iter().enumerate() {
        created.tasks.push(tasks::create(&tx, input, now, today).map_err(failed("task", i))?.id);
    }
    for (i, input) in batch.events.iter().enumerate() {
        created.events.push(events::create(&tx, input, now).map_err(failed("event", i))?.id);
    }
    for (i, input) in batch.obligations.iter().enumerate() {
        created.obligations.push(obligations::create(&tx, input, now).map_err(failed("obligation", i))?.id);
    }
    for (i, note) in batch.notes.iter().enumerate() {
        created.notes.push(notes::insert(&tx, &note.body, &note.meta, now).map_err(failed("note", i))?);
    }
    for (i, input) in batch.habits.iter().enumerate() {
        created.habits.push(habits::create(&tx, input, now).map_err(failed("habit", i))?.id);
    }
    for (i, input) in batch.contacts.iter().enumerate() {
        created.contacts.push(contacts::create(&tx, input, now).map_err(failed("contact", i))?.id);
    }
    for (i, input) in batch.transactions.iter().enumerate() {
        created.transactions.push(budget::create(&tx, input, now).map_err(failed("transaction", i))?.id);
    }
    // Éléments de listes, numérotés à la suite, liste après liste.
    let mut index = 0;
    for group in &batch.lists {
        let list_id = match (&group.list_id, &group.list) {
            (Some(id), _) => id.clone(),
            (None, Some(input)) => {
                let id = lists::create_list(&tx, input, now).map_err(failed("listItem", index))?.id;
                created.lists.push(id.clone());
                id
            }
            (None, None) => return Err(failed("listItem", index)(DataError::NotFound)),
        };
        for item in &group.items {
            let id = lists::create_item(&tx, &list_id, item, now).map_err(failed("listItem", index))?.id;
            if group.list_id.is_some() {
                created.list_items.push(id);
            }
            index += 1;
        }
    }
    // Mises à jour, numérotées après les créations de leur type.
    let offsets = [batch.tasks.len(), batch.events.len(), batch.contacts.len(), batch.transactions.len()];
    replace_all(&tx, &batch.updates, offsets, now, today)?;
    tx.commit()?;
    Ok(created)
}

/// Un élément déjà supprimé depuis n'empêche pas d'annuler le reste.
fn skip_missing(result: Result<(), DataError>) -> Result<(), DataError> {
    match result {
        Err(DataError::NotFound) => Ok(()),
        other => other,
    }
}

/// Annule un import : les éléments créés vont à la corbeille, tous ensemble.
pub fn undo(conn: &mut Connection, created: &Created, restore: &Updates, now: u64, today: Day) -> Result<(), DataError> {
    let tx = conn.transaction()?;
    // Éléments mis à jour : leurs valeurs d'avant reviennent (un élément supprimé depuis est passé).
    for r in &restore.tasks {
        skip_missing(tasks::update(&tx, &r.id, &r.input, now, today).map(|_| ()))?;
    }
    for r in &restore.events {
        skip_missing(events::update(&tx, &r.id, &r.input, now).map(|_| ()))?;
    }
    for r in &restore.contacts {
        skip_missing(contacts::update(&tx, &r.id, &r.input, now).map(|_| ()))?;
    }
    for r in &restore.transactions {
        skip_missing(budget::update(&tx, &r.id, &r.input, now).map(|_| ()))?;
    }
    for id in &created.tasks {
        skip_missing(tasks::delete(&tx, id, now))?;
    }
    for id in &created.events {
        skip_missing(events::delete(&tx, id, now))?;
    }
    for id in &created.obligations {
        skip_missing(obligations::delete(&tx, id, now))?;
    }
    for id in &created.notes {
        skip_missing(notes::delete(&tx, id, now))?;
    }
    for id in &created.habits {
        skip_missing(habits::delete(&tx, id, now))?;
    }
    for id in &created.contacts {
        skip_missing(contacts::delete(&tx, id, now))?;
    }
    for id in &created.transactions {
        skip_missing(budget::delete(&tx, id, now))?;
    }
    for id in &created.lists {
        skip_missing(lists::delete_list(&tx, id, now))?;
    }
    for id in &created.list_items {
        skip_missing(lists::delete_item(&tx, id))?;
    }
    tx.commit()?;
    Ok(())
}

/// Classeur Excel minimal (sans compression) : un onglet par type, en-têtes en gras, cellules
/// au format texte pour que les dates et les heures restent telles qu'elles sont saisies.
mod xlsx {
    const MAIN: &str = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const RELS: &str = "http://schemas.openxmlformats.org/package/2006/relationships";
    const DOC_RELS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const HEAD: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;

    fn escape(text: &str) -> String {
        text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
    }

    fn column(index: usize) -> char {
        (b'A' + index as u8) as char
    }

    /// Onglet : nom, en-têtes (en gras) et lignes.
    pub struct Sheet<'a> {
        pub name: &'a str,
        pub headers: Vec<&'a str>,
        pub rows: Vec<Vec<&'a str>>,
    }

    fn row(number: usize, cells: &[&str], style: u8) -> String {
        let cells: String = cells
            .iter()
            .enumerate()
            .filter(|(_, v)| !v.is_empty())
            .map(|(i, v)| format!(r#"<c r="{}{number}" t="inlineStr" s="{style}"><is><t xml:space="preserve">{}</t></is></c>"#, column(i), escape(v)))
            .collect();
        format!(r#"<row r="{number}">{cells}</row>"#)
    }

    fn sheet(sheet: &Sheet) -> String {
        let last = sheet.headers.len().max(1);
        let mut rows = row(1, &sheet.headers, 1);
        for (i, cells) in sheet.rows.iter().enumerate() {
            rows.push_str(&row(i + 2, cells, 2));
        }
        format!(
            r#"{HEAD}<worksheet xmlns="{MAIN}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="36" style="2" customWidth="1"/><col min="2" max="{last}" width="18" style="2" customWidth="1"/></cols><sheetData>{rows}</sheetData></worksheet>"#
        )
    }

    pub fn workbook(sheets: &[Sheet]) -> Vec<u8> {
        let n = sheets.len();
        let overrides: String = (1..=n)
            .map(|i| format!(r#"<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#))
            .collect();
        let types = format!(
            r#"{HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>{overrides}</Types>"#
        );
        let root_rels = format!(
            r#"{HEAD}<Relationships xmlns="{RELS}"><Relationship Id="rId1" Type="{DOC_RELS}/officeDocument" Target="xl/workbook.xml"/></Relationships>"#
        );
        let sheet_list: String = sheets
            .iter()
            .enumerate()
            .map(|(i, s)| format!(r#"<sheet name="{}" sheetId="{}" r:id="rId{}"/>"#, escape(s.name), i + 1, i + 1))
            .collect();
        let workbook = format!(r#"{HEAD}<workbook xmlns="{MAIN}" xmlns:r="{DOC_RELS}"><sheets>{sheet_list}</sheets></workbook>"#);
        let sheet_rels: String = (1..=n)
            .map(|i| format!(r#"<Relationship Id="rId{i}" Type="{DOC_RELS}/worksheet" Target="worksheets/sheet{i}.xml"/>"#))
            .collect();
        let workbook_rels = format!(
            r#"{HEAD}<Relationships xmlns="{RELS}">{sheet_rels}<Relationship Id="rId{}" Type="{DOC_RELS}/styles" Target="styles.xml"/></Relationships>"#,
            n + 1
        );
        let styles = format!(
            r#"{HEAD}<styleSheet xmlns="{MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>"#
        );
        let mut entries: Vec<(String, Vec<u8>)> = vec![
            ("[Content_Types].xml".into(), types.into_bytes()),
            ("_rels/.rels".into(), root_rels.into_bytes()),
            ("xl/workbook.xml".into(), workbook.into_bytes()),
            ("xl/_rels/workbook.xml.rels".into(), workbook_rels.into_bytes()),
            ("xl/styles.xml".into(), styles.into_bytes()),
        ];
        for (i, s) in sheets.iter().enumerate() {
            entries.push((format!("xl/worksheets/sheet{}.xml", i + 1), sheet(s).into_bytes()));
        }
        zip(&entries)
    }

    pub(super) fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for &byte in bytes {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                let mask = (crc & 1).wrapping_neg();
                crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
            }
        }
        !crc
    }

    /// Archive ZIP sans compression, datée du 1er janvier 2026 (contenu identique d'une
    /// fois sur l'autre).
    pub(super) fn zip(entries: &[(String, Vec<u8>)]) -> Vec<u8> {
        const DOS_TIME: u16 = 0;
        const DOS_DATE: u16 = ((2026 - 1980) << 9) | (1 << 5) | 1;
        const UTF8_NAMES: u16 = 0x0800;
        let mut out = Vec::new();
        let mut central = Vec::new();
        for (name, data) in entries {
            let offset = out.len() as u32;
            let crc = crc32(data);
            let size = data.len() as u32;
            let name = name.as_bytes();
            out.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
            for v in [20u16, UTF8_NAMES, 0, DOS_TIME, DOS_DATE] {
                out.extend_from_slice(&v.to_le_bytes());
            }
            for v in [crc, size, size] {
                out.extend_from_slice(&v.to_le_bytes());
            }
            out.extend_from_slice(&(name.len() as u16).to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(name);
            out.extend_from_slice(data);

            central.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
            for v in [20u16, 20, UTF8_NAMES, 0, DOS_TIME, DOS_DATE] {
                central.extend_from_slice(&v.to_le_bytes());
            }
            for v in [crc, size, size] {
                central.extend_from_slice(&v.to_le_bytes());
            }
            for v in [name.len() as u16, 0, 0, 0, 0] {
                central.extend_from_slice(&v.to_le_bytes());
            }
            central.extend_from_slice(&0u32.to_le_bytes());
            central.extend_from_slice(&offset.to_le_bytes());
            central.extend_from_slice(name);
        }
        let central_offset = out.len() as u32;
        let central_size = central.len() as u32;
        out.extend_from_slice(&central);
        out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
        for v in [0u16, 0, entries.len() as u16, entries.len() as u16] {
            out.extend_from_slice(&v.to_le_bytes());
        }
        out.extend_from_slice(&central_size.to_le_bytes());
        out.extend_from_slice(&central_offset.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;
    use crate::data::habits::Frequency;

    fn open_vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", 1000).unwrap();
        (dir, vault)
    }

    fn task(title: &str) -> TaskInput {
        TaskInput { title: title.into(), ..Default::default() }
    }

    fn today() -> Day {
        Day::parse("2026-09-29").unwrap()
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table} WHERE deleted_at IS NULL"), [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn apply_creates_everything_then_undo_removes_it() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let batch = Batch {
            tasks: vec![task("Appeler le garage"), task("Préparer les cartons")],
            events: vec![EventInput {
                title: "Dentiste".into(),
                start_date: "2026-10-08".into(),
                end_date: "2026-10-08".into(),
                start_time: Some("09:30".into()),
                end_time: Some("10:00".into()),
                ..Default::default()
            }],
            obligations: vec![ObligationInput {
                title: "Assurance habitation".into(),
                category: "assurances".into(),
                due_date: "2026-11-15".into(),
                status: "a-faire".into(),
                ..Default::default()
            }],
            notes: vec![ImportNote {
                body: NoteBody { title: "Idées cadeaux".into(), content: r#"{"type":"doc"}"#.into(), ..Default::default() },
                meta: NoteMeta::default(),
            }],
            habits: vec![HabitInput {
                name: "Lire".into(),
                icon: "livre".into(),
                color: None,
                kind: "quantite".into(),
                negative: false,
                target: 20,
                unit: "pages".into(),
                frequency: Frequency::Jours { days: vec![1, 3, 5] },
                reminder: Some("21:30".into()),
                moment: None,
                space_id: None,
            }],
            contacts: vec![ContactInput { first_name: "Léa".into(), birthday: Some("--05-14".into()), ..Default::default() }],
            ..Default::default()
        };
        let created = apply(c, &batch, 1000, today()).unwrap();
        assert_eq!(
            (created.tasks.len(), created.events.len(), created.obligations.len(), created.notes.len(), created.habits.len()),
            (2, 1, 1, 1, 1)
        );
        assert_eq!(count(c, "tasks"), 2);
        assert_eq!(count(c, "notes"), 1);
        assert_eq!(count(c, "habits"), 1);
        assert_eq!(count(c, "contacts"), 1);

        // Un élément supprimé entre-temps n'empêche pas d'annuler le reste.
        tasks::delete(c, &created.tasks[0], 1100).unwrap();
        undo(c, &created, &Updates::default(), 1200, today()).unwrap();
        for table in ["tasks", "events", "obligations", "notes", "habits", "contacts"] {
            assert_eq!(count(c, table), 0, "{table}");
        }
    }

    #[test]
    fn an_identified_line_updates_the_existing_item_and_undo_brings_it_back() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let before = tasks::create(c, &task("Appeler le garage"), 900, today()).unwrap();
        let spending = budget::create(
            c,
            &TransactionInput { day: "2026-09-26".into(), amount_cents: 4250, kind: "depense".into(), label: "Marché".into(), ..Default::default() },
            900,
        )
        .unwrap();
        let batch = Batch {
            tasks: vec![task("Nouvelle tâche")],
            updates: Updates {
                tasks: vec![Replace { id: before.id.clone(), input: TaskInput { priority: 3, ..task("Appeler le garage avant 18 h") } }],
                transactions: vec![Replace {
                    id: spending.id.clone(),
                    input: TransactionInput { day: "2026-09-26".into(), amount_cents: 3990, kind: "depense".into(), label: "Marché du samedi".into(), ..Default::default() },
                }],
                ..Default::default()
            },
            ..Default::default()
        };
        let created = apply(c, &batch, 1000, today()).unwrap();
        assert_eq!(created.tasks.len(), 1, "seule la nouvelle tâche est créée");
        assert_eq!(count(c, "tasks"), 2);
        let updated = tasks::get(c, &before.id).unwrap();
        assert_eq!((updated.title.as_str(), updated.priority), ("Appeler le garage avant 18 h", 3));
        assert_eq!(budget::get(c, &spending.id).unwrap().amount_cents, 3990);

        // Une ligne refusée parmi les mises à jour : rien n'est fait, et la ligne est désignée.
        let bad = Batch { updates: Updates { tasks: vec![Replace { id: before.id.clone(), input: task("") }], ..Default::default() }, ..Default::default() };
        let failure = apply(c, &bad, 1050, today()).unwrap_err();
        assert_eq!((failure.kind, failure.index), (Some("task"), Some(0)));

        let restore = Updates {
            tasks: vec![Replace { id: before.id.clone(), input: task("Appeler le garage") }],
            transactions: vec![Replace {
                id: spending.id.clone(),
                input: TransactionInput { day: "2026-09-26".into(), amount_cents: 4250, kind: "depense".into(), label: "Marché".into(), ..Default::default() },
            }],
            ..Default::default()
        };
        undo(c, &created, &restore, 1200, today()).unwrap();
        assert_eq!(count(c, "tasks"), 1, "la tâche créée va à la corbeille");
        let back = tasks::get(c, &before.id).unwrap();
        assert_eq!((back.title.as_str(), back.priority), ("Appeler le garage", 0));
        assert_eq!(budget::get(c, &spending.id).unwrap().label, "Marché");
    }

    #[test]
    fn operations_and_list_items_are_imported_then_undone() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let existing = lists::create_list(
            c,
            &ListInput { name: "Courses".into(), template: "courses".into(), sections: vec!["Frais".into()], view: "liste".into(), icon: "panier".into(), ..Default::default() },
            900,
        )
        .unwrap();
        let item = |title: &str| ListItemInput { title: title.into(), ..Default::default() };
        let batch = Batch {
            transactions: vec![
                TransactionInput { day: "2026-09-26".into(), amount_cents: 4250, kind: "depense".into(), category_id: Some("cat-courses".into()), label: "Marché".into(), ..Default::default() },
                TransactionInput { day: "2026-10-01".into(), amount_cents: 245_000, kind: "revenu".into(), label: "Salaire".into(), ..Default::default() },
            ],
            lists: vec![
                ImportList { list_id: Some(existing.id.clone()), list: None, items: vec![ListItemInput { section: Some("Frais".into()), ..item("Lait") }] },
                ImportList {
                    list_id: None,
                    list: Some(ListInput { name: "Livres à lire".into(), template: "livres".into(), view: "galerie".into(), icon: "livre".into(), ..Default::default() }),
                    items: vec![item("Dune"), item("Fondation")],
                },
            ],
            ..Default::default()
        };
        let created = apply(c, &batch, 1000, today()).unwrap();
        assert_eq!((created.transactions.len(), created.lists.len(), created.list_items.len()), (2, 1, 1));
        assert_eq!(count(c, "transactions"), 2);
        assert_eq!(count(c, "lists"), 2);
        let items = |c: &Connection| c.query_row("SELECT COUNT(*) FROM list_items", [], |r| r.get::<_, i64>(0)).unwrap();
        assert_eq!(items(c), 3);

        undo(c, &created, &Updates::default(), 1200, today()).unwrap();
        assert_eq!(count(c, "transactions"), 0);
        assert_eq!(count(c, "lists"), 1, "la liste existante reste ; la liste importée va à la corbeille");
        assert_eq!(c.query_row("SELECT COUNT(*) FROM list_items WHERE list_id = ?1", [&existing.id], |r| r.get::<_, i64>(0)).unwrap(), 0);

        // Un élément refusé (rayon inconnu) annule tout, et l'erreur désigne sa place.
        let bad = Batch {
            transactions: vec![TransactionInput { day: "2026-09-26".into(), amount_cents: 100, kind: "depense".into(), label: "Café".into(), ..Default::default() }],
            lists: vec![ImportList { list_id: Some(existing.id.clone()), list: None, items: vec![item("Pain"), ListItemInput { section: Some("Inconnu".into()), ..item("Beurre") }] }],
            ..Default::default()
        };
        let failure = apply(c, &bad, 1300, today()).unwrap_err();
        assert_eq!((failure.kind, failure.index), (Some("listItem"), Some(1)));
        assert_eq!(count(c, "transactions"), 0);
    }

    #[test]
    fn a_refused_item_cancels_the_whole_import() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let batch = Batch { tasks: vec![task("Valide"), task("   "), task("Autre")], ..Default::default() };
        let failure = apply(c, &batch, 1000, today()).unwrap_err();
        assert_eq!(failure.kind, Some("task"));
        assert_eq!(failure.index, Some(1));
        assert_eq!(count(c, "tasks"), 0);
    }

    #[test]
    fn too_many_items_are_refused() {
        let (_dir, mut vault) = open_vault();
        let c = vault.connection_mut().unwrap();
        let batch = Batch { tasks: vec![task("x"); MAX_ITEMS + 1], ..Default::default() };
        assert_eq!(apply(c, &batch, 1000, today()).unwrap_err().error, DataError::TooMany { max: MAX_ITEMS });
    }

    #[test]
    fn only_readable_files_are_listed() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["tâches.xlsx", "liste.CSV", "notes.md", "a.txt", "agenda.ics", "contacts.VCF", "~$tâches.xlsx", ".cache.txt", "photo.jpg", "macros.xlsm"] {
            fs::write(dir.path().join(name), b"x").unwrap();
        }
        fs::create_dir(dir.path().join("Traités.txt")).unwrap();
        let mut names: Vec<String> = list(dir.path()).into_iter().map(|f| f.name).collect();
        names.sort();
        assert_eq!(names, ["a.txt", "agenda.ics", "contacts.VCF", "liste.CSV", "notes.md", "tâches.xlsx"]);
    }

    #[test]
    fn only_files_directly_in_the_folder_are_inside() {
        let folder = Path::new(r"C:\Users\x\Documents\Aqueli\Import");
        assert!(in_folder(folder, &folder.join("liste.txt")));
        assert!(!in_folder(folder, &folder.join("Traités").join("liste.txt")));
        assert!(!in_folder(folder, &folder.join("..").join("secret.txt")));
        assert!(!in_folder(folder, Path::new(r"C:\Users\x\Documents\liste.txt")));
    }

    #[test]
    fn finish_deletes_or_moves_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path();
        let file = folder.join("liste.txt");
        fs::write(&file, b"un").unwrap();
        finish(folder, &file, false).unwrap();
        assert!(!file.exists());

        fs::write(&file, b"deux").unwrap();
        finish(folder, &file, true).unwrap();
        fs::write(&file, b"trois").unwrap();
        finish(folder, &file, true).unwrap();
        assert_eq!(fs::read(folder.join(DONE).join("liste.txt")).unwrap(), b"deux");
        assert_eq!(fs::read(folder.join(DONE).join("liste (2).txt")).unwrap(), b"trois");

        // Un fichier choisi ailleurs reste où il est.
        let outside = tempfile::tempdir().unwrap();
        let elsewhere = outside.path().join("liste.txt");
        fs::write(&elsewhere, b"x").unwrap();
        finish(folder, &elsewhere, false).unwrap();
        assert!(elsewhere.exists());
    }

    #[test]
    fn guide_is_written_once_and_workbook_is_a_valid_zip() {
        let dir = tempfile::tempdir().unwrap();
        prepare(dir.path(), Lang::Fr).unwrap();
        let guide = guide_folder(dir.path(), Lang::Fr);
        assert!(folder(dir.path()).is_dir());
        fs::write(guide.join("LISEZ-MOI.md"), b"ancien guide").unwrap();
        prepare(dir.path(), Lang::Fr).unwrap();
        for name in ["LISEZ-MOI.html", "Exemple.txt", "Modèle tâches.csv", "Modèle notes.csv", "Modèle habitudes.csv", FRENCH.workbook, FRENCH.example_workbook] {
            assert!(guide.join(name).is_file(), "{name}");
        }
        assert_eq!(readme(dir.path(), Lang::Fr), guide.join("LISEZ-MOI.html"));
        assert!(!guide.join("LISEZ-MOI.md").exists());
        let book = fs::read(guide.join(FRENCH.workbook)).unwrap();
        assert_eq!(&book[..4], b"PK\x03\x04");
        // Fin de l'archive : 13 parties (8 onglets et 5 fichiers de structure).
        let end = &book[book.len() - 22..];
        assert_eq!(&end[..4], &0x0605_4b50u32.to_le_bytes());
        assert_eq!(u16::from_le_bytes([end[10], end[11]]), 13);
        // Contenu identique d'une fois sur l'autre : rien n'est réécrit.
        assert_eq!(xlsx::workbook(&sheets(&FRENCH, false)), book);
        for (guide, first) in [(&FRENCH, ("Tâches", "Titre")), (&ENGLISH, ("Tasks", "Title"))] {
            let examples = sheets(guide, true);
            assert_eq!((examples[0].name, examples[0].headers[0]), first);
            assert!(examples.iter().all(|s| s.headers.len() <= 26 && !s.rows.is_empty()));
            // Chaque ligne d'exemple a au plus autant de cellules que d'en-têtes.
            assert!(examples.iter().all(|s| s.rows.iter().all(|r| r.len() <= s.headers.len())));
        }
    }

    #[test]
    fn guide_follows_the_language() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        prepare(root, Lang::Fr).unwrap();
        // Un modèle rempli par la personne est gardé quand la langue change.
        let french = guide_folder(root, Lang::Fr);
        fs::write(french.join("Modèle tâches.csv"), "Titre\nAppeler le garage\n").unwrap();
        prepare(root, Lang::De).unwrap();
        let german = guide_folder(root, Lang::De);
        for name in ["README.html", "Example.txt", "Template tasks.csv", "Aqueli template.xlsx", "Aqueli example.xlsx"] {
            assert!(german.join(name).is_file(), "{name}");
        }
        assert_eq!(readme(root, Lang::De), german.join("README.html"));
        assert!(fs::read_to_string(german.join("README.html")).unwrap().contains("<html lang=\"de\">"));
        let left: Vec<_> = fs::read_dir(&french).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(left, ["Modèle tâches.csv"]);
        // En anglais : le guide allemand, intact, disparaît avec son dossier.
        prepare(root, Lang::En).unwrap();
        assert!(!german.exists());
        let english = guide_folder(root, Lang::En);
        assert_eq!(english, root.join("Import guide"));
        assert_eq!(readme(root, Lang::En), english.join("README.html"));
        // Retour au français : de même pour le guide anglais.
        prepare(root, Lang::Fr).unwrap();
        assert!(!english.exists());
        assert!(french.join("LISEZ-MOI.html").is_file());
        assert_eq!(fs::read_to_string(french.join("Modèle tâches.csv")).unwrap(), FRENCH.templates[0].2);
    }

    #[test]
    fn each_language_has_its_guide() {
        let codes = ["fr", "en", "es", "pt", "de", "it", "nl", "pl", "ru", "uk", "tr", "hi", "id", "vi", "zh", "ja", "ko"];
        let mut folders = Vec::new();
        for code in codes {
            let lang = Lang::from_code(code).unwrap();
            let guide = guide(lang);
            // Page dans la langue (« pt-BR », « zh-CN » : la langue suffit).
            assert!(guide.readme.1.contains(&format!("<html lang=\"{code}")), "{code}");
            assert!(!guide.folder.is_empty() && !guide.folder.contains(['<', '>', ':', '"', '/', '\\', '|', '?', '*']), "{code}");
            folders.push(guide.folder);
        }
        folders.sort_unstable();
        folders.dedup();
        assert_eq!(folders.len(), codes.len());
    }

    #[test]
    fn crc32_matches_the_reference() {
        assert_eq!(xlsx::crc32(b"123456789"), 0xCBF4_3926);
    }
}
