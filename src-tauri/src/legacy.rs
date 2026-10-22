//! Ancien nom de l'application : Aqualis. Au premier lancement sous le nom Aqueli, les
//! dossiers et fichiers créés sous l'ancien nom sont renommés, sans rien perdre.

use std::fs;
use std::path::{Path, PathBuf};

/// Dossier des données sous l'ancien nom (%APPDATA%\Aqualis).
pub const OLD_DATA_FOLDER: &str = "Aqualis";
/// Identifiant de l'application sous l'ancien nom : Windows et WebView2 y rangent la
/// position de la fenêtre (%APPDATA%) et les préférences d'affichage (%LOCALAPPDATA%).
pub const OLD_IDENTIFIER: &str = "fr.aqualis.desktop";
/// Fichier de la base sous l'ancien nom.
pub const OLD_DB_FILE: &str = "aqualis.db";
/// Clé Windows Hello créée sous l'ancien nom : toujours acceptée.
pub const OLD_HELLO_KEY: &str = "Aqualis";

/// Renomme chaque couple (ancien, nouveau), dans l'ordre, tout ou rien. Un ancien chemin
/// absent est ignoré ; un nouveau chemin déjà présent l'emporte (l'ancien reste en place).
/// Si un renommage échoue (fichier ouvert par un autre programme), ceux déjà faits sont
/// annulés et la fonction renvoie `false` : les anciens noms restent en usage.
pub fn rename_all(pairs: &[(PathBuf, PathBuf)]) -> bool {
    let mut done: Vec<&(PathBuf, PathBuf)> = Vec::new();
    for pair in pairs {
        let (old, new) = pair;
        if !old.exists() || new.exists() {
            continue;
        }
        if fs::rename(old, new).is_err() {
            for (old, new) in done.into_iter().rev() {
                let _ = fs::rename(new, old);
            }
            return false;
        }
        done.push(pair);
    }
    true
}

/// Dossier à utiliser : `new`, après y avoir renommé `old` s'il existe ; `old` si ce
/// renommage a échoué, pour ne jamais présenter un dossier vide à la place des données.
pub fn adopt_dir(old: &Path, new: &Path) -> PathBuf {
    if rename_all(&[(old.to_path_buf(), new.to_path_buf())]) {
        new.to_path_buf()
    } else {
        old.to_path_buf()
    }
}

/// Renomme les dossiers rangés sous l'identifiant de l'application. À faire avant la
/// création de la fenêtre, qui les ouvre.
pub fn adopt_app_folders(identifier: &str) {
    for var in ["APPDATA", "LOCALAPPDATA"] {
        if let Some(base) = std::env::var_os(var).map(PathBuf::from) {
            adopt_dir(&base.join(OLD_IDENTIFIER), &base.join(identifier));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    #[test]
    fn un_dossier_est_renomme_avec_son_contenu() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("Ancien");
        let new = root.path().join("Nouveau");
        write(&old.join("donnees.txt"), "conservé");

        assert_eq!(adopt_dir(&old, &new), new);
        assert!(!old.exists());
        assert_eq!(fs::read_to_string(new.join("donnees.txt")).unwrap(), "conservé");
    }

    #[test]
    fn sans_ancien_dossier_le_nouveau_est_utilise() {
        let root = tempfile::tempdir().unwrap();
        let new = root.path().join("Nouveau");
        assert_eq!(adopt_dir(&root.path().join("Ancien"), &new), new);
        assert!(!new.exists(), "rien n'est créé");
    }

    #[test]
    fn un_nouveau_dossier_existant_l_emporte() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("Ancien");
        let new = root.path().join("Nouveau");
        write(&old.join("a.txt"), "ancien");
        write(&new.join("a.txt"), "nouveau");

        assert_eq!(adopt_dir(&old, &new), new);
        assert_eq!(fs::read_to_string(new.join("a.txt")).unwrap(), "nouveau");
        assert_eq!(fs::read_to_string(old.join("a.txt")).unwrap(), "ancien", "l'ancien n'est pas effacé");
    }

    #[test]
    fn un_echec_annule_les_renommages_deja_faits() {
        let root = tempfile::tempdir().unwrap();
        let (a_old, a_new) = (root.path().join("a.ancien"), root.path().join("a.nouveau"));
        let b_old = root.path().join("b.ancien");
        // Destination impossible : son dossier parent n'existe pas.
        let b_new = root.path().join("introuvable").join("b.nouveau");
        write(&a_old, "a");
        write(&b_old, "b");

        assert!(!rename_all(&[(a_old.clone(), a_new.clone()), (b_old.clone(), b_new)]));
        assert!(a_old.exists() && b_old.exists(), "tout reste sous l'ancien nom");
        assert!(!a_new.exists());
    }

    #[test]
    fn un_dossier_introuvable_renvoie_l_ancien_chemin() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("Ancien");
        write(&old.join("a.txt"), "a");
        let new = root.path().join("introuvable").join("Nouveau");
        assert_eq!(adopt_dir(&old, &new), old);
    }
}
