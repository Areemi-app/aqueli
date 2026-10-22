//! Mini-lecteur du Focus : une petite fenêtre toujours visible, même hors d'Aqueli, qui montre
//! le temps restant et permet de suspendre, d'arrêter ou de revenir à Aqueli. Elle ne reçoit
//! que l'état du minuteur (phase, temps), jamais le contenu du compte ; ses boutons sont
//! transmis à la fenêtre principale, qui fait tourner le minuteur.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::system::background;

pub const WINDOW: &str = "focus";
/// Nouvel état du minuteur, pour le mini-lecteur.
pub const STATE_EVENT: &str = "focus-etat";
/// Bouton du mini-lecteur, pour la fenêtre principale.
pub const COMMAND_EVENT: &str = "focus-commande";
/// Boutons du mini-lecteur ; « detacher » le ferme et le retire des écrans hors d'Aqueli,
/// « taille » demande à la fenêtre principale la taille suivante.
pub const ACTIONS: [&str; 6] = ["basculer", "arreter", "passer", "afficher", "detacher", "taille"];

/// Les trois tailles prévues du mini-lecteur (largeur, hauteur en pixels logiques). Il n'en a
/// jamais d'autre : ni agrandi, ni plein écran, sans quoi, toujours au premier plan, il
/// recouvrirait tout l'écran.
pub const SIZES: [(&str, f64, f64); 3] = [("compacte", 216.0, 64.0), ("standard", 370.0, 84.0), ("grande", 460.0, 116.0)];

/// Taille demandée, la standard si le nom est inconnu.
pub fn size_of(name: &str) -> (f64, f64) {
    let (_, w, h) = SIZES.iter().find(|(n, _, _)| *n == name).copied().unwrap_or(SIZES[1]);
    (w, h)
}

/// Taille actuelle du mini-lecteur.
#[derive(Default)]
pub struct MiniSize(pub Mutex<Option<(f64, f64)>>);

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

/// Le mini-lecteur garde la place où la personne l'a posé : il ne retourne dans le coin de
/// l'écran qu'à sa première ouverture, ou si sa place n'est plus sur aucun écran.
fn visible_somewhere(window: &tauri::WebviewWindow) -> bool {
    let (Ok(pos), Ok(size), Ok(monitors)) = (window.outer_position(), window.outer_size(), window.available_monitors()) else {
        return false;
    };
    let (cx, cy) = (pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2);
    monitors.iter().any(|m| {
        let a = m.work_area();
        cx >= a.position.x && cx < a.position.x + a.size.width as i32 && cy >= a.position.y && cy < a.position.y + a.size.height as i32
    })
}

/// Nouvelle taille, en gardant le coin en bas à droite là où il était (le lecteur reste à sa
/// place), sans sortir de l'écran.
fn set_size_anchored(app: &AppHandle, window: &tauri::WebviewWindow, w: f64, h: f64) {
    let before = window.outer_position().ok().zip(window.outer_size().ok());
    let _ = window.set_size(LogicalSize::new(w, h));
    let (Some((pos, old)), Ok(new)) = (before, window.outer_size()) else {
        return place(app, window);
    };
    let mut x = pos.x + old.width as i32 - new.width as i32;
    let mut y = pos.y + old.height as i32 - new.height as i32;
    if let Ok(Some(monitor)) = window.current_monitor() {
        let a = monitor.work_area();
        x = x.clamp(a.position.x, (a.position.x + a.size.width as i32 - new.width as i32).max(a.position.x));
        y = y.clamp(a.position.y, (a.position.y + a.size.height as i32 - new.height as i32).max(a.position.y));
    }
    let _ = window.set_position(PhysicalPosition::new(x, y));
    if !visible_somewhere(window) {
        place(app, window);
    }
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

/// Montre le mini-lecteur sans lui donner le premier plan : il ne prend jamais le clavier, et la
/// capture rapide, qui se cache dès qu'elle le perd, reste ouverte quand il apparaît.
fn show_inactive(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    strip_caption(window);
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
        // SAFETY: `hwnd` est la fenêtre du mini-lecteur, vivante tant que l'application tourne.
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        return Ok(());
    }
    window.show()
}

/// Cache le mini-lecteur. Sous Windows, il est montré directement par Windows (voir
/// `show_inactive`) : Tauri le croit donc toujours caché et ignorerait `hide()`. Il est caché de
/// la même façon.
fn hide_window(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};
        // SAFETY: `hwnd` est la fenêtre du mini-lecteur, vivante tant que l'application tourne.
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        return;
    }
    let _ = window.hide();
}

