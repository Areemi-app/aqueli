//! Emplacement des données (cahier des charges § 9 : « déplaçable vers un autre disque dans les
//! Paramètres »). Les données vivent d'origine dans %APPDATA%\Aqueli ; si elles sont déplacées,
//! ce dossier ne garde qu'un petit fichier qui indique le nouvel emplacement.
//!
//! Le déplacement copie tout, vérifie la copie octet par octet, inscrit le nouvel emplacement,
//! puis seulement écrase et efface l'ancien : une coupure en cours de route ne perd rien.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::files::{shred, write_atomic};

/// Fichier du dossier d'origine qui indique où sont les données.
pub const POINTER_FILE: &str = "emplacement.json";
/// Nom du dossier créé dans le dossier choisi.
pub const FOLDER: &str = "Aqueli";

#[derive(Debug, Serialize, Deserialize)]
struct Pointer {
    dossier: String,
}

/// Où sont les données : le dossier d'origine, ou celui qu'indique son fichier d'emplacement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Location {
    pub dir: PathBuf,
    /// Les données ont été déplacées hors du dossier d'origine.
    pub moved: bool,
}

pub fn read_pointer(default_dir: &Path) -> Option<PathBuf> {
    let bytes = fs::read(default_dir.join(POINTER_FILE)).ok()?;
    let pointer: Pointer = serde_json::from_slice(&bytes).ok()?;
    let dir = PathBuf::from(pointer.dossier);
    dir.is_absolute().then_some(dir)
}

pub fn resolve(default_dir: &Path) -> Location {
    match read_pointer(default_dir) {
        Some(dir) if dir != default_dir => Location { dir, moved: true },
        _ => Location { dir: default_dir.to_path_buf(), moved: false },
    }
}

/// Emplacement des données pour cette session.
#[derive(Debug, Clone)]
pub struct Place {
    /// Dossier d'origine (%APPDATA%\Aqueli), qui garde le fichier d'emplacement.
    pub default_dir: PathBuf,
    pub location: Location,
    /// Faux en développement avec AQUELI_DATA_DIR : le dossier d'origine réel n'est jamais touché.
    pub movable: bool,
}

pub struct PlaceState(pub Place);

impl MoveError {
    /// Code et précision envoyés à l'interface.
    pub fn parts(&self) -> (&'static str, String) {
        match self {
            MoveError::Same => ("meme", String::new()),
            MoveError::Nested => ("imbrique", String::new()),
            MoveError::NotEmpty => ("occupe", String::new()),
            MoveError::Copy(detail) => ("copie", detail.clone()),
            MoveError::Verify => ("verification", String::new()),
        }
    }
}

/// Raisons d'un refus, traduites par l'interface.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MoveError {
    /// Le dossier choisi est déjà celui des données.
    Same,
    /// L'un des deux dossiers est dans l'autre.
    Nested,
    /// Le dossier choisi contient déjà des fichiers.
    NotEmpty,
    /// Copie impossible (place, droits…), rien n'a changé.
    Copy(String),
    /// La copie ne correspond pas à l'original, rien n'a changé.
    Verify,
}

/// Dossier qui recevra les données, d'après le dossier choisi : lui-même s'il s'appelle
/// « Aqueli » et qu'il est vide, sinon un dossier « Aqueli » créé dedans.
pub fn target_in(chosen: &Path) -> PathBuf {
    let named = chosen.file_name().is_some_and(|n| n.eq_ignore_ascii_case(FOLDER));
    if named && is_empty_dir(chosen) {
        chosen.to_path_buf()
    } else {
        chosen.join(FOLDER)
    }
}

fn is_empty_dir(dir: &Path) -> bool {
    fs::read_dir(dir).map(|mut entries| entries.next().is_none()).unwrap_or(false)
}

/// Le dossier d'origine reste « vide » s'il ne contient que son fichier d'emplacement.
fn is_free(target: &Path, default_dir: &Path) -> bool {
    match fs::read_dir(target) {
        Err(_) => true,
        Ok(entries) => entries.flatten().all(|e| target == default_dir && e.file_name() == POINTER_FILE),
    }
}

