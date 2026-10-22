//! Note ouverte dans sa propre fenêtre (bouton « Ouvrir dans une fenêtre » de l'éditeur).
//! Une fenêtre par note, à son nom « note-<identifiant> » ; elle ne voit que les notes et les
//! espaces (capabilities/note.json). Elle se ferme dès que le compte se verrouille, et la
//! fenêtre principale est prévenue de ce qui s'y passe (ouverture, fermeture, enregistrement).

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

/// Début du nom de chaque fenêtre de note.
pub const PREFIX: &str = "note-";
/// Pour la fenêtre principale : identifiants des notes ouvertes à part.
pub const LIST_EVENT: &str = "notes-fenetres";
/// Pour la fenêtre principale : une note a été modifiée dans sa fenêtre.
pub const SAVED_EVENT: &str = "note-enregistree";
/// Pour la fenêtre principale : ouvrir cette note (lien suivi, « Ramener dans Aqueli »).
pub const OPEN_EVENT: &str = "note-ouvrir";
/// Pour la fenêtre principale : la personne est active dans une fenêtre de note.
pub const ACTIVITY_EVENT: &str = "activite";
/// Pour les fenêtres de note : enregistrer tout de suite (verrouillage imminent).
pub const FLUSH_EVENT: &str = "note-enregistrer";

/// Identifiant de note admis dans un nom de fenêtre (ceux du cœur sont hexadécimaux).
pub fn is_note_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn label_of(id: &str) -> String {
    format!("{PREFIX}{id}")
}

/// Note d'une fenêtre, d'après son nom.
pub fn note_of(label: &str) -> Option<&str> {
    label.strip_prefix(PREFIX).filter(|id| is_note_id(id))
}

/// Notes ouvertes dans leur fenêtre.
pub fn open_notes(app: &AppHandle) -> Vec<String> {
    let mut ids: Vec<String> = app.webview_windows().keys().filter_map(|l| note_of(l).map(String::from)).collect();
    ids.sort();
    ids
}

fn announce(app: &AppHandle) {
    let _ = app.emit_to("main", LIST_EVENT, open_notes(app));
}

/// Ouvre (ou ramène au premier plan) la fenêtre d'une note.
pub fn open(app: &AppHandle, id: &str, title: &str) -> tauri::Result<()> {
    let label = label_of(id);
    if let Some(window) = app.get_webview_window(&label) {
        window.unminimize()?;
        window.show()?;
        window.set_focus()?;
        crate::system::discreet::protect(&window);
        return Ok(());
    }
    let window: WebviewWindow = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(format!("index.html#note={id}").into()))
        .title(format!("{title} · Aqueli"))
        .inner_size(780.0, 860.0)
        .min_inner_size(460.0, 420.0)
        .decorations(false)
        .transparent(true)
        .visible(false)
        .build()?;
    // Montrée par l'interface une fois dessinée (`revealWindow`), qui applique alors le mode discret.
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            announce(&handle);
        }
    });
    announce(app);
    Ok(())
}

/// Ferme toutes les fenêtres de note (verrouillage du compte).
pub fn close_all(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if note_of(&label).is_some() {
            let _ = window.destroy();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_nom_d_une_fenetre_de_note_porte_son_identifiant_et_rien_d_autre() {
        assert_eq!(label_of("a1b2"), "note-a1b2");
        assert_eq!(note_of("note-a1b2"), Some("a1b2"));
        assert_eq!(note_of("main"), None);
        assert_eq!(note_of("note-"), None);
        assert_eq!(note_of("note-../x"), None);
        assert!(!is_note_id(&"a".repeat(65)));
        assert!(is_note_id("0f3a-9c_2"));
    }
}
