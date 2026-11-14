//! Version portable (demande GitHub n° 2) : un fichier `portable.txt` posé à côté d'Aqueli.exe
//! garde tout dans ce dossier. « Data » reçoit les comptes, la base chiffrée, les préférences,
//! les sauvegardes, la position des fenêtres et les données de WebView2 ; « Documents » reçoit
//! le dossier d'import et le guide (au lieu de Documents\Aqueli). Rien n'est écrit dans
//! %APPDATA% ni dans les Documents de Windows. Seuls restent dans Windows les réglages des
//! notifications et, si la personne l'active, le lancement avec Windows (sous un nom à part).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Fichier qui rend Aqueli portable.
pub const MARKER: &str = "portable.txt";
/// Comptes, base chiffrée, préférences, sauvegardes.
pub const DATA: &str = "Data";
/// Dossier d'import et guide d'import.
pub const DOCUMENTS: &str = "Documents";
/// Dossiers de Tauri et de WebView2 (position des fenêtres, cache de l'interface).
const APP: &str = "App";
/// Identifiant à part : la version portable s'ouvre même si la version installée tourne déjà.
pub const IDENTIFIER: &str = "fr.aqueli.portable";

static FOLDER: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Dossier de l'exécutable s'il porte le fichier `portable.txt`.
pub fn folder_of(exe: &Path) -> Option<PathBuf> {
    let dir = exe.parent()?;
    dir.join(MARKER).is_file().then(|| dir.to_path_buf())
}

/// Dossier de la version portable ; `None` pour la version installée.
pub fn folder() -> Option<&'static Path> {
    FOLDER.get_or_init(|| std::env::current_exe().ok().and_then(|exe| folder_of(&exe))).as_deref()
}

pub fn is_portable() -> bool {
    folder().is_some()
}

pub fn data_dir(folder: &Path) -> PathBuf {
    folder.join(DATA)
}

pub fn documents_dir(folder: &Path) -> PathBuf {
    folder.join(DOCUMENTS)
}

pub fn app_dir(folder: &Path) -> PathBuf {
    data_dir(folder).join(APP)
}

/// Raisons de ne pas démarrer, expliquées dans une fenêtre de Windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Problem {
    /// Ouvert depuis l'intérieur du fichier .zip : Windows en a fait une copie temporaire, et
    /// les données y seraient perdues.
    NotExtracted,
    /// Dossier en lecture seule (Program Files, CD…).
    ReadOnly,
}

impl Problem {
    pub fn message(self) -> &'static str {
        match self {
            Problem::NotExtracted => "Extrayez d'abord le dossier d'Aqueli du fichier .zip. Ouvrez ensuite Aqueli.exe depuis ce dossier.",
            Problem::ReadOnly => "Aqueli ne peut pas écrire dans son dossier. Placez le dossier d'Aqueli dans un emplacement modifiable, par exemple Documents ou une clé USB.",
        }
    }
}

fn lower(path: &Path) -> String {
    path.to_string_lossy().to_lowercase()
}

/// Exécutable ouvert depuis un .zip : copie dans le dossier temporaire, sous un dossier au nom
/// du fichier .zip (« Temp1_Aqueli….zip » pour l'Explorateur), ou avec `portable.txt`.
pub fn from_archive(exe: &Path, temp: &Path, marked: bool) -> bool {
    let (exe_text, temp_text) = (lower(exe), lower(temp));
    let temp_text = temp_text.trim_end_matches(['\\', '/']);
    let Some(rest) = exe_text.strip_prefix(temp_text).filter(|r| r.starts_with(['\\', '/'])) else {
        return false;
    };
    marked || rest.split(['\\', '/']).any(|part| part.ends_with(".zip"))
}

/// Le dossier des données se crée et accepte l'écriture.
pub fn writable(data: &Path) -> bool {
    let probe = data.join(".ecriture");
    fs::create_dir_all(data).is_ok() && fs::write(&probe, b"").is_ok() && fs::remove_file(&probe).is_ok()
}

/// Vérifie, avant tout, que la version portable peut garder ses données dans son dossier.
pub fn check() -> Result<(), Problem> {
    let marked = is_portable();
    // En développement, l'exécutable peut vivre n'importe où.
    if cfg!(not(debug_assertions)) {
        let resolve = |p: PathBuf| fs::canonicalize(&p).unwrap_or(p);
        if let Ok(exe) = std::env::current_exe() {
            if from_archive(&resolve(exe), &resolve(std::env::temp_dir()), marked) {
                return Err(Problem::NotExtracted);
            }
        }
    }
    match folder() {
        Some(folder) if !writable(&data_dir(folder)) => Err(Problem::ReadOnly),
        _ => Ok(()),
    }
}

/// Fenêtre de Windows qui explique pourquoi Aqueli ne démarre pas.
pub fn explain(problem: Problem) {
    let lang = folder().map_or_else(crate::lang::system, |f| crate::lang::current(&data_dir(f)));
    let text = crate::lang::text(lang, problem.message());
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};
        // SAFETY: textes UTF-16 vivants pendant tout l'appel, sans fenêtre parente.
        unsafe {
            MessageBoxW(None, &HSTRING::from(text), &HSTRING::from("Aqueli"), MB_OK | MB_ICONINFORMATION);
        }
    }
    #[cfg(not(windows))]
    eprintln!("{text}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_fichier_portable_txt_rend_aqueli_portable() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("Aqueli.exe");
        assert_eq!(folder_of(&exe), None);
        fs::write(dir.path().join(MARKER), "portable").unwrap();
        assert_eq!(folder_of(&exe).as_deref(), Some(dir.path()));
        assert_eq!(data_dir(dir.path()), dir.path().join("Data"));
        assert!(app_dir(dir.path()).starts_with(data_dir(dir.path())));
    }

    #[test]
    fn un_aqueli_ouvert_depuis_le_zip_est_repere() {
        let temp = Path::new(r"C:\Users\Lea\AppData\Local\Temp");
        let explorer = Path::new(r"C:\Users\Lea\AppData\Local\Temp\Temp1_Aqueli_2.0.0_x64-portable.zip\Aqueli\Aqueli.exe");
        assert!(from_archive(explorer, temp, false));
        // Tout le dossier extrait dans le dossier temporaire : les données y seraient perdues.
        let extracted = Path::new(r"C:\Users\Lea\AppData\Local\Temp\7zO1234\Aqueli\Aqueli.exe");
        assert!(from_archive(extracted, temp, true));
        assert!(!from_archive(extracted, temp, false));
        // Dossier ordinaire, ou dossier qui commence seulement comme le dossier temporaire.
        assert!(!from_archive(Path::new(r"D:\Aqueli\Aqueli.exe"), temp, true));
        assert!(!from_archive(Path::new(r"C:\Users\Lea\AppData\Local\Temporaire.zip\Aqueli.exe"), temp, true));
        assert!(from_archive(Path::new(r"c:\users\lea\appdata\local\temp\x.ZIP\Aqueli.exe"), &PathBuf::from(r"C:\Users\Lea\AppData\Local\Temp\"), false));
    }

    #[test]
    fn chaque_explication_est_traduite() {
        for problem in [Problem::NotExtracted, Problem::ReadOnly] {
            assert_ne!(crate::lang::text(crate::lang::Lang::En, problem.message()), problem.message());
        }
    }

    #[test]
    fn un_dossier_modifiable_est_reconnu() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("Data");
        assert!(writable(&data));
        assert!(data.is_dir());
        assert_eq!(fs::read_dir(&data).unwrap().count(), 0, "le fichier d'essai est retiré");
    }
}
