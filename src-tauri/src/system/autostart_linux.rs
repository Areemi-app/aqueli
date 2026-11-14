//! Lancement discret d'Aqueli à l'ouverture de la session Linux : fichier `aqueli.desktop` du
//! dossier `~/.config/autostart` (norme XDG, suivie par GNOME, KDE, Xfce…) ;
//! `aqueli-portable.desktop` pour la version portable, qui suit le dossier s'il change de place.

use std::path::{Path, PathBuf};

/// Argument de lancement : Aqueli démarre verrouillé, sans ouvrir de fenêtre.
pub const BACKGROUND_ARG: &str = "--arriere-plan";

fn file() -> Option<PathBuf> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    let name = if crate::portable::is_portable() { "aqueli-portable.desktop" } else { "aqueli.desktop" };
    Some(config.join("autostart").join(name))
}

/// Programme à lancer : le fichier AppImage lui-même quand Aqueli en vient (le programme
/// extrait change de place à chaque lancement), sinon l'exécutable.
fn program() -> Option<PathBuf> {
    std::env::var_os("APPIMAGE").map(PathBuf::from).or_else(|| std::env::current_exe().ok())
}

/// Chemin entre guillemets, `"`, `` ` ``, `$` et `\` protégés (norme « Desktop Entry », comprise
/// aussi par le terminal).
fn quoted(program: &Path) -> String {
    let mut quoted = String::from('"');
    for c in program.to_string_lossy().chars() {
        if matches!(c, '"' | '`' | '$' | '\\') {
            quoted.push('\\');
        }
        quoted.push(c);
    }
    quoted.push('"');
    quoted
}

/// Contenu du fichier.
fn entry(program: &Path) -> String {
    let exec = quoted(program);
    format!("[Desktop Entry]\nType=Application\nName=Aqueli\nExec={exec} {BACKGROUND_ARG}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n")
}

/// Commande qui lance Aqueli avec `arg` (raccourci du bureau pour la capture rapide).
pub fn command(arg: &str) -> String {
    let program = program().unwrap_or_else(|| PathBuf::from("aqueli"));
    format!("{} {arg}", quoted(&program))
}

pub fn is_enabled() -> bool {
    file().is_some_and(|f| f.is_file())
}

/// Active ou désactive le lancement à l'ouverture de la session.
pub fn set(enabled: bool) -> Result<(), String> {
    let file = file().ok_or("dossier personnel introuvable")?;
    if enabled {
        let program = program().ok_or("programme introuvable")?;
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        crate::files::write_atomic(&file, entry(&program).as_bytes()).map_err(|e| e.to_string())
    } else {
        match std::fs::remove_file(&file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_fichier_lance_aqueli_en_arriere_plan() {
        let text = entry(Path::new("/opt/Aqueli/aqueli"));
        assert!(text.starts_with("[Desktop Entry]\nType=Application\n"));
        assert!(text.contains("Exec=\"/opt/Aqueli/aqueli\" --arriere-plan\n"));
    }

    #[test]
    fn un_chemin_avec_des_signes_reste_un_seul_argument() {
        let text = entry(Path::new("/home/léa/Mes \"apps\"/$HOME/aqueli"));
        assert!(text.contains(r#"Exec="/home/léa/Mes \"apps\"/\$HOME/aqueli" --arriere-plan"#));
    }
}
