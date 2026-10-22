//! Mini-lecteur du Focus : une petite fenêtre toujours visible, même hors d'Aqueli, qui montre
//! le temps restant et permet de suspendre, d'arrêter ou de revenir à Aqueli. Elle ne reçoit
//! que l'état du minuteur (phase, temps), jamais le contenu du compte ; ses boutons sont
//! transmis à la fenêtre principale, qui fait tourner le minuteur.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::system::background;

pub const WINDOW: &str = "focus";
/// Nouvel état du minuteur, pour le mini-lecteur.
pub const STATE_EVENT: &str = "focus-etat";
/// Bouton du mini-lecteur, pour la fenêtre principale.
pub const COMMAND_EVENT: &str = "focus-commande";
/// Boutons du mini-lecteur ; « detacher » le ferme et le retire des écrans hors d'Aqueli.
pub const ACTIONS: [&str; 5] = ["basculer", "arreter", "passer", "afficher", "detacher"];

/// État du minuteur : rien de personnel (ni tâche, ni réglage).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniState {
    pub phase: String,
    pub status: String,
    /// Fin de la phase (millisecondes Unix), pendant qu'elle s'écoule.
    pub ends_at: Option<f64>,
    /// Temps restant (millisecondes), à l'arrêt ou suspendu.
    pub remaining: f64,
    /// Durée de la phase (millisecondes).
    pub total: f64,
    pub cycle: u32,
    pub every: u32,
}

/// Dernier état connu, lu par le mini-lecteur à son ouverture.
#[derive(Default)]
pub struct MiniLatest(pub Mutex<Option<MiniState>>);

/// Une action de bouton reconnue.
pub fn is_action(action: &str) -> bool {
    ACTIONS.contains(&action)
}

/// En bas à droite de l'écran de la fenêtre principale, au-dessus de la barre des tâches.
fn place(app: &AppHandle, window: &tauri::WebviewWindow) {
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, window.outer_size()) else {
        return;
    };
    let area = monitor.work_area();
    let margin = (16.0 * monitor.scale_factor()) as i32;
    let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Ouvre (ou ramène) le mini-lecteur.
pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(WINDOW) {
        window.show()?;
        crate::system::discreet::protect(&window);
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("index.html#focus".into()))
        .title("Focus")
        .inner_size(300.0, 84.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    place(app, &window);
    let target = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = target.hide();
        }
    });
    window.show()?;
    crate::system::discreet::protect(&window);
    Ok(())
}

pub fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.hide();
    }
}

/// Garde le dernier état et le transmet au mini-lecteur s'il existe.
pub fn publish(app: &AppHandle, state: MiniState) {
    if let Ok(mut latest) = app.state::<MiniLatest>().0.lock() {
        *latest = Some(state.clone());
    }
    if app.get_webview_window(WINDOW).is_some() {
        let _ = app.emit_to(WINDOW, STATE_EVENT, state);
    }
}

/// Bouton du mini-lecteur : transmis à la fenêtre principale ; « afficher » la ramène.
pub fn command(app: &AppHandle, action: &str) {
    if action == "afficher" {
        background::show_main(app);
    }
    if action == "detacher" {
        close(app);
    }
    let _ = app.emit_to("main", COMMAND_EVENT, action.to_string());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seuls_les_boutons_connus_sont_transmis() {
        for action in ACTIONS {
            assert!(is_action(action));
        }
        assert!(!is_action("supprimer"));
        assert!(!is_action(""));
    }

    #[test]
    fn l_etat_ne_porte_rien_de_personnel() {
        let json = serde_json::to_string(&MiniState { phase: "concentration".into(), status: "en-cours".into(), ..Default::default() }).unwrap();
        for field in ["phase", "status", "endsAt", "remaining", "total", "cycle", "every"] {
            assert!(json.contains(field), "{field}");
        }
        assert!(!json.contains("task"));
    }
}
