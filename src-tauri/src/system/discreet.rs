//! Mode discret (cahier des charges § 8) : le contenu des fenêtres d'Aqueli est exclu des
//! captures et des partages d'écran (Windows les montre vides).

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::prefs::Prefs;

static ENABLED: AtomicBool = AtomicBool::new(false);

/// Réglage enregistré par l'interface (Paramètres › Sécurité), dans ses préférences d'affichage.
pub fn from_prefs(prefs: &Prefs) -> bool {
    prefs
        .get("preferences")
        .and_then(|p| p.get("discreetMode"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Applique le réglage à une fenêtre affichée : chaque fenêtre l'appelle juste après s'être
/// montrée. Une fenêtre encore cachée (capture rapide préparée d'avance, fenêtre principale
/// avant son premier affichage) est laissée de côté : Windows peut l'afficher, vide et
/// impossible à fermer, quand on change ce réglage.
pub fn protect(window: &WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.set_content_protected(ENABLED.load(Ordering::Relaxed));
    }
}

/// Active ou coupe le mode discret pour les fenêtres affichées et celles à venir.
pub fn set(app: &AppHandle, enabled: bool) {
    ENABLED.store(enabled, Ordering::Relaxed);
    for window in app.webview_windows().values() {
        protect(window);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn le_mode_discret_se_lit_dans_les_preferences_d_affichage() {
        assert!(!from_prefs(&Prefs::new()));
        let on = Prefs::from([("preferences".to_string(), json!({ "discreetMode": true, "textScale": 100 }))]);
        assert!(from_prefs(&on));
        let odd = Prefs::from([("preferences".to_string(), json!({ "discreetMode": "oui" }))]);
        assert!(!from_prefs(&odd));
    }
}
