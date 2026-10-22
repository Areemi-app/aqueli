//! Journal de diagnostic local (cahier des charges § 9) : ce que fait Aqueli en arrière-plan,
//! pour comprendre une panne. Jamais de contenu personnel : ni titre, ni texte, ni secret.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::commands::DataDir;

pub const LOG_FILE: &str = "diagnostic.log";
/// Au-delà, le journal repart de zéro (l'ancien est gardé à côté).
const MAX_BYTES: u64 = 256 * 1024;

/// Ajoute une ligne « [secondes Unix] message ».
pub fn log(dir: &Path, message: &str) {
    let path = dir.join(LOG_FILE);
    if fs::metadata(&path).is_ok_and(|m| m.len() > MAX_BYTES) {
        let _ = fs::rename(&path, dir.join(format!("{LOG_FILE}.ancien")));
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "[{}] {message}", crate::unix_now());
    }
}

/// Ajoute une ligne au journal, dans le dossier des données d'Aqueli.
pub fn note(app: &AppHandle, message: &str) {
    if let Some(dir) = app.try_state::<DataDir>() {
        log(&dir.0, message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_lignes_s_ajoutent_avec_l_heure() {
        let dir = tempfile::tempdir().unwrap();
        log(dir.path(), "rappels : 1 à l'heure");
        log(dir.path(), "notification : affichée");
        let text = fs::read_to_string(dir.path().join(LOG_FILE)).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with('[') && lines[0].ends_with("rappels : 1 à l'heure"));
    }

    #[test]
    fn un_journal_trop_gros_repart_de_zero() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join(LOG_FILE),
            vec![b'x'; MAX_BYTES as usize + 1],
        )
        .unwrap();
        log(dir.path(), "nouveau");
        assert!(dir.path().join("diagnostic.log.ancien").exists());
        assert!(fs::read_to_string(dir.path().join(LOG_FILE))
            .unwrap()
            .ends_with("nouveau\n"));
    }
}
