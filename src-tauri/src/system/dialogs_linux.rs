//! Fenêtres standard de Linux pour choisir un dossier, ouvrir un fichier ou enregistrer un export :
//! `FileChooserNative` de GTK, qui passe par le portail du bureau quand il existe (Flatpak, GNOME,
//! KDE). GTK fait déjà partie de Tauri sous Linux : aucune bibliothèque de plus.
//!
//! Les appels arrivent d'un fil de travail ; GTK ne se pilote que depuis le fil principal. La
//! fenêtre y est donc ouverte (`run_on_main_thread`), et le fil de travail attend la réponse.

use std::path::{Path, PathBuf};
use std::sync::mpsc;

use gtk::prelude::*;
use tauri::{AppHandle, Manager};

/// Ce qu'on choisit (mêmes cas que sous Windows).
pub enum Pick<'a> {
    Folder { title: &'a str },
    /// `folder` : dossier affiché à l'ouverture (celui des sauvegardes).
    OpenFile { title: &'a str, filter: (&'a str, &'a str), folder: Option<&'a Path> },
    SaveFile { title: &'a str, filter: (&'a str, &'a str), default_name: &'a str, extension: &'a str },
}

/// Demande telle qu'elle part vers le fil principal (sans emprunt).
struct Request {
    title: String,
    action: gtk::FileChooserAction,
    filter: Option<(String, Vec<String>)>,
    folder: Option<PathBuf>,
    name: Option<String>,
    multiple: bool,
}

/// Motifs d'un filtre écrit à la Windows (« *.xlsx;*.csv ») : GTK distingue les majuscules, le
/// motif en majuscules est donc ajouté aussi (« RELEVE.CSV »).
fn patterns(spec: &str) -> Vec<String> {
    let mut out = Vec::new();
    // « *.* » (tous les fichiers sous Windows) ne garderait que les noms à point.
    for p in spec.split(';').map(str::trim).filter(|p| !p.is_empty()).map(|p| if p == "*.*" { "*" } else { p }) {
        for v in [p.to_string(), p.to_uppercase()] {
            if !out.contains(&v) {
                out.push(v);
            }
        }
    }
    out
}

/// Ajoute l'extension prévue si la personne ne l'a pas écrite (comme Windows).
fn with_extension(path: PathBuf, extension: &str) -> PathBuf {
    let has = path.extension().is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case(extension));
    if has || extension.is_empty() {
        return path;
    }
    let mut name = path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(format!(".{extension}"));
    path.with_file_name(name)
}

/// Ouvre la fenêtre au-dessus de la fenêtre principale, sur le fil principal, et attend le choix.
fn show(app: &AppHandle, request: Request) -> Vec<PathBuf> {
    let (tx, rx) = mpsc::channel();
    let handle = app.clone();
    let sent = app.run_on_main_thread(move || {
        let parent = handle.get_webview_window("main").and_then(|w| w.gtk_window().ok());
        let dialog = gtk::FileChooserNative::new(Some(&request.title), parent.as_ref(), request.action, None, None);
        dialog.set_modal(true);
        dialog.set_select_multiple(request.multiple);
        if request.action == gtk::FileChooserAction::Save {
            dialog.set_do_overwrite_confirmation(true);
        }
        if let Some((name, list)) = &request.filter {
            let filter = gtk::FileFilter::new();
            filter.set_name(Some(name));
            for p in list {
                filter.add_pattern(p);
            }
            dialog.add_filter(filter);
        }
        // Dossier d'ouverture : celui demandé, sinon les Documents de la personne (comme Windows),
        // et non le dossier d'où Aqueli a été lancé.
        let start = request.folder.clone().or_else(|| handle.path().document_dir().ok()).or_else(|| handle.path().home_dir().ok());
        if let Some(folder) = start.filter(|f| f.is_dir()) {
            let _ = dialog.set_current_folder(folder);
        }
        if let Some(name) = &request.name {
            dialog.set_current_name(name);
        }
        let chosen = if dialog.run() == gtk::ResponseType::Accept { dialog.filenames() } else { Vec::new() };
        dialog.destroy();
        let _ = tx.send(chosen);
    });
    if sent.is_err() {
        return Vec::new();
    }
    rx.recv().unwrap_or_default()
}

/// `None` : la personne a annulé, ou la fenêtre n'a pas pu s'ouvrir.
pub fn pick(app: &AppHandle, what: Pick) -> Option<PathBuf> {
    match what {
        Pick::Folder { title } => show(
            app,
            Request { title: title.into(), action: gtk::FileChooserAction::SelectFolder, filter: None, folder: None, name: None, multiple: false },
        )
        .into_iter()
        .next(),
        Pick::OpenFile { title, filter, folder } => show(
            app,
            Request {
                title: title.into(),
                action: gtk::FileChooserAction::Open,
                filter: Some((filter.0.into(), patterns(filter.1))),
                folder: folder.map(Path::to_path_buf),
                name: None,
                multiple: false,
            },
        )
        .into_iter()
        .next(),
        Pick::SaveFile { title, filter, default_name, extension } => show(
            app,
            Request {
                title: title.into(),
                action: gtk::FileChooserAction::Save,
                filter: Some((filter.0.into(), patterns(filter.1))),
                folder: None,
                name: Some(default_name.into()),
                multiple: false,
            },
        )
        .into_iter()
        .next()
        .map(|p| with_extension(p, extension)),
    }
}

/// Fenêtre « Ouvrir » qui accepte plusieurs fichiers de tout type (documents) ; vide si la
/// personne a annulé.
pub fn pick_files(app: &AppHandle, title: &str) -> Vec<PathBuf> {
    show(app, Request { title: title.into(), action: gtk::FileChooserAction::Open, filter: None, folder: None, name: None, multiple: true })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_filtre_a_la_windows_donne_ses_motifs_en_minuscules_et_en_majuscules() {
        assert_eq!(patterns("*.xlsx;*.csv"), ["*.xlsx", "*.XLSX", "*.csv", "*.CSV"]);
        assert_eq!(patterns("*.aqueli"), ["*.aqueli", "*.AQUELI"]);
        assert_eq!(patterns("*.*"), ["*"]);
    }

    #[test]
    fn l_extension_prevue_s_ajoute_si_elle_manque() {
        assert_eq!(with_extension(PathBuf::from("/tmp/Export"), "aqueli"), PathBuf::from("/tmp/Export.aqueli"));
        assert_eq!(with_extension(PathBuf::from("/tmp/Export.AQUELI"), "aqueli"), PathBuf::from("/tmp/Export.AQUELI"));
        assert_eq!(with_extension(PathBuf::from("/tmp/notes.v2"), "md"), PathBuf::from("/tmp/notes.v2.md"));
    }
}