fn normalize(p: &Path) -> PathBuf {
    PathBuf::from(p.to_string_lossy().trim_end_matches(['\\', '/']).to_lowercase())
}

pub fn check_target(source: &Path, target: &Path, default_dir: &Path) -> Result<(), MoveError> {
    let (s, t) = (normalize(source), normalize(target));
    if s == t {
        return Err(MoveError::Same);
    }
    if t.starts_with(&s) || s.starts_with(&t) {
        return Err(MoveError::Nested);
    }
    if !is_free(target, default_dir) {
        return Err(MoveError::NotEmpty);
    }
    Ok(())
}

/// Copie récursive ; `skip` : nom de fichier laissé de côté à la racine.
fn copy_tree(source: &Path, target: &Path, skip: Option<&str>) -> std::io::Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        if skip.is_some_and(|s| name == s) {
            continue;
        }
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_tree(&entry.path(), &target.join(&name), None)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), target.join(&name))?;
            // Écrit sur le disque avant la vérification (Windows exige l'ouverture en écriture).
            fs::OpenOptions::new().write(true).open(target.join(&name))?.sync_all()?;
        }
    }
    Ok(())
}

fn same_file(a: &Path, b: &Path) -> std::io::Result<bool> {
    if fs::metadata(a)?.len() != fs::metadata(b)?.len() {
        return Ok(false);
    }
    let (mut fa, mut fb) = (fs::File::open(a)?, fs::File::open(b)?);
    let (mut ba, mut bb) = (vec![0u8; 256 * 1024], vec![0u8; 256 * 1024]);
    loop {
        let n = fa.read(&mut ba)?;
        if n == 0 {
            return Ok(true);
        }
        fb.read_exact(&mut bb[..n])?;
        if ba[..n] != bb[..n] {
            return Ok(false);
        }
    }
}

/// Chaque fichier de `source` (sauf `skip`) existe dans `target`, identique.
fn verify_tree(source: &Path, target: &Path, skip: Option<&str>) -> std::io::Result<bool> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        if skip.is_some_and(|s| name == s) {
            continue;
        }
        let kind = entry.file_type()?;
        let ok = if kind.is_dir() {
            verify_tree(&entry.path(), &target.join(&name), None)?
        } else if kind.is_file() {
            same_file(&entry.path(), &target.join(&name))?
        } else {
            true
        };
        if !ok {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Écrase et efface le contenu d'un dossier, sauf `keep` à sa racine.
fn shred_except(dir: &Path, keep: Option<&str>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if keep.is_some_and(|k| entry.file_name() == k) {
            continue;
        }
        let kind = entry.file_type()?;
        if kind.is_dir() {
            crate::files::shred_dir(&entry.path(), true)?;
            fs::remove_dir(entry.path())?;
        } else if kind.is_file() {
            shred(&entry.path())?;
        }
    }
    Ok(())
}