/// Retire à la fenêtre ses boutons Agrandir, Réduire et Fermer de Windows : une fenêtre sans
/// cadre peut sinon les faire apparaître au survol, et passer en plein écran. Sans menu système,
/// Windows ne dessine aucun bouton. La barre de titre invisible reste en place : Tauri s'en sert
/// pour effacer le cadre, et la retirer laissait une fine bande au-dessus du lecteur. Windows ne
/// peint plus rien autour de la fenêtre (ni bord, ni barre). Échap et Alt+F4 la ferment toujours.
#[cfg(windows)]
fn strip_caption(window: &tauri::WebviewWindow) {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMNCRP_DISABLED, DWMWA_NCRENDERING_POLICY};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU,
    };
    let Ok(hwnd) = window.hwnd() else { return };
    let remove = (WS_SYSMENU.0 | WS_MAXIMIZEBOX.0 | WS_MINIMIZEBOX.0) as isize;
    // SAFETY: `hwnd` est la fenêtre du mini-lecteur, vivante ; on ne retire que des styles et on
    // passe un entier de 4 octets, comme l'attend l'attribut.
    unsafe {
        let policy = DWMNCRP_DISABLED;
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_NCRENDERING_POLICY, std::ptr::from_ref(&policy).cast(), std::mem::size_of_val(&policy) as u32);
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        if style & remove != 0 {
            SetWindowLongPtrW(hwnd, GWL_STYLE, style & !remove);
            let _ = SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        }
    }
}

#[cfg(not(windows))]
fn strip_caption(_window: &tauri::WebviewWindow) {}

/// Remet le mini-lecteur à sa taille prévue s'il a été agrandi (double-clic, glissé contre le
/// haut de l'écran, Windows+Haut) ou mis en plein écran.
fn keep_size(app: &AppHandle, window: &tauri::WebviewWindow) {
    strip_caption(window);
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }
    if window.is_fullscreen().unwrap_or(false) {
        let _ = window.set_fullscreen(false);
    }
    let wanted = app.state::<MiniSize>().0.lock().ok().and_then(|s| *s).unwrap_or(size_of("standard"));
    let scale = window.scale_factor().unwrap_or(1.0);
    if let Ok(size) = window.inner_size() {
        let current = (f64::from(size.width) / scale, f64::from(size.height) / scale);
        if (current.0 - wanted.0).abs() > 1.0 || (current.1 - wanted.1).abs() > 1.0 {
            set_size_anchored(app, window, wanted.0, wanted.1);
        }
    }
}

/// Change la taille du mini-lecteur parmi les trois prévues, sans le déplacer.
pub fn resize(app: &AppHandle, name: &str) {
    let (w, h) = size_of(name);
    if let Ok(mut size) = app.state::<MiniSize>().0.lock() {
        *size = Some((w, h));
    }
    if let Some(window) = app.get_webview_window(WINDOW) {
        set_size_anchored(app, &window, w, h);
    }
}

/// Ouvre (ou ramène) le mini-lecteur, à la taille demandée.
pub fn open(app: &AppHandle, size: &str) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(WINDOW) {
        resize(app, size);
        if !visible_somewhere(&window) {
            place(app, &window);
        }
        show_inactive(&window)?;
        crate::system::discreet::protect(&window);
        return Ok(());
    }
    let (w, h) = size_of(size);
    if let Ok(mut current) = app.state::<MiniSize>().0.lock() {
        *current = Some((w, h));
    }
    let window = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("index.html#focus".into()))
        .title("Focus")
        .inner_size(w, h)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    place(app, &window);
    let target = window.clone();
    let handle = app.clone();
    window.on_window_event(move |event| match event {
        // Alt+F4 : comme le bouton Fermer (caché et désépinglé).
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            command(&handle, "detacher");
        }
        WindowEvent::Resized(_) => keep_size(&handle, &target),
        _ => {}
    });
    show_inactive(&window)?;
    crate::system::discreet::protect(&window);
    Ok(())
}

pub fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        hide_window(&window);
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

/// Bouton du mini-lecteur : transmis à la fenêtre principale ; « afficher » la ramène ;
/// « detacher » le cache tout de suite, sans attendre la fenêtre principale.
pub fn command(app: &AppHandle, action: &str) {
    if action == "detacher" {
        close(app);
    }
    if action == "afficher" {
        background::show_main(app);
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
    fn trois_tailles_prevues_la_standard_par_defaut() {
        assert_eq!(size_of("compacte"), (216.0, 64.0));
        assert_eq!(size_of("grande"), (460.0, 116.0));
        assert_eq!(size_of("plein-ecran"), size_of("standard"));
        assert!(SIZES.iter().all(|(_, w, h)| *w <= 480.0 && *h <= 120.0), "jamais plus grand qu'un lecteur");
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
