//! Écriture de fichiers sans risque de coupure ; ouverture d'un dossier ou d'un fichier dans Windows.

use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::Command;

/// Écrit un fichier sans risque de le laisser à moitié écrit : on écrit une copie
/// temporaire, on force son écriture sur le disque, puis on la met à la place de l'ancienne.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)
}

/// Ouvre un dossier dans l'Explorateur, ou un fichier (ou une adresse web) avec le logiciel choisi
/// dans Windows. Le chemin vient toujours du cœur, jamais de l'interface.
pub fn open_with_windows(path: &Path) -> std::io::Result<()> {
    Command::new("explorer.exe").arg(path).spawn().map(|_| ())
}

/// Écrase un fichier (zéros sur toute sa longueur, écrits sur le disque), puis l'efface.
/// Un fichier absent ne compte pas.
pub fn shred(path: &Path) -> std::io::Result<()> {
    let len = match fs::metadata(path) {
        Ok(meta) if meta.is_file() => meta.len(),
        Ok(_) => return Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    {
        let mut file = fs::OpenOptions::new().write(true).open(path)?;
        let zeros = vec![0u8; 64 * 1024];
        let mut left = len;
        while left > 0 {
            let n = left.min(zeros.len() as u64) as usize;
            file.write_all(&zeros[..n])?;
            left -= n as u64;
        }
        file.sync_all()?;
    }
    fs::remove_file(path)
}

/// Écrase puis efface tous les fichiers d'un dossier ; `deep` : ses sous-dossiers aussi (effacés).
pub fn shred_dir(dir: &Path, deep: bool) -> std::io::Result<()> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    for entry in entries {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_file() {
            shred(&entry.path())?;
        } else if kind.is_dir() && deep {
            shred_dir(&entry.path(), true)?;
            fs::remove_dir(entry.path())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_fichier_ecrase_disparait_et_un_dossier_garde_ses_sous_dossiers_si_demande() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.db");
        fs::write(&a, vec![7u8; 200_000]).unwrap();
        shred(&a).unwrap();
        assert!(!a.exists());
        shred(&a).unwrap();

        let keep = dir.path().join("Sauvegardes");
        fs::create_dir(&keep).unwrap();
        fs::write(keep.join("s.aqueli"), b"x").unwrap();
        fs::write(dir.path().join("preferences.json"), b"{}").unwrap();
        shred_dir(dir.path(), false).unwrap();
        assert!(!dir.path().join("preferences.json").exists());
        assert!(keep.join("s.aqueli").exists(), "sous-dossier gardé");
        shred_dir(dir.path(), true).unwrap();
        assert!(!keep.exists());
    }
}