/// Déplace les données de `source` vers `target` (le compte doit être fermé). Une fois la copie
/// vérifiée, le nouvel emplacement est inscrit dans le dossier d'origine, puis l'ancien est effacé.
pub fn move_data(source: &Path, target: &Path, default_dir: &Path) -> Result<(), MoveError> {
    check_target(source, target, default_dir)?;
    let created = !target.exists();
    // Le fichier d'emplacement reste dans le dossier d'origine : il n'est jamais copié.
    let skip = (source == default_dir).then_some(POINTER_FILE);
    let undo = |e: MoveError| {
        if created {
            let _ = fs::remove_dir_all(target);
        }
        e
    };
    copy_tree(source, target, skip).map_err(|e| undo(MoveError::Copy(e.kind().to_string())))?;
    match verify_tree(source, target, skip) {
        Ok(true) => {}
        Ok(false) => return Err(undo(MoveError::Verify)),
        Err(e) => return Err(undo(MoveError::Copy(e.kind().to_string()))),
    }
    // Nouvel emplacement inscrit avant tout effacement.
    let pointer_written = if target == default_dir {
        fs::remove_file(default_dir.join(POINTER_FILE)).or_else(|e| if e.kind() == std::io::ErrorKind::NotFound { Ok(()) } else { Err(e) })
    } else {
        fs::create_dir_all(default_dir).and_then(|_| {
            let pointer = Pointer { dossier: target.to_string_lossy().into_owned() };
            write_atomic(&default_dir.join(POINTER_FILE), &serde_json::to_vec_pretty(&pointer).unwrap_or_default())
        })
    };
    pointer_written.map_err(|e| undo(MoveError::Copy(e.kind().to_string())))?;
    // L'ancien emplacement : écrasé puis effacé (le dossier d'origine garde son fichier d'emplacement).
    let _ = shred_except(source, skip);
    if source != default_dir {
        let _ = fs::remove_dir(source);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fill(dir: &Path) {
        fs::create_dir_all(dir.join("Sauvegardes")).unwrap();
        fs::write(dir.join("aqueli.db"), vec![42u8; 300_000]).unwrap();
        fs::write(dir.join("coffre.json"), b"{\"v\":1}").unwrap();
        fs::write(dir.join("Sauvegardes").join("2026-10-08.aqueli"), b"sauvegarde").unwrap();
    }

    #[test]
    fn les_donnees_partent_ailleurs_puis_reviennent_au_dossier_d_origine() {
        let root = tempfile::tempdir().unwrap();
        let default_dir = root.path().join("AppData").join("Aqueli");
        fill(&default_dir);
        let chosen = root.path().join("Disque E");
        fs::create_dir_all(&chosen).unwrap();
        let target = target_in(&chosen);
        assert_eq!(target, chosen.join("Aqueli"));

        move_data(&default_dir, &target, &default_dir).unwrap();
        assert_eq!(resolve(&default_dir), Location { dir: target.clone(), moved: true });
        assert_eq!(fs::read(target.join("aqueli.db")).unwrap(), vec![42u8; 300_000]);
        assert!(target.join("Sauvegardes").join("2026-10-08.aqueli").exists());
        let left: Vec<_> = fs::read_dir(&default_dir).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(left, vec![std::ffi::OsString::from(POINTER_FILE)], "seul le fichier d'emplacement reste");

        move_data(&target, &default_dir, &default_dir).unwrap();
        assert_eq!(resolve(&default_dir), Location { dir: default_dir.clone(), moved: false });
        assert!(default_dir.join("aqueli.db").exists());
        assert!(!default_dir.join(POINTER_FILE).exists());
        assert!(!target.exists(), "l'ancien emplacement est effacé");
    }

    #[test]
    fn un_dossier_occupe_ou_imbrique_est_refuse_sans_rien_changer() {
        let root = tempfile::tempdir().unwrap();
        let default_dir = root.path().join("Aqueli");
        fill(&default_dir);
        assert_eq!(check_target(&default_dir, &default_dir, &default_dir), Err(MoveError::Same));
        assert_eq!(check_target(&default_dir, &default_dir.join("Sauvegardes").join("Aqueli"), &default_dir), Err(MoveError::Nested));
        let busy = root.path().join("Occupé");
        fs::create_dir_all(&busy).unwrap();
        fs::write(busy.join("autre.txt"), b"x").unwrap();
        assert_eq!(move_data(&default_dir, &busy, &default_dir), Err(MoveError::NotEmpty));
        assert!(busy.join("autre.txt").exists() && default_dir.join("aqueli.db").exists());
        // Un dossier « Aqueli » vide choisi tel quel est utilisé directement.
        let empty = root.path().join("E").join("Aqueli");
        fs::create_dir_all(&empty).unwrap();
        assert_eq!(target_in(&empty), empty);
    }

    #[test]
    fn un_fichier_d_emplacement_abime_ramene_au_dossier_d_origine() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join(POINTER_FILE), b"pas du json").unwrap();
        assert_eq!(resolve(root.path()), Location { dir: root.path().to_path_buf(), moved: false });
        fs::write(root.path().join(POINTER_FILE), b"{\"dossier\":\"relatif\\\\Aqueli\"}").unwrap();
        assert!(!resolve(root.path()).moved, "un chemin relatif est ignoré");
    }
}
